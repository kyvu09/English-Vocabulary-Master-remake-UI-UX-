// Module Trang Luyện tập (Practice Page) - Hỗ trợ Quiz hai chiều, thống kê chi tiết, luyện nghe
import { auth, db, updateUserTotalPoints, triggerStreakAction } from '../../firebase-config.js';
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
let weakWords = [];
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

  // In-memory weak words calculation: error rate >= 30% and attempted >= 2 times
  weakWords = allWords.filter(w => {
    const stats = w.stats || {};
    const wrong = stats.wrongCount || 0;
    const correct = stats.correctCount || 0;
    const total = stats.totalAnswered || (wrong + correct);
    if (total < 2) return false;
    return (wrong / total) >= 0.3;
  });

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
    { value: 'matchpairs', label: 'Match Pairs', icon: 'shuffle', desc: 'Ghép cặp từ Anh', color: '#e11d48' },
    { value: 'ai_quiz', label: 'AI Quiz', icon: 'sparkles', desc: 'Trắc nghiệm tạo bởi AI', color: '#0ea5e9' }
  ];

  let weakReviewHtml = '';
  if (weakWords.length > 0) {
    weakReviewHtml = `
      <div class="card animate-enter mt-4" style="border-left: 4px solid var(--danger);">
        <h3 class="m-0 mb-3 d-flex align-items-center gap-2 text-danger"><i data-lucide="alert-circle"></i> Từ vựng hay làm sai cần ôn tập</h3>
        <p class="text-muted small">Dưới đây là các từ bạn có tỷ lệ trả lời sai từ 30% trở lên (tính trên các từ bạn đã làm ít nhất 2 lần).</p>
        <div class="table-responsive mb-3" style="max-height: 240px; overflow-y: auto;">
          <table class="table table-sm table-hover m-0" style="min-width: 480px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--line);">
                <th style="font-size:0.85rem; color:var(--muted); font-weight:700;">Từ tiếng Anh</th>
                <th style="font-size:0.85rem; color:var(--muted); font-weight:700;">Nghĩa tiếng Việt</th>
                <th style="font-size:0.85rem; color:var(--muted); font-weight:700; text-align:center;">Tỷ lệ sai</th>
                <th style="font-size:0.85rem; color:var(--muted); font-weight:700; text-align:center;">Tổng lượt làm</th>
              </tr>
            </thead>
            <tbody>
              ${weakWords.map(w => {
                const wrong = w.stats?.wrongCount || 0;
                const total = w.stats?.totalAnswered || 0;
                const rate = total ? Math.round((wrong / total) * 100) : 0;
                return `
                  <tr style="border-bottom: 1px solid var(--line-soft);">
                    <td class="fw-bold text-danger" style="font-size:0.9rem; padding:8px 4px;">${getEnglish(w)}</td>
                    <td class="text-muted" style="font-size:0.9rem; padding:8px 4px;">${w.meaning}</td>
                    <td class="text-danger fw-bold" style="font-size:0.9rem; text-align:center; padding:8px 4px;">${rate}%</td>
                    <td class="text-muted" style="font-size:0.9rem; text-align:center; padding:8px 4px;">${total}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  document.getElementById('practiceConfig').innerHTML = `
    <div class="card animate-enter">
      <h2 class="m-0 mb-4 d-flex align-items-center gap-2"><i data-lucide="settings"></i> Cấu hình Quiz</h2>

      <label class="form-label fw-semibold mb-3">Chọn chế độ</label>
      <div class="row g-3 mb-4" id="modeCardsContainer">
        ${modes.map((m) => `
          <div class="col-md-3 col-sm-6">
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
        ${weakWords.length ? `
          <div class="form-check form-switch mb-4 p-3 bg-danger-subtle rounded-3 border border-danger-subtle d-flex align-items-center gap-2" style="padding-left: 2.85rem !important;">
            <input class="form-check-input" type="checkbox" id="practiceWeakCheckbox" style="cursor:pointer; width: 2.2em; height: 1.1em;" />
            <label class="form-check-label fw-bold text-danger-emphasis mb-0" for="practiceWeakCheckbox" style="cursor:pointer; user-select:none;">
              <i data-lucide="zap" width="16" height="16"></i> Chỉ luyện tập từ vựng hay làm sai (${weakWords.length} từ)
            </label>
          </div>
        ` : ''}
        <div class="row g-3 mb-4">
          <div class="col-sm-6" id="directionSelectContainer">
            <label class="form-label fw-semibold">Loại dịch</label>
            <select id="directionSelect" class="form-select">
              <option value="both">Ngẫu nhiên</option>
              <option value="en-vi">English → Tiếng Việt</option>
              <option value="vi-en">Tiếng Việt → English</option>
            </select>
          </div>
          <div class="col-sm-6" id="sourceSelectContainer">
            <label class="form-label fw-semibold">Nguồn từ</label>
            <select id="sourceSelect" class="form-select">
              <option value="all" ${defaultSourceId === 'all' ? 'selected' : ''}>Tất cả từ vựng (${allWords.length})</option>
              ${weakWords.length ? `<option value="weak" ${defaultSourceId === 'weak' ? 'selected' : ''}>Từ vựng hay làm sai (${weakWords.length})</option>` : ''}
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
    ${weakReviewHtml}
  `;
  document.getElementById('practiceQuizContent').innerHTML = '';
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceConfig') });

  // Reset về chưa chọn khi tải cấu hình
  selectedMode = null;
  const modeColors = { quiz: '#2563eb', listening: '#7c3aed', matchpairs: '#e11d48', ai_quiz: '#0ea5e9' };
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
        // Listening & Match Pairs & AI Quiz không cần cấu hình Loại dịch
        directionContainer.style.display = 'none';
      }
    }
  });



  const weakCheckbox = document.getElementById('practiceWeakCheckbox');
  const sourceSelect = document.getElementById('sourceSelect');
  const sourceSelectContainer = document.getElementById('sourceSelectContainer');
  const countInput = document.getElementById('wordCountInput');

  let previousSource = sourceSelect ? sourceSelect.value : 'all';

  if (weakCheckbox) {
    weakCheckbox.addEventListener('change', () => {
      if (weakCheckbox.checked) {
        if (sourceSelect) {
          previousSource = sourceSelect.value !== 'weak' ? sourceSelect.value : 'all';
          sourceSelect.value = 'weak';
          sourceSelect.disabled = true;
        }
        if (sourceSelectContainer) {
          sourceSelectContainer.style.opacity = '0.5';
        }
        if (countInput) {
          countInput.max = weakWords.length;
          countInput.value = Math.min(parseInt(countInput.value) || 10, weakWords.length);
        }
      } else {
        if (sourceSelect) {
          sourceSelect.value = previousSource;
          sourceSelect.disabled = false;
        }
        if (sourceSelectContainer) {
          sourceSelectContainer.style.opacity = '1';
        }
        if (countInput) {
          // Restore max based on the restored source select
          const currentSource = sourceSelect ? sourceSelect.value : 'all';
          let maxVal = allWords.length;
          if (currentSource === 'weak') {
            maxVal = weakWords.length;
          } else if (currentSource !== 'all') {
            const selectedSession = sessions.find(s => s.id === currentSource);
            if (selectedSession) {
              const sessionWords = allWords.filter(w => w.sessionId === currentSource || (!w.sessionId && w.sessionName === selectedSession.name));
              maxVal = sessionWords.length;
            }
          }
          countInput.max = maxVal;
          countInput.value = Math.min(parseInt(countInput.value) || 10, maxVal);
        }
      }
    });
  }

  if (sourceSelect) {
    sourceSelect.addEventListener('change', () => {
      const currentSource = sourceSelect.value;
      let maxVal = allWords.length;
      if (currentSource === 'weak') {
        maxVal = weakWords.length;
        if (weakCheckbox) weakCheckbox.checked = true;
        if (sourceSelectContainer) sourceSelectContainer.style.opacity = '0.5';
        sourceSelect.disabled = true;
      } else {
        if (currentSource !== 'all') {
          const selectedSession = sessions.find(s => s.id === currentSource);
          if (selectedSession) {
            const sessionWords = allWords.filter(w => w.sessionId === currentSource || (!w.sessionId && w.sessionName === selectedSession.name));
            maxVal = sessionWords.length;
          }
        }
      }
      if (countInput) {
        countInput.max = maxVal;
        countInput.value = Math.min(parseInt(countInput.value) || 10, maxVal);
      }
    });
  }

  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
  document.getElementById('cancelBtn').addEventListener('click', () => window.router?.navigateTo('dashboard'));
}


async function generateAIQuestions(words, count) {
  const apiKey = window.__APP_CONFIG__?.GEMINI_API_KEY?.trim();
  const MAX_RETRIES = 2;
  const INITIAL_DELAY = 1000; // 1 second

  if (!apiKey) {
    throw new Error('Thiếu GEMINI_API_KEY trong cấu hình. Vui lòng thêm vào file env-config.js.');
  }

  if (apiKey.startsWith('AQ.') || (!apiKey.startsWith('AIzaSy') && apiKey.length < 30)) {
    throw new Error(
      "Khóa GEMINI_API_KEY hiện tại không đúng định dạng của Google AI Studio (Key hợp lệ bắt đầu bằng 'AIzaSy...'). " +
      "Chuỗi '" + apiKey.slice(0, 8) + "...' hiện có là token tạm thời hoặc không hợp lệ. " +
      "Vui lòng truy cập https://aistudio.google.com/apikey để lấy API Key miễn phí và dán vào env-config.js."
    );
  }

  // Format the vocabulary words to feed into the prompt
  const vocabList = words.map((w, idx) => `${idx + 1}. English: "${getEnglish(w)}", Meaning: "${w.meaning}", POS: "${w.partOfSpeech || 'other'}"`).join('\n');

  const promptText = `Bạn là trợ lý AI dạy Tiếng Anh xuất sắc. Hãy tạo ra đúng ${count} câu hỏi trắc nghiệm tiếng Anh (Multiple Choice Questions) dạng trắc nghiệm 4 lựa chọn (A, B, C, D) cho người Việt học tiếng Anh.
Các từ vựng mục tiêu cần kiểm tra PHẢI được chọn từ danh sách sau:
${vocabList}

YÊU CẦU:
1. Mỗi câu hỏi chỉ được kiểm tra đúng một từ vựng mục tiêu trong danh sách trên.
2. Cấu trúc câu hỏi:
- Mỗi câu chỉ kiểm tra 1 từ trong danh sách.
- Chỉ sử dụng dạng hoàn thành câu với chỗ trống (____).
- Độ khó của câu phải tương ứng với độ khó CEFR của từ vựng:
  + Từ dễ => câu đơn giản.
  + Từ khó => ngữ cảnh phức tạp hơn.
3. Cung cấp chính xác 4 phương án lựa chọn trong mảng "options". Các phương án nhiễu phải thực tế. Các phương án nên được đánh dấu hoặc bắt đầu bằng A, B, C, D (ví dụ: ["A. ...", "B. ...", "C. ...", "D. ..."]).
4. Cung cấp "correctOptionIndex" là chỉ số (0, 1, 2, hoặc 3) của phương án đúng trong mảng "options".
5. Cung cấp "explanation" là lời giải thích chi tiết, ngắn gọn bằng Tiếng Việt tại sao phương án đó đúng, dịch nghĩa của câu và từ vựng liên quan.

Bắt buộc trả về kết quả khớp đúng với định dạng Schema JSON được yêu cầu.`;

  const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: promptText
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    word: { type: "STRING" },
                    question: { type: "STRING" },
                    options: {
                      type: "ARRAY",
                      items: { type: "STRING" }
                    },
                    correctOptionIndex: { type: "INTEGER", description: "0-indexed correct option in options array (0 to 3)" },
                    explanation: { type: "STRING" }
                  },
                  required: ["word", "question", "options", "correctOptionIndex", "explanation"]
                }
              }
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          
          if (response.status === 401 || response.status === 403) {
            let detailMsg = '';
            try {
              const errJson = JSON.parse(errText);
              detailMsg = errJson.error?.message || '';
            } catch (_) {}
            throw new Error(
              `Lỗi xác thực Gemini API (${response.status}): ${detailMsg || 'Khóa API không hợp lệ hoặc bị từ chối'}. ` +
              `Vui lòng truy cập https://aistudio.google.com/apikey để lấy API Key (bắt đầu bằng 'AIzaSy...') và điền vào env-config.js.`
            );
          }

          if (response.status === 404) {
            // Model not found or not supported in this region/key, break inner loop to try next model
            console.warn(`Model ${model} not available (404). Trying next model...`);
            lastError = new Error(`Model ${model} không hỗ trợ (404).`);
            break;
          }

          if (response.status === 503 && attempt < MAX_RETRIES - 1) {
            const delay = INITIAL_DELAY * Math.pow(2, attempt);
            console.warn(`API temporarily unavailable. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw new Error(`Gemini API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) {
          throw new Error("Không nhận được dữ liệu hợp lệ từ Gemini AI.");
        }

        const questions = JSON.parse(candidateText);

        // Map questions back to their Firestore word IDs if possible
        return questions.map(q => {
          const matchedWord = words.find(w => getEnglish(w).toLowerCase() === q.word.toLowerCase());
          return {
            id: matchedWord?.id || words[Math.floor(Math.random() * words.length)].id,
            english: q.word,
            meaning: matchedWord?.meaning || q.word,
            direction: 'ai',
            ...q
          };
        });
      } catch (error) {
        lastError = error;
        // Don't retry auth or validation errors
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('GEMINI_API_KEY')) {
          throw error;
        }
        if (attempt === MAX_RETRIES - 1) {
          console.error(`AI Generation Error on ${model}:`, error);
        }
      }
    }
  }

  throw lastError || new Error("Không thể khởi tạo câu hỏi AI từ Gemini.");
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
  let words = [];
  if (sourceId === 'all') {
    words = [...allWords];
  } else if (sourceId === 'weak') {
    words = [...weakWords];
  } else {
    words = allWords.filter(w => w.sessionId === sourceId || (!w.sessionId && w.sessionName === selectedSession?.name));
  }
  
  if (words.length < 1) {
    await showAlert('Không có từ vựng trong phạm vi đã chọn', 'Lưu ý');
    return;
  }

  const selectedWords = shuffle(words).slice(0, wordCount);

  if (mode === 'ai_quiz') {
    document.getElementById('practiceConfig').style.display = 'none';
    document.getElementById('practiceQuizContent').innerHTML = `
      <div class="card animate-enter text-center" style="padding: 60px 40px;">
        <div class="spinner-border text-info" role="status" style="width: 4rem; height: 4rem; margin-bottom: 24px; border-width: 0.25em;">
          <span class="visually-hidden">Loading...</span>
        </div>
        <h3 class="fw-bold text-info">Đang khởi tạo câu hỏi AI...</h3>
        <p class="text-muted mt-2">Trợ lý Gemini đang soạn thảo bộ câu hỏi trắc nghiệm đặc biệt dựa trên kho từ vựng của bạn. Vui lòng chờ trong giây lát.</p>
      </div>
    `;

    try {
      const apiKey = window.__APP_CONFIG__?.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Thiếu GEMINI_API_KEY trong cấu hình. Vui lòng thêm vào env-config.js');
      }

      const aiQuestions = await generateAIQuestions(selectedWords, wordCount);
      const initialTime = 5 * aiQuestions.length + (aiQuestions.length * 15);

      quizState = {
        mode,
        direction: 'ai',
        questions: aiQuestions,
        currentIndex: 0,
        score: 0,
        points: 0,
        combo: 0,
        maxCombo: 0,
        timer: initialTime,
        initialTime: initialTime,
        intervalId: null,
        answers: [],
        finished: false,
        paused: false
      };

      renderQuestion();
      quizState.intervalId = setInterval(quizTick, 1000);
    } catch (err) {
      let userMessage = err.message;
      if (err.message.includes('503')) {
        userMessage = 'Dịch vụ Gemini AI hiện đang quá tải. Vui lòng thử lại sau vài phút.';
      } else if (err.message.includes('GEMINI_API_KEY')) {
        userMessage = err.message;
      } else {
        userMessage = `Lỗi khi tạo câu hỏi AI: ${err.message}`;
      }
      await showAlert(userMessage, 'Lỗi hệ thống');
      document.getElementById('practiceConfig').style.display = 'block';
      document.getElementById('practiceQuizContent').innerHTML = '';
    }
    return;
  }

  // Normal modes
  let questions = [];
  if (direction === 'both') {
    selectedWords.forEach(w => {
      questions.push({
        ...w,
        direction: Math.random() < 0.5 ? 'en-vi' : 'vi-en'
      });
    });
  } else {
    selectedWords.forEach(w => {
      questions.push({ ...w, direction });
    });
  }

  questions = shuffle(questions);

  document.getElementById('practiceConfig').style.display = 'none';

  if (mode === 'matchpairs') {
    startMatchPairs(selectedWords);
    return;
  }

  const initialTime = 5*questions.length + (questions.length * 12);

  quizState = {
    mode,
    direction,
    questions,
    currentIndex: 0,
    score: 0,
    points: 0,
    combo: 0,
    maxCombo: 0,
    timer: initialTime,
    initialTime: initialTime,
    intervalId: null,
    answers: [],
    finished: false,
    paused: false
  };

  renderQuestion();
  quizState.intervalId = setInterval(quizTick, 1000);
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
  const isAI = quizState.mode === 'ai_quiz';
  const english = getEnglish(q);

  const label = isAI
    ? 'Câu hỏi trắc nghiệm AI'
    : isListening
      ? 'Nghe và gõ lại từ tiếng Anh'
      : (isEnVi ? 'Dịch sang tiếng Việt' : 'Dịch sang tiếng Anh');

  const prompt = isEnVi ? english : q.meaning;
  const promptDisplay = isAI
    ? `<div style="font-size:1.35rem; font-weight:700; color:var(--primary); margin-bottom:16px; text-align:left; line-height:1.4;">${q.question}</div>`
    : isListening
      ? `<div style="color:var(--primary); margin-bottom:8px;"><i data-lucide="headphones" width="48" height="48"></i></div>
         <div style="font-size:1rem; color:var(--muted);">Hãy nghe và gõ lại đúng từ tiếng Anh</div>`
      : `<div style="font-size:2rem; font-weight:700; color:var(--primary); margin-bottom:16px;">${prompt}</div>
         ${!isEnVi ? '' : `<div style="font-size:0.9rem; color:var(--muted);">Loại từ: <strong>${PART_OF_SPEECH[q.partOfSpeech] || q.partOfSpeech}</strong></div>`}`;

  let scoreBadgeHtml = '';
  if (quizState.mode === 'quiz' || quizState.mode === 'listening' || quizState.mode === 'ai_quiz') {
    scoreBadgeHtml = `
      <div class="d-flex gap-2 align-items-center flex-wrap">
        <span class="badge bg-success-subtle text-success-emphasis d-inline-flex align-items-center gap-1"><i data-lucide="check" width="12" height="12"></i> ${quizState.score} đúng</span>
        <span class="badge bg-warning-subtle text-warning-emphasis d-inline-flex align-items-center gap-1"><i data-lucide="zap" width="12" height="12"></i> x${quizState.combo}</span>
        <span class="badge bg-danger-subtle text-danger-emphasis d-inline-flex align-items-center gap-1"><i data-lucide="award" width="12" height="12"></i> ${quizState.points}đ</span>
      </div>
    `;
  } else {
    scoreBadgeHtml = `
      <span class="badge bg-success-subtle text-success-emphasis d-inline-flex align-items-center gap-1"><i data-lucide="check" width="12" height="12"></i> ${quizState.score} đúng</span>
    `;
  }

  let html = `
    <div class="card animate-enter">
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <span class="text-muted small">Câu ${quizState.currentIndex + 1}/${quizState.questions.length}</span>
        <div class="d-flex gap-2 align-items-center flex-wrap">
          <span id="quizTimerLabel" class="badge bg-primary-subtle text-primary fw-bold" style="font-size:0.85rem; font-variant-numeric:tabular-nums; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="timer" width="14" height="14"></i>${Math.max(0, quizState.timer).toFixed(1)}s</span>
          ${scoreBadgeHtml}
        </div>
      </div>
      <div class="match-timer-bar" style="margin-bottom: 20px;">
        <div id="quizTimerFill" class="match-timer-fill" style="width:${Math.min(100, Math.max(0, (quizState.timer / quizState.initialTime) * 100))}%"></div>
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

  if (isAI) {
    html += `
      <div class="row g-3 mb-3" id="aiOptionsContainer">
        ${q.options.map((opt, idx) => `
          <div class="col-sm-6">
            <button class="btn btn-outline-primary w-100 ai-option-btn text-start p-3 fw-semibold border-2" data-index="${idx}" style="transition: all 0.2s ease; border-radius:14px; min-height:64px; line-height:1.35;">
              ${opt}
            </button>
          </div>
        `).join('')}
      </div>
      <div id="feedback"></div>
    `;
  } else {
    html += `
      <div class="mb-3">
        <textarea id="answerInput" class="form-control" style="min-height:60px; resize:none;" placeholder="${isListening ? 'Gõ từ tiếng Anh bạn vừa nghe...' : (isEnVi ? 'Nhập từ/cụm tiếng Việt...' : 'Nhập từ tiếng Anh...')}"></textarea>
        <div id="inputWarning" class="small text-danger mt-1" style="display:none;"><i data-lucide="alert-triangle" width="14" height="14"></i> Hãy nhập câu trả lời trước khi kiểm tra.</div>
      </div>
      <div class="d-flex gap-2">
        <button id="submitBtn" class="btn btn-primary flex-fill d-flex align-items-center justify-content-center gap-2"><i data-lucide="check-circle" width="18" height="18"></i> Kiểm tra</button>
      </div>
      <div id="feedback"></div>
    `;
  }

  document.getElementById('practiceQuizContent').innerHTML = html;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('practiceQuizContent') });

  if (isAI) {
    document.querySelectorAll('.ai-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedIdx = parseInt(btn.dataset.index);
        checkAIOption(selectedIdx);
      });
    });
  } else {
    document.getElementById('submitBtn').addEventListener('click', checkAnswer);
    document.getElementById('speakBtn')?.addEventListener('click', () => speakWord(english));

    if (isListening) {
      setTimeout(() => speakWord(english), 500);
    }

    setTimeout(() => document.getElementById('answerInput').focus(), 100);
  }
}

function checkAIOption(selectedIdx) {
  if (quizState.finished) return;
  
  const q = quizState.questions[quizState.currentIndex];
  const correct = selectedIdx === q.correctOptionIndex;
  
  // Disable all options immediately to prevent double clicking
  document.querySelectorAll('.ai-option-btn').forEach(btn => {
    btn.disabled = true;
    const idx = parseInt(btn.dataset.index);
    if (idx === q.correctOptionIndex) {
      btn.className = 'btn btn-success w-100 ai-option-btn text-start p-3 fw-semibold border-2 text-white';
    } else if (idx === selectedIdx) {
      btn.className = 'btn btn-danger w-100 ai-option-btn text-start p-3 fw-semibold border-2 text-white';
    } else {
      btn.className = 'btn btn-outline-secondary w-100 ai-option-btn text-start p-3 fw-semibold border-2';
      btn.style.opacity = '0.5';
    }
  });

  if (correct) {
    quizState.score++;
    quizState.combo++;
    if (quizState.combo > quizState.maxCombo) {
      quizState.maxCombo = quizState.combo;
    }
    const points = 5 + (quizState.combo - 1) * 2;
    quizState.points += points;
    quizState.timer += 0.5; // Award time for correct answer
    updateQuizTimer();
  } else {
    quizState.combo = 0;
    quizState.timer -= 1.0; // Subtract time for wrong answer
    if (quizState.timer < 0) quizState.timer = 0;
    updateQuizTimer();
    if (quizState.timer <= 0) {
      endQuiz();
      return;
    }
  }

  quizState.answers.push({
    wordId: q.id,
    english: q.english || getEnglish(q),
    meaning: q.meaning,
    direction: 'ai',
    userAnswer: q.options[selectedIdx],
    correct,
    correctAnswers: q.options[q.correctOptionIndex]
  });

  let title = correct ? '<i data-lucide="check-circle" width="16" height="16"></i> Chính xác!' : '<i data-lucide="x-circle" width="16" height="16"></i> Sai rồi!';
  const pointsAwarded = 5 + (quizState.combo - 1) * 2;
  title += correct 
    ? ` <span class="badge bg-warning text-dark ms-2" style="font-size:0.8rem; vertical-align:middle;">+${pointsAwarded}đ (Combo x${quizState.combo})</span>`
    : ` <span class="badge bg-danger text-white ms-2" style="font-size:0.8rem; vertical-align:middle;">Mất combo</span>`;

  showFeedback(correct ? 'success' : 'error', title, q.explanation);
}

function checkAnswer() {
  const q = quizState.questions[quizState.currentIndex];
  const userAnswer = normalizeText(document.getElementById('answerInput').value);
  const isEnVi = q.direction === 'en-vi';
  const isListening = quizState.mode === 'listening';
  const isGamified = quizState.mode === 'quiz' || quizState.mode === 'listening';

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

  if (correct) {
    quizState.score++;
    if (isGamified) {
      quizState.combo++;
      if (quizState.combo > quizState.maxCombo) {
        quizState.maxCombo = quizState.combo;
      }
      const points = 5 + (quizState.combo - 1) * 2;
      quizState.points += points;

      // Add time for correct answer (+0.3s)
      quizState.timer += 0.3;
      updateQuizTimer();
    }
  } else {
    if (isGamified) {
      quizState.combo = 0;

      // Subtract time for wrong answer (-0.7s)
      quizState.timer -= 0.7;
      if (quizState.timer < 0) quizState.timer = 0;
      updateQuizTimer();
      if (quizState.timer <= 0) {
        endQuiz();
        return;
      }
    }
  }

  quizState.answers.push({
    wordId: q.id,
    english: getEnglish(q),
    meaning: q.meaning,
    direction: q.direction,
    userAnswer: document.getElementById('answerInput').value.trim(),
    correct,
    correctAnswers: isListening ? getEnglish(q) : acceptedAnswers.map(a => denormalizeText(a, isEnVi)).join(' / ')
  });

  let title = correct ? '<i data-lucide="check-circle" width="16" height="16"></i> Chính xác!' : '<i data-lucide="x-circle" width="16" height="16"></i> Sai rồi!';
  if (isGamified) {
    if (correct) {
      const points = 5 + (quizState.combo - 1) * 2;
      title += ` <span class="badge bg-warning text-dark ms-2" style="font-size:0.8rem; vertical-align:middle;">+${points}đ (Combo x${quizState.combo})</span>`;
    } else {
      title += ` <span class="badge bg-danger text-white ms-2" style="font-size:0.8rem; vertical-align:middle;">Mất combo</span>`;
    }
  }

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
  if (quizState) quizState.paused = true;

  const submitBtn = document.getElementById('submitBtn');
  const skipBtn = document.getElementById('skipBtn');
  const answerInput = document.getElementById('answerInput');
  
  if (answerInput) answerInput.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;

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
    if (quizState) quizState.paused = false;
    renderQuestion();
  }
}

function quizTick() {
  if (!quizState || quizState.finished || quizState.paused) return;
  quizState.timer--;
  updateQuizTimer();
  if (quizState.timer <= 0) {
    endQuiz();
  }
}

function updateQuizTimer() {
  const fill = document.getElementById('quizTimerFill');
  const label = document.getElementById('quizTimerLabel');
  if (fill) fill.style.width = `${Math.min(100, Math.max(0, (quizState.timer / quizState.initialTime) * 100))}%`;
  if (label) label.textContent = `${Math.max(0, quizState.timer).toFixed(1)}s`;
}

function endQuiz() {
  if (!quizState) return;
  quizState.finished = true;
  if (quizState.intervalId) {
    clearInterval(quizState.intervalId);
    quizState.intervalId = null;
  }
  showResults();
}

async function showResults() {
  if (quizState && quizState.intervalId) {
    clearInterval(quizState.intervalId);
    quizState.intervalId = null;
  }
  if (quizState) {
    quizState.finished = true;
  }

  const total = quizState.answers.length;
  const correct = quizState.answers.filter(a => a.correct).length;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const emoji = percent >= 80 ? '<i data-lucide="award" width="64" height="64"></i>' : percent >= 60 ? '<i data-lucide="thumbs-up" width="64" height="64"></i>' : percent >= 40 ? '<i data-lucide="minus" width="64" height="64"></i>' : '<i data-lucide="frown" width="64" height="64"></i>';

  // Lưu kết quả vào Firestore bằng cơ chế Write Batch
  const user = auth.currentUser;
  if (user) {
    try {
      const batch = writeBatch(db);
      
      // Lưu thông tin lượt làm quiz
      const attemptRef = doc(collection(db, 'users', user.uid, 'quizAttempts'));
      const attemptData = {
        direction: quizState.direction,
        mode: quizState.mode,
        totalQuestions: total,
        correctAnswers: correct,
        scorePercent: percent,
        answers: quizState.answers,
        createdAt: serverTimestamp()
      };
      if (quizState.mode === 'quiz' || quizState.mode === 'listening' || quizState.mode === 'ai_quiz') {
        attemptData.points = quizState.points || 0;
        attemptData.maxCombo = quizState.maxCombo || 0;
      }
      batch.set(attemptRef, attemptData);

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
      try {
        await updateUserTotalPoints(user.uid);
      } catch (err) {
        console.error('Lỗi khi cập nhật điểm rank:', err);
      }
      try {
        await triggerStreakAction(user.uid);
      } catch (err) {
        console.error('Lỗi khi kích hoạt streak:', err);
      }
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  let scoreDisplayHtml = '';
  if (quizState.mode === 'quiz' || quizState.mode === 'listening' || quizState.mode === 'ai_quiz') {
    scoreDisplayHtml = `
      <div class="match-stats-grid mb-4">
        <div class="match-stat">
          <div class="match-stat-value text-primary">${correct}/${total}</div>
          <div class="match-stat-label">Số câu đúng</div>
        </div>
        <div class="match-stat">
          <div class="match-stat-value text-success">${percent}%</div>
          <div class="match-stat-label">Chính xác</div>
        </div>
        <div class="match-stat">
          <div class="match-stat-value text-warning">${quizState.maxCombo || 0}</div>
          <div class="match-stat-label">Combo cao nhất</div>
        </div>
        <div class="match-stat">
          <div class="match-stat-value text-danger">${quizState.points || 0}</div>
          <div class="match-stat-label">Điểm số</div>
        </div>
      </div>
    `;
  } else {
    scoreDisplayHtml = `
      <div class="stat-count" style="font-size:3rem; margin:16px 0;">${correct}/${total}</div>
      <div class="text-muted mb-4 fs-5">${percent}% chính xác</div>
    `;
  }

  document.getElementById('practiceQuizContent').innerHTML = `
    <div class="card text-center border-0 animate-enter">
      <div class="float-animate" style="font-size:4rem; margin-bottom:12px;">${emoji}</div>
      <h2 class="m-0 mb-3">${percent >= 80 ? 'Xuất sắc!' : percent >= 60 ? 'Tốt lắm!' : percent >= 40 ? 'Cố gắng thêm!' : 'Cần ôn luyện!'}</h2>
      ${scoreDisplayHtml}

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
  if (!matchState || matchState.finished || matchState.locked) return;
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

  const board = document.querySelector('.match-board');
  if (board) {
    // Phản hồi tức thì ngay khi nhấn chuột/chạm (pointerdown) để không bị trễ hay trượt click khi di chuột nhanh
    board.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const tile = e.target.closest('.match-tile');
      if (!tile || tile.disabled) return;
      e.preventDefault();
      onMatchTileClick(tile);
    });
    // Hỗ trợ bàn phím (Enter / Space phát sinh click với e.detail === 0)
    board.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      const tile = e.target.closest('.match-tile');
      if (tile && !tile.disabled) onMatchTileClick(tile);
    });
    board.addEventListener('animationend', (e) => {
      if (e.target.classList?.contains('animate-spawn-tile')) {
        e.target.classList.remove('animate-spawn-tile');
      }
    });
  }

  // Sau khi hiển thị, đổi tất cả trạng thái 'spawning' về 'active' để tránh chạy lại animation
  matchState.leftTiles.forEach(t => { if (t.state === 'spawning') t.state = 'active'; });
  matchState.rightTiles.forEach(t => { if (t.state === 'spawning') t.state = 'active'; });
}

