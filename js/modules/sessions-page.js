// Sessions Page Module
import { auth, db } from '../../firebase-config.js';
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showAlert, showConfirm } from '../core/ui-utils.js';

let unsubscribers = [];
let sessions = [];
let vocabulary = [];
let sessionModalInstance = null;

function normalizeText(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function slugify(value = '') {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

export async function render() {
  return `
    <div class="page-container animate-enter">
      <div class="page-header">
        <h1 class="page-title">Quản lý buổi học</h1>
        <p class="page-subtitle">Tạo và quản lý các buổi học của bạn</p>
        <div class="page-actions">
          <button class="btn btn-primary d-flex align-items-center gap-2" id="createNewSessionBtn">
            <i data-lucide="plus" width="18" height="18"></i> Tạo buổi học mới
          </button>
        </div>
      </div>

      <div class="card">
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
          <div>
            <h2 class="m-0">Danh sách buổi học</h2>
            <div class="text-muted small mt-1">Các nhóm từ vựng của bạn</div>
          </div>
        </div>
        <div id="sessionsContainer" class="row g-3 stagger-fade">
          <div class="col-12">
            <div class="table-empty">
              <div class="table-empty-icon"><i data-lucide="target"></i></div>
              <p>Chưa có buổi học nào. Hãy tạo buổi học đầu tiên!</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal tạo buổi học (Bootstrap) -->
      <div id="sessionModal" class="modal fade" tabindex="-1" style="z-index:1055;">
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content border-0 shadow p-4" style="border-radius:var(--radius);">
            <h2 class="fs-4 fw-bold mb-4">Tạo buổi học mới</h2>
            <div class="mb-0">
              <label class="form-label fw-semibold">Tên buổi học *</label>
              <input id="sessionNameInput" class="form-control" type="text" placeholder="Ví dụ: Buổi 1 - Động vật" />
            </div>
            <div class="d-flex gap-2 justify-content-end mt-4">
              <button class="btn btn-outline-secondary" id="sessionModalCancelBtn">Hủy</button>
              <button class="btn btn-primary d-flex align-items-center gap-1" id="sessionModalSaveBtn"><i data-lucide="save" width="18" height="18"></i> Tạo</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function mount() {
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = 'Buổi học';
  }

  if (!sessionModalInstance) {
    sessionModalInstance = new bootstrap.Modal(document.getElementById('sessionModal'), { backdrop: true });
  }

  document.getElementById('createNewSessionBtn').addEventListener('click', () => {
    document.getElementById('sessionNameInput').value = '';
    sessionModalInstance.show();
    setTimeout(() => document.getElementById('sessionNameInput').focus(), 300);
  });

  document.getElementById('sessionModalCancelBtn').addEventListener('click', () => {
    sessionModalInstance.hide();
  });

  document.getElementById('sessionModalSaveBtn').addEventListener('click', createSession);

  document.getElementById('sessionNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') createSession();
  });

  loadSessions();
  loadVocabulary();
}

async function createSession() {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById('sessionNameInput').value.trim();
  if (!name) {
    await showAlert('Vui lòng nhập tên buổi học!', 'Lưu ý');
    return;
  }

  const saveBtn = document.getElementById('sessionModalSaveBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i data-lucide="loader" width="18" height="18"></i> Đang tạo...';
  if (window.lucide) lucide.createIcons({ root: saveBtn });

  try {
    await addDoc(collection(db, 'users', user.uid, 'sessions'), {
      name,
      nameLower: normalizeText(name),
      slug: slugify(name),
      createdAt: serverTimestamp(),
    });
    sessionModalInstance.hide();
  } catch (err) {
    await showAlert('Tạo thất bại: ' + err.message, 'Lỗi');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i data-lucide="save" width="18" height="18"></i> Tạo';
    if (window.lucide) lucide.createIcons({ root: saveBtn });
  }
}

async function deleteSession(sessionId) {
  const session = sessions.find(s => s.id === sessionId);
  const count = getWordCount(session);
  if (count > 0) {
    await showAlert(`Buổi "${session?.name || ''}" đang có ${count} từ. Hãy xóa hoặc chuyển các từ trước.`, 'Không thể xóa');
    return;
  }
  if (!(await showConfirm('Bạn có chắc muốn xóa buổi học này không?', 'Xác nhận xóa'))) return;
  const user = auth.currentUser;
  if (!user) return;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'sessions', sessionId));
  } catch (err) {
    await showAlert('Xóa thất bại: ' + err.message, 'Lỗi');
  }
}

function loadSessions() {
  const user = auth.currentUser;
  if (!user) return;

  const q = query(collection(db, 'users', user.uid, 'sessions'), orderBy('createdAt', 'desc'));
  unsubscribers.push(onSnapshot(q, snapshot => {
    sessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSessions();
  }));
}

function loadVocabulary() {
  const user = auth.currentUser;
  if (!user) return;

  const q = query(collection(db, 'users', user.uid, 'vocabulary'), orderBy('createdAt', 'desc'));
  unsubscribers.push(onSnapshot(q, snapshot => {
    vocabulary = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSessions();
  }));
}

function getWordCount(session = {}) {
  return vocabulary.filter(word =>
    word.sessionId === session.id ||
    (!word.sessionId && word.sessionName === session.name)
  ).length;
}

function renderSessions() {
  const container = document.getElementById('sessionsContainer');
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="col-12">
        <div class="table-empty">
          <div class="table-empty-icon"><i data-lucide="target"></i></div>
          <p>Chưa có buổi học nào. Hãy tạo buổi học đầu tiên!</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(session => `
    <div class="col-sm-6 col-lg-4">
      <div class="card h-100 hover-lift" style="position:relative;">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
          <h3 class="m-0 fs-5 flex-grow-1">${session.name}</h3>
          <button class="btn btn-sm btn-outline-danger border-0 session-delete-btn p-1" data-id="${session.id}" title="Xóa buổi học"><i data-lucide="trash-2" width="16" height="16"></i></button>
        </div>
        <div class="stat-label mb-1">Số từ vựng</div>
        <div class="stat-count" style="font-size:1.8rem;">${getWordCount(session)}</div>
        <div class="d-flex gap-2 mt-4">
          <button class="btn btn-primary btn-sm flex-fill session-study-btn d-flex align-items-center justify-content-center gap-1" data-id="${session.id}" data-name="${session.name}"><i data-lucide="book-open" width="16" height="16"></i> Luyện tập</button>
          <button class="btn btn-outline-secondary btn-sm flex-fill session-vocab-btn d-flex align-items-center justify-content-center gap-1" data-id="${session.id}" data-name="${session.name}"><i data-lucide="library" width="16" height="16"></i> Xem từ</button>
        </div>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons({ root: container });

  container.querySelectorAll('.session-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteSession(btn.dataset.id));
  });

  container.querySelectorAll('.session-study-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.practiceSessionFilter = {
        id: btn.dataset.id,
        name: btn.dataset.name
      };
      window.router?.navigateTo('practice');
    });
  });

  container.querySelectorAll('.session-vocab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.vocabSessionFilter = {
        id: btn.dataset.id,
        name: btn.dataset.name
      };
      window.router?.navigateTo('vocabulary');
    });
  });
}

export function unmount() {
  unsubscribers.forEach(u => u?.());
  unsubscribers = [];
  sessions = [];
  vocabulary = [];
}
