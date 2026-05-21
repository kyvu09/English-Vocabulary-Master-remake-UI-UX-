import {
  auth,
  googleProvider,
  firebaseReady,
  ensureUserProfile,
  APP_PAGE
} from "./firebase-config.js";
import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail // Bổ sung import này
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const refs = {
  authStateText: document.getElementById("authStateText"),
  authTabsContainer: document.getElementById("authTabsContainer"),
  authTabs: document.querySelectorAll(".auth-tab"),
  authMessage: document.getElementById("authMessage"),
  
  // Panels
  loginPanel: document.getElementById("loginPanel"),
  registerPanel: document.getElementById("registerPanel"),
  forgotPasswordPanel: document.getElementById("forgotPasswordPanel"),
  
  // Forms
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  forgotPasswordForm: document.getElementById("forgotPasswordForm"),
  
  // Buttons & Links
  googleLoginBtn: document.getElementById("googleLoginBtn"),
  googleRegisterBtn: document.getElementById("googleRegisterBtn"),
  btnShowForgotPassword: document.getElementById("btnShowForgotPassword"),
  btnBackToLogin: document.getElementById("btnBackToLogin")
};

const state = {
  activeTab: "login"
};

function showStatus(element, type, message) {
  if (!element) return;
  if (!message) {
    element.className = "status";
    element.textContent = "";
    return;
  }
  element.className = `status show ${type}`;
  element.textContent = message;
}

function getFriendlyFirebaseError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/user-not-found": "Không tìm thấy tài khoản.",
    "auth/wrong-password": "Mật khẩu không đúng.",
    "auth/email-already-in-use": "Email này đã được sử dụng.",
    "auth/weak-password": "Mật khẩu quá yếu. Hãy dùng ít nhất 6 ký tự.",
    "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập Google.",
    "auth/network-request-failed": "Không thể kết nối mạng. Hãy thử lại.",
    "auth/unauthorized-domain": "Domain hiện tại chưa được thêm vào Firebase Authentication.",
    "auth/operation-not-allowed": "Bạn chưa bật provider này trong Firebase.",
    "auth/missing-email": "Vui lòng nhập địa chỉ email."
  };
  return map[code] || error?.message || "Có lỗi xảy ra.";
}

function setAuthTab(tab) {
  state.activeTab = tab;
  
  // Cập nhật class active cho nút tab (chỉ chạy với login/register)
  refs.authTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });

  // Ẩn hiện các Panels tương ứng
  refs.loginPanel?.classList.toggle("active", tab === "login");
  refs.registerPanel?.classList.toggle("active", tab === "register");
  refs.forgotPasswordPanel?.classList.toggle("active", tab === "forgot-password");

  // Nếu đang ở tab quên mật khẩu, ẩn thanh chọn tab Đăng nhập/Đăng ký đi cho đẹp
  if (refs.authTabsContainer) {
    refs.authTabsContainer.style.display = tab === "forgot-password" ? "none" : "flex";
  }

  showStatus(refs.authMessage, "", "");
}

function setFormsDisabled(disabled) {
  [refs.loginForm, refs.registerForm, refs.forgotPasswordForm].forEach((form) => {
    if (!form) return;
    Array.from(form.elements).forEach((element) => {
      element.disabled = disabled;
    });
  });
  if (refs.googleLoginBtn) refs.googleLoginBtn.disabled = disabled;
  if (refs.googleRegisterBtn) refs.googleRegisterBtn.disabled = disabled;
}

function redirectToApp() {
  window.location.replace(APP_PAGE);
}