function onMatchTileClick(el) {
  if (!matchState || matchState.finished || matchState.locked) return;
  if (el.disabled || el.classList.contains('matched') || el.classList.contains('match-correct')) return;

  // Nếu thẻ đang có hiệu ứng báo sai từ lượt trước, xóa ngay để phản hồi tức thì
  if (el.classList.contains('wrong')) {
    el.classList.remove('wrong');
  }

  // Nhấn lại chính thẻ đang chọn -> bỏ chọn
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    matchState.selected = matchState.selected.filter(item => item !== el);
    return;
  }

  const side = el.dataset.side;

  // Đang chọn 1 thẻ ở cùng cột -> chuyển ngay sang thẻ mới chỉ với 1 lần nhấn
  const sameSideIdx = matchState.selected.findIndex(item => item.dataset.side === side);
  if (sameSideIdx !== -1) {
    document.querySelectorAll(`.match-tile.selected[data-side="${side}"]`).forEach(t => {
      t.classList.remove('selected');
    });
    el.classList.add('selected');
    matchState.selected[sameSideIdx] = el;
    return;
  }

  el.classList.add('selected');
  matchState.selected.push(el);

  if (matchState.selected.length === 2) {
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
    const points = 5 + (matchState.combo - 1) * 2;
    matchState.score += points;

    matchState.timer += 0.3;
    updateMatchTimer();

    // Trước tiên áp dụng class match-correct để tạo hiệu ứng nhấp nháy xanh lá (pop)
    a.classList.remove('selected');
    b.classList.remove('selected');
    a.classList.add('match-correct');
    b.classList.add('match-correct');

    const matchedEl = document.getElementById('matchStatsMatched');
    if (matchedEl) matchedEl.textContent = matchState.matched;
    const comboEl = document.getElementById('matchCombo');
    if (comboEl) comboEl.textContent = matchState.combo;

    // Xác định chỉ số slot của 2 thẻ vừa được ghép đúng
    const leftEl = a.dataset.side === 'left' ? a : b;
    const rightEl = a.dataset.side === 'right' ? a : b;
    const leftIdx = parseInt(leftEl.dataset.index);
    const rightIdx = parseInt(rightEl.dataset.index);

    // Cập nhật trạng thái trong bộ nhớ thành 'matched' (để giữ ẩn khi vẽ lại bảng)
    matchState.leftTiles[leftIdx].state = 'matched';
    matchState.rightTiles[rightIdx].state = 'matched';

    // Giải phóng lựa chọn ngay lập tức để người dùng chọn cặp tiếp theo không bị khựng
    matchState.selected = [];
    matchState.locked = false;

    // Sau khi hiệu ứng pop chạy xong, chuyển sang trạng thái ẩn mờ (matched)
    setTimeout(() => {
      a.classList.remove('match-correct');
      b.classList.remove('match-correct');
      a.classList.add('matched');
      b.classList.add('matched');
      a.disabled = true;
      b.disabled = true;
    }, 320);

    // Kiểm tra xem tất cả các ô hiện tại đã được ghép đúng chưa
    const activeCount = matchState.leftTiles.filter(t => t.state === 'active' || t.state === 'spawning').length;
    if (activeCount === 0) {
      matchState.locked = true; // Tạm dừng đồng hồ & khóa trong lúc nạp bảng mới
      setTimeout(() => {
        if (matchState.pool.length > 0) {
          replaceEntireBoard();
        } else {
          endMatchPairs();
        }
      }, 360);
    }
  } else {
    matchState.combo = 0;
    const comboEl = document.getElementById('matchCombo');
    if (comboEl) comboEl.textContent = '0';

    // Mở khóa ngay để người dùng có thể bấm chọn lại lập tức mà không phải chờ 500ms
    a.classList.remove('selected');
    b.classList.remove('selected');
    a.classList.add('wrong');
    b.classList.add('wrong');
    matchState.selected = [];
    matchState.locked = false;

    matchState.timer -= 0.7;
    if (matchState.timer < 0) matchState.timer = 0;
    updateMatchTimer();
    if (matchState.timer <= 0) {
      endMatchPairs();
      return;
    }

    setTimeout(() => {
      a.classList.remove('wrong');
      b.classList.remove('wrong');
    }, 320);
  }
}

