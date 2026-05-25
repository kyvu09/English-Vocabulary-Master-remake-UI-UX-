import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp,
  collection, query, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const LOGIN_PAGE = "login.html";
export const APP_PAGE = "index.html";

const cfg = window.__APP_CONFIG__ || {};

export const firebaseConfig = {
  apiKey: cfg.FIREBASE_API_KEY || "",
  authDomain: cfg.FIREBASE_AUTH_DOMAIN || "",
  projectId: cfg.FIREBASE_PROJECT_ID || "",
  storageBucket: cfg.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: cfg.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: cfg.FIREBASE_APP_ID || "",
  measurementId: cfg.FIREBASE_MEASUREMENT_ID || ""
};

export function isFirebaseConfigured(config = firebaseConfig) {
  return Boolean(
    config?.apiKey &&
    config?.projectId &&
    !String(config.apiKey).includes("YOUR_") &&
    !String(config.projectId).includes("YOUR_")
  );
}

export const firebaseReady = isFirebaseConfigured();
export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = firebaseReady ? getAuth(app) : null;
export const db = firebaseReady ? getFirestore(app) : null;
export const googleProvider = firebaseReady ? new GoogleAuthProvider() : null;

export async function ensureUserProfile(user) {
  if (!firebaseReady || !db || !user) return;

  const profileRef = doc(db, "users", user.uid, "profile", "main");
  await setDoc(
    profileRef,
    {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email || "",
      photoURL: user.photoURL || "",
      lastLoginAt: serverTimestamp()
    },
    { merge: true }
  );
}

export const RANKS = [
  { name: "Iron", min: 0, max: 99, icon: "shield", color: "#8e8e93" },
  { name: "Titanium", min: 100, max: 199, icon: "award", color: "#bf5af2" },
  { name: "Tantalum", min: 200, max: 299, icon: "shield-alert", color: "#30d158" },
  { name: "Osmium", min: 300, max: 499, icon: "gem", color: "#0a84ff" },
  { name: "Vanadium", min: 500, max: 699, icon: "swords", color: "#ffd60a" },
  { name: "Tungsten", min: 700, max: 999, icon: "flame", color: "#ff9f0a" },
  { name: "Chromium", min: 1000, max: Infinity, icon: "crown", color: "#ff453a" }
];

export function getRank(points) {
  return RANKS.find(r => points >= r.min && points <= r.max) || RANKS[0];
}

export async function updateUserTotalPoints(userId) {
  if (!db || !userId) return 0;

  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  
  let carryOverPoints = 0;
  let rankPeriodStartAt = null;
  
  if (userSnap.exists()) {
    const data = userSnap.data();
    carryOverPoints = data.carryOverPoints || 0;
    rankPeriodStartAt = data.rankPeriodStartAt || null;
  }
  
  const now = Date.now();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  
  // If period start is null, set it to now
  if (!rankPeriodStartAt) {
    rankPeriodStartAt = new Date(now);
    await setDoc(userRef, {
      carryOverPoints: 0,
      rankPeriodStartAt: rankPeriodStartAt,
      totalPoints: 0
    }, { merge: true });
  } else {
    // Check if a week has passed
    const periodTime = rankPeriodStartAt.toDate ? rankPeriodStartAt.toDate().getTime() : new Date(rankPeriodStartAt).getTime();
    if (now - periodTime >= ONE_WEEK_MS) {
      // Calculate current total points before reset
      const q = collection(db, "users", userId, "quizAttempts");
      const snap = await getDocs(q);
      let sumOfNewPoints = 0;
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const pts = d.points || 0;
        let createdAtTime = now;
        if (d.createdAt) {
          createdAtTime = d.createdAt.toDate ? d.createdAt.toDate().getTime() : new Date(d.createdAt).getTime();
        }
        if (createdAtTime >= periodTime) {
          sumOfNewPoints += pts;
        }
      });
      
      const currentTotal = carryOverPoints + sumOfNewPoints;
      carryOverPoints = Math.round(currentTotal / 3);
      rankPeriodStartAt = new Date(now);
      
      await setDoc(userRef, {
        carryOverPoints: carryOverPoints,
        rankPeriodStartAt: rankPeriodStartAt,
        totalPoints: carryOverPoints
      }, { merge: true });
    }
  }

  // Now, calculate the up-to-date total points for the current week
  const periodTime = rankPeriodStartAt.toDate ? rankPeriodStartAt.toDate().getTime() : new Date(rankPeriodStartAt).getTime();
  const q = collection(db, "users", userId, "quizAttempts");
  const snap = await getDocs(q);
  let sumOfNewPoints = 0;
  snap.forEach(docSnap => {
    const d = docSnap.data();
    const pts = d.points || 0;
    let createdAtTime = now;
    if (d.createdAt) {
      createdAtTime = d.createdAt.toDate ? d.createdAt.toDate().getTime() : new Date(d.createdAt).getTime();
    }
    if (createdAtTime >= periodTime) {
      sumOfNewPoints += pts;
    }
  });

  const totalPoints = carryOverPoints + sumOfNewPoints;
  await setDoc(userRef, {
    totalPoints: totalPoints
  }, { merge: true });

  return totalPoints;
}
