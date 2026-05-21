// Results Page - Quiz history + Rankings
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

      <div class="stagger-container">
        <!-- Ranking -->
        <div class="card">
          <div class="section-title">
            <h2>🏆 Từ đã thuộc</h2>
            <div class="sub">Các từ với độ chính xác ≥ 80%</div>
          </div>
          <div id="rankingContainer" class="table-wrap">
            <div class="table-empty">
              <div class="table-empty-icon">📊</div>
              <p>Chưa có từ nào đạt tiêu chuẩn</p>
            </div>
          </div>
        </div>

        <!-- History -->
        <div class="card">
          <div class="section-title">
            <h2>📝 Lịch sử Quiz</h2>
            <div class="sub">Các bài kiểm tra gần đây</div>
          </div>
          <div id="historyContainer" class="table-wrap">
            <div class="table-empty">
              <div class="table-empty-icon">📋</div>
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
          <div class="table-empty-icon">📊</div>
          <p>Chưa có từ nào đạt tiêu chuẩn</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Từ tiếng Anh</th>
            <th>Loại từ</th>
            <th>Nghĩa</th>
            <th>Độ chính xác</th>
            <th>Số lần</th>
          </tr>
        </thead>
        <tbody>
          ${mastered.map((w, i) => {
            const acc = w.stats?.accuracy || 0;
            const cnt = w.stats?.totalAnswered || 0;
            return `
              <tr>
                <td>${i + 1}</td>
                <td><strong>${getEnglish(w)}</strong></td>
                <td><span class="badge">${PART_OF_SPEECH[w.partOfSpeech] || w.partOfSpeech || '-'}</span></td>
                <td>${w.meaning}</td>
                <td><span style="color:#10b981; font-weight:700;">${acc}%</span></td>
                <td>${cnt}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
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
          <div class="table-empty-icon">📋</div>
          <p>Chưa có bài quiz nào</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Ngày làm</th>
            <th>Loại</th>
            <th>Chiều dịch</th>
            <th>Số câu</th>
            <th>Đúng</th>
            <th>Điểm</th>
          </tr>
        </thead>
        <tbody>
          ${snapshot.docs.map(doc => {
            const d = doc.data();
            const date = d.createdAt?.toDate?.() || new Date();
            const totalQuestions = d.totalQuestions || d.total || 0;
            const correctAnswers = d.correctAnswers || d.correct || 0;
            const scorePercent = d.scorePercent ?? d.percent ?? Math.round((correctAnswers / Math.max(totalQuestions, 1)) * 100);
            const direction = d.direction || d.directionMode;
            const directionLabel = direction === 'en-vi' ? '🇺🇸→🇻🇳' : direction === 'vi-en' ? '🇻🇳→🇺🇸' : '↔️ Cả hai';
            const scoreColor = scorePercent >= 80 ? '#10b981' : scorePercent >= 60 ? '#f59e0b' : '#ef4444';

            return `
              <tr>
                <td style="font-size:0.9rem;">${date.toLocaleString('vi-VN')}</td>
                <td><span class="badge">${d.mode === 'listening' ? '🎧' : '📝'} ${d.mode === 'listening' ? 'Listening' : 'Quiz'}</span></td>
                <td>${directionLabel}</td>
                <td>${totalQuestions}</td>
                <td><strong>${correctAnswers}/${totalQuestions}</strong></td>
                <td><span style="color:${scoreColor}; font-weight:700;">${scorePercent}%</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }));
}

export function unmount() {
  unsubscribers.forEach(u => u?.());
  unsubscribers = [];
}
