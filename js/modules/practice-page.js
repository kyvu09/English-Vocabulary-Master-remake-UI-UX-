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
        <div style="font-size:3rem; margin-bottom:16px;">📚</div>
        <h3>Chưa có từ vựng</h3>
        <p>Vui lòng thêm từ vựng trước khi luyện tập</p>
        <button class="btn btn-primary" onclick="window.router?.navigateTo('vocabulary')" style="margin-top:16px;">➕ Thêm từ vựng</button>
      </div>
    `;
    return;
  }

  showQuizConfig();
}

function showQuizConfig() {
  document.getElementById('practiceContent').innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 24px;">⚙️ Cấu hình Quiz</h2>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px;">
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Loại dịch</label>
          <select id="directionSelect" class="select" style="width:100%;">
            <option value="both">Ngẫu nhiên</option>
            <option value="en-vi">English → Tiếng Việt</option>
            <option value="vi-en">Tiếng Việt → English</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Nguồn từ</label>
          <select id="sourceSelect" class="select" style="width:100%;">
            <option value="all" ${defaultSourceId === 'all' ? 'selected' : ''}>Tất cả từ vựng (${allWords.length})</option>
            ${sessions.map(s => `<option value="${s.id}" ${defaultSourceId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Số câu hỏi</label>
            <input id="wordCountInput" class="input" type="number" value="${Math.min(10, allWords.length)}" min="1" max="${allWords.length}" style="width:100%;" />
        </div>
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Chế độ</label>
          <select id="modeSelect" class="select" style="width:100%;">
            <option value="quiz">📝 Quiz Văn bản</option>
            <option value="listening">🎧 Listening</option>
          </select>
        </div>
      </div>

      <div style="display:flex; gap:12px;">
        <button id="startQuizBtn" class="btn btn-primary" style="flex:1;">🎯 Bắt đầu Quiz</button>
        <button id="cancelBtn" class="btn btn-ghost">Hủy</button>
      </div>
    </div>
  `;

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
    ? `<div style="font-size:3rem; margin-bottom:8px;">🎧</div>
       <div style="font-size:1rem; color:var(--muted);">Hãy nghe và gõ lại đúng từ tiếng Anh</div>`
    : `<div style="font-size:2rem; font-weight:700; color:var(--primary); margin-bottom:16px;">${prompt}</div>
       ${!isEnVi ? '' : `<div style="font-size:0.9rem; color:var(--muted);">Loại từ: <strong>${PART_OF_SPEECH[q.partOfSpeech] || q.partOfSpeech}</strong></div>`}`;

  let html = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <span style="font-size:0.9rem; color:var(--muted);">Câu ${quizState.currentIndex + 1}/${quizState.questions.length}</span>
        <span style="font-size:0.9rem; color:#10b981; font-weight:700;">✅ ${quizState.score} đúng</span>
      </div>
      <div style="height:6px; background:var(--border); border-radius:3px; margin-bottom:24px;">
        <div style="height:100%; background:var(--primary); border-radius:3px; width:${progress}%; transition:width 0.3s;"></div>
      </div>

      <div class="practice-card" style="text-align:center; margin-bottom:24px;">
        <div style="font-size:0.95rem; color:var(--muted); margin-bottom:12px;">${label}</div>
        ${promptDisplay}
      </div>
  `;

  if (isListening) {
    html += `
      <div style="text-align:center; margin-bottom:24px;">
        <button id="speakBtn" class="btn btn-primary" style="font-size:1.2rem; padding:16px 32px;">🔊 Nghe lại</button>
      </div>
    `;
  }

  html += `
    <div style="margin-bottom:20px;">
      <textarea id="answerInput" class="input" style="width:100%; min-height:60px; resize:none;" placeholder="${isListening ? 'Gõ từ tiếng Anh bạn vừa nghe...' : (isEnVi ? 'Nhập từ/cụm tiếng Việt...' : 'Nhập từ tiếng Anh...')}"></textarea>
      <div id="inputWarning" style="display:none; color:#ef4444; font-size:0.85rem; margin-top:6px;">⚠️ Hãy nhập câu trả lời trước khi kiểm tra.</div>
    </div>
    <div style="display:flex; gap:12px;">
      <button id="submitBtn" class="btn btn-primary" style="flex:1;">✓ Kiểm tra</button>
      <button id="skipBtn" class="btn btn-secondary" style="flex:1;">⏭️ Bỏ qua</button>
    </div>
    <div id="feedback"></div>
  `;

  document.getElementById('practiceContent').innerHTML = html;

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
      input.style.borderColor = '#ef4444';
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

  const title = correct ? '✅ Chính xác!' : '❌ Sai rồi!';

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

  const colors = { success: '#d1fae5', error: '#fee2e2', warning: '#fef3c7' };
  const textColors = { success: '#065f46', error: '#7f1d1d', warning: '#92400e' };

  document.getElementById('feedback').innerHTML = `
    <div style="margin-top:20px; padding:16px; background:${colors[type]}; border-radius:12px; border-left:4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};">
      <div style="font-weight:700; color:${textColors[type]}; margin-bottom:6px;">${title}</div>
      <div style="color:${textColors[type]}; font-size:0.95rem;">${msg}</div>
      <button id="nextBtn" class="btn btn-primary" style="width:100%; margin-top:12px;">
        ${quizState.currentIndex === quizState.questions.length - 1 ? '🏁 Xem kết quả' : 'Câu tiếp theo →'}
      </button>
    </div>
  `;

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
  const emoji = percent >= 80 ? '🏆' : percent >= 60 ? '😊' : percent >= 40 ? '😐' : '😢';

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
    <div class="card" style="text-align:center;">
      <div style="font-size:4rem; margin-bottom:12px;">${emoji}</div>
      <h2 style="margin:0 0 8px;">${percent >= 80 ? 'Xuất sắc!' : percent >= 60 ? 'Tốt lắm!' : percent >= 40 ? 'Cố gắng thêm!' : 'Cần ôn luyện!'}</h2>
      <div style="font-size:3rem; font-weight:800; color:var(--primary); margin:16px 0;">${correct}/${total}</div>
      <div style="font-size:1.1rem; color:var(--muted); margin-bottom:32px;">${percent}% chính xác</div>

      <div class="card" style="text-align:left; margin-bottom:24px;">
        <h3 style="margin:0 0 12px;">Chi tiết kết quả</h3>
        <div style="max-height:280px; overflow-y:auto;">
          ${quizState.answers.map(a => `
            <div style="padding:10px; margin-bottom:8px; border-radius:8px; background:${a.correct ? '#d1fae5' : '#fee2e2'}; border-left:4px solid ${a.correct ? '#10b981' : '#ef4444'};">
              <div style="font-weight:700; margin-bottom:4px;">${a.correct ? '✅' : '❌'} ${a.english}</div>
              <div style="font-size:0.9rem; color:${a.correct ? '#065f46' : '#7f1d1d'};">
                ${a.correct ? `✓ Đúng` : `❌ Sai - Đáp án: ${a.correctAnswers}`}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="location.reload()">← Làm lại</button>
        <button class="btn btn-secondary" onclick="window.router?.navigateTo('results')">📊 Xem lịch sử</button>
        <button class="btn btn-primary" onclick="window.router?.navigateTo('dashboard')">🏠 Trang chủ</button>
      </div>
    </div>
  `;
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