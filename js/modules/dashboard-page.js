// Module Trang chủ (Dashboard) — "Hôm nay học gì?"
import { auth, db, getRank, RANKS, getDayKey } from '../../firebase-config.js';
import { collection, query, orderBy, onSnapshot, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { escapeHtml, getWordEnglish } from '../core/data-utils.js';

const TIPS = [
  { title: 'Học ít nhưng đều mỗi ngày', text: 'Chỉ 10–15 phút mỗi ngày hiệu quả hơn học dồn một buổi dài. Hãy giữ chuỗi học tập của bạn!' },
  { title: 'Chia nhỏ theo buổi học', text: 'Gom 10–20 từ cùng chủ đề vào một buổi để não dễ liên kết và ghi nhớ.' },
  { title: 'Đa dạng chế độ luyện tập', text: 'Kết hợp Quiz, Nghe – gõ và Ghép cặp để rèn cả nhận diện, chính tả và phản xạ.' },
  { title: 'Ôn lại từ hay sai', text: 'Dành vài phút ôn những từ bạn hay trả lời sai — đây là cách tiến bộ nhanh nhất.' },
  { title: 'Nghe phát âm thật nhiều', text: 'Bấm biểu tượng loa ở từng từ để nghe cách đọc và bắt chước theo.' },
  { title: 'Đặt câu với từ mới', text: 'Tự đặt một câu ví dụ cho mỗi từ mới sẽ giúp bạn nhớ lâu hơn rất nhiều.' }
];

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

let unsubscribers = [];
let state = null;
let goalListener = null;

const freshState = () => ({
  loaded: { user: false, vocab: false, sessions: false, quizzes: false },
  words: [],
  sessionsCount: 0,
  quizzesCount: 0,
  userDoc: {}
});

function getGoal() {
  const stored = Number(localStorage.getItem('daily-goal'));
  return [10, 20, 30, 50].includes(stored) ? stored : 20;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function getFirstName() {
  const user = auth.currentUser;
  const label = user?.displayName || user?.email?.split('@')[0] || '';
  return label.trim().split(/\s+/).slice(-1)[0] || 'bạn';
}

function refreshIcons(root) {
  if (window.lucide) lucide.createIcons({ root });
}

const skeletonCard = (lines = 3) => `
  <div class="sk sk-title"></div>
  ${Array.from({ length: lines }, () => '<div class="sk sk-line"></div>').join('')}
`;

export async function render() {
  return `
    <div class="page-container animate-enter">
      <h1 class="sr-only">Trang chủ</h1>

      <section class="dash-hero" id="dashHero" aria-label="Mục tiêu hôm nay">
        <div style="flex:1 1 280px; min-width:0;">
          <div class="sk sk-title" style="background-color:rgba(255,255,255,.25)"></div>
          <div class="sk sk-line" style="width:70%"></div>
        </div>
      </section>

      <section class="quick-actions" aria-label="Thao tác nhanh">
        <button type="button" class="quick-action" data-go="vocabulary" data-action="add-word">
          <span class="qa-icon"><i data-lucide="plus"></i></span>
          <span>Thêm từ mới<small>Tra nghĩa tự động</small></span>
        </button>
        <button type="button" class="quick-action" data-go="sessions" data-action="new-session">
          <span class="qa-icon"><i data-lucide="target"></i></span>
          <span>Tạo buổi học<small>Gom từ theo chủ đề</small></span>
        </button>
        <button type="button" class="quick-action" data-go="practice">
          <span class="qa-icon"><i data-lucide="pen-tool"></i></span>
          <span>Luyện tập<small>4 chế độ khác nhau</small></span>
        </button>
        <button type="button" class="quick-action" data-go="leaderboard">
          <span class="qa-icon"><i data-lucide="award"></i></span>
          <span>Xếp hạng<small>Xem cấp bậc của bạn</small></span>
        </button>
      </section>

      <section class="card" id="onboardingCard" hidden aria-labelledby="onboardingTitle"></section>

      <div class="dash-grid">
        <section class="card dash-col-8" aria-labelledby="statsTitle">
          <h2 class="fs-5 fw-bold mb-3" id="statsTitle">Tổng quan học tập</h2>
          <div id="statsBody">${skeletonCard(2)}</div>
        </section>

        <section class="card dash-col-4" aria-labelledby="rankTitle">
          <h2 class="fs-5 fw-bold mb-3" id="rankTitle">Cấp bậc</h2>
          <div id="rankBody">${skeletonCard(2)}</div>
        </section>

        <section class="card dash-col-6" aria-labelledby="weekTitle">
          <h2 class="fs-5 fw-bold mb-1" id="weekTitle">7 ngày gần nhất</h2>
          <p class="text-muted small mb-3">Số từ bạn đã luyện mỗi ngày</p>
          <div id="weekBody">${skeletonCard(2)}</div>
        </section>

        <section class="card dash-col-6" aria-labelledby="weakTitle">
          <h2 class="fs-5 fw-bold mb-1" id="weakTitle">Từ hay làm sai</h2>
          <p class="text-muted small mb-3">Ôn lại những từ này để tiến bộ nhanh hơn</p>
          <div id="weakBody">${skeletonCard(3)}</div>
        </section>

        <section class="card dash-col-8" aria-labelledby="recentTitle">
          <h2 class="fs-5 fw-bold mb-3" id="recentTitle">Từ mới thêm gần đây</h2>
          <div id="recentBody">${skeletonCard(4)}</div>
        </section>

        <section class="card dash-col-4" id="tipCard" aria-labelledby="tipTitle"></section>
      </div>
    </div>
  `;
}

export async function mount() {
  state = freshState();
  const user = auth.currentUser;

  // Thao tác nhanh
  document.querySelector('.quick-actions')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-go]');
    if (!btn) return;
    if (btn.dataset.action) window.pendingPageAction = btn.dataset.action;
    window.router?.navigateTo(btn.dataset.go);
  });

  renderTip();
  refreshIcons(document.getElementById('pageContent'));

  goalListener = () => { renderHero(); renderWeek(); };
  window.addEventListener('daily-goal-changed', goalListener);

  if (!user) return;

  const uid = user.uid;
  const onErr = (label, targetIds) => (error) => {
    console.error(`Dashboard ${label} load error`, error);
    targetIds.forEach(id => renderLoadError(id));
  };

  // Thông tin người dùng: streak, điểm, hoạt động theo ngày
  unsubscribers.push(onSnapshot(doc(db, 'users', uid), (snap) => {
    state.userDoc = snap.exists() ? snap.data() : {};
    state.loaded.user = true;
    if (window.__appUser) {
      window.__appUser.dailyActivity = state.userDoc.dailyActivity || {};
      window.__appUser.totalPoints = state.userDoc.totalPoints || 0;
    }
    renderHero();
    renderRank();
    renderWeek();
  }, onErr('user', ['rankBody', 'weekBody'])));

  // Từ vựng
  unsubscribers.push(onSnapshot(
    query(collection(db, 'users', uid, 'vocabulary'), orderBy('createdAt', 'desc')),
    (snap) => {
      state.words = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      state.loaded.vocab = true;
      renderStats();
      renderWeak();
      renderRecent();
      renderHero();
      renderOnboarding();
    },
    onErr('vocabulary', ['statsBody', 'weakBody', 'recentBody'])
  ));

  // Buổi học
  unsubscribers.push(onSnapshot(
    collection(db, 'users', uid, 'sessions'),
    (snap) => {
      state.sessionsCount = snap.size;
      state.loaded.sessions = true;
      renderStats();
      renderOnboarding();
    },
    onErr('sessions', ['statsBody'])
  ));

  // Lượt làm bài
  unsubscribers.push(onSnapshot(
    collection(db, 'users', uid, 'quizAttempts'),
    (snap) => {
      state.quizzesCount = snap.size;
      state.loaded.quizzes = true;
      renderStats();
      renderOnboarding();
    },
    onErr('quizAttempts', ['statsBody'])
  ));
}

