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

function createDialog({ title, message, type, onClose }) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'custom-dialog-overlay';
  
  // Create dialog box
  const dialog = document.createElement('div');
  dialog.className = 'custom-dialog';
  
  // Title
  const header = document.createElement('div');
  header.className = 'custom-dialog-header';
  
  const titleEl = document.createElement('h3');
  titleEl.className = 'custom-dialog-title';
  titleEl.textContent = title;
  
  header.appendChild(titleEl);
  
  // Message
  const body = document.createElement('div');
  body.className = 'custom-dialog-body';
  body.textContent = message;
  
  // Footer (Buttons)
  const footer = document.createElement('div');
  footer.className = 'custom-dialog-footer';
  
  const closeDialog = (result) => {
    dialog.classList.add('custom-dialog-closing');
    overlay.classList.add('custom-dialog-closing');
    
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      onClose(result);
    }, 200); // Wait for animation
  };

  if (type === 'confirm') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost custom-dialog-btn';
    cancelBtn.textContent = 'Hủy';
    cancelBtn.onclick = () => closeDialog(false);
    
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-danger custom-dialog-btn'; // Usually confirm is for delete, making it danger for now, but could be customizable
    okBtn.textContent = 'Xác nhận';
    okBtn.onclick = () => closeDialog(true);
    
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
  } else {
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary custom-dialog-btn';
    okBtn.textContent = 'Đóng';
    okBtn.onclick = () => closeDialog(true);
    
    footer.appendChild(okBtn);
  }
  
  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Trigger animation
  requestAnimationFrame(() => {
    overlay.classList.add('custom-dialog-show');
    dialog.classList.add('custom-dialog-show');
  });
}
