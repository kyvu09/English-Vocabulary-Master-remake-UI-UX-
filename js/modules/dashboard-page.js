// Dashboard Page Module
import { auth, db } from '../../firebase-config.js';
import { collection, query, orderBy, onSnapshot, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscribers = [];

export async function render() {
  const stats = await getStats();

  return `
    <div class="page-container animate-enter">
      <div class="page-header">
        <h1 class="page-title">Chào mừng trở lại! 👋</h1>
        <p class="page-subtitle">Hãy tiếp tục hành trình học tập của bạn</p>

        <div class="page-actions">
          
      </div>

      <!-- Stats Grid -->
      <div class="stagger-container">
        <div class="card">
          <div class="section-title">
            <div>
              <h2>Tổng quan học tập</h2>
              <div class="sub">Theo dõi tiến độ của bạn</div>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Tổng từ vựng</div>
              <div class="stat-value">${stats.totalWords}</div>
              <div class="stat-change positive">📈 Đã thêm mới</div>
            </div>

            <div class="stat-card">
              <div class="stat-label">Từ đã thuộc</div>
              <div class="stat-value">${stats.learnedWords}</div>
              <div class="stat-change positive">✅ ${Math.round((stats.learnedWords / Math.max(stats.totalWords, 1)) * 100)}%</div>
            </div>

            <div class="stat-card">
              <div class="stat-label">Buổi học</div>
              <div class="stat-value">${stats.sessions}</div>
              <div class="stat-change">📚 Đang học</div>
            </div>

            <div class="stat-card">
              <div class="stat-label">Quiz hoàn thành</div>
              <div class="stat-value">${stats.quizzes}</div>
              <div class="stat-change">🎯 Bài kiểm tra</div>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="card">
          <div class="section-title">
            <div>
              <h2>Hoạt động gần đây</h2>
              <div class="sub">Những từ vựng mới nhất của bạn</div>
            </div>
          </div>
          <div id="recentActivityContainer" class="stagger-container">
            <div class="table-empty">
              <div class="table-empty-icon">📝</div>
              <p>Chưa có hoạt động nào. Hãy bắt đầu thêm từ vựng!</p>
            </div>
          </div>
        </div>

        <!-- Quick Tips -->
        <div class="card">
          <div class="section-title">
            <div>
              <h2>💡 Mẹo học tập</h2>
              <div class="sub">Làm theo những gợi ý này để học hiệu quả</div>
            </div>
          </div>
          <div class="feature-list">
            <div class="feature-item">
              <strong>Học từng buổi thường xuyên</strong>
              <span>Chia nhỏ các từ vựng thành từng nhóm (buổi) để tập trung tốt hơn.</span>
            </div>
            <div class="feature-item">
              <strong>Ôn luyện đa chế độ</strong>
              <span>Sử dụng Quiz, Spelling, Listening để ôn luyện toàn diện.</span>
            </div>
            <div class="feature-item">
              <strong>Kiểm tra tiến độ thường xuyên</strong>
              <span>Xem lịch sử Quiz để đánh giá mức độ thành thạo của bạn.</span>
            </div>
            <div class="feature-item">
              <strong>Nghe phát âm đúng</strong>
              <span>Nhấn biểu tượng loa để nghe cách phát âm từng từ vựng.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function mount() {
  // Setup event listeners
  document.getElementById('createSessionBtn')?.addEventListener('click', () => {
    // Trigger modal or navigate to sessions page
    window.router?.navigateTo('sessions');
  });

  document.getElementById('addWordBtn')?.addEventListener('click', () => {
    window.router?.navigateTo('vocabulary');
  });

  document.getElementById('startQuizBtn')?.addEventListener('click', () => {
    window.router?.navigateTo('practice');
  });

  // Load recent activity
  loadRecentActivity();

  // Update navbar title
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = 'Dashboard';
  }
}

async function getStats() {
  const user = auth.currentUser;
  if (!user) return { totalWords: 0, learnedWords: 0, sessions: 0, quizzes: 0 };

  return new Promise((resolve) => {
    let stats = { totalWords: 0, learnedWords: 0, sessions: 0, quizzes: 0 };
    let loadedCollections = 0;
    const markLoaded = () => {
      loadedCollections++;
      if (loadedCollections >= 3) resolve(stats);
    };
    const handleLoadError = (label, error) => {
      console.error(`Dashboard ${label} load error`, error);
      markLoaded();
    };

    // Load vocabulary
    const vocabQuery = query(
      collection(db, 'users', user.uid, 'vocabulary'),
      orderBy('createdAt', 'desc')
    );

    unsubscribers.push(
      onSnapshot(vocabQuery, (snapshot) => {
        stats.totalWords = snapshot.size;
        stats.learnedWords = snapshot.docs.filter(
          doc => doc.data().stats?.mastered
        ).length;
        markLoaded();
      },
      error => handleLoadError('vocabulary', error))
    );

    // Load sessions
    const sessionsQuery = query(
      collection(db, 'users', user.uid, 'sessions'),
      orderBy('createdAt', 'desc')
    );

    unsubscribers.push(
      onSnapshot(sessionsQuery, (snapshot) => {
        stats.sessions = snapshot.size;
        markLoaded();
      },
      error => handleLoadError('sessions', error))
    );

    // Load quiz attempts
    const quizzesQuery = query(
      collection(db, 'users', user.uid, 'quizAttempts'),
      orderBy('createdAt', 'desc')
    );

    unsubscribers.push(
      onSnapshot(quizzesQuery, (snapshot) => {
        stats.quizzes = snapshot.size;
        markLoaded();
      },
      error => handleLoadError('quizAttempts', error))
    );
  });
}

function loadRecentActivity() {
  const user = auth.currentUser;
  if (!user) return;

  const container = document.getElementById('recentActivityContainer');
  if (!container) return;

  const vocabQuery = query(
    collection(db, 'users', user.uid, 'vocabulary'),
    orderBy('createdAt', 'desc'),
    limit(5)
  );

  unsubscribers.push(
    onSnapshot(vocabQuery, (snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="table-empty">
            <div class="table-empty-icon">📝</div>
            <p>Chưa có hoạt động nào. Hãy bắt đầu thêm từ vựng!</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Từ tiếng Anh</th>
                <th>Nghĩa tiếng Việt</th>
                <th>Buổi học</th>
                <th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              ${snapshot.docs.map(doc => {
                const data = doc.data();
                const date = data.createdAt?.toDate?.() || new Date();
                return `
                  <tr>
                    <td><strong>${data.english || data.englishWord || ''}</strong></td>
                    <td>${data.meaning}</td>
                    <td><span class="badge">${data.sessionName || 'Chưa xác định'}</span></td>
                    <td>${date.toLocaleDateString('vi-VN')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    })
  );
}

// Cleanup on unmount
export function unmount() {
  unsubscribers.forEach(unsub => unsub?.());
  unsubscribers = [];
}
