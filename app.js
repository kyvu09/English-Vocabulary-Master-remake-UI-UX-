import {
  auth,
  db,
  firebaseReady,
  ensureUserProfile,
  LOGIN_PAGE,
  updateUserTotalPoints,
  getDayKey
} from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { router, initRouter } from "./js/core/router.js?v=20261112d";
import * as dashboardPage from "./js/modules/dashboard-page.js?v=20261112d";
import * as vocabularyPage from "./js/modules/vocabulary-page.js?v=20261112d";
import * as sessionsPage from "./js/modules/sessions-page.js?v=20261112d";
import * as practicePage from "./js/modules/practice-page.js?v=20261112d";
import * as resultsPage from "./js/modules/results-page.js?v=20261112d";
import * as leaderboardPage from "./js/modules/leaderboard-page.js?v=20261112d";

import { showAlert, showToast } from "./js/core/ui-utils.js?v=20261112d";

const refs = {
  userProfile: document.getElementById("userProfile"),
  logoutBtn: document.getElementById("logoutBtn"),
  userAvatar: document.getElementById("userAvatar"),
  userAvatarImage: document.getElementById("userAvatarImage"),
  userInitial: document.getElementById("userInitial"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  globalSearch: document.getElementById("globalSearch"),
  pageContent: document.getElementById("pageContent"),
  accountModal: document.getElementById("accountModal"),
  accountForm: document.getElementById("accountForm"),
  accountDisplayName: document.getElementById("accountDisplayName"),
  accountEmail: document.getElementById("accountEmail"),
  accountPhotoUrl: document.getElementById("accountPhotoUrl"),
  accountModalHeading: document.getElementById("accountModalHeading"),
  accountAvatar: document.getElementById("accountAvatar"),
  accountAvatarImage: document.getElementById("accountAvatarImage"),
  accountAvatarInitial: document.getElementById("accountAvatarInitial"),
  accountStatus: document.getElementById("accountStatus"),
  accountSaveBtn: document.getElementById("accountSaveBtn"),
  accountResetPasswordBtn: document.getElementById("accountResetPasswordBtn"),
  accountCancelBtn: document.getElementById("accountCancelBtn"),
  accountModalCloseBtn: document.getElementById("accountModalCloseBtn"),
  tabProfileBtn: document.getElementById("tabProfileBtn"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  themeSeg: document.getElementById("themeSeg"),
  goalSeg: document.getElementById("goalSeg"),
  streakBadge: document.getElementById("streakBadge"),
  streakPop: document.getElementById("streakPop"),
  streakWrap: document.getElementById("streakWrap")
};

let routerStarted = false;

window.router = router;
window.__appUser = { dailyActivity: {}, totalPoints: 0 };

router.registerPage("dashboard", dashboardPage);
router.registerPage("vocabulary", vocabularyPage);
router.registerPage("sessions", sessionsPage);
router.registerPage("practice", practicePage);
router.registerPage("results", resultsPage);
router.registerPage("leaderboard", leaderboardPage);

function redirectToLogin() {
  window.location.replace(LOGIN_PAGE);
}

function getDisplayLabel(user) {
  return user?.displayName || user?.email || user?.uid || "User";
}

function getInitial(label = "") {
  return String(label).trim().charAt(0).toUpperCase() || "U";
}

function setStatus(element, type = "", message = "") {
  if (!element) return;
  if (!message) {
    element.className = "status";
    element.textContent = "";
    return;
  }

  element.className = `status show ${type}`;
  element.textContent = message;
}

function applyAvatar(container, imageEl, fallbackEl, photoURL, label) {
  if (!container || !fallbackEl) return;

  const initial = getInitial(label);
  fallbackEl.textContent = initial;

  if (imageEl) {
    imageEl.onerror = () => {
      imageEl.hidden = true;
      imageEl.removeAttribute("src");
      container.classList.remove("has-image");
      fallbackEl.hidden = false;
      fallbackEl.textContent = initial;
    };
  }

  if (photoURL && imageEl) {
    imageEl.src = photoURL;
    imageEl.hidden = false;
    fallbackEl.hidden = true;
    container.classList.add("has-image");
    return;
  }

  if (imageEl) {
    imageEl.hidden = true;
    imageEl.removeAttribute("src");
  }
  container.classList.remove("has-image");
  fallbackEl.hidden = false;
}

function updateUserUI(user) {
  const label = getDisplayLabel(user);
  const email = user?.email || "Không có email";

  if (refs.userName) refs.userName.textContent = label;
  if (refs.userEmail) refs.userEmail.textContent = email;

  applyAvatar(refs.userAvatar, refs.userAvatarImage, refs.userInitial, user?.photoURL || "", label);
  applyAvatar(refs.accountAvatar, refs.accountAvatarImage, refs.accountAvatarInitial, user?.photoURL || "", label);

  if (refs.accountModalHeading) {
    refs.accountModalHeading.textContent = label;
  }
}

function showFatalMessage(message) {
  if (!refs.pageContent) return;
  refs.pageContent.innerHTML = `
    <div class="page-container">
      <div class="card">
        <div class="section-title">
          <div>
            <h2>Không thể khởi động ứng dụng</h2>
            <div class="sub">${message}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function fillAccountForm(user) {
  if (!user) return;

  if (refs.accountDisplayName) {
    refs.accountDisplayName.value = user.displayName || user.email || "";
  }
  if (refs.accountEmail) {
    refs.accountEmail.value = user.email || "";
  }
  if (refs.accountPhotoUrl) {
    refs.accountPhotoUrl.value = user.photoURL || "";
  }

  updateAccountPreview();
  setStatus(refs.accountStatus);
}

function updateAccountPreview() {
  const label = refs.accountDisplayName?.value.trim() || refs.accountEmail?.value.trim() || "User";
  const photoURL = refs.accountPhotoUrl?.value.trim() || "";
  applyAvatar(refs.accountAvatar, refs.accountAvatarImage, refs.accountAvatarInitial, photoURL, label);
  if (refs.accountModalHeading) {
    refs.accountModalHeading.textContent = label;
  }
}

let accountModalInstance = null;

function openAccountModal() {
  if (!refs.accountModal || !auth.currentUser) return;

  fillAccountForm(auth.currentUser);
  if (!accountModalInstance) {
    accountModalInstance = new bootstrap.Modal(refs.accountModal, { backdrop: true });
  }
  accountModalInstance.show();
  refs.accountDisplayName?.focus();
}

function closeAccountModal() {
  if (!accountModalInstance) return;
  accountModalInstance.hide();
  setStatus(refs.accountStatus);
}

function setAccountFormDisabled(disabled) {
  if (!refs.accountForm) return;
  Array.from(refs.accountForm.elements).forEach((element) => {
    element.disabled = disabled;
  });
}

function getFriendlyError(error, fallback) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-email": "Email hiện tại không hợp lệ.",
    "auth/missing-email": "Tài khoản hiện tại chưa có email để gửi liên kết đổi mật khẩu.",
    "auth/network-request-failed": "Không thể kết nối mạng. Hãy thử lại.",
    "auth/too-many-requests": "Bạn thao tác quá nhanh. Hãy đợi một lúc rồi thử lại."
  };

  return map[code] || error?.message || fallback;
}

async function handleLogout() {
  try {
    await signOut(auth);
    redirectToLogin();
  } catch (error) {
    console.error(error);
    await showAlert("Không thể đăng xuất lúc này.", "Lỗi");
  }
}

async function handleAccountSave(event) {
  event.preventDefault();

  const user = auth.currentUser;
  if (!user) return;

  const displayName = refs.accountDisplayName?.value.trim() || "";
  const photoURL = refs.accountPhotoUrl?.value.trim() || "";

  if (!displayName) {
    setStatus(refs.accountStatus, "error", "Tên hiển thị không được để trống.");
    refs.accountDisplayName?.focus();
    return;
  }

  try {
    setAccountFormDisabled(true);
    setStatus(refs.accountStatus, "info", "Đang lưu thông tin tài khoản...");

    await updateProfile(user, {
      displayName,
      photoURL: photoURL || null
    });
    await ensureUserProfile(auth.currentUser);

    updateUserUI(auth.currentUser);
    fillAccountForm(auth.currentUser);
    setStatus(refs.accountStatus, "success", "Đã cập nhật thông tin tài khoản.");
  } catch (error) {
    console.error(error);
    setStatus(refs.accountStatus, "error", getFriendlyError(error, "Không thể cập nhật thông tin tài khoản."));
  } finally {
    setAccountFormDisabled(false);
  }
}

async function handlePasswordReset() {
  const user = auth.currentUser;
  if (!user?.email) {
    setStatus(refs.accountStatus, "error", "Tài khoản hiện tại chưa có email để gửi liên kết đổi mật khẩu.");
    return;
  }

  try {
    setAccountFormDisabled(true);
    setStatus(refs.accountStatus, "info", "Đang gửi email đổi mật khẩu...");

    await sendPasswordResetEmail(auth, user.email);
    setStatus(
      refs.accountStatus,
      "success",
      `Đã gửi liên kết đổi mật khẩu tới ${user.email}. Hãy kiểm tra hộp thư và mục Spam.`
    );
  } catch (error) {
    console.error(error);
    setStatus(refs.accountStatus, "error", getFriendlyError(error, "Không thể gửi email đổi mật khẩu."));
  } finally {
    setAccountFormDisabled(false);
  }
}

function bindGlobalEvents() {
  refs.logoutBtn?.addEventListener("click", handleLogout);
  refs.userProfile?.addEventListener("click", openAccountModal);
  refs.accountForm?.addEventListener("submit", handleAccountSave);
  refs.accountResetPasswordBtn?.addEventListener("click", handlePasswordReset);
  refs.accountCancelBtn?.addEventListener("click", closeAccountModal);
  refs.accountModalCloseBtn?.addEventListener("click", closeAccountModal);

  refs.accountModal?.addEventListener("hidden.bs.modal", () => {
    document.body.classList.remove("no-scroll");
    setStatus(refs.accountStatus);
  });

  refs.accountDisplayName?.addEventListener("input", updateAccountPreview);
  refs.accountPhotoUrl?.addEventListener("input", updateAccountPreview);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const openModal = document.querySelector(".modal.show");
      if (openModal) {
        const modal = bootstrap.Modal.getInstance(openModal);
        modal?.hide();
      }
    }
  });

  refs.globalSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      refs.globalSearch.value = "";
      refs.globalSearch.blur();
      return;
    }
    if (event.key !== "Enter") return;
    const keyword = refs.globalSearch.value.trim();
    if (!keyword) return;

    if (router.getCurrentPage() === "vocabulary") {
      // Đang ở trang Từ vựng: điền thẳng vào ô lọc của trang
      const pageSearch = document.getElementById("wordSearchInput");
      if (pageSearch) {
        pageSearch.value = keyword;
        pageSearch.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else {
      window.vocabSearchQuery = keyword;
      router.navigateTo("vocabulary");
    }
    refs.globalSearch.value = "";
    refs.globalSearch.blur();
  });

  // Phím tắt: Ctrl/Cmd + K hoặc "/" để tìm kiếm nhanh
  document.addEventListener("keydown", (event) => {
    const tag = (event.target?.tagName || "").toLowerCase();
    const typing = ["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable;
    const isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
    if (isCmdK || (event.key === "/" && !typing)) {
      event.preventDefault();
      if (window.getComputedStyle(refs.globalSearch?.parentElement || document.body).display === "none") {
        router.navigateTo("vocabulary");
        return;
      }
      refs.globalSearch?.focus();
      refs.globalSearch?.select();
    }
  });

  // Hồ sơ trên thanh tab (mobile)
  refs.tabProfileBtn?.addEventListener("click", openAccountModal);

  // Giao diện sáng/tối/hệ thống
  refs.themeToggleBtn?.addEventListener("click", cycleTheme);
  refs.themeSeg?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-theme-pref]");
    if (btn) setThemePreference(btn.dataset.themePref);
  });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getThemePreference() === "system") applyTheme("system");
  });

  // Mục tiêu mỗi ngày
  refs.goalSeg?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-goal]");
    if (!btn) return;
    setDailyGoal(Number(btn.dataset.goal));
  });

  bindStreakPopover();
}

// ─── Mục tiêu ngày ─────────────────────────────────────────────────────────────
export function getDailyGoal() {
  const stored = Number(localStorage.getItem("daily-goal"));
  return [10, 20, 30, 50].includes(stored) ? stored : 20;
}

function setDailyGoal(value) {
  localStorage.setItem("daily-goal", String(value));
  syncGoalSeg();
  window.dispatchEvent(new CustomEvent("daily-goal-changed", { detail: { goal: value } }));
}

function syncGoalSeg() {
  const goal = getDailyGoal();
  refs.goalSeg?.querySelectorAll("[data-goal]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.goal) === goal));
  });
}
window.getDailyGoal = getDailyGoal;

// ─── Streak popover ────────────────────────────────────────────────────────────
function renderStreakPopover() {
  const daysEl = document.getElementById("streakDays");
  if (!daysEl) return;

  const activity = window.__appUser?.dailyActivity || {};
  const labels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const today = new Date();
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = getDayKey(d);
    const done = (activity[key] || 0) > 0;
    cells.push(`
      <div class="streak-day ${done ? "done" : ""} ${i === 0 ? "today" : ""}">
        <span class="dot" aria-hidden="true">${done ? "✓" : ""}</span>
        <span>${labels[d.getDay()]}</span>
        <span class="sr-only">${done ? "đã học" : "chưa học"}</span>
      </div>`);
  }
  daysEl.innerHTML = cells.join("");

  const state = window.__streakState || { count: 0, active: false };
  const title = document.getElementById("streakPopTitle");
  const desc = document.getElementById("streakPopDesc");
  if (title) title.textContent = state.count > 0 ? `Chuỗi ${state.count} ngày 🔥` : "Chưa có chuỗi học";
  if (desc) {
    desc.textContent = state.active
      ? "Tuyệt vời! Hôm nay bạn đã giữ được chuỗi."
      : state.count > 0
        ? "Hôm nay bạn chưa học. Luyện tập ngay để không mất chuỗi!"
        : "Học một chút mỗi ngày để bắt đầu chuỗi mới.";
  }
}

function bindStreakPopover() {
  const { streakBadge, streakPop, streakWrap } = refs;
  if (!streakBadge || !streakPop) return;

  const close = () => {
    streakPop.hidden = true;
    streakBadge.setAttribute("aria-expanded", "false");
  };
  const toggle = () => {
    const willOpen = streakPop.hidden;
    if (willOpen) renderStreakPopover();
    streakPop.hidden = !willOpen;
    streakBadge.setAttribute("aria-expanded", String(willOpen));
  };

  streakBadge.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });
  document.addEventListener("click", (event) => {
    if (!streakWrap.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !streakPop.hidden) {
      close();
      streakBadge.focus();
    }
  });
  document.getElementById("streakPracticeBtn")?.addEventListener("click", () => {
    close();
    router.navigateTo("practice");
  });
}

// ─── Giao diện: sáng / tối / theo hệ thống ────────────────────────────────────
function getThemePreference() {
  const saved = localStorage.getItem("app-theme");
  return ["light", "dark", "system"].includes(saved) ? saved : "system";
}

function resolveTheme(pref) {
  if (pref === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function applyTheme(pref) {
  const theme = resolveTheme(pref);
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  html.setAttribute("data-bs-theme", theme);
  updateThemeUI(pref, theme);
}

function setThemePreference(pref) {
  localStorage.setItem("app-theme", pref);
  applyTheme(pref);
}

// Nút trên thanh điều hướng: Sáng → Tối → Theo hệ thống
function cycleTheme() {
  const order = ["light", "dark", "system"];
  const next = order[(order.indexOf(getThemePreference()) + 1) % order.length];
  setThemePreference(next);
  const labels = { light: "Giao diện sáng", dark: "Giao diện tối", system: "Theo hệ thống" };
  showToast(labels[next], "info", { delay: 1500 });
}

function updateThemeUI(pref, theme) {
  const icon = pref === "system" ? "monitor" : theme === "dark" ? "moon" : "sun";
  const iconContainer = document.getElementById("themeIcon");
  if (iconContainer) {
    iconContainer.innerHTML = `<i data-lucide="${icon}"></i>`;
    if (window.lucide) lucide.createIcons({ root: iconContainer });
  }
  const labels = { light: "sáng", dark: "tối", system: "theo hệ thống" };
  refs.themeToggleBtn?.setAttribute(
    "aria-label",
    `Giao diện hiện tại: ${labels[pref]}. Nhấn để đổi`
  );
  refs.themeSeg?.querySelectorAll("[data-theme-pref]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themePref === pref));
  });
}

function initTheme() {
  applyTheme(getThemePreference());
  syncGoalSeg();
}

function startRouterOnce() {
  if (routerStarted) return;
  routerStarted = true;
  initRouter();
}

window.updateStreakHeaderUI = function(streakCount, streakActive) {
  const badge = document.getElementById("streakBadge");
  const icon = document.getElementById("streakIcon");
  const countText = document.getElementById("streakCountText");
  
  if (!badge || !icon || !countText) return;
  
  window.__streakState = { count: streakCount, active: Boolean(streakActive) };
  countText.textContent = streakCount;
  badge.setAttribute(
    "aria-label",
    streakCount > 0
      ? `Chuỗi học ${streakCount} ngày${streakActive ? ", hôm nay đã học" : ", hôm nay chưa học"}`
      : "Chưa có chuỗi học tập"
  );
  
  if (streakCount > 0 && streakActive) {
    badge.classList.remove("inactive");
    badge.classList.add("active");
    
    // Choose color based on streak count
    let color = "#ffcc00"; // yellow
    if (streakCount >= 30) {
      color = "#007aff"; // Cosmic Blue
    } else if (streakCount >= 15) {
      color = "#af52de"; // Mystical Purple
    } else if (streakCount >= 7) {
      color = "#ff3b30"; // Fiery Red
    } else if (streakCount >= 3) {
      color = "#ff9500"; // Vibrant Orange
    }
    
    icon.style.color = color;
    icon.style.filter = `drop-shadow(0 0 5px ${color}80)`;
    badge.style.borderColor = `${color}40`;
    badge.style.background = `${color}0b`;
    countText.style.color = color;
  } else {
    badge.classList.remove("active");
    badge.classList.add("inactive");
    icon.style.color = "";
    icon.style.filter = "";
    badge.style.borderColor = "";
    badge.style.background = "";
    countText.style.color = "";
  }
};

function init() {
  initTheme();

  if (!firebaseReady || !auth || !db) {
    showFatalMessage("Thiếu hoặc sai cấu hình Firebase trong firebase-config.js.");
    return;
  }

  bindGlobalEvents();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirectToLogin();
      return;
    }

    updateUserUI(user);

    try {
      await ensureUserProfile(user);
      await updateUserTotalPoints(user.uid);
      
      // Load streak info
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        window.__appUser = {
          dailyActivity: data.dailyActivity || {},
          totalPoints: data.totalPoints || 0
        };
        const streakCount = data.streakCount || 0;
        const lastStreakDate = data.lastStreakDate || "";
        const todayStr = new Date().toLocaleDateString('sv-SE');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('sv-SE');
        
        let streakActive = false;
        let displayCount = 0;
        
        if (lastStreakDate === todayStr) {
          streakActive = true;
          displayCount = streakCount;
        } else if (lastStreakDate === yesterdayStr) {
          streakActive = false;
          displayCount = streakCount;
        } else {
          streakActive = false;
          displayCount = 0;
        }
        
        window.updateStreakHeaderUI(displayCount, streakActive);
      }
    } catch (error) {
      console.error("ensureUserProfile/updateUserTotalPoints/streak failed", error);
    }

    updateUserUI(auth.currentUser);
    startRouterOnce();
  });
}

init();
