// Module Trang Kết quả (Results Page) - Lịch sử làm bài + Bảng xếp hạng
import { auth, db } from '../../firebase-config.js';
import { collection, query, orderBy, onSnapshot, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PART_OF_SPEECH = {
  noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ',
  pronoun: 'Đại từ', preposition: 'Giới từ', conjunction: 'Liên từ', other: 'Khác'
};

let unsubscribers = [];

function getEnglish(word = {}) {
  return word.english || word.englishWord || '';
}

export async function render() {
  return `
    <div class="page-container animate-enter">
      <div class="page-header">
        <h1 class="page-title">Kết quả học tập</h1>
        <p class="page-subtitle">Xem tiến độ và lịch sử quiz</p>
      </div>

      <div class="stagger-fade">
        <!-- Ranking -->
        <div class="card hover-lift">
          <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
            <div>
              <h2 class="m-0 d-flex align-items-center gap-2"><i data-lucide="award"></i> Từ đã thuộc</h2>
              <div class="text-muted small mt-1">Các từ với độ chính xác ≥ 80%</div>
            </div>
          </div>
          <div id="rankingContainer" class="table-wrap">
            <div class="table-empty">
              <div class="table-empty-icon"><i data-lucide="bar-chart-2"></i></div>
              <p>Chưa có từ nào đạt tiêu chuẩn</p>
            </div>
          </div>
        </div>

        <!-- History -->
        <div class="card hover-lift">
          <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
            <div>
              <h2 class="m-0 d-flex align-items-center gap-2"><i data-lucide="file-text"></i> Lịch sử Quiz</h2>
              <div class="text-muted small mt-1">Các bài kiểm tra gần đây</div>
            </div>
          </div>
          <div id="historyContainer" class="table-wrap">
            <div class="table-empty">
              <div class="table-empty-icon"><i data-lucide="clipboard-list"></i></div>
              <p>Chưa có bài quiz nào</p>
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
    pageTitleEl.textContent = 'Kết quả';
  }
  loadRanking();
  loadHistory();
}

function formatDate(value) {
  if (!value) return '--';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('vi-VN');
}

function loadRanking() {
  const user = auth.currentUser;
  if (!user) return;

  const q = query(
    collection(db, 'users', user.uid, 'vocabulary'),
    orderBy('stats.accuracy', 'desc'),
    limit(20)
  );

  unsubscribers.push(onSnapshot(q, snapshot => {
    const mastered = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(w => (w.stats?.accuracy || 0) >= 80);

    const container = document.getElementById('rankingContainer');
    if (!container) return;

    if (mastered.length === 0) {
      container.innerHTML = `
        <div class="table-empty">
          <div class="table-empty-icon"><i data-lucide="bar-chart-2"></i></div>
          <p>Chưa có từ nào đạt tiêu chuẩn</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: container });
      return;
    }

    container.innerHTML = `
      <table class="table table-hover align-middle mb-0" style="min-width:500px;">
        <thead class="table-light">
          <tr>
            <th class="small text-muted text-uppercase">#</th>
            <th class="small text-muted text-uppercase">Từ tiếng Anh</th>
            <th class="small text-muted text-uppercase">Loại từ</th>
            <th class="small text-muted text-uppercase">Nghĩa</th>
            <th class="small text-muted text-uppercase">Độ chính xác</th>
            <th class="small text-muted text-uppercase">Số lần</th>
          </tr>
        </thead>
        <tbody>
          ${mastered.map((w, i) => {
            const acc = w.stats?.accuracy || 0;
            const cnt = w.stats?.totalAnswered || 0;
            return `
              <tr>
                <td>${i + 1}</td>
                <td class="fw-semibold">${getEnglish(w)}</td>
                <td><span class="badge bg-primary-subtle text-primary-emphasis">${PART_OF_SPEECH[w.partOfSpeech] || w.partOfSpeech || '-'}</span></td>
                <td>${w.meaning}</td>
                <td><span class="badge bg-success-subtle text-success-emphasis">${acc}%</span></td>
                <td>${cnt}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    if (window.lucide) lucide.createIcons({ root: container });
  }));
}

function loadHistory() {
  const user = auth.currentUser;
  if (!user) return;

  const q = query(
    collection(db, 'users', user.uid, 'quizAttempts'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  unsubscribers.push(onSnapshot(q, snapshot => {
    const container = document.getElementById('historyContainer');
    if (!container) return;

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="table-empty">
          <div class="table-empty-icon"><i data-lucide="clipboard-list"></i></div>
          <p>Chưa có bài quiz nào</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: container });
      return;
    }

    container.innerHTML = `
      <table class="table table-hover align-middle mb-0" style="min-width:600px;">
        <thead class="table-light">
          <tr>
            <th class="small text-muted text-uppercase">Ngày làm</th>
            <th class="small text-muted text-uppercase">Loại</th>
            <th class="small text-muted text-uppercase">Chiều dịch</th>
            <th class="small text-muted text-uppercase">Số câu</th>
            <th class="small text-muted text-uppercase">Đúng</th>
            <th class="small text-muted text-uppercase">Điểm</th>
          </tr>
        </thead>
        <tbody>
          ${snapshot.docs.map(doc => {
            const d = doc.data();
            const date = d.createdAt?.toDate?.() || new Date();
            const totalQuestions = d.totalQuestions || d.total || 0;
            const correctAnswers = d.correctAnswers || d.correct || 0;
            const scorePercent = d.scorePercent ?? d.percent ?? Math.round((correctAnswers / Math.max(totalQuestions, 1)) * 100);
            const scoreBadge = scorePercent >= 80 ? 'success' : scorePercent >= 60 ? 'warning' : 'danger';
            const direction = d.direction || d.directionMode;
            const directionLabel = direction === 'en-vi' ? 'EN → VI' : direction === 'vi-en' ? 'VI → EN' : '<i data-lucide="arrow-left-right" width="14" height="14"></i> Cả hai';
            const modeIcon = d.mode === 'listening' ? '<i data-lucide="headphones" width="14" height="14"></i>' : '<i data-lucide="file-text" width="14" height="14"></i>';

            return `
              <tr>
                <td class="small">${date.toLocaleString('vi-VN')}</td>
                <td><span class="badge bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center gap-1">${modeIcon} ${d.mode === 'listening' ? 'Listening' : 'Quiz'}</span></td>
                <td>${directionLabel}</td>
                <td>${totalQuestions}</td>
                <td class="fw-semibold">${correctAnswers}/${totalQuestions}</td>
                <td><span class="badge bg-${scoreBadge}-subtle text-${scoreBadge}-emphasis">${scorePercent}%</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    if (window.lucide) lucide.createIcons({ root: container });
  }));
}

// Giải phóng bộ nhớ khi rời trang (unmount)
export function unmount() {
  unsubscribers.forEach(u => u?.());
  unsubscribers = [];
}
