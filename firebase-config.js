import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
