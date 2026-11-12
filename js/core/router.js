// Hệ thống Router - Quản lý điều hướng trang và trạng thái

const PAGE_TITLES = {
  dashboard: 'Trang chủ',
  vocabulary: 'Từ vựng',
  sessions: 'Buổi học',
  practice: 'Luyện tập',
  results: 'Kết quả',
  leaderboard: 'Xếp hạng'
};

const DEFAULT_PAGE = 'dashboard';
const APP_NAME = 'English Vocabulary Master';

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

class Router {
  constructor() {
    this.currentPage = null;
    this.pageModules = {};
    this.isTransitioning = false;
  }

  registerPage(name, module) {
    this.pageModules[name] = module;
  }

  isValidPage(name) {
    return Boolean(name && this.pageModules[name]);
  }

  async unmountCurrentPage() {
    const previousModule = this.pageModules[this.currentPage];
    if (!previousModule?.unmount) return;

    try {
      await Promise.resolve(previousModule.unmount());
    } catch (error) {
      console.error(`Error unmounting ${this.currentPage}:`, error);
    }
  }

  // Cho phép trang hiện tại chặn việc rời đi (ví dụ đang làm bài dở)
  async canLeaveCurrentPage() {
    const current = this.pageModules[this.currentPage];
    if (!current?.canLeave) return true;
    try {
      return await Promise.resolve(current.canLeave());
    } catch (error) {
      console.error('canLeave error:', error);
      return true;
    }
  }