function renderLoadError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
    <div class="empty-state" style="padding:16px">
      <p class="mb-2">Không tải được dữ liệu.</p>
      <button type="button" class="btn btn-outline-primary btn-sm" data-retry>Thử lại</button>
    </div>`;
  el.querySelector('[data-retry]')?.addEventListener('click', () => {
    window.router.currentPage = null;
    window.router.navigateTo('dashboard', { replace: true });
  });
}

// ─── Hero: mục tiêu hôm nay ──────────────────────────────────────────────────
function getTodayCount() {
  return Number(state?.userDoc?.dailyActivity?.[getDayKey()] || 0);
}

function getWeakWords() {
  return (state?.words || [])
    .map(w => {
      const s = w.stats || {};
      const wrong = s.wrongCount || 0;
      const total = s.totalAnswered || (wrong + (s.correctCount || 0));
      return { word: w, wrong, total, rate: total ? wrong / total : 0 };
    })
    .filter(x => x.total >= 2 && x.rate >= 0.3)
    .sort((a, b) => b.rate - a.rate || b.total - a.total);
}

function renderHero() {
  const hero = document.getElementById('dashHero');
  if (!hero || !state) return;

  const goal = getGoal();
  const done = getTodayCount();
  const percent = Math.min(100, Math.round((done / goal) * 100));
  const reached = done >= goal;
  const hasWords = state.words.length > 0;
  const weakCount = getWeakWords().length;

  let message;
  if (!hasWords && state.loaded.vocab) message = 'Hãy thêm vài từ vựng đầu tiên để bắt đầu hành trình nhé!';
  else if (reached) message = 'Tuyệt vời! Bạn đã hoàn thành mục tiêu hôm nay 🎉';
  else if (done === 0) message = `Mục tiêu hôm nay: luyện ${goal} từ. Bắt đầu thôi!`;
  else message = `Còn ${goal - done} từ nữa là đạt mục tiêu hôm nay. Cố lên!`;

  const primary = !hasWords && state.loaded.vocab
    ? `<button type="button" class="btn btn-light d-inline-flex align-items-center gap-2" id="heroPrimary" data-go="vocabulary" data-action="add-word"><i data-lucide="plus" width="18" height="18"></i> Thêm từ đầu tiên</button>`
    : weakCount > 0 && done === 0
      ? `<button type="button" class="btn btn-light d-inline-flex align-items-center gap-2" id="heroPrimary" data-go="practice" data-preset="weak"><i data-lucide="zap" width="18" height="18"></i> Ôn ${weakCount} từ hay sai</button>`
      : `<button type="button" class="btn btn-light d-inline-flex align-items-center gap-2" id="heroPrimary" data-go="practice"><i data-lucide="play" width="18" height="18"></i> ${done > 0 ? 'Luyện tập tiếp' : 'Bắt đầu luyện tập'}</button>`;

  hero.innerHTML = `
    <div style="flex:1 1 280px; min-width:0;">
      <h1>${getGreeting()}, ${escapeHtml(getFirstName())}! 👋</h1>
      <p>${escapeHtml(message)}</p>
      <div class="d-flex flex-wrap gap-2">
        ${primary}
        <button type="button" class="btn btn-outline-light" data-go="vocabulary" data-action="add-word">Thêm từ mới</button>
      </div>
    </div>
    <div class="d-flex flex-column align-items-center gap-1">
      <div class="ring-wrap" style="--size:112px" role="img" aria-label="Đã luyện ${done} trên ${goal} từ hôm nay">
        <div class="ring" style="--p:${percent}; --thick:11px"></div>
        <div class="ring-label"><strong>${done}/${goal}</strong><small>từ hôm nay</small></div>
      </div>
      <button type="button" class="goal-edit" id="goalEditBtn">Đổi mục tiêu</button>
    </div>
  `;

  hero.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action) window.pendingPageAction = btn.dataset.action;
      if (btn.dataset.preset) window.practicePreset = { source: btn.dataset.preset };
      window.router?.navigateTo(btn.dataset.go);
    });
  });
  hero.querySelector('#goalEditBtn')?.addEventListener('click', () => {
    document.getElementById('userProfile')?.click();
  });
  refreshIcons(hero);
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function renderOnboarding() {
  const card = document.getElementById('onboardingCard');
  if (!card || !state) return;
  const { vocab, sessions, quizzes } = state.loaded;
  if (!(vocab && sessions && quizzes)) return;

  const steps = [
    { done: state.sessionsCount > 0, text: 'Tạo buổi học đầu tiên', go: 'sessions', action: 'new-session', cta: 'Tạo buổi học' },
    { done: state.words.length >= 5, text: `Thêm ít nhất 5 từ vựng (${Math.min(state.words.length, 5)}/5)`, go: 'vocabulary', action: 'add-word', cta: 'Thêm từ' },
    { done: state.quizzesCount > 0, text: 'Hoàn thành bài luyện tập đầu tiên', go: 'practice', cta: 'Luyện tập' }
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  const nextIndex = steps.findIndex(s => !s.done);
  card.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
      <div>
        <h2 class="fs-5 fw-bold m-0" id="onboardingTitle">Bắt đầu nhanh — ${doneCount}/${steps.length} bước</h2>
        <p class="text-muted small m-0">Hoàn thành 3 bước để có trải nghiệm học tốt nhất.</p>
      </div>
    </div>
    <ul class="checklist">
      ${steps.map((s, i) => `
        <li class="${s.done ? 'done' : ''}">
          <span class="check" aria-hidden="true"><i data-lucide="check" width="16" height="16"></i></span>
          <span class="ck-text">${escapeHtml(s.text)}<span class="sr-only">${s.done ? ' — đã xong' : ''}</span></span>
          ${!s.done && i === nextIndex
            ? `<button type="button" class="btn btn-primary btn-sm" data-go="${s.go}" ${s.action ? `data-action="${s.action}"` : ''}>${escapeHtml(s.cta)}</button>`
            : ''}
        </li>`).join('')}
    </ul>
  `;
  card.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action) window.pendingPageAction = btn.dataset.action;
      window.router?.navigateTo(btn.dataset.go);
    });
  });
  refreshIcons(card);
}

