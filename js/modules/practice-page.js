// Module Trang Luyện tập (Practice Page) - Hỗ trợ Quiz hai chiều, thống kê chi tiết, luyện nghe
import { auth, db } from '../../firebase-config.js';
import { 
  collection, query, orderBy, getDocs, doc, 
  serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showAlert } from '../core/ui-utils.js';
import { normalizeSearch as normalizeText } from '../core/data-utils.js';

const PART_OF_SPEECH = {
  noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ',
  pronoun: 'Đại từ', preposition: 'Giới từ', conjunction: 'Liên từ',
  interjection: 'Thán từ', 'phrasal verb': 'Cụm động từ', idiom: 'Thành ngữ', other: 'Khác'
};

let allWords = [];
let sessions = [];
let quizState = null;
let allMeanings = [];
let sessionFilter = null;
let defaultSourceId = 'all';
let selectedMode = null;

function getEnglish(word = {}) {
  return word.english || word.englishWord || '';
}

export async function render() {
  sessionFilter = window.practiceSessionFilter || null;
  window.practiceSessionFilter = null;

  return `
    <div class="page-container animate-enter">
      <div class="page-header">
        <h1 class="page-title">Luyện tập Quiz</h1>
        <p class="page-subtitle">Ôn luyện từ vựng qua các bài kiểm tra</p>
      </div>
      <div id="practiceConfig"></div>
      <div id="practiceQuizContent"></div>
    </div>
  `;
}

export async function mount() {
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = 'Luyện tập';
  }
  const user = auth.currentUser;
  if (!user) return;

  // Load data
  const sessionsSnap = await getDocs(query(collection(db, 'users', user.uid, 'sessions'), orderBy('createdAt', 'desc')));
  sessions = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const vocabSnap = await getDocs(query(collection(db, 'users', user.uid, 'vocabulary'), orderBy('englishNormalized', 'asc')));
  allWords = vocabSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(w => getEnglish(w) && w.meaning);
  defaultSourceId = resolveSessionFilterId();
  allMeanings = [...new Set(allWords.flatMap(w => w.meaning.split(/[;,/|]/).map(m => m.trim())))].filter(Boolean);

  if (!allWords.length) {
    document.getElementById('practiceConfig').innerHTML = `
      <div class="card animate-enter" style="text-align:center; padding:48px;">
        <div style="color:var(--primary); margin-bottom:16px;"><i data-lucide="book-open" width="48" height="48"></i></div>
        <h3>Chưa có từ vựng</h3>
        <p>Vui lòng thêm từ vựng trước khi luyện tập</p>
        <button class="btn btn-primary d-inline-flex align-items-center gap-2 justify-content-center" onclick="window.router?.navigateTo('vocabulary')" style="margin-top:16px;"><i data-lucide="plus" width="18" height="18"></i> Thêm từ vựng</button>
      </div>
    `;
    document.getElementById('practiceQuizContent').innerHTML = '';
    if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceConfig') });
    return;
  }

  showQuizConfig();
}