  async navigateTo(pageName, { fromPopState = false, replace = false } = {}) {
    if (!this.isValidPage(pageName)) pageName = DEFAULT_PAGE;
    if (this.isTransitioning || this.currentPage === pageName) return;

    const pageContent = document.getElementById('pageContent');
    if (!pageContent) {
      console.error('pageContent element not found');
      return;
    }

    if (!(await this.canLeaveCurrentPage())) {
      // Người dùng chọn ở lại: khôi phục URL nếu họ bấm nút Back của trình duyệt
      if (fromPopState && this.currentPage) {
        window.history.pushState({ page: this.currentPage }, '', `#${this.currentPage}`);
      }
      return;
    }

    this.isTransitioning = true;
    pageContent.setAttribute('aria-busy', 'true');

    // Hiệu ứng biến mất (exit animation)
    if (pageContent.children.length > 0 && !prefersReducedMotion()) {
      pageContent.children[0].classList.remove('animate-enter');
      pageContent.children[0].classList.add('animate-exit');
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    await this.unmountCurrentPage();

    pageContent.innerHTML = '';
    const pageModule = this.pageModules[pageName];

    try {
      const html = await pageModule.render();
      pageContent.innerHTML = html;
      pageContent.children[0]?.classList.add('animate-enter');

      // Cập nhật điều hướng + tiêu đề trước khi mount để module có thể ghi đè nếu cần
      this.currentPage = pageName;
      this.updateActiveNav(pageName);
      this.updateTitle(pageName);

      if (pageModule.mount) {
        await pageModule.mount();
      }

      if (window.lucide) {
        lucide.createIcons({ root: pageContent });
      }

      // Đồng bộ URL
      const state = { page: pageName };
      if (!fromPopState) {
        if (replace) window.history.replaceState(state, '', `#${pageName}`);
        else window.history.pushState(state, '', `#${pageName}`);
      }

      // Cuộn lên đầu & chuyển focus cho người dùng bàn phím / screen reader
      const appContent = document.querySelector('.app-content');
      if (appContent) appContent.scrollTop = 0;
      this.moveFocus(pageContent);
      this.announce(`Đã chuyển tới ${PAGE_TITLES[pageName] || pageName}`);
    } catch (error) {
      console.error(`Error navigating to ${pageName}:`, error);
      this.renderError(pageContent, pageName);
    } finally {
      pageContent.removeAttribute('aria-busy');
      this.isTransitioning = false;
    }
  }

  renderError(container, pageName) {
    container.innerHTML = `
      <div class="page-container">
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon"><i data-lucide="alert-triangle"></i></div>
            <h3>Không thể tải trang này</h3>
            <p>Đã có lỗi xảy ra. Hãy kiểm tra kết nối mạng rồi thử lại.</p>
            <button type="button" class="btn btn-primary" id="routerRetryBtn">Thử lại</button>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons({ root: container });
    document.getElementById('routerRetryBtn')?.addEventListener('click', () => {
      this.currentPage = null;
      this.navigateTo(pageName, { replace: true });
    });
  }

  updateTitle(pageName) {
    const title = PAGE_TITLES[pageName] || APP_NAME;
    document.title = `${title} · ${APP_NAME}`;
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) pageTitleEl.textContent = title;
  }

  moveFocus(container) {
    const heading = container.querySelector('h1');
    const target = heading || container;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  announce(message) {
    const el = document.getElementById('routeAnnouncer');
    if (!el) return;
    el.textContent = '';
    // Đặt lại sau 1 nhịp để screen reader luôn đọc lại thông báo
    setTimeout(() => { el.textContent = message; }, 50);
  }

  updateActiveNav(pageName) {
    document.querySelectorAll('.nav-item[data-page], .tab-bar-item[data-page]').forEach(item => {
      const isActive = item.dataset.page === pageName;
      item.classList.toggle('active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  getCurrentPage() {
    return this.currentPage;
  }

  handlePopState(event) {
    const page = event.state?.page || window.location.hash.slice(1) || DEFAULT_PAGE;
    this.navigateTo(page, { fromPopState: true });
  }
}

export const router = new Router();

// Khởi tạo Router
export function initRouter() {
  // Sử dụng ủy quyền sự kiện (event delegation) cho các nút điều hướng (hỗ trợ nội dung động)
  const sidebarNav = document.querySelector('.sidebar-nav');
  if (sidebarNav) {
    sidebarNav.addEventListener('click', (e) => {
      const navItem = e.target.closest('.nav-item');
      const page = navItem?.dataset.page;
      if (page) router.navigateTo(page);
    });
  }

  // Sử dụng ủy quyền sự kiện cho thanh tab dưới (mobile)
  const tabBar = document.querySelector('.tab-bar-items');
  if (tabBar) {
    tabBar.addEventListener('click', (e) => {
      const tabItem = e.target.closest('.tab-bar-item');
      const page = tabItem?.dataset.page;
      if (page) router.navigateTo(page);
    });
  }

  // Thiết lập hệ thống đóng/mở sidebar
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

  function openSidebar() {
    sidebar?.classList.add('show');
    sidebarOverlay?.classList.add('show');
    hamburgerBtn?.classList.add('is-active');
    hamburgerBtn?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
    sidebar?.querySelector('.nav-item')?.focus();
  }

  function closeSidebar({ restoreFocus = false } = {}) {
    sidebar?.classList.remove('show');
    sidebarOverlay?.classList.remove('show');
    hamburgerBtn?.classList.remove('is-active');
    hamburgerBtn?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
    if (restoreFocus) hamburgerBtn?.focus();
  }

  hamburgerBtn?.addEventListener('click', () => {
    sidebar?.classList.contains('show') ? closeSidebar() : openSidebar();
  });
  sidebarOverlay?.addEventListener('click', () => closeSidebar());
  sidebarCloseBtn?.addEventListener('click', () => closeSidebar({ restoreFocus: true }));

  // Tự động đóng sidebar trên thiết bị di động khi nhấp vào một nút điều hướng
  sidebarNav?.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') && window.innerWidth <= 768) closeSidebar();
  });

  // Đóng sidebar khi nhấn phím Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('show')) {
      closeSidebar({ restoreFocus: true });
    }
  });

  // Xử lý nút Back/Forward của trình duyệt (chỉ gắn một lần)
  if (!window.routerPopstateAttached) {
    window.addEventListener('popstate', (e) => router.handlePopState(e));
    window.routerPopstateAttached = true;
  }

  // Điều hướng đến trang mặc định theo URL hiện tại (không thêm entry lịch sử mới)
  const hash = window.location.hash.slice(1);
  router.navigateTo(router.isValidPage(hash) ? hash : DEFAULT_PAGE, { replace: true });
}
