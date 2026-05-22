// Vocabulary Page Module - Enhanced with AI lookup + POS + Statistics
import { auth, db } from '../../firebase-config.js';
import { 
  collection, query, orderBy, onSnapshot, deleteDoc, doc, 
  addDoc, updateDoc, serverTimestamp, where, limit, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showAlert, showConfirm, showToast } from '../core/ui-utils.js';

const PART_OF_SPEECH = {
  noun: 'Danh từ',
  verb: 'Động từ',
  adjective: 'Tính từ',
  adverb: 'Trạng từ',
  pronoun: 'Đại từ',
  preposition: 'Giới từ',
  conjunction: 'Liên từ',
  interjection: 'Thán từ',
  'phrasal verb': 'Cụm động từ',
  idiom: 'Thành ngữ',
  other: 'Khác'
};

let unsubscribers = [];
let vocabularyData = [];
let sessionsData = [];
let editingWordId = null;
let wordModalInstance = null;

function getEnglish(word = null) {
  return word?.english || word?.englishWord || '';
}

function normalizeSearch(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export async function render() {
  return `
    <div class="page-container animate-enter">
      <div class="page-header">
        <h1 class="page-title">Từ vựng</h1>
        <p class="page-subtitle">Quản lý từ vựng và theo dõi tiến độ</p>
        <div class="page-actions">
          <button class="btn btn-primary d-flex align-items-center gap-2" id="addNewWordBtn">
            <i data-lucide="plus" width="18" height="18"></i> Thêm từ mới
          </button>
        </div>
      </div>

      <div class="card">
        <div class="section-title">
          <div>
            <h2>Danh sách từ vựng</h2>
            <div class="sub">Sắp xếp theo bảng chữ cái A → Z</div>
          </div>
          <span id="wordCountBadge" class="badge">0 từ</span>
        </div>

        <div class="toolbar" style="margin-bottom: 20px;">
          <select id="wordFilterSession" class="select" style="max-width: 220px;">
            <option value="all">Tất cả buổi học</option>
          </select>
          <input id="wordSearchInput" class="input" type="search" placeholder="Tìm từ / nghĩa / loại từ..." style="max-width: 360px;" />
        </div>

        <div id="wordTableContainer" class="table-wrap">
          <div class="table-empty">
            <div class="table-empty-icon"><i data-lucide="book-open"></i></div>
            <p>Chưa có từ vựng nào</p>
          </div>
        </div>
      </div>

      <!-- Modal Thêm/Sửa từ (Bootstrap) -->
      <div id="wordModal" class="modal fade" tabindex="-1" style="z-index:1055;">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content p-4 border-0 shadow" style="border-radius:var(--radius);">
            <h2 class="fs-4 fw-bold mb-4" id="wordModalTitle">Thêm từ vựng mới</h2>
            
            <div class="d-flex gap-2 mb-3">
              <div class="flex-grow-1">
                <label class="form-label fw-semibold">Từ tiếng Anh *</label>
                <input id="modalEnglishWord" class="form-control" type="text" placeholder="apple" />
              </div>
              <button id="lookupBtn" class="btn btn-outline-primary align-self-end d-flex align-items-center gap-1"><i data-lucide="search" width="18" height="18"></i> Tìm</button>
            </div>

            <div id="lookupStatus" class="alert alert-info py-2 px-3 small d-none"></div>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <label class="form-label fw-semibold small">Phiên âm</label>
                <input id="modalPhonetic" class="form-control" type="text" placeholder="/ˈæp.əl/" />
              </div>
              <div class="col-6">
                <label class="form-label fw-semibold small">Loại từ</label>
                <select id="modalPartOfSpeech" class="form-select">
                  <option value="">-- Chọn --</option>
                  ${Object.entries(PART_OF_SPEECH).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold">Nghĩa tiếng Việt *</label>
              <input id="modalMeaning" class="form-control" type="text" placeholder="quả táo; hình tròn..." />
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold">Buổi học</label>
              <select id="modalSession" class="form-select">
                <option value="">-- Chọn buổi học --</option>
              </select>
            </div>

            <div class="d-flex gap-2 justify-content-end mt-4">
              <button class="btn btn-outline-secondary" id="wordModalCancelBtn">Hủy</button>
              <button class="btn btn-primary d-flex align-items-center gap-1" id="wordModalSaveBtn"><i data-lucide="save" width="18" height="18"></i> Lưu</button>
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
    pageTitleEl.textContent = 'Từ vựng';
  }

  document.getElementById('addNewWordBtn').addEventListener('click', () => openWordModal());
  document.getElementById('wordModalCancelBtn').addEventListener('click', closeWordModal);
  document.getElementById('wordModalSaveBtn').addEventListener('click', saveWord);
  document.getElementById('lookupBtn').addEventListener('click', lookupWord);
  document.getElementById('wordSearchInput').addEventListener('input', filterTable);
  document.getElementById('wordFilterSession').addEventListener('change', filterTable);

  if (window.vocabSearchQuery) {
    document.getElementById('wordSearchInput').value = window.vocabSearchQuery;
    window.vocabSearchQuery = null;
  }

  loadSessions();
  loadVocabulary();
}

// ─── Lookup từ Gemini API ────────────────────────────────────────────────────

async function lookupWord() {
  const english = document.getElementById('modalEnglishWord').value.trim();
  if (!english) {
    await showAlert('Vui lòng nhập từ tiếng Anh', 'Lưu ý');
    return;
  }

  const statusEl = document.getElementById('lookupStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = '⏳ Đang tìm...';
  statusEl.style.background = 'var(--info-bg)';
  statusEl.style.color = 'var(--info)';

  try {
   const dictBase = (window.__APP_CONFIG__?.API_DICTIONARY) || "https://api.dictionaryapi.dev/api/v2/entries/en";
   const dictionaryUrl = `${dictBase}/${encodeURIComponent(english)}`;
   const dictionaryResponse = await fetch(dictionaryUrl);
  let sourceText = english;

  if (dictionaryResponse.ok) {
    const entries = await dictionaryResponse.json();
    const firstEntry = Array.isArray(entries) ? entries[0] : null;
    const firstMeaning = firstEntry?.meanings?.[0];
    const firstDefinition = firstMeaning?.definitions?.[0]?.definition?.trim();
    const phonetic =
      firstEntry?.phonetic ||
      firstEntry?.phonetics?.find(item => item?.text)?.text ||
      '';

    if (phonetic) document.getElementById('modalPhonetic').value = phonetic;
    if (firstMeaning?.partOfSpeech) {
      document.getElementById('modalPartOfSpeech').value = firstMeaning.partOfSpeech;
    }
    if (firstDefinition) sourceText = firstDefinition;
  }

  const translateBase = (window.__APP_CONFIG__?.API_TRANSLATE) || "https://api.mymemory.translated.net/get";
  const url = `${translateBase}?q=${encodeURIComponent(sourceText)}&langpair=en|vi`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('API error');
  }

  const data = await response.json();
  const result = data.responseData.translatedText;

  document.getElementById('modalMeaning').value = result;

  statusEl.style.background = 'var(--success-bg)';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = '✅ Dịch thành công!';

  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 1500);

} catch (err) {
  statusEl.style.background = 'var(--danger-bg)';
  statusEl.style.color = 'var(--danger)';
  statusEl.textContent = `❌ Lỗi: ${err.message}`;
}
}

function openWordModal(word = null) {
  editingWordId = word?.id || null;
  document.getElementById('wordModalTitle').textContent = word ? 'Sửa từ vựng' : 'Thêm từ vựng mới';
  document.getElementById('modalEnglishWord').value = getEnglish(word);
  document.getElementById('modalPhonetic').value = word?.phonetic || '';
  document.getElementById('modalMeaning').value = word?.meaning || '';
  document.getElementById('modalPartOfSpeech').value = word?.partOfSpeech || '';
  document.getElementById('lookupStatus').classList.add('d-none');

  const sessionSelect = document.getElementById('modalSession');
  sessionSelect.innerHTML = '<option value="">-- Chọn buổi học --</option>' +
    sessionsData.map(s => `<option value="${s.id}" ${word?.sessionId === s.id ? 'selected' : ''}>${s.name}</option>`).join('');

  if (!wordModalInstance) {
    wordModalInstance = new bootstrap.Modal(document.getElementById('wordModal'), { backdrop: true });
  }
  wordModalInstance.show();
  setTimeout(() => document.getElementById('modalEnglishWord').focus(), 300);
}

function closeWordModal() {
  if (wordModalInstance) wordModalInstance.hide();
  editingWordId = null;
}

async function saveWord() {
  const user = auth.currentUser;
  if (!user) return;

  const english = document.getElementById('modalEnglishWord').value.trim();
  const phonetic = document.getElementById('modalPhonetic').value.trim();
  const meaning = document.getElementById('modalMeaning').value.trim();
  const partOfSpeech = document.getElementById('modalPartOfSpeech').value;
  const sessionId = document.getElementById('modalSession').value;

  // Bắt buộc chọn buổi học
  if (!sessionId) {
    await showAlert('Vui lòng chọn buổi học trước khi lưu!', 'Lưu ý');
    document.getElementById('modalSession').focus();
    return;
  }

  if (!english || !meaning) {
    await showAlert('Vui lòng điền Từ tiếng Anh và Nghĩa!', 'Lưu ý');
    return;
  }

  const englishKey = normalizeSearch(english);
  const duplicateWord = vocabularyData.find(w =>
    w.id !== editingWordId && normalizeSearch(getEnglish(w)) === englishKey
  );
  if (duplicateWord) {
    await showAlert(`Từ "${english}" đã tồn tại trong danh sách.`, 'Lưu ý');
    return;
  }

  const duplicateQuery = query(
    collection(db, 'users', user.uid, 'vocabulary'),
    where('englishNormalized', '==', english.toLowerCase()),
    limit(5)
  );
  const duplicateSnapshot = await getDocs(duplicateQuery);
  const duplicateRemote = duplicateSnapshot.docs.find(d => d.id !== editingWordId);
  if (duplicateRemote) {
    await showAlert(`Từ "${english}" đã tồn tại trong danh sách.`, 'Lưu ý');
    return;
  }

  const saveBtn = document.getElementById('wordModalSaveBtn');
  saveBtn.disabled = true;

  const sessionName = sessionId ? sessionsData.find(s => s.id === sessionId)?.name || '' : '';

  const data = {
    english,
    englishWord: english,
    englishNormalized: english.toLowerCase(),
    phonetic,
    meaning,
    partOfSpeech,
    sessionId: sessionId || null,
    sessionName: sessionName || 'Chưa xác định',
    updatedAt: serverTimestamp(),
  };

  try {
    if (editingWordId) {
      // Chế độ sửa: lưu xong đóng modal
      await updateDoc(doc(db, 'users', user.uid, 'vocabulary', editingWordId), data);
      closeWordModal();
    } else {
      // Chế độ thêm mới: lưu xong giữ modal, clear input, giữ buổi học
      data.createdAt = serverTimestamp();
      data.stats = { correctCount: 0, wrongCount: 0, totalAnswered: 0, accuracy: 0, mastery: 0, mastered: false };
      await addDoc(collection(db, 'users', user.uid, 'vocabulary'), data);

      // Clear các trường nhập nhưng giữ nguyên buổi học đã chọn
      document.getElementById('modalEnglishWord').value = '';
      document.getElementById('modalPhonetic').value = '';
      document.getElementById('modalMeaning').value = '';
      document.getElementById('modalPartOfSpeech').value = '';
      document.getElementById('lookupStatus').style.display = 'none';

      // Hiển thị thông báo thành công
      showSaveSuccessToast(english);

      // Focus lại ô nhập từ mới
      document.getElementById('modalEnglishWord').focus();
    }
  } catch (err) {
    console.error(err);
    await showAlert('Lưu thất bại: ' + err.message, 'Lỗi');
  } finally {
    saveBtn.disabled = false;
  }
}

function showSaveSuccessToast(word) {
  showToast(`Đã lưu "${word}" thành công!`, 'success');
}

async function deleteWord(wordId) {
  if (!(await showConfirm('Xóa từ này?', 'Xác nhận xóa'))) return;
  const user = auth.currentUser;
  if (!user) return;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'vocabulary', wordId));
  } catch (err) {
    await showAlert('Xóa thất bại: ' + err.message, 'Lỗi');
  }
}

function loadSessions() {
  const user = auth.currentUser;
  if (!user) return;
  const q = query(collection(db, 'users', user.uid, 'sessions'), orderBy('createdAt', 'desc'));
  unsubscribers.push(onSnapshot(q, snapshot => {
    sessionsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const filterSelect = document.getElementById('wordFilterSession');
    if (filterSelect) {
      const requestedFilter = window.vocabSessionFilter;
      window.vocabSessionFilter = null;
      const requestedId = typeof requestedFilter === 'object' ? requestedFilter.id : requestedFilter;
      const requestedName = typeof requestedFilter === 'object' ? requestedFilter.name : requestedFilter;
      const current = requestedFilter
        ? sessionsData.find(s => s.id === requestedId || s.name === requestedName)?.id || filterSelect.value
        : filterSelect.value;
      filterSelect.innerHTML = '<option value="all">Tất cả buổi học</option>' +
        sessionsData.map(s => `<option value="${s.id}" ${current === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
      filterSelect.value = sessionsData.some(s => s.id === current) ? current : 'all';
    }
    filterTable();
  }));
}

