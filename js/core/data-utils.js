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

export async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export function normalizePos(pos, word = "") {
  if (!pos) return "";
  const p = String(pos).toLowerCase().trim();
  if (p in PART_OF_SPEECH_LABELS) return p;
  if (p === "adj") return "adjective";
  if (p === "adv") return "adverb";
  if (p === "v") return "verb";
  if (p === "n") return "noun";
  if (p === "prep") return "preposition";
  if (p === "conj") return "conjunction";
  if (p === "interj" || p === "exclamation") return "interjection";
  if (p === "phrase" || p === "phrasal" || p === "expression") {
    return String(word).includes(" ") ? "phrasal verb" : "other";
  }
  return "other";
}

export async function lookupWordDetails(rawWord) {
  const word = String(rawWord || "").trim();
  if (!word) return null;

  const result = {
    word,
    meaning: "",
    phonetic: "",
    partOfSpeech: "",
    audioUrl: "",
    source: ""
  };

  const configuredDict = typeof window !== "undefined" ? window.__APP_CONFIG__?.API_DICTIONARY : null;
  const dictUrl = configuredDict && !configuredDict.includes("api.dictionaryapi.dev")
    ? configuredDict
    : "https://freedictionaryapi.com/api/v1/entries/en";

  // Chạy song song Google Translate (dịch nghĩa + phiên âm nhanh) & FreeDictionary API
  const [gtResult, dictResult] = await Promise.allSettled([
    (async () => {
      const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(word)}`;
      const res = await fetchWithTimeout(gUrl, {}, 3000);
      if (!res.ok) return null;
      return res.json();
    })(),
    (async () => {
      const dUrl = `${dictUrl}/${encodeURIComponent(word)}`;
      const res = await fetchWithTimeout(dUrl, {}, 3000);
      if (!res.ok) return null;
      return res.json();
    })()
  ]);

  // Xử lý dữ liệu từ Google Translate
  if (gtResult.status === "fulfilled" && gtResult.value) {
    const data = gtResult.value;
    const primary = data[0]?.map((p) => p[0]).filter(Boolean).join("").trim();
    const gPhonetic = data[0]?.[1]?.[3] || data[0]?.[1]?.[2] || "";
    const gPos = data[1]?.[0]?.[0] || "";

    if (primary && primary.toLowerCase() !== word.toLowerCase()) {
      result.meaning = primary;
      result.source = "google";
    }
    if (gPhonetic) {
      result.phonetic = gPhonetic.startsWith("/") ? gPhonetic : `/${gPhonetic}/`;
    }
    if (gPos) {
      result.partOfSpeech = normalizePos(gPos, word);
    }
  }

  // Xử lý dữ liệu từ Dictionary (chuẩn IPA và Audio)
  if (dictResult.status === "fulfilled" && dictResult.value) {
    const data = dictResult.value;
    if (data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      const first = data.entries[0];
      const ipa = first.pronunciations?.find((p) => p.type === "ipa")?.text;
      if (ipa) result.phonetic = ipa;
      if (first.partOfSpeech && (!result.partOfSpeech || result.partOfSpeech === "other")) {
        result.partOfSpeech = normalizePos(first.partOfSpeech, word);
      }
      const audio = first.pronunciations?.find((p) => p.audioUrl || p.audio)?.audioUrl || first.pronunciations?.find((p) => p.audioUrl || p.audio)?.audio;
      if (audio) result.audioUrl = audio;
    } else if (Array.isArray(data) && data.length > 0) {
      const firstEntry = data[0];
      const phonetic = firstEntry?.phonetic || firstEntry?.phonetics?.find((p) => p?.text)?.text;
      if (phonetic) result.phonetic = phonetic;
      const pos = firstEntry?.meanings?.[0]?.partOfSpeech;
      if (pos && (!result.partOfSpeech || result.partOfSpeech === "other")) {
        result.partOfSpeech = normalizePos(pos, word);
      }
      const audio = firstEntry?.phonetics?.find((p) => p?.audio)?.audio;
      if (audio) result.audioUrl = audio;
    }
  }

  // Fallback nếu nghĩa vẫn trống
  if (!result.meaning) {
    try {
      const fallback = await translateToVietnamese(word);
      if (fallback && fallback.toLowerCase() !== word.toLowerCase()) {
        result.meaning = fallback;
      }
    } catch (_) {}
  }

  // Nếu là cụm từ nhiều từ mà chưa rõ loại từ
  if (word.includes(" ") && (!result.partOfSpeech || result.partOfSpeech === "other")) {
    result.partOfSpeech = "phrasal verb";
  }

  return result;
}

export async function lookupWordMeaning(word) {
  const key = normalizeText(word);
  if (dictionaryCache.has(key)) return dictionaryCache.get(key);

  try {
    const details = await lookupWordDetails(word);
    if (details && (details.meaning || details.phonetic)) {
      const result = {
        word,
        phonetic: details.phonetic,
        audioUrl: details.audioUrl,
        meaningsByPos: {
          [details.partOfSpeech || "other"]: [
            { en: word, vi: details.meaning || word }
          ]
        }
      };
      dictionaryCache.set(key, result);
      return result;
    }
  } catch (_) {}

  const translated = await translateToVietnamese(word);
  const result = {
    word,
    phonetic: "",
    audioUrl: "",
    meaningsByPos: {
      other: [{ en: word, vi: translated || word }]
    }
  };
  dictionaryCache.set(key, result);
  return result;
}

export async function translateToVietnamese(text) {
  const key = normalizeText(text);
  if (translationCache.has(key)) return translationCache.get(key);

  // 1. Thử Google Translate trước (nhanh và tỉ lệ thành công cao)
  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetchWithTimeout(gUrl, {}, 3500);
    if (response.ok) {
      const data = await response.json();
      const translated = data?.[0]?.map((p) => p[0]).filter(Boolean).join("").trim() || "";
      if (translated) {
        translationCache.set(key, translated);
        return translated;
      }
    }
  } catch (_) {}

  // 2. Fallback MyMemory
  try {
    const translateBase = (typeof window !== "undefined" && window.__APP_CONFIG__?.API_TRANSLATE) || "https://api.mymemory.translated.net/get";
    const response = await fetchWithTimeout(`${translateBase}?q=${encodeURIComponent(text)}&langpair=en|vi`, {}, 3500);
    if (response.ok) {
      const data = await response.json();
      const translated = data?.responseData?.translatedText?.trim() || "";
      if (translated && !translated.toUpperCase().includes("MYMEMORY WARNING")) {
        translationCache.set(key, translated);
        return translated;
      }
    }
  } catch (_) {}

  return "";
}

export function formatDate(value) {
  if (!value) return "--";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("vi-VN");
}
