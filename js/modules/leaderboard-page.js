import { auth, db, getRank, RANKS } from '../../firebase-config.js';
import { doc, onSnapshot, collection, query, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscriber = null;

export async function render() {
  return `
    <div class="page-container animate-enter">
      <div class="page-header">
        <h1 class="page-title"><i data-lucide="award" class="text-warning float-animate" style="vertical-align: middle; margin-right: 8px;"></i> Xếp Hạng Cá Nhân</h1>
        <p class="page-subtitle">Theo dõi cấp bậc rank học tập và tiến trình tranh hạng của bạn!</p>
      </div>

      <div class="row g-4" style="margin-top: 10px;">
        <!-- Left Column: Current Rank & Progress -->
        <div class="col-lg-7">
          <div class="card h-100 hover-lift d-flex flex-column justify-content-between p-4" id="rankMainCard" style="min-height: 380px;">
            <!-- Loading state -->
            <div class="text-center p-5 my-auto">
              <div class="spinner-border text-primary" role="status"></div>
              <p class="mt-2 text-muted">Đang tải thông tin rank của bạn...</p>
            </div>
          </div>
        </div>

        <!-- Right Column: Reset Countdown & Stats -->
        <div class="col-lg-5">
          <div class="card h-100 hover-lift p-4" id="rankStatsCard" style="min-height: 380px;">
            <!-- Loading state -->
            <div class="text-center p-5 my-auto">
              <div class="spinner-border text-primary" role="status"></div>
              <p class="mt-2 text-muted">Đang tải thống kê...</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Rank Guide List -->
      <div class="card hover-lift mt-4">
        <div class="mb-3">
          <h2 class="m-0 d-flex align-items-center gap-2"><i data-lucide="list-collapse"></i> Hướng Dẫn Cấp Bậc Rank</h2>
          <p class="text-muted small mt-1 mb-0">Hệ thống 7 mức rank từ Iron đến Chromium cao nhất. Điểm số sẽ chia 3 sau mỗi tuần để bắt đầu tuần mới.</p>
        </div>
        <div class="table-wrap">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th class="small text-muted text-uppercase text-center" style="width: 100px;">Trạng thái</th>
                <th class="small text-muted text-uppercase">Tên Rank</th>
                <th class="small text-muted text-uppercase">Khoảng điểm</th>
                <th class="small text-muted text-uppercase">Biểu tượng</th>
                <th class="small text-muted text-uppercase">Màu sắc</th>
              </tr>
            </thead>
            <tbody id="rankGuideTableBody">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function mount() {
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = 'Xếp Hạng';
  }
  loadPersonalRank();
}

function loadPersonalRank() {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, 'users', user.uid);

  unsubscriber = onSnapshot(userRef, async (docSnap) => {
    const mainCard = document.getElementById('rankMainCard');
    const statsCard = document.getElementById('rankStatsCard');
    const guideTableBody = document.getElementById('rankGuideTableBody');
    if (!mainCard || !statsCard) return;

    const userData = docSnap.exists() ? docSnap.data() : {};
    const totalPoints = userData.totalPoints || 0;
    const carryOverPoints = userData.carryOverPoints || 0;
    const rankPeriodStartAt = userData.rankPeriodStartAt;

    const rank = getRank(totalPoints);
    const nextRankIndex = RANKS.findIndex(r => r.name === rank.name) + 1;
    const nextRank = nextRankIndex < RANKS.length ? RANKS[nextRankIndex] : null;

    // Calculate progress to next rank
    let progressPercent = 100;
    let progressText = 'Đang ở Rank cao nhất!';
    if (nextRank) {
      const range = nextRank.min - rank.min;
      const gained = totalPoints - rank.min;
      progressPercent = Math.min(100, Math.max(0, (gained / range) * 100));
      progressText = `Cần thêm ${nextRank.min - totalPoints}đ để đạt Rank ${nextRank.name}`;
    }

    // Calculate time left for reset
    let timeLeftStr = 'Đang tính toán...';
    let nextResetDateStr = '--/--/----';
    let carryOverEstimate = Math.round(totalPoints / 3);

    if (rankPeriodStartAt) {
      const periodTime = rankPeriodStartAt.toDate ? rankPeriodStartAt.toDate().getTime() : new Date(rankPeriodStartAt).getTime();
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const resetTime = periodTime + ONE_WEEK_MS;
      nextResetDateStr = new Date(resetTime).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const timeLeftMs = resetTime - Date.now();
      if (timeLeftMs > 0) {
        const days = Math.floor(timeLeftMs / (24 * 60 * 60 * 1000));
        const hours = Math.floor((timeLeftMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        timeLeftStr = `${days} ngày ${hours} giờ`;
      } else {
        timeLeftStr = 'Chu kỳ đã kết thúc. Sắp reset!';
      }
    }

    // Query attempts to get score breakdown
    let pointsFromMatchPairs = 0;
    let pointsFromQuiz = 0;
    let pointsFromListening = 0;
    let highestCombo = 0;

    try {
      const q = collection(db, 'users', user.uid, 'quizAttempts');
      const snap = await getDocs(q);
      snap.forEach(doc => {
        const data = doc.data();
        const pts = data.points || 0;
        if (data.mode === 'matchpairs') {
          pointsFromMatchPairs += pts;
        } else if (data.mode === 'quiz') {
          pointsFromQuiz += pts;
        } else if (data.mode === 'listening') {
          pointsFromListening += pts;
        }
        if (data.maxCombo && data.maxCombo > highestCombo) {
          highestCombo = data.maxCombo;
        }
      });
    } catch (err) {
      console.error('Lỗi load attempts:', err);
    }

    // Render Left Column: Current Rank
    mainCard.innerHTML = `
      <div class="text-center mb-3 my-auto">
        <h3 class="fw-bold text-muted small text-uppercase letter-spacing-wide">Mức Rank Hiện Tại</h3>
        <div class="user-avatar mx-auto my-3 animate-pulse" style="width: 120px; height: 120px; font-size: 3rem; background: ${rank.color}15; border: 4px solid ${rank.color}; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
          <i data-lucide="${rank.icon}" width="54" height="54" style="color: ${rank.color};"></i>
        </div>
        <h1 class="fw-extrabold text-uppercase m-0" style="color: ${rank.color}; font-size: 2.2rem; letter-spacing: 1px;">${rank.name}</h1>
        <div class="stat-count text-danger mt-2" style="font-size: 2.5rem; font-variant-numeric: tabular-nums;">${totalPoints} <span class="fs-5 text-muted">điểm</span></div>
      </div>

      <div class="mt-4">
        <div class="d-flex justify-content-between align-items-center mb-2 small fw-bold">
          <span class="text-muted">${rank.name} (${rank.min}đ)</span>
          <span style="color: ${nextRank ? nextRank.color : rank.color};">${nextRank ? `${nextRank.name} (${nextRank.min}đ)` : 'Hạng tối đa'}</span>
        </div>
        <div class="match-timer-bar" style="height: 14px; margin-bottom: 8px;">
          <div class="match-timer-fill" style="width: ${progressPercent}%; background: linear-gradient(90deg, ${rank.color}, ${nextRank ? nextRank.color : rank.color});"></div>
        </div>
        <div class="text-center text-muted small fw-semibold mt-1">${progressText}</div>
      </div>
    `;

    // Render Right Column: Stats
    statsCard.innerHTML = `
      <h3 class="fw-bold text-muted small text-uppercase mb-4 text-center">Đếm Ngược & Thống Kê</h3>
      
      <!-- Weekly countdown -->
      <div class="p-3 rounded-4 mb-3 border bg-light-subtle d-flex align-items-center gap-3">
        <div class="user-avatar" style="width: 48px; height: 48px; background: var(--primary-soft); border-color: var(--primary); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="clock" class="text-primary" width="22" height="22"></i>
        </div>
        <div>
          <div class="text-muted small fw-semibold">Thời gian reset tuần sau</div>
          <div class="fw-bold text-primary" style="font-size: 1.15rem;">${timeLeftStr}</div>
          <div class="text-muted small" style="font-size: 0.75rem;">Mốc reset: ${nextResetDateStr}</div>
        </div>
      </div>

      <!-- Carry-over points -->
      <div class="p-3 rounded-4 mb-4 border bg-light-subtle d-flex align-items-center gap-3">
        <div class="user-avatar" style="width: 48px; height: 48px; background: var(--success-bg); border-color: var(--success); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="trending-down" class="text-success" width="22" height="22"></i>
        </div>
        <div>
          <div class="text-muted small fw-semibold">Điểm chuyển tiếp tuần sau (Điểm / 3)</div>
          <div class="fw-bold text-success" style="font-size: 1.15rem;">~ ${carryOverEstimate}đ</div>
          <div class="text-muted small" style="font-size: 0.75rem;">Giữ lại từ thành tích tuần hiện tại</div>
        </div>
      </div>

      <!-- Score Breakdown list -->
      <div class="score-breakdown small">
        <div class="d-flex justify-content-between p-2 border-bottom">
          <span class="text-muted fw-bold">Điểm Ghép Cặp (Match Pairs):</span>
          <span class="fw-bold">${pointsFromMatchPairs}đ</span>
        </div>
        <div class="d-flex justify-content-between p-2 border-bottom">
          <span class="text-muted fw-bold">Điểm Trắc Nghiệm (Quiz):</span>
          <span class="fw-bold">${pointsFromQuiz}đ</span>
        </div>
        <div class="d-flex justify-content-between p-2 border-bottom">
          <span class="text-muted fw-bold">Điểm Nghe Viết (Listening):</span>
          <span class="fw-bold">${pointsFromListening}đ</span>
        </div>
        <div class="d-flex justify-content-between p-2">
          <span class="text-muted fw-bold">Combo cao nhất đạt được:</span>
          <span class="fw-bold text-warning" style="display:inline-flex; align-items:center; gap:2px;"><i data-lucide="zap" width="14" height="14"></i> x${highestCombo}</span>
        </div>
      </div>
    `;

    // Render Table Guide
    if (guideTableBody) {
      guideTableBody.innerHTML = RANKS.map((r, i) => {
        const isCurrent = r.name === rank.name;
        const statusIcon = isCurrent ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill small px-2 py-1 d-inline-flex align-items-center gap-1"><i data-lucide="check" width="12" height="12"></i> Hiện tại</span>' : '<span class="text-muted small">--</span>';
        
        return `
          <tr class="${isCurrent ? 'table-success fw-bold' : ''}">
            <td class="text-center">${statusIcon}</td>
            <td class="fw-bold">${r.name}</td>
            <td class="font-monospace">${r.min}đ - ${r.max === Infinity ? 'Trở lên' : `${r.max}đ`}</td>
            <td><span class="badge" style="background: ${r.color}22; color: ${r.color}; border: 1px solid ${r.color}44; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;"><i data-lucide="${r.icon}" width="12" height="12"></i> ${r.name}</span></td>
            <td><span style="display: inline-block; width: 24px; height: 12px; background: ${r.color}; border-radius: 99px;"></span></td>
          </tr>
        `;
      }).join('');
    }

    if (window.lucide) lucide.createIcons({ root: document.getElementById('pageContent') });
  });
}

export function unmount() {
  if (unsubscriber) {
    unsubscriber();
    unsubscriber = null;
  }
}