function showQuizConfig() {
  const modes = [
    { value: 'quiz', label: 'Quiz Văn bản', icon: 'edit-3', desc: 'Trả lời câu hỏi dịch thuật', color: 'var(--primary)' },
    { value: 'listening', label: 'Listening', icon: 'headphones', desc: 'Nghe và gõ lại tiếng Anh', color: '#7c3aed' },
    { value: 'matchpairs', label: 'Match Pairs', icon: 'shuffle', desc: 'Ghép cặp từ Anh', color: '#e11d48' }
  ];

  document.getElementById('practiceConfig').innerHTML = `
    <div class="card animate-enter">
      <h2 class="m-0 mb-4 d-flex align-items-center gap-2"><i data-lucide="settings"></i> Cấu hình Quiz</h2>

      <label class="form-label fw-semibold mb-3">Chọn chế độ</label>
      <div class="row g-3 mb-4" id="modeCardsContainer">
        ${modes.map((m) => `
          <div class="col-sm-4">
            <div class="card h-100 mode-card" data-mode="${m.value}" style="cursor:pointer; text-align:center; padding:20px 16px; border:2px solid var(--line); opacity: 0.85; transition: all var(--transition-fast);">
              <div style="font-size:2rem; color:${m.color}; margin-bottom:8px;"><i data-lucide="${m.icon}" width="32" height="32"></i></div>
              <h4 class="m-0 fs-6 fw-bold" style="color:${m.color};">${m.label}</h4>
              <p class="text-muted small mt-1 mb-0" style="line-height:1.4;">${m.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Phần cấu hình các tùy chọn (Loại dịch, Nguồn từ, Số câu hỏi và Bắt đầu) sẽ ẩn ban đầu -->
      <div id="quizOptionsContainer" style="display: none;" class="animate-enter">
        <div class="row g-3 mb-4">
          <div class="col-sm-6" id="directionSelectContainer">
            <label class="form-label fw-semibold">Loại dịch</label>
            <select id="directionSelect" class="form-select">
              <option value="both">Ngẫu nhiên</option>
              <option value="en-vi">English → Tiếng Việt</option>
              <option value="vi-en">Tiếng Việt → English</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label fw-semibold">Nguồn từ</label>
            <select id="sourceSelect" class="form-select">
              <option value="all" ${defaultSourceId === 'all' ? 'selected' : ''}>Tất cả từ vựng (${allWords.length})</option>
              ${sessions.map(s => `<option value="${s.id}" ${defaultSourceId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label fw-semibold">Số câu hỏi</label>
            <input id="wordCountInput" class="form-control" type="number" value="${Math.min(10, allWords.length)}" min="1" max="${allWords.length}" />
          </div>
        </div>

        <div class="d-flex gap-2">
          <button id="startQuizBtn" class="btn btn-primary flex-fill d-flex align-items-center justify-content-center gap-2"><i data-lucide="play" width="18" height="18"></i> Bắt đầu Quiz</button>
          <button id="cancelBtn" class="btn btn-outline-secondary">Hủy</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('practiceQuizContent').innerHTML = '';
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceConfig') });

  // Reset về chưa chọn khi tải cấu hình
  selectedMode = null;
  const modeColors = { quiz: '#2563eb', listening: '#7c3aed', matchpairs: '#e11d48' };
  document.getElementById('modeCardsContainer').addEventListener('click', (e) => {
    const card = e.target.closest('.mode-card');
    if (!card) return;
    const newMode = card.dataset.mode;
    if (!newMode) return;

    selectedMode = newMode;

    document.querySelectorAll('.mode-card').forEach(c => {
      c.classList.remove('mode-card-selected');
      c.style.borderColor = 'var(--line)';
      c.style.opacity = '0.85';
    });
    card.classList.add('mode-card-selected');
    card.style.borderColor = modeColors[newMode] || '#2563eb';
    card.style.opacity = '1';

    // Hiện container tùy chọn và điều chỉnh các input cho phù hợp từng chế độ
    const optionsContainer = document.getElementById('quizOptionsContainer');
    const directionContainer = document.getElementById('directionSelectContainer');
    if (optionsContainer) {
      optionsContainer.style.display = 'block';
    }
    if (directionContainer) {
      if (newMode === 'quiz') {
        directionContainer.style.display = 'block';
      } else {
        // Listening & Match Pairs không cần cấu hình Loại dịch
        directionContainer.style.display = 'none';
      }
    }
  });

  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
  document.getElementById('cancelBtn').addEventListener('click', () => window.router?.navigateTo('dashboard'));
}


async function startQuiz() {
  if (!selectedMode) {
    await showAlert('Vui lòng chọn chế độ để bắt đầu', 'Thông báo');
    return;
  }
  const direction = document.getElementById('directionSelect').value;
  const sourceId = document.getElementById('sourceSelect').value;
  const wordCount = parseInt(document.getElementById('wordCountInput').value) || 10;
  const mode = selectedMode || 'quiz';

  const selectedSession = sessions.find(s => s.id === sourceId);
  let words = sourceId === 'all'
    ? [...allWords]
    : allWords.filter(w => w.sessionId === sourceId || (!w.sessionId && w.sessionName === selectedSession?.name));
  
  if (words.length < 1) {
    await showAlert('Không có từ vựng trong phạm vi đã chọn', 'Lưu ý');
    return;
  }

  words = shuffle(words).slice(0, wordCount);

  // Generate questions
  let questions = [];
  if (direction === 'both') {
    words.forEach(w => {
      questions.push({
        ...w,
        direction: Math.random() < 0.5 ? 'en-vi' : 'vi-en'
      });
    });
  } else {
    words.forEach(w => {
      questions.push({ ...w, direction });
    });
  }

  questions = shuffle(questions);

  document.getElementById('practiceConfig').style.display = 'none';

  if (mode === 'matchpairs') {
    startMatchPairs(words);
    return;
  }

  quizState = {
    mode,
    direction,
    questions,
    currentIndex: 0,
    score: 0,
    answers: [],
    finished: false
  };

  renderQuestion();
}

function resolveSessionFilterId() {
  if (!sessionFilter) return 'all';

  const requestedId = typeof sessionFilter === 'object' ? sessionFilter.id : null;
  const requestedName = typeof sessionFilter === 'object' ? sessionFilter.name : sessionFilter;
  const matchedSession = sessions.find(s => s.id === requestedId || s.name === requestedName);
  return matchedSession?.id || 'all';
}

function renderQuestion() {
  if (quizState.finished) {
    showResults();
    return;
  }

  const q = quizState.questions[quizState.currentIndex];
  const progress = Math.round((quizState.currentIndex / quizState.questions.length) * 100);
  const isEnVi = q.direction === 'en-vi';
  const isListening = quizState.mode === 'listening';
  const english = getEnglish(q);

  // Chế độ nghe (Listening): luôn nghe tiếng Anh → gõ lại tiếng Anh (chép chính tả)
  // Chế độ trắc nghiệm (Quiz): hiển thị gợi ý (prompt) dựa theo chiều dịch thông thường
  const label = isListening
    ? 'Nghe và gõ lại từ tiếng Anh'
    : (isEnVi ? 'Dịch sang tiếng Việt' : 'Dịch sang tiếng Anh');

  const prompt = isEnVi ? english : q.meaning;
  const promptDisplay = isListening
    ? `<div style="color:var(--primary); margin-bottom:8px;"><i data-lucide="headphones" width="48" height="48"></i></div>
       <div style="font-size:1rem; color:var(--muted);">Hãy nghe và gõ lại đúng từ tiếng Anh</div>`
    : `<div style="font-size:2rem; font-weight:700; color:var(--primary); margin-bottom:16px;">${prompt}</div>
       ${!isEnVi ? '' : `<div style="font-size:0.9rem; color:var(--muted);">Loại từ: <strong>${PART_OF_SPEECH[q.partOfSpeech] || q.partOfSpeech}</strong></div>`}`;

  let html = `
    <div class="card animate-enter">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted small">Câu ${quizState.currentIndex + 1}/${quizState.questions.length}</span>
        <span class="badge bg-success-subtle text-success-emphasis d-inline-flex align-items-center gap-1"><i data-lucide="check" width="12" height="12"></i> ${quizState.score} đúng</span>
      </div>
      <div class="progress-gradient mb-4">
        <div class="progress-bar" style="width:${progress}%;"></div>
      </div>

      <div class="practice-card text-center mb-4">
        <div class="text-muted small mb-2">${label}</div>
        ${promptDisplay}
      </div>
  `;

  if (isListening) {
    html += `
      <div class="text-center mb-4">
        <button id="speakBtn" class="btn btn-primary btn-lg px-5 d-inline-flex align-items-center gap-2"><i data-lucide="volume-2"></i> Nghe lại</button>
      </div>
    `;
  }

  html += `
    <div class="mb-3">
      <textarea id="answerInput" class="form-control" style="min-height:60px; resize:none;" placeholder="${isListening ? 'Gõ từ tiếng Anh bạn vừa nghe...' : (isEnVi ? 'Nhập từ/cụm tiếng Việt...' : 'Nhập từ tiếng Anh...')}"></textarea>
      <div id="inputWarning" class="small text-danger mt-1" style="display:none;"><i data-lucide="alert-triangle" width="14" height="14"></i> Hãy nhập câu trả lời trước khi kiểm tra.</div>
    </div>
    <div class="d-flex gap-2">
      <button id="submitBtn" class="btn btn-primary flex-fill d-flex align-items-center justify-content-center gap-2"><i data-lucide="check-circle" width="18" height="18"></i> Kiểm tra</button>
      <button id="skipBtn" class="btn btn-outline-secondary flex-fill d-flex align-items-center justify-content-center gap-2"><i data-lucide="skip-forward" width="18" height="18"></i> Bỏ qua</button>
    </div>
    <div id="feedback"></div>
  `;

  document.getElementById('practiceQuizContent').innerHTML = html;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceQuizContent') });

  document.getElementById('submitBtn').addEventListener('click', checkAnswer);
  document.getElementById('skipBtn').addEventListener('click', () => nextQuestion(null));
  document.getElementById('speakBtn')?.addEventListener('click', () => speakWord(getEnglish(q)));

  if (isListening) {
    setTimeout(() => speakWord(getEnglish(q)), 500);
  }

  setTimeout(() => document.getElementById('answerInput').focus(), 100);
}

function checkAnswer() {
  const q = quizState.questions[quizState.currentIndex];
  const userAnswer = normalizeText(document.getElementById('answerInput').value);
  const isEnVi = q.direction === 'en-vi';
  const isListening = quizState.mode === 'listening';

  if (!userAnswer) {
    // Hiển thị cảnh báo trực tiếp mà không vô hiệu hóa đầu vào để người dùng vẫn có thể tiếp tục nhập liệu
    const warning = document.getElementById('inputWarning');
    const input = document.getElementById('answerInput');
    if (warning) warning.style.display = 'block';
    if (input) {
      input.style.borderColor = 'var(--danger)';
      input.focus();
      input.addEventListener('input', () => {
        warning.style.display = 'none';
        input.style.borderColor = '';
      }, { once: true });
    }
    return;
  }

  // Chế độ Listening: câu trả lời đúng luôn luôn là chính từ tiếng Anh đó (nghe chép chính tả)
  const acceptedAnswers = isListening
    ? [normalizeText(getEnglish(q))]
    : isEnVi
      ? q.meaning.split(/[;,/|]/).map(normalizeText).filter(Boolean)
      : [normalizeText(getEnglish(q))];

  const correct = acceptedAnswers.includes(userAnswer);

  if (correct) quizState.score++;

  quizState.answers.push({
    wordId: q.id,
    english: getEnglish(q),
    meaning: q.meaning,
    direction: q.direction,
    userAnswer: document.getElementById('answerInput').value.trim(),
    correct,
    correctAnswers: isListening ? getEnglish(q) : acceptedAnswers.map(a => denormalizeText(a, isEnVi)).join(' / ')
  });

  const title = correct ? '<i data-lucide="check-circle" width="16" height="16"></i> Chính xác!' : '<i data-lucide="x-circle" width="16" height="16"></i> Sai rồi!';

  // Luôn hiển thị từ tiếng Anh và nghĩa đầy đủ sau khi kiểm tra xong (listening & quiz)
  const msg = correct
    ? `"${getEnglish(q)}" — nghĩa là: "${q.meaning}"`
    : isListening
      ? `Từ đúng: <strong>${getEnglish(q)}</strong> — nghĩa là: "${q.meaning}"`
      : `Đáp án đúng: "<strong>${quizState.answers[quizState.currentIndex].correctAnswers}</strong>" — "${isEnVi ? q.meaning : getEnglish(q)}"`;

  showFeedback(correct ? 'success' : 'error', title, msg);
}

function denormalizeText(text, isViet) {
  if (!isViet) return text.split(' ')[0];
  return text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function showFeedback(type, title, msg) {
  const submitBtn = document.getElementById('submitBtn');
  const skipBtn = document.getElementById('skipBtn');
  const answerInput = document.getElementById('answerInput');
  
  answerInput.disabled = true;
  submitBtn.disabled = true;
  skipBtn.disabled = true;

  const borderColor = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--warning)';
  const bgColor = type === 'success' ? 'var(--success-bg)' : type === 'error' ? 'var(--danger-bg)' : 'var(--warning-bg)';
  const textColor = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--warning)';

  document.getElementById('feedback').innerHTML = `
    <div style="margin-top:20px; padding:16px; background:${bgColor}; border-radius:12px; border-left:4px solid ${borderColor};">
      <div style="font-weight:700; color:${textColor}; margin-bottom:6px;">${title}</div>
      <div style="color:${textColor}; font-size:0.95rem;">${msg}</div>
      <button id="nextBtn" class="btn btn-primary" style="width:100%; margin-top:12px;">
        ${quizState.currentIndex === quizState.questions.length - 1 ? '<i data-lucide="flag" width="16" height="16"></i> Xem kết quả' : 'Câu tiếp theo →'}
      </button>
    </div>
  `;

  if (window.lucide) lucide.createIcons({ root: document.getElementById('feedback') });

  document.getElementById('nextBtn').addEventListener('click', () => nextQuestion(quizState.answers[quizState.currentIndex]));
}

function nextQuestion(answer) {
  if (quizState.currentIndex >= quizState.questions.length - 1) {
    quizState.finished = true;
    renderQuestion();
  } else {
    quizState.currentIndex++;
    renderQuestion();
  }
}

async function showResults() {
  const total = quizState.answers.length;
  const correct = quizState.answers.filter(a => a.correct).length;
  const percent = Math.round((correct / total) * 100);
  const emoji = percent >= 80 ? '<i data-lucide="award" width="64" height="64"></i>' : percent >= 60 ? '<i data-lucide="thumbs-up" width="64" height="64"></i>' : percent >= 40 ? '<i data-lucide="minus" width="64" height="64"></i>' : '<i data-lucide="frown" width="64" height="64"></i>';

  // Lưu kết quả vào Firestore bằng cơ chế Write Batch
  const user = auth.currentUser;
  if (user) {
    try {
      const batch = writeBatch(db);
      
      // Lưu thông tin lượt làm quiz
      const attemptRef = doc(collection(db, 'users', user.uid, 'quizAttempts'));
      batch.set(attemptRef, {
        direction: quizState.direction,
        mode: quizState.mode,
        totalQuestions: total,
        correctAnswers: correct,
        scorePercent: percent,
        answers: quizState.answers,
        createdAt: serverTimestamp()
      });

      // Cập nhật số liệu thống kê chi tiết của từng từ vựng
      const statsByWord = new Map();
      quizState.answers.forEach(a => {
        if (!statsByWord.has(a.wordId)) {
          statsByWord.set(a.wordId, { correct: 0, wrong: 0 });
        }
        const s = statsByWord.get(a.wordId);
        if (a.correct) s.correct++;
        else s.wrong++;
      });

      for (const [wordId, delta] of statsByWord.entries()) {
        const word = allWords.find(w => w.id === wordId);
        if (!word) continue;

        const newStats = {
          correctCount: (word.stats?.correctCount || 0) + delta.correct,
          wrongCount: (word.stats?.wrongCount || 0) + delta.wrong,
        };
        newStats.totalAnswered = newStats.correctCount + newStats.wrongCount;
        newStats.accuracy = newStats.totalAnswered ? Math.round((newStats.correctCount / newStats.totalAnswered) * 100) : 0;
        newStats.mastery = Math.min(100, Math.round((newStats.correctCount / 30) * 100));
        newStats.mastered = newStats.correctCount >= 30;

        batch.update(doc(db, 'users', user.uid, 'vocabulary', wordId), { stats: newStats, updatedAt: serverTimestamp() });
      }

      await batch.commit();
      await enforceQuizHistoryLimit(user.uid);
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  document.getElementById('practiceQuizContent').innerHTML = `
    <div class="card text-center border-0 animate-enter">
      <div class="float-animate" style="font-size:4rem; margin-bottom:12px;">${emoji}</div>
      <h2 class="m-0">${percent >= 80 ? 'Xuất sắc!' : percent >= 60 ? 'Tốt lắm!' : percent >= 40 ? 'Cố gắng thêm!' : 'Cần ôn luyện!'}</h2>
      <div class="stat-count" style="font-size:3rem; margin:16px 0;">${correct}/${total}</div>
      <div class="text-muted mb-4 fs-5">${percent}% chính xác</div>

      <div class="card text-start mb-4">
        <h3 class="m-0 mb-3">Chi tiết kết quả</h3>
        <div class="stagger-fade" style="max-height:280px; overflow-y:auto;">
          ${quizState.answers.map((a, index) => `
            <div class="d-flex align-items-start gap-2 p-2 mb-2 rounded-3" style="background:var(--surface-soft); border-left:4px solid var(--border);">
              <div class="text-muted small fw-bold" style="min-width:32px;">#${index + 1}</div>
              <div>
                <div class="fw-bold small d-flex align-items-center gap-1">${a.correct ? '<i data-lucide="check" width="14" height="14"></i>' : '<i data-lucide="x" width="14" height="14"></i>'} ${a.english}</div>
                <div class="small">
                  ${a.correct ? `<i data-lucide="check" width="14" height="14"></i> Đúng` : `<i data-lucide="x" width="14" height="14"></i> Sai - Đáp án: ${a.correctAnswers}`}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="d-flex gap-2 justify-content-center flex-wrap">
        <button class="btn btn-outline-secondary d-inline-flex align-items-center gap-1" onclick="location.reload()"><i data-lucide="rotate-ccw" width="18" height="18"></i> Làm lại</button>
        <button class="btn btn-outline-primary d-inline-flex align-items-center gap-1" onclick="window.router?.navigateTo('results')"><i data-lucide="bar-chart-2" width="18" height="18"></i> Xem lịch sử</button>
        <button class="btn btn-primary d-inline-flex align-items-center gap-1" onclick="window.router?.navigateTo('dashboard')"><i data-lucide="home" width="18" height="18"></i> Trang chủ</button>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceQuizContent') });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function speakWord(word) {
  if (!('speechSynthesis' in window)) {
    showAlert('Trình duyệt không hỗ trợ text-to-speech', 'Lỗi');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

// ── Match Pairs ──────────────────────────────────────────────
const MATCH_PAIRS_COUNT = 6;

let matchState = null;

function startMatchPairs(words) {
  const allWords = shuffle([...words]);
  const active = allWords.slice(0, MATCH_PAIRS_COUNT);
  const pool = allWords.slice(MATCH_PAIRS_COUNT);

  // Tạo và trộn riêng hai cột ban đầu (chỉ trộn duy nhất 1 lần khi bắt đầu)
  const leftTiles = shuffle(active.map(w => ({ id: w.id, text: getEnglish(w), state: 'active' })));
  const rightTiles = shuffle(active.map(w => ({ id: w.id, text: w.meaning, state: 'active' })));

  const initialTime = 5 + (words.length * 2.5);

  matchState = {
    pool,
    leftTiles,
    rightTiles,
    timer: initialTime,
    initialTime: initialTime,
    totalPairs: words.length,
    matched: 0,
    attempts: 0,
    combo: 0,
    maxCombo: 0,
    score: 0,
    selected: [],
    pendingMatches: [], // Bộ đệm lưu các cặp ghép đúng chờ thay thế (đủ 2 cặp mới đổi)
    locked: false,
    intervalId: null,
    finished: false
  };

  renderMatchBoard(true); // Tham số true biểu thị lượt render đầu tiên
  matchState.intervalId = setInterval(matchTick, 1000);
}

function matchTick() {
  if (matchState.finished) return;
  matchState.timer--;
  updateMatchTimer();
  if (matchState.timer <= 0) {
    endMatchPairs();
  }
}

function updateMatchTimer() {
  const fill = document.getElementById('matchTimerFill');
  const label = document.getElementById('matchTimerLabel');
  if (fill) fill.style.width = `${Math.min(100, Math.max(0, (matchState.timer / matchState.initialTime) * 100))}%`;
  if (label) label.textContent = `${Math.max(0, matchState.timer).toFixed(1)}s`;
}

function renderTileHTML(t, index, side, isFirstRender) {
  if (t.state === 'empty') {
    return `<div class="match-tile-empty" style="height: 52px; margin-bottom: 8px; opacity: 0; pointer-events: none;"></div>`;
  }

  // Thêm class matched để tạo hiệu ứng ẩn mờ nếu thẻ đã được ghép đúng
  const matchedClass = t.state === 'matched' ? 'matched' : '';
  const animClass = t.state === 'spawning' ? 'animate-spawn-tile' : (isFirstRender ? 'animate-spawn-tile' : '');
  
  return `
    <button class="match-tile ${matchedClass} ${animClass}" data-pair="${t.id}" data-side="${side}" data-index="${index}" style="margin-bottom: 8px;" ${t.state === 'matched' ? 'disabled' : ''}>
      ${t.text}
    </button>
  `;
}

function renderMatchBoard(isFirstRender = false) {
  const html = `
    <div class="match-container animate-enter">
      <div class="match-header">
        <h2 class="match-title"><i data-lucide="shuffle" width="22" height="22"></i> Match Pairs</h2>
        <div class="match-stats-row">
          <div class="match-badge badge-correct"><i data-lucide="check" width="14" height="14"></i> <span id="matchStatsMatched">${matchState.matched}</span></div>
          <div class="match-badge badge-timer" id="matchComboBadge"><i data-lucide="zap" width="14" height="14"></i> <span id="matchCombo">${matchState.combo}</span></div>
          <div class="match-badge badge-timer" id="matchTimerLabel">${Math.max(0, matchState.timer).toFixed(1)}s</div>
        </div>
      </div>
      <div class="match-timer-bar">
        <div id="matchTimerFill" class="match-timer-fill" style="width:${Math.min(100, Math.max(0, (matchState.timer / matchState.initialTime) * 100))}%"></div>
      </div>
      <div class="match-board">
        <div class="match-column">
          <div class="match-column-title">English</div>
          ${matchState.leftTiles.map((t, idx) => renderTileHTML(t, idx, 'left', isFirstRender)).join('')}
        </div>
        <div class="match-column">
          <div class="match-column-title">Tiếng Việt</div>
          ${matchState.rightTiles.map((t, idx) => renderTileHTML(t, idx, 'right', isFirstRender)).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('practiceQuizContent').innerHTML = html;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceQuizContent') });

  document.querySelectorAll('.match-tile').forEach(el => {
    el.addEventListener('click', () => onMatchTileClick(el));
  });

  // Sau khi hiển thị, đổi tất cả trạng thái 'spawning' về 'active' để tránh chạy lại animation
  matchState.leftTiles.forEach(t => { if (t.state === 'spawning') t.state = 'active'; });
  matchState.rightTiles.forEach(t => { if (t.state === 'spawning') t.state = 'active'; });
}

function onMatchTileClick(el) {
  if (matchState.finished || matchState.locked) return;
  if (el.classList.contains('selected') || el.classList.contains('matched') || el.classList.contains('match-correct')) return;

  const side = el.dataset.side;

  if (matchState.selected.length === 1) {
    const first = matchState.selected[0];
    if (first.dataset.side === side) {
      first.classList.remove('selected');
      matchState.selected = [];
      return;
    }
  }

  el.classList.add('selected');
  matchState.selected.push(el);

  if (matchState.selected.length === 2) {
    matchState.locked = true;
    checkMatchPair();
  }
}

function checkMatchPair() {
  const [a, b] = matchState.selected;
  const match = a.dataset.pair === b.dataset.pair;

  matchState.attempts++;

  if (match) {
    matchState.matched++;
    matchState.combo++;
    if (matchState.combo > matchState.maxCombo) matchState.maxCombo = matchState.combo;
    const points = 100 + (matchState.combo - 1) * 50;
    matchState.score += points;

    matchState.timer += 0.3;
    updateMatchTimer();

    // Trước tiên áp dụng class match-correct để tạo hiệu ứng nhấp nháy xanh lá (pop) cực đẹp
    a.classList.remove('selected');
    b.classList.remove('selected');
    a.classList.add('match-correct');
    b.classList.add('match-correct');

    document.getElementById('matchStatsMatched').textContent = matchState.matched;
    const comboEl = document.getElementById('matchCombo');
    if (comboEl) comboEl.textContent = matchState.combo;
    if (window.lucide) lucide.createIcons({ root: document.querySelector('.match-header') });

    // Xác định chỉ số slot của 2 thẻ vừa được ghép đúng
    const leftEl = a.dataset.side === 'left' ? a : b;
    const rightEl = a.dataset.side === 'right' ? a : b;
    const leftIdx = parseInt(leftEl.dataset.index);
    const rightIdx = parseInt(rightEl.dataset.index);

    // Cập nhật trạng thái trong bộ nhớ thành 'matched' (để giữ ẩn mờ khi vẽ lại bảng)
    matchState.leftTiles[leftIdx].state = 'matched';
    matchState.rightTiles[rightIdx].state = 'matched';

    // Lưu cặp chỉ số vừa ghép đúng vào bộ đệm pendingMatches
    matchState.pendingMatches.push({ leftIdx, rightIdx });

    // Sau khi hiệu ứng nhấp nháy xanh lá (pop) chạy được 400ms, chuyển sang trạng thái ẩn mờ (matched)
    setTimeout(() => {
      a.classList.remove('match-correct');
      b.classList.remove('match-correct');
      a.classList.add('matched');
      b.classList.add('matched');
      a.disabled = true;
      b.disabled = true;
    }, 400);

    // Giải phóng trạng thái lựa chọn để người dùng có thể thao tác tiếp cặp thứ 2 ngay lập tức
    matchState.selected = [];
    matchState.locked = false;

    // Nếu đã ghép đúng đủ 2 cặp, tiến hành thay thế và tự trộn lẫn nhau
    if (matchState.pendingMatches.length === 2) {
      matchState.locked = true; // Khóa bảng tạm thời để thực hiện thay thế
      setTimeout(() => {
        replacePendingPairs();
      }, 600);
    } else {
      // Trường hợp đặc biệt: không còn thẻ hoạt động nào trên bảng và pool rỗng (kết thúc game)
      const activeCount = matchState.leftTiles.filter(t => t.state === 'active' || t.state === 'spawning').length;
      if (activeCount === 0) {
        setTimeout(() => {
          endMatchPairs();
        }, 600);
      }
    }
  } else {
    matchState.combo = 0;
    const comboEl = document.getElementById('matchCombo');
    if (comboEl) comboEl.textContent = '0';

    a.classList.add('wrong');
    b.classList.add('wrong');

    matchState.timer -= 0.7;
    if (matchState.timer < 0) matchState.timer = 0;
    updateMatchTimer();
    if (matchState.timer <= 0) {
      endMatchPairs();
    }

    setTimeout(() => {
      a.classList.remove('selected', 'wrong');
      b.classList.remove('selected', 'wrong');
      matchState.selected = [];
      matchState.locked = false;
    }, 500);
  }
}

function replacePendingPairs() {
  if (matchState.finished) return;

  const [pair1, pair2] = matchState.pendingMatches;
  const leftIdx1 = pair1.leftIdx;
  const rightIdx1 = pair1.rightIdx;
  const leftIdx2 = pair2.leftIdx;
  const rightIdx2 = pair2.rightIdx;

  if (matchState.pool.length >= 2) {
    const wordA = matchState.pool.shift();
    const wordB = matchState.pool.shift();

    // Tự trộn lẫn nhau giữa 2 thẻ mới nạp trước khi đưa vào slot cũ cột trái
    const leftValues = shuffle([
      { id: wordA.id, text: getEnglish(wordA), state: 'spawning' },
      { id: wordB.id, text: getEnglish(wordB), state: 'spawning' }
    ]);
    // Tự trộn lẫn nhau giữa 2 thẻ mới nạp trước khi đưa vào slot cũ cột phải
    const rightValues = shuffle([
      { id: wordA.id, text: wordA.meaning, state: 'spawning' },
      { id: wordB.id, text: wordB.meaning, state: 'spawning' }
    ]);

    matchState.leftTiles[leftIdx1] = leftValues[0];
    matchState.leftTiles[leftIdx2] = leftValues[1];

    matchState.rightTiles[rightIdx1] = rightValues[0];
    matchState.rightTiles[rightIdx2] = rightValues[1];
  } else if (matchState.pool.length === 1) {
    const wordA = matchState.pool.shift();

    // 1 từ mới và 1 slot rỗng, trộn lẫn nhau
    const leftValues = shuffle([
      { id: wordA.id, text: getEnglish(wordA), state: 'spawning' },
      { state: 'empty' }
    ]);
    const rightValues = shuffle([
      { id: wordA.id, text: wordA.meaning, state: 'spawning' },
      { state: 'empty' }
    ]);

    matchState.leftTiles[leftIdx1] = leftValues[0];
    matchState.leftTiles[leftIdx2] = leftValues[1];

    matchState.rightTiles[rightIdx1] = rightValues[0];
    matchState.rightTiles[rightIdx2] = rightValues[1];
  } else {
    // Rỗng hoàn toàn trong pool, đặt các slot đã ghép thành trống
    matchState.leftTiles[leftIdx1] = { state: 'empty' };
    matchState.leftTiles[leftIdx2] = { state: 'empty' };

    matchState.rightTiles[rightIdx1] = { state: 'empty' };
    matchState.rightTiles[rightIdx2] = { state: 'empty' };
  }

  // Xóa bộ đệm sau khi thay thế
  matchState.pendingMatches = [];
  matchState.selected = [];
  matchState.locked = false;

  // Kiểm tra xem tất cả các ô đã trống chưa để kết thúc game
  const allEmpty = matchState.leftTiles.every(t => t.state === 'empty');
  if (allEmpty) {
    endMatchPairs();
  } else {
    renderMatchBoard();
  }
}

// Giới hạn lịch sử lưu tối đa 10 lượt làm gần nhất trong Firestore
async function enforceQuizHistoryLimit(userId) {
  try {
    const q = query(
      collection(db, 'users', userId, 'quizAttempts'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.size > 10) {
      const batch = writeBatch(db);
      for (let i = 10; i < snap.docs.length; i++) {
        batch.delete(snap.docs[i].ref);
      }
      await batch.commit();
    }
  } catch (err) {
    console.error('Lỗi khi giới hạn số lượng lịch sử:', err);
  }
}

// Lưu lịch sử chế độ Match Pairs vào Firestore
async function saveMatchPairsAttempt(userId, total, correct, percent) {
  try {
    const batch = writeBatch(db);
    const attemptRef = doc(collection(db, 'users', userId, 'quizAttempts'));
    batch.set(attemptRef, {
      direction: 'both',
      mode: 'matchpairs',
      totalQuestions: total,
      correctAnswers: correct,
      scorePercent: percent,
      createdAt: serverTimestamp()
    });
    await batch.commit();
    await enforceQuizHistoryLimit(userId);
  } catch (err) {
    console.error('Lỗi khi lưu kết quả ghép cặp:', err);
  }
}

function endMatchPairs() {
  matchState.finished = true;
  if (matchState.intervalId) {
    clearInterval(matchState.intervalId);
    matchState.intervalId = null;
  }

  const totalPairs = matchState.totalPairs || 1;
  const accuracy = Math.round((matchState.matched / totalPairs) * 100);

  const user = auth.currentUser;
  if (user) {
    saveMatchPairsAttempt(user.uid, totalPairs, matchState.matched, accuracy);
  }

  let emojiIcon = 'trophy';
  let title = 'Xuất sắc!';
  if (accuracy < 50) { emojiIcon = 'book-open'; title = 'Cần luyện thêm!'; }
  else if (accuracy < 75) { emojiIcon = 'thumbs-up'; title = 'Khá tốt!'; }

  document.getElementById('practiceQuizContent').innerHTML = `
    <div class="match-result-overlay animate-enter">
      <div class="card text-center border-0 result-card">
        <div class="float-animate" style="color:var(--text); margin-bottom:12px;">
          <i data-lucide="${emojiIcon}" width="64" height="64"></i>
        </div>
        <h2 class="m-0">${title}</h2>
        <p class="text-muted mb-4">Kết quả Match Pairs</p>

        <div class="match-stats-grid">
          <div class="match-stat">
            <div class="match-stat-value text-primary">${matchState.matched}/${totalPairs}</div>
            <div class="match-stat-label">Cặp đã ghép</div>
          </div>
          <div class="match-stat">
            <div class="match-stat-value text-success">${accuracy}%</div>
            <div class="match-stat-label">Độ chính xác</div>
          </div>
          <div class="match-stat">
            <div class="match-stat-value text-warning">${matchState.maxCombo}</div>
            <div class="match-stat-label">Combo cao nhất</div>
          </div>
          <div class="match-stat">
            <div class="match-stat-value text-danger">${matchState.score}</div>
            <div class="match-stat-label">Điểm số</div>
          </div>
        </div>

        <div class="d-flex gap-2 justify-content-center flex-wrap" style="margin-top:24px;">
          <button class="btn btn-outline-secondary d-inline-flex align-items-center gap-1" onclick="location.reload()"><i data-lucide="rotate-ccw" width="18" height="18"></i> Làm lại</button>
          <button class="btn btn-primary d-inline-flex align-items-center gap-1" onclick="window.router?.navigateTo('dashboard')"><i data-lucide="home" width="18" height="18"></i> Trang chủ</button>
        </div>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceQuizContent') });
}

// Giải phóng bộ nhớ và dừng âm thanh khi rời trang (unmount)
export function unmount() {
  if (matchState?.intervalId) {
    clearInterval(matchState.intervalId);
    matchState.intervalId = null;
  }
  window.speechSynthesis?.cancel();
  quizState = null;
  matchState = null;

  const config = document.getElementById('practiceConfig');
  if (config) config.style.display = 'block';
  const content = document.getElementById('practiceQuizContent');
  if (content) content.innerHTML = '';
}