function loadVocabulary() {
  const user = auth.currentUser;
  if (!user) return;

  const vocabQuery = query(
    collection(db, 'users', user.uid, 'vocabulary'),
    orderBy('englishNormalized', 'asc')
  );

  unsubscribers.push(onSnapshot(vocabQuery, (snapshot) => {
    vocabularyData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const badge = document.getElementById('wordCountBadge');
    if (badge) badge.textContent = `${vocabularyData.length} từ`;
    filterTable();
  }));
}

function filterTable() {
  const search = normalizeSearch(document.getElementById('wordSearchInput')?.value || '');
  const sessionId = document.getElementById('wordFilterSession')?.value || 'all';
  const sessionName = sessionsData.find(s => s.id === sessionId)?.name || '';

  const filtered = vocabularyData.filter(w => {
    const matchSession = sessionId === 'all' || w.sessionId === sessionId || (!w.sessionId && w.sessionName === sessionName);
    const bag = normalizeSearch([
      getEnglish(w),
      w.meaning,
      w.phonetic,
      w.sessionName,
      PART_OF_SPEECH[w.partOfSpeech] || w.partOfSpeech
    ].join(' '));
    const matchSearch = !search || 
      bag.includes(search);
    return matchSession && matchSearch;
  });
  renderTable(filtered);
}

function renderTable(data) {
  const container = document.getElementById('wordTableContainer');
  if (!container) return;

  if (data.length === 0) {
    container.innerHTML = `<div class="table-empty"><div class="table-empty-icon"><i data-lucide="book-open"></i></div><p>Không tìm thấy từ vựng</p></div>`;
    if (window.lucide) lucide.createIcons({ root: container });
    return;
  }

  container.innerHTML = `
    <table class="table table-hover align-middle mb-0" style="min-width:600px;">
      <thead class="table-light">
        <tr>
          <th class="small text-muted text-uppercase">Từ tiếng Anh</th>
          <th class="small text-muted text-uppercase">Phiên âm</th>
          <th class="small text-muted text-uppercase">Loại từ</th>
          <th class="small text-muted text-uppercase">Nghĩa tiếng Việt</th>
          <th class="small text-muted text-uppercase">Độ chính xác</th>
          <th class="small text-muted text-uppercase">Thao tác</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(word => {
          const acc = word.stats?.accuracy || 0;
          const accBadge = acc >= 80 ? 'success' : acc >= 60 ? 'warning' : 'danger';
          return `
            <tr>
              <td class="fw-semibold">${getEnglish(word)}</td>
              <td class="text-muted small">${word.phonetic || '-'}</td>
              <td><span class="badge bg-primary-subtle text-primary-emphasis">${PART_OF_SPEECH[word.partOfSpeech] || word.partOfSpeech || '-'}</span></td>
              <td>${word.meaning}</td>
              <td><span class="badge bg-${accBadge}-subtle text-${accBadge}-emphasis">${acc}%</span></td>
              <td>
                <button class="btn btn-sm btn-outline-secondary border-0 word-edit-btn" data-id="${word.id}" title="Sửa"><i data-lucide="pencil" width="16" height="16"></i></button>
                <button class="btn btn-sm btn-outline-danger border-0 word-delete-btn" data-id="${word.id}" title="Xóa"><i data-lucide="trash-2" width="16" height="16"></i></button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  if (window.lucide) lucide.createIcons({ root: container });

  container.querySelectorAll('.word-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const word = vocabularyData.find(w => w.id === btn.dataset.id);
      if (word) openWordModal(word);
    });
  });

  container.querySelectorAll('.word-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteWord(btn.dataset.id));
  });
}

export function unmount() {
  unsubscribers.forEach(u => u?.());
  unsubscribers = [];
  vocabularyData = [];
  sessionsData = [];
  editingWordId = null;
}