// ─── Thống kê ────────────────────────────────────────────────────────────────
function renderStats() {
  const el = document.getElementById('statsBody');
  if (!el || !state) return;
  const total = state.words.length;
  const mastered = state.words.filter(w => w.stats?.mastered).length;
  const pct = Math.round((mastered / Math.max(total, 1)) * 100);

  el.innerHTML = `
    <div class="stat-tiles">
      <div class="stat-tile"><div class="num">${total}</div><div class="lbl">Tổng từ vựng</div></div>
      <div class="stat-tile"><div class="num">${mastered}</div><div class="lbl">Đã thuộc (${pct}%)</div></div>
      <div class="stat-tile"><div class="num">${state.sessionsCount}</div><div class="lbl">Buổi học</div></div>
      <div class="stat-tile"><div class="num">${state.quizzesCount}</div><div class="lbl">Bài đã làm</div></div>
    </div>
    <div class="mt-3">
      <div class="d-flex justify-content-between small text-muted mb-1">
        <span>Tiến độ thuộc từ</span><span>${mastered}/${total}</span>
      </div>
      <div class="progress" role="progressbar" aria-label="Tiến độ thuộc từ" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="height:8px">
        <div class="progress-bar bg-success" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

// ─── Cấp bậc ─────────────────────────────────────────────────────────────────
function renderRank() {
  const el = document.getElementById('rankBody');
  if (!el || !state) return;
  const points = Number(state.userDoc.totalPoints || 0);
  const rank = getRank(points);
  const nextIdx = RANKS.findIndex(r => r.name === rank.name) + 1;
  const next = nextIdx < RANKS.length ? RANKS[nextIdx] : null;
  const pct = next ? Math.min(100, Math.round(((points - rank.min) / (next.min - rank.min)) * 100)) : 100;

  el.innerHTML = `
    <div class="d-flex align-items-center gap-3 mb-3">
      <span style="color:${rank.color}"><i data-lucide="${rank.icon}" width="36" height="36"></i></span>
      <div>
        <div class="fw-bold fs-5" style="color:${rank.color}">${escapeHtml(rank.name)}</div>
        <div class="text-muted small">${points} điểm tuần này</div>
      </div>
    </div>
    <div class="progress mb-2" role="progressbar" aria-label="Tiến độ lên hạng" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="height:8px">
      <div class="progress-bar" style="width:${pct}%; background:${rank.color}"></div>
    </div>
    <div class="small text-muted mb-3">${next ? `Cần thêm ${next.min - points}đ để lên ${escapeHtml(next.name)}` : 'Bạn đang ở hạng cao nhất!'}</div>
    <button type="button" class="btn btn-outline-primary btn-sm" data-go="leaderboard">Xem xếp hạng</button>
  `;
  el.querySelector('[data-go]')?.addEventListener('click', () => window.router?.navigateTo('leaderboard'));
  refreshIcons(el);
}

// ─── Biểu đồ 7 ngày ──────────────────────────────────────────────────────────
function renderWeek() {
  const el = document.getElementById('weekBody');
  if (!el || !state) return;
  const activity = state.userDoc.dailyActivity || {};
  const goal = getGoal();
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({ label: WEEKDAY_LABELS[d.getDay()], value: Number(activity[getDayKey(d)] || 0), isToday: i === 0 });
  }
  const max = Math.max(goal, ...days.map(d => d.value), 1);
  const total = days.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:16px">
        <p class="mb-2">Chưa có hoạt động trong 7 ngày qua.</p>
        <button type="button" class="btn btn-primary btn-sm" data-go="practice">Luyện tập ngay</button>
      </div>`;
    el.querySelector('[data-go]')?.addEventListener('click', () => window.router?.navigateTo('practice'));
    return;
  }

  el.innerHTML = `
    <div class="week-bars" role="img" aria-label="Biểu đồ số từ đã luyện 7 ngày: ${days.map(d => `${d.label} ${d.value}`).join(', ')}">
      ${days.map(d => `
        <div class="week-bar ${d.value > 0 ? 'active' : ''} ${d.isToday ? 'today' : ''}">
          <span class="val">${d.value || ''}</span>
          <div class="bar" style="height:${Math.max(4, Math.round((d.value / max) * 80))}px"></div>
          <span>${d.label}</span>
        </div>`).join('')}
    </div>
    <div class="small text-muted mt-2">Tổng cộng ${total} từ trong 7 ngày · Mục tiêu ${goal} từ/ngày</div>
  `;
}

