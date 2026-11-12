// Tiện ích giao diện dùng chung: Toast, Alert, Confirm

/**
 * Hiển thị toast.
 * @param {string} message  Nội dung (luôn được hiển thị dạng văn bản, an toàn với XSS)
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {{ action?: { label: string, onClick: Function }, delay?: number }} [options]
 *        action: nút hành động (ví dụ "Hoàn tác")
 */
export function showToast(message, type = 'success', options = {}) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: 'check-circle',
    error: 'x-circle',
    info: 'info',
    warning: 'alert-triangle'
  };
  const iconName = icons[type] || 'info';
  const { action, delay = action ? 6000 : 3500 } = options;

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type} align-items-center border-0`;
  toastEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toastEl.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toastEl.setAttribute('aria-atomic', 'true');
  toastEl.innerHTML = `
    <div class="d-flex align-items-center">
      <div class="toast-body d-flex align-items-center gap-2 flex-grow-1">
        <span class="d-flex align-items-center"><i data-lucide="${iconName}" width="18" height="18"></i></span>
        <span class="toast-message"></span>
      </div>
      <button type="button" class="btn-close me-2" data-bs-dismiss="toast" aria-label="Đóng thông báo"></button>
    </div>
  `;
  toastEl.querySelector('.toast-message').textContent = message;

  if (action?.label) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-action';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', () => {
      try { action.onClick?.(); } finally { bootstrap.Toast.getInstance(toastEl)?.hide(); }
    });
    toastEl.querySelector('.toast-body').appendChild(actionBtn);
  }

  container.appendChild(toastEl);
  if (window.lucide) lucide.createIcons({ root: toastEl });

  const toast = new bootstrap.Toast(toastEl, { delay });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

export function showAlert(message, title = 'Thông báo') {
  return new Promise((resolve) => {
    createDialog({
      title,
      message,
      type: 'alert',
      onClose: () => resolve(true)
    });
  });
}

/**
 * Hộp thoại xác nhận. Trả về Promise<boolean>.
 * Đóng bằng nút X, phím Esc hoặc bấm ra ngoài đều được tính là "Hủy".
 */
export function showConfirm(message, title = 'Xác nhận', options = {}) {
  return new Promise((resolve) => {
    createDialog({
      title,
      message,
      type: 'confirm',
      confirmText: options.confirmText || 'Xác nhận',
      cancelText: options.cancelText || 'Hủy',
      danger: options.danger !== false,
      onClose: (result) => resolve(result)
    });
  });
}

let dialogModalInstance = null;

function getOrCreateDialogModal() {
  let el = document.getElementById('bootstrapDialogModal');
  if (el) {
    if (!dialogModalInstance) dialogModalInstance = new bootstrap.Modal(el);
    return { el, modal: dialogModalInstance };
  }

  el = document.createElement('div');
  el.id = 'bootstrapDialogModal';
  el.className = 'modal fade';
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('aria-labelledby', 'bootstrapDialogTitle');
  el.style.zIndex = '1080';
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-sm">
      <div class="modal-content border-0 shadow" style="border-radius:var(--radius);">
        <div class="modal-header border-0 pb-0">
          <h5 class="modal-title fw-bold" id="bootstrapDialogTitle"></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
        </div>
        <div class="modal-body" id="bootstrapDialogBody"></div>
        <div class="modal-footer border-0 pt-0" id="bootstrapDialogFooter"></div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  dialogModalInstance = new bootstrap.Modal(el);
  return { el, modal: dialogModalInstance };
}

async function createDialog({ title, message, type, onClose, confirmText, cancelText, danger }) {
  const { el, modal } = getOrCreateDialogModal();

  // Nếu hộp thoại trước vẫn đang hiển thị / đang đóng dở, đợi nó đóng hẳn để không bị bỏ qua
  if (el.style.display === 'block') {
    await new Promise((resolve) => el.addEventListener('hidden.bs.modal', resolve, { once: true }));
  }

  el.querySelector('#bootstrapDialogTitle').textContent = title;
  el.querySelector('#bootstrapDialogBody').textContent = message;

  const footer = el.querySelector('#bootstrapDialogFooter');
  footer.innerHTML = '';

  let settled = false;
  const settle = (result) => {
    if (settled) return;
    settled = true;
    onClose(result);
  };

  let primaryBtn;
  if (type === 'confirm') {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-outline-secondary';
    cancelBtn.textContent = cancelText;
    cancelBtn.onclick = () => { settle(false); modal.hide(); };

    primaryBtn = document.createElement('button');
    primaryBtn.type = 'button';
    primaryBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    primaryBtn.textContent = confirmText;
    primaryBtn.onclick = () => { settle(true); modal.hide(); };

    footer.append(cancelBtn, primaryBtn);
  } else {
    primaryBtn = document.createElement('button');
    primaryBtn.type = 'button';
    primaryBtn.className = 'btn btn-primary';
    primaryBtn.textContent = 'Đóng';
    primaryBtn.onclick = () => { settle(true); modal.hide(); };
    footer.appendChild(primaryBtn);
  }

  // Đóng bằng X / Esc / bấm nền => coi như hủy (alert vẫn trả về true)
  el.addEventListener('hidden.bs.modal', () => {
    settle(type === 'alert');
    footer.innerHTML = '';
  }, { once: true });

  el.addEventListener('shown.bs.modal', () => primaryBtn.focus(), { once: true });

  modal.show();
}