function replaceEntireBoard() {
  if (matchState.finished) return;

  const nextCount = Math.min(MATCH_PAIRS_COUNT, matchState.pool.length);
  const active = matchState.pool.slice(0, nextCount);
  matchState.pool = matchState.pool.slice(nextCount);

  // Tạo và trộn lại hai cột cho lượt tiếp theo
  matchState.leftTiles = shuffle(active.map(w => ({ id: w.id, text: getEnglish(w), state: 'spawning' })));
  matchState.rightTiles = shuffle(active.map(w => ({ id: w.id, text: w.meaning, state: 'spawning' })));

  matchState.selected = [];
  matchState.locked = false;

  renderMatchBoard();
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
async function saveMatchPairsAttempt(userId, total, correct, percent, points, maxCombo) {
  try {
    const batch = writeBatch(db);
    const attemptRef = doc(collection(db, 'users', userId, 'quizAttempts'));
    batch.set(attemptRef, {
      direction: 'both',
      mode: 'matchpairs',
      totalQuestions: total,
      correctAnswers: correct,
      scorePercent: percent,
      points: points || 0,
      maxCombo: maxCombo || 0,
      createdAt: serverTimestamp()
    });
    await batch.commit();
    await enforceQuizHistoryLimit(userId);
    try {
      await updateUserTotalPoints(userId);
    } catch (err) {
      console.error('Lỗi khi cập nhật điểm rank:', err);
    }
    try {
      await triggerStreakAction(userId);
    } catch (err) {
      console.error('Lỗi khi kích hoạt streak:', err);
    }
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
    saveMatchPairsAttempt(user.uid, totalPairs, matchState.matched, accuracy, matchState.score, matchState.maxCombo);
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
  if (quizState?.intervalId) {
    clearInterval(quizState.intervalId);
    quizState.intervalId = null;
  }
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