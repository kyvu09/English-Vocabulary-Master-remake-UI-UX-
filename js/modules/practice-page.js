// Practice Page - Complete implementation with bidirectional quiz, statistics, listening
import { auth, db } from '../../firebase-config.js';
import { 
  collection, query, orderBy, getDocs, doc, 
  serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showAlert } from '../core/ui-utils.js';

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
      <div id="practiceContent"></div>
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
    document.getElementById('practiceContent').innerHTML = `
      <div class="card" style="text-align:center; padding:48px;">
        <div style="color:var(--primary); margin-bottom:16px;"><i data-lucide="book-open" width="48" height="48"></i></div>
        <h3>Chưa có từ vựng</h3>
        <p>Vui lòng thêm từ vựng trước khi luyện tập</p>
        <button class="btn btn-primary d-inline-flex align-items-center gap-2 justify-content-center" onclick="window.router?.navigateTo('vocabulary')" style="margin-top:16px;"><i data-lucide="plus" width="18" height="18"></i> Thêm từ vựng</button>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceContent') });
    return;
  }

  showQuizConfig();
}

function showQuizConfig() {
  document.getElementById('practiceContent').innerHTML = `
    <div class="card">
      <h2 class="m-0 mb-4 d-flex align-items-center gap-2"><i data-lucide="settings"></i> Cấu hình Quiz</h2>
      
      <div class="row g-3 mb-4">
        <div class="col-sm-6">
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
        <div class="col-sm-6">
          <label class="form-label fw-semibold">Chế độ</label>
          <select id="modeSelect" class="form-select">
            <option value="quiz">Quiz Văn bản</option>
            <option value="listening">Listening</option>
          </select>
        </div>
      </div>

      <div class="d-flex gap-2">
        <button id="startQuizBtn" class="btn btn-primary flex-fill d-flex align-items-center justify-content-center gap-2"><i data-lucide="play" width="18" height="18"></i> Bắt đầu Quiz</button>
        <button id="cancelBtn" class="btn btn-outline-secondary">Hủy</button>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceContent') });

  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
  document.getElementById('cancelBtn').addEventListener('click', () => window.router?.navigateTo('dashboard'));
}

async function startQuiz() {
  const direction = document.getElementById('directionSelect').value;
  const sourceId = document.getElementById('sourceSelect').value;
  const wordCount = parseInt(document.getElementById('wordCountInput').value) || 10;
  const mode = document.getElementById('modeSelect').value;

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

  // Listening mode: always hear English → type English (dictation)
  // Quiz mode: show prompt based on direction as usual
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
    <div class="card">
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
      <div id="inputWarning" class="small text-danger mt-1" style="display:none;">⚠️ Hãy nhập câu trả lời trước khi kiểm tra.</div>
    </div>
    <div class="d-flex gap-2">
      <button id="submitBtn" class="btn btn-primary flex-fill d-flex align-items-center justify-content-center gap-2"><i data-lucide="check-circle" width="18" height="18"></i> Kiểm tra</button>
      <button id="skipBtn" class="btn btn-outline-secondary flex-fill d-flex align-items-center justify-content-center gap-2"><i data-lucide="skip-forward" width="18" height="18"></i> Bỏ qua</button>
    </div>
    <div id="feedback"></div>
  `;

  document.getElementById('practiceContent').innerHTML = html;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceContent') });

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
    // Show inline warning without disabling anything so user can still type
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

  // Listening mode: correct answer is always the English word itself (dictation)
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

  // Always show English word + meaning after checking (listening & quiz)
  const msg = correct
    ? `"${getEnglish(q)}" — nghĩa là: "${q.meaning}"`
    : isListening
      ? `Từ đúng: <strong>${getEnglish(q)}</strong> — nghĩa là: "${q.meaning}"`
      : `Đáp án đúng: "<strong>${quizState.answers[quizState.currentIndex].correctAnswers}</strong>" — "${isEnVi ? q.meaning : getEnglish(q)}"`;

  showFeedback(correct ? 'success' : 'error', title, msg);
}

function normalizeText(text = '') {
  return String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
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
        ${quizState.currentIndex === quizState.questions.length - 1 ? '🏁 Xem kết quả' : 'Câu tiếp theo →'}
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

  // Save to Firestore with batch update
  const user = auth.currentUser;
  if (user) {
    try {
      const batch = writeBatch(db);
      
      // Save attempt
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

      // Update word stats
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
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  document.getElementById('practiceContent').innerHTML = `
    <div class="card text-center border-0">
      <div class="float-animate" style="font-size:4rem; margin-bottom:12px;">${emoji}</div>
      <h2 class="m-0">${percent >= 80 ? 'Xuất sắc!' : percent >= 60 ? 'Tốt lắm!' : percent >= 40 ? 'Cố gắng thêm!' : 'Cần ôn luyện!'}</h2>
      <div class="stat-count" style="font-size:3rem; margin:16px 0;">${correct}/${total}</div>
      <div class="text-muted mb-4 fs-5">${percent}% chính xác</div>

      <div class="card text-start mb-4">
        <h3 class="m-0 mb-3">Chi tiết kết quả</h3>
        <div class="stagger-fade" style="max-height:280px; overflow-y:auto;">
          ${quizState.answers.map(a => `
            <div class="d-flex align-items-start gap-2 p-2 mb-2 rounded-3 ${a.correct ? 'bg-success-subtle' : 'bg-danger-subtle'}" style="border-left:4px solid ${a.correct ? 'var(--success)' : 'var(--danger)'};">
              <div>
                <div class="fw-bold small d-flex align-items-center gap-1">${a.correct ? '<i data-lucide="check" width="14" height="14"></i>' : '<i data-lucide="x" width="14" height="14"></i>'} ${a.english}</div>
                <div class="small ${a.correct ? 'text-success-emphasis' : 'text-danger-emphasis'}">
                  ${a.correct ? `✓ Đúng` : `❌ Sai - Đáp án: ${a.correctAnswers}`}
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
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceContent') });
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

export function unmount() {
  window.speechSynthesis?.cancel();
  quizState = null;
}