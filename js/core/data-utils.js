export const PART_OF_SPEECH_LABELS = {
  noun: "Danh từ",
  verb: "Động từ",
  adjective: "Tính từ",
  adverb: "Trạng từ",
  pronoun: "Đại từ",
  preposition: "Giới từ",
  conjunction: "Liên từ",
  interjection: "Thán từ",
  "phrasal verb": "Cụm động từ",
  exclamation: "Thán từ",
  article: "Mạo từ",
  determiner: "Từ hạn định",
  abbreviation: "Viết tắt",
  idiom: "Thành ngữ",
  other: "Khác"
};

const dictionaryCache = new Map();
const translationCache = new Map();

export function normalizeText(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeSearch(value = "") {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function slugify(value = "") {
  return normalizeSearch(value)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

export function getWordEnglish(word = {}) {
  return word.english || word.englishWord || "";
}

export function getPosLabel(pos = "") {
  return PART_OF_SPEECH_LABELS[pos] || pos || "Khác";
}

export function getSessionName(sessionId, sessions = [], fallback = "") {
  if (!sessionId) return fallback || "";
  return sessions.find((session) => session.id === sessionId)?.name || fallback || "";
}

export function wordMatchesSession(word = {}, sessionId = "all", sessions = []) {
  if (sessionId === "all") return true;
  if (word.sessionId === sessionId) return true;
  const sessionName = getSessionName(sessionId, sessions);
  return Boolean(sessionName && normalizeSearch(word.sessionName) === normalizeSearch(sessionName));
}

export function calcStats(stats = {}, deltaCorrect = 0, deltaWrong = 0) {
  const correctCount = (stats.correctCount ?? stats.correct ?? 0) + deltaCorrect;
  const wrongCount = (stats.wrongCount ?? Math.max((stats.attempts ?? 0) - (stats.correct ?? 0), 0)) + deltaWrong;
  const totalAnswered = correctCount + wrongCount;
  const accuracy = totalAnswered ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const mastery = correctCount >= 30 ? 100 : Math.min(100, Math.round((correctCount / 30) * 100));

  return {
    ...stats,
    correctCount,
    wrongCount,
    totalAnswered,
    accuracy,
    mastery,
    mastered: correctCount >= 30,
    attempts: totalAnswered,
    correct: correctCount
  };
}

export function splitMeaningAnswers(text = "") {
  return String(text)
    .split(/[;,/|]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

export async function lookupWordMeaning(word) {
  const key = normalizeText(word);
  if (dictionaryCache.has(key)) return dictionaryCache.get(key);

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error("Dictionary lookup failed");

    const entries = await response.json();
    if (!Array.isArray(entries) || !entries.length) throw new Error("No dictionary data");

    const phonetic =
      entries.find((item) => item.phonetic)?.phonetic ||
      entries.flatMap((item) => item.phonetics || []).find((item) => item?.text)?.text ||
      "";

    const audioUrl =
      entries.flatMap((item) => item.phonetics || []).find((item) => item?.audio)?.audio || "";

    const grouped = {};
    entries.forEach((entry) => {
      (entry.meanings || []).forEach((meaningObj) => {
        const pos = meaningObj.partOfSpeech || "other";
        grouped[pos] ||= [];
        (meaningObj.definitions || []).forEach((defObj) => {
          const definition = String(defObj.definition || "").trim();
          if (definition && !grouped[pos].includes(definition)) grouped[pos].push(definition);
        });
      });
    });

    const meaningsByPos = {};
    for (const [pos, definitions] of Object.entries(grouped)) {
      meaningsByPos[pos] = [];
      for (const definition of definitions.slice(0, 3)) {
        let vi = "";
        try {
          vi = await translateToVietnamese(definition);
        } catch (_) {
          vi = "";
        }
        meaningsByPos[pos].push({ en: definition, vi: vi || definition });
      }
    }

    const result = { word, phonetic, audioUrl, meaningsByPos };
    dictionaryCache.set(key, result);
    return result;
  } catch (error) {
    const translated = await translateToVietnamese(word);
    const result = {
      word,
      phonetic: "",
      audioUrl: "",
      meaningsByPos: {
        other: [{ en: word, vi: translated }]
      }
    };
    dictionaryCache.set(key, result);
    return result;
  }
}

async function translateToVietnamese(text) {
  const key = normalizeText(text);
  if (translationCache.has(key)) return translationCache.get(key);

  const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`);
  if (!response.ok) throw new Error("Translation failed");

  const data = await response.json();
  const translated = data?.responseData?.translatedText?.trim() || "";
  if (!translated) throw new Error("No translation");

  translationCache.set(key, translated);
  return translated;
}

export function formatDate(value) {
  if (!value) return "--";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("vi-VN");
}