// ─── Từ hay sai ──────────────────────────────────────────────────────────────
function renderWeak() {
  const el = document.getElementById('weakBody');
  if (!el || !state) return;
  const weak = getWeakWords();

  if (!weak.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:16px">
        <div class="empty-icon"><i data-lucide="thumbs-up"></i></div>
        <p class="mb-0">${state.words.length ? 'Chưa có từ nào hay sai. Tiếp tục phát huy!' : 'Thêm từ và luyện tập để xem thống kê tại đây.'}</p>
      </div>`;
    refreshIcons(el);
    return;
  }

  el.innerHTML = `
    <ul class="weak-list mb-3">
      ${weak.slice(0, 5).map(x => `
        <li>
          <span><span class="w-en">${escapeHtml(getWordEnglish(x.word))}</span> <span class="text-muted small">— ${escapeHtml(x.word.meaning || '')}</span></span>
          <span class="w-rate">${Math.round(x.rate * 100)}% sai</span>
        </li>`).join('')}
    </ul>
    <button type="button" class="btn btn-danger btn-sm d-inline-flex align-items-center gap-1" id="reviewWeakBtn">
      <i data-lucide="zap" width="16" height="16"></i> Ôn ${weak.length} từ này
    </button>
  `;
  el.querySelector('#reviewWeakBtn')?.addEventListener('click', () => {
    window.practicePreset = { source: 'weak' };
    window.router?.navigateTo('practice');
  });
  refreshIcons(el);
}

// ─── Từ mới thêm gần đây ─────────────────────────────────────────────────────
function renderRecent() {
  const el = document.getElementById('recentBody');
  if (!el || !state) return;
  const recent = state.words.slice(0, 5);

  if (!recent.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:16px">
        <div class="empty-icon"><i data-lucide="book-open"></i></div>
        <h3>Chưa có từ vựng nào</h3>
        <p>Thêm từ đầu tiên — ứng dụng sẽ tự tra nghĩa và phiên âm giúp bạn.</p>
        <button type="button" class="btn btn-primary" data-go="vocabulary">Thêm từ vựng</button>
      </div>`;
    el.querySelector('[data-go]')?.addEventListener('click', () => {
      window.pendingPageAction = 'add-word';
      window.router?.navigateTo('vocabulary');
    });
    refreshIcons(el);
    return;
  }

  el.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th scope="col" class="small text-muted">Từ tiếng Anh</th>
            <th scope="col" class="small text-muted">Nghĩa tiếng Việt</th>
            <th scope="col" class="small text-muted">Buổi học</th>
            <th scope="col" class="small text-muted">Ngày thêm</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(w => {
            const date = w.createdAt?.toDate?.() || new Date();
            return `
              <tr>
                <td class="fw-semibold">${escapeHtml(getWordEnglish(w))}</td>
                <td>${escapeHtml(w.meaning || '')}</td>
                <td><span class="pos-chip">${escapeHtml(w.sessionName || 'Chưa xác định')}</span></td>
                <td class="text-muted small">${date.toLocaleDateString('vi-VN')}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Mẹo học tập (đổi theo ngày) ─────────────────────────────────────────────
function renderTip() {
  const el = document.getElementById('tipCard');
  if (!el) return;
  const dayIndex = Math.floor(Date.now() / 86400000) % TIPS.length;
  const tip = TIPS[dayIndex];
  el.innerHTML = `
    <div class="tip-card">
      <span class="tip-icon"><i data-lucide="lightbulb"></i></span>
      <div>
        <h2 class="fs-6 fw-bold mb-1" id="tipTitle">Mẹo hôm nay</h2>
        <div class="fw-semibold small mb-1">${escapeHtml(tip.title)}</div>
        <p class="text-muted small m-0">${escapeHtml(tip.text)}</p>
      </div>
    </div>`;
}

// Giải phóng bộ nhớ khi rời trang (unmount)
export function unmount() {
  unsubscribers.forEach(unsub => unsub?.());
  unsubscribers = [];
  if (goalListener) window.removeEventListener('daily-goal-changed', goalListener);
  goalListener = null;
  state = null;
}