function bindEvents() {
  // Sự kiện chuyển tab Đăng nhập/Đăng ký
  refs.authTabs.forEach((button) => {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
  });

  // Sự kiện chuyển sang màn hình Quên mật khẩu
  refs.btnShowForgotPassword?.addEventListener("click", (e) => {
    e.preventDefault();
    setAuthTab("forgot-password");
  });

  // Sự kiện quay lại từ màn hình Quên mật khẩu
  refs.btnBackToLogin?.addEventListener("click", () => {
    setAuthTab("login");
  });

  // Xử lý ĐĂNG NHẬP
  refs.loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseReady || !auth) return;

    const email = document.getElementById("loginEmail")?.value.trim();
    const password = document.getElementById("loginPassword")?.value || "";

    try {
      setFormsDisabled(true);
      await signInWithEmailAndPassword(auth, email, password);
      showStatus(refs.authMessage, "success", "Đăng nhập thành công. Đang chuyển vào ứng dụng...");
      refs.loginForm.reset();
    } catch (error) {
      showStatus(refs.authMessage, "error", getFriendlyFirebaseError(error));
    } finally {
      setFormsDisabled(false);
    }
  });

  // Xử lý ĐĂNG KÝ
  refs.registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseReady || !auth) return;

    const name = document.getElementById("registerName")?.value.trim() || "";
    const email = document.getElementById("registerEmail")?.value.trim();
    const password = document.getElementById("registerPassword")?.value || "";

    try {
      setFormsDisabled(true);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        await updateProfile(credential.user, { displayName: name });
      }
      await ensureUserProfile({
        ...credential.user,
        displayName: name || credential.user.displayName || ""
      });
      showStatus(refs.authMessage, "success", "Tạo tài khoản thành công. Đang chuyển vào ứng dụng...");
      refs.registerForm.reset();
    } catch (error) {
      showStatus(refs.authMessage, "error", getFriendlyFirebaseError(error));
    } finally {
      setFormsDisabled(false);
    }
  });

  // Xử lý QUÊN MẬT KHẨU
  refs.forgotPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseReady || !auth) return;

    const email = document.getElementById("forgotEmail")?.value.trim();

    try {
      setFormsDisabled(true);
      showStatus(refs.authMessage, "success", "Đang gửi liên kết...");
      
      // Hàm gửi email khôi phục của Firebase
      await sendPasswordResetEmail(auth, email);
      
      showStatus(refs.authMessage, "success", "Đã gửi liên kết khôi phục! Vui lòng kiểm tra hộp thư đến (hoặc Spam) của bạn.");
      refs.forgotPasswordForm.reset();
      
      // Chờ 3 giây rồi tự động quay lại tab Login
      setTimeout(() => {
        setAuthTab("login");
      }, 3000);

    } catch (error) {
      showStatus(refs.authMessage, "error", getFriendlyFirebaseError(error));
    } finally {
      setFormsDisabled(false);
    }
  });

  // Xử lý đăng nhập bằng Google
  const googleHandler = async () => {
    if (!firebaseReady || !auth || !googleProvider) return;
    try {
      setFormsDisabled(true);
      const credential = await signInWithPopup(auth, googleProvider);
      await ensureUserProfile(credential.user);
      showStatus(refs.authMessage, "success", "Đăng nhập Google thành công. Đang chuyển vào ứng dụng...");
    } catch (error) {
      showStatus(refs.authMessage, "error", getFriendlyFirebaseError(error));
    } finally {
      setFormsDisabled(false);
    }
  };

  refs.googleLoginBtn?.addEventListener("click", googleHandler);
  refs.googleRegisterBtn?.addEventListener("click", googleHandler);
}

function init() {
  setAuthTab("login");

  if (!firebaseReady || !auth) {
    if (refs.authStateText) refs.authStateText.textContent = "Chưa cấu hình Firebase";
    showStatus(refs.authMessage, "warning", "Thiếu firebaseConfig hợp lệ. Hãy kiểm tra firebase-config.js.");
    setFormsDisabled(true);
    return;
  }

  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (refs.authStateText) {
        refs.authStateText.textContent = user.displayName || user.email || "Đã đăng nhập";
      }
      try {
        await ensureUserProfile(user);
      } catch (error) {
        console.error(error);
      }
      redirectToApp();
      return;
    }

    if (refs.authStateText) {
      refs.authStateText.textContent = "Chưa đăng nhập";
    }
  });
}

init();