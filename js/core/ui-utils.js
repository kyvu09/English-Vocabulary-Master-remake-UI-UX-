export function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const icon = icons[type] || 'ℹ️';

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type} align-items-center border-0`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <span style="font-size:1.2rem;">${icon}</span>
        <span>${message}</span>
      </div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  container.appendChild(toastEl);

  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
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

export function showConfirm(message, title = 'Xác nhận') {
  return new Promise((resolve) => {
    createDialog({
      title,
      message,
      type: 'confirm',
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
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-sm">
      <div class="modal-content border-0 shadow" style="border-radius:var(--radius);">
        <div class="modal-header border-0 pb-0">
          <h5 class="modal-title fw-bold" id="bootstrapDialogTitle"></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
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

function createDialog({ title, message, type, onClose }) {
  const { el, modal } = getOrCreateDialogModal();

  el.querySelector('#bootstrapDialogTitle').textContent = title;
  el.querySelector('#bootstrapDialogBody').textContent = message;

  const footer = el.querySelector('#bootstrapDialogFooter');
  footer.innerHTML = '';

  if (type === 'confirm') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-outline-secondary';
    cancelBtn.textContent = 'Hủy';
    cancelBtn.onclick = () => { modal.hide(); onClose(false); };

    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-danger';
    okBtn.textContent = 'Xác nhận';
    okBtn.onclick = () => { modal.hide(); onClose(true); };

    footer.append(cancelBtn, okBtn);
  } else {
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = 'Đóng';
    okBtn.onclick = () => { modal.hide(); onClose(true); };
    footer.appendChild(okBtn);
  }

  el.addEventListener('hidden.bs.modal', () => {
    footer.innerHTML = '';
  }, { once: true });

  modal.show();
}
