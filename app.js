import {
  auth,
  db,
  firebaseReady,
  ensureUserProfile,
  LOGIN_PAGE
} from "./firebase-config.js";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { router, initRouter } from "./js/core/router.js";
import * as dashboardPage from "./js/modules/dashboard-page.js";
import * as vocabularyPage from "./js/modules/vocabulary-page.js";
import * as sessionsPage from "./js/modules/sessions-page.js";
import * as practicePage from "./js/modules/practice-page.js";
import * as resultsPage from "./js/modules/results-page.js";

import { showAlert } from "./js/core/ui-utils.js";

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
  accountModalCloseBtn: document.getElementById("accountModalCloseBtn")
};

let routerStarted = false;

window.router = router;

router.registerPage("dashboard", dashboardPage);
router.registerPage("vocabulary", vocabularyPage);
router.registerPage("sessions", sessionsPage);
router.registerPage("practice", practicePage);
router.registerPage("results", resultsPage);

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
    if (event.key !== "Enter") return;
    const keyword = refs.globalSearch.value.trim();
    if (!keyword) return;
    window.vocabSearchQuery = keyword;
    router.navigateTo("vocabulary");
  });

  // Theme toggle (capture phase to intercept before router)
  document.addEventListener("click", (e) => {
    const themesBtn = e.target.closest('[data-page="themes"]');
    if (!themesBtn) return;
    e.stopPropagation();
    toggleTheme();
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar) sidebar.classList.remove('show');
      if (overlay) overlay.classList.remove('show');
      document.getElementById('hamburgerBtn')?.classList.remove('is-active');
      document.body.classList.remove('no-scroll');
    }
  }, true);
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);
  localStorage.setItem("app-theme", newTheme);
  updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
  const iconContainer = document.getElementById('themeIcon');
  if (iconContainer) {
    iconContainer.innerHTML = `<i data-lucide="${theme === 'dark' ? 'moon' : 'sun'}"></i>`;
    if (window.lucide) {
      lucide.createIcons({ root: iconContainer });
    }
  }
}

function initTheme() {
  const saved = localStorage.getItem("app-theme");
  const theme = saved === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeUI(theme);
}

function startRouterOnce() {
  if (routerStarted) return;
  routerStarted = true;
  initRouter();
}

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
    } catch (error) {
      console.error("ensureUserProfile failed", error);
    }

    updateUserUI(auth.currentUser);
    startRouterOnce();
  });
}

init();
