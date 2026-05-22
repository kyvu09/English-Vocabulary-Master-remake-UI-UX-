// Hệ thống Router - Quản lý điều hướng trang và trạng thái

class Router {
  constructor() {
    this.currentPage = null;
    this.pageModules = {};
    this.isTransitioning = false;
  }

  registerPage(name, module) {
    this.pageModules[name] = module;
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

  async navigateTo(pageName) {
    if (this.isTransitioning || this.currentPage === pageName) return;

    this.isTransitioning = true;
    const pageContent = document.getElementById('pageContent');
    
    if (!pageContent) {
      console.error('pageContent element not found');
      this.isTransitioning = false;
      return;
    }

    // Hiệu ứng biến mất (exit animation)
    if (pageContent.children.length > 0) {
      pageContent.children[0].classList.remove('animate-enter');
      pageContent.children[0].classList.add('animate-exit');
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await this.unmountCurrentPage();

    // Tải trang mới
    pageContent.innerHTML = '';
    const pageModule = this.pageModules[pageName];

    if (!pageModule || !pageModule.render) {
      console.error(`Page module not found for: ${pageName}`);
      this.isTransitioning = false;
      return;
    }

    // Hiển thị trang
    try {
      const html = await pageModule.render();
      pageContent.innerHTML = html;
      pageContent.children[0]?.classList.add('animate-enter');

      // Gắn các trình xử lý sự kiện (mount event handlers)
      if (pageModule.mount) {
        await pageModule.mount();
      }

      if (window.lucide) {
        lucide.createIcons({ root: pageContent });
      }

      // Cập nhật thanh điều hướng
      this.updateActiveNav(pageName);
      this.currentPage = pageName;

      // Cập nhật URL nếu sử dụng History API
      window.history.pushState({ page: pageName }, '', `#${pageName}`);

      // Cuộn trang lên đầu
      const appContent = document.querySelector('.app-content');
      if (appContent) {
        appContent.scrollTop = 0;
      }
    } catch (error) {
      console.error(`Error navigating to ${pageName}:`, error);
    } finally {
      this.isTransitioning = false;
    }
  }

  updateActiveNav(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageName);
    });

    document.querySelectorAll('.tab-bar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageName);
    });
  }

  getCurrentPage() {
    return this.currentPage;
  }

  handlePopState(event) {
    if (event.state?.page) {
      this.navigateTo(event.state.page);
    }
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
      if (navItem) {
        const page = navItem.dataset.page;
        if (page) {
          console.log('Navigating to:', page);
          router.navigateTo(page);
        }
      }
    });
  }

  // Sử dụng ủy quyền sự kiện cho các tab dưới thanh điều hướng (tab bar)
  const tabBar = document.querySelector('.tab-bar-items');
  if (tabBar) {
    tabBar.addEventListener('click', (e) => {
      const tabItem = e.target.closest('.tab-bar-item');
      if (tabItem) {
        const page = tabItem.dataset.page;
        if (page) {
          console.log('Navigating to:', page);
          router.navigateTo(page);
        }
      }
    });
  }

  // Thiết lập hệ thống đóng/mở sidebar
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('show');
    if (sidebarOverlay) sidebarOverlay.classList.add('show');
    if (hamburgerBtn) hamburgerBtn.classList.add('is-active');
    document.body.classList.add('no-scroll');
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('show');
    if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    if (hamburgerBtn) hamburgerBtn.classList.remove('is-active');
    document.body.classList.remove('no-scroll');
  }

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = sidebar?.classList.contains('show');
      isOpen ? closeSidebar() : openSidebar();
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', closeSidebar);
  }

  // Tự động đóng sidebar trên thiết bị di động khi nhấp vào một nút điều hướng
  if (sidebarNav) {
    sidebarNav.addEventListener('click', (e) => {
      const navItem = e.target.closest('.nav-item');
      if (navItem && window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  }

  // Đóng sidebar khi nhấn phím Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('show')) {
      closeSidebar();
    }
  });

  // Xử lý sự kiện popstate cho nút Quay lại của trình duyệt (chỉ thêm một lần duy nhất)
  if (!window.routerPopstateAttached) {
    window.addEventListener('popstate', (e) => router.handlePopState(e));
    window.routerPopstateAttached = true;
  }

  // Điều hướng đến trang mặc định
  const hash = window.location.hash.slice(1) || 'dashboard';
  router.navigateTo(hash);
}
