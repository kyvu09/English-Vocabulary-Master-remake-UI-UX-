// Sessions Page Module
import { auth, db } from '../../firebase-config.js';
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showAlert, showConfirm } from '../core/ui-utils.js';

let unsubscribers = [];
let sessions = [];
let vocabulary = [];

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
          <button class="btn btn-primary" id="createNewSessionBtn">➕ Tạo buổi học mới</button>
        </div>
      </div>

      <div class="card">
        <div class="section-title">
          <div>
            <h2>Danh sách buổi học</h2>
            <div class="sub">Các nhóm từ vựng của bạn</div>
          </div>
        </div>
        <div id="sessionsContainer" class="stagger-container" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:20px;">
          <div class="table-empty" style="grid-column:1/-1;">
            <div class="table-empty-icon">🎯</div>
            <p>Chưa có buổi học nào. Hãy tạo buổi học đầu tiên!</p>
          </div>
        </div>
      </div>

      <!-- Modal tạo buổi học -->
      <div id="sessionModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1000; align-items:center; justify-content:center;">
        <div style="background:white; border-radius:16px; padding:32px; width:100%; max-width:420px; margin:16px; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <h2 style="margin:0 0 24px;">Tạo buổi học mới</h2>
          <div>
            <label style="font-weight:600; display:block; margin-bottom:6px;">Tên buổi học *</label>
            <input id="sessionNameInput" class="input" type="text" placeholder="Ví dụ: Buổi 1 - Động vật" style="width:100%;" />
          </div>
          <div style="display:flex; gap:12px; margin-top:24px; justify-content:flex-end;">
            <button class="btn btn-ghost" id="sessionModalCancelBtn">Hủy</button>
            <button class="btn btn-primary" id="sessionModalSaveBtn">💾 Tạo</button>
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

  document.getElementById('createNewSessionBtn').addEventListener('click', () => {
    document.getElementById('sessionNameInput').value = '';
    document.getElementById('sessionModal').style.display = 'flex';
    setTimeout(() => document.getElementById('sessionNameInput').focus(), 100);
  });

  document.getElementById('sessionModalCancelBtn').addEventListener('click', () => {
    document.getElementById('sessionModal').style.display = 'none';
  });

  document.getElementById('sessionModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('sessionModal'))
      document.getElementById('sessionModal').style.display = 'none';
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
  saveBtn.textContent = '⏳ Đang tạo...';

  try {
    await addDoc(collection(db, 'users', user.uid, 'sessions'), {
      name,
      nameLower: normalizeText(name),
      slug: slugify(name),
      createdAt: serverTimestamp(),
    });
    document.getElementById('sessionModal').style.display = 'none';
  } catch (err) {
    await showAlert('Tạo thất bại: ' + err.message, 'Lỗi');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Tạo';
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
      <div class="table-empty" style="grid-column:1/-1;">
        <div class="table-empty-icon">🎯</div>
        <p>Chưa có buổi học nào. Hãy tạo buổi học đầu tiên!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(session => `
    <div class="card" style="position:relative;">
      <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:16px;">
        <h3 style="margin:0; flex:1; margin-right:8px;">${session.name}</h3>
        <button class="btn btn-sm btn-danger session-delete-btn" data-id="${session.id}" title="Xóa buổi học">🗑️</button>
      </div>
      <div class="stat-label">Số từ vựng</div>
      <div class="stat-value" style="color:var(--primary); font-size:1.8rem;">${getWordCount(session)}</div>
      <div style="display:flex; gap:8px; margin-top:16px;">
        <button class="btn btn-primary btn-sm session-study-btn" data-id="${session.id}" data-name="${session.name}" style="flex:1;">📖 Luyện tập</button>
        <button class="btn btn-ghost btn-sm session-vocab-btn" data-id="${session.id}" data-name="${session.name}" style="flex:1;">📚 Xem từ</button>
      </div>
    </div>
  `).join('');

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
