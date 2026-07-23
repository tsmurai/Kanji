// ユーザー切り替え・進捗のローカル保存(端末内完結、クラウド同期なし)
const USERS_KEY = "kanji-app:users";
const CURRENT_USER_KEY = "kanji-app:currentUser";
const PROGRESS_KEY_PREFIX = "kanji-app:progress:";
const PRACTICE_LENGTH_KEY = "kanji-app:practiceLength";
const FOCUS_PAGE_KEY = "kanji-app:focusPage";

const DEFAULT_USERS = [
  { id: "tsune", name: "Tsune" },
  { id: "takuma", name: "Takuma" },
  { id: "guest", name: "Guest" },
];

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return [...DEFAULT_USERS];
  }
  return JSON.parse(raw);
}

export function addUser(name) {
  const users = getUsers();
  const user = { id: uid(), name };
  users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return user;
}

// 明示的に選択されたユーザーがいる場合のみ返す(未選択なら null にして選択画面を出す)
export function getCurrentUserId() {
  const id = localStorage.getItem(CURRENT_USER_KEY);
  const users = getUsers();
  if (id && users.some((u) => u.id === id)) return id;
  return null;
}

export function setCurrentUserId(id) {
  localStorage.setItem(CURRENT_USER_KEY, id);
}

export function getPracticeLength() {
  const value = Number(localStorage.getItem(PRACTICE_LENGTH_KEY));
  return Number.isFinite(value) && value > 0 ? value : 10;
}

export function setPracticeLength(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return;
  localStorage.setItem(PRACTICE_LENGTH_KEY, String(next));
}

// 集中して練習したいページ番号(複数選択可)。空配列は「指定なし(全体から出題)」を意味する。
export function getFocusPages() {
  const raw = localStorage.getItem(FOCUS_PAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => Number.isFinite(v)) : [];
  } catch {
    return [];
  }
}

export function setFocusPages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    localStorage.removeItem(FOCUS_PAGE_KEY);
    return;
  }
  localStorage.setItem(FOCUS_PAGE_KEY, JSON.stringify(pages));
}

function progressKey(userId) {
  return `${PROGRESS_KEY_PREFIX}${userId}`;
}

// { [kanjiChar]: { attempts, correct, wrong, lastResult, lastAt, streak } }
// { [questionId]: { attempts, correct, wrong, lastResult, lastAt, streak } }
export function getProgress(userId) {
  const raw = localStorage.getItem(progressKey(userId));
  return raw ? JSON.parse(raw) : {};
}

export function recordResult(userId, char, passed) {
  const progress = getProgress(userId);
  const entry = progress[char] || { attempts: 0, correct: 0, wrong: 0, streak: 0 };
  entry.attempts += 1;
  if (passed) {
    entry.correct += 1;
    entry.streak = Math.max(0, entry.streak) + 1;
  } else {
    entry.wrong += 1;
    entry.streak = Math.min(0, entry.streak) - 1;
  }
  entry.lastResult = passed ? "ok" : "ng";
  entry.lastAt = Date.now();
  progress[char] = entry;
  localStorage.setItem(progressKey(userId), JSON.stringify(progress));
  return entry;
}

export function recordQuestionResult(userId, questionId, passed) {
  const progress = getProgress(userId);
  const entry = progress[questionId] || { attempts: 0, correct: 0, wrong: 0, streak: 0 };
  entry.attempts += 1;
  if (passed) {
    entry.correct += 1;
    entry.streak = Math.max(0, entry.streak) + 1;
  } else {
    entry.wrong += 1;
    entry.streak = Math.min(0, entry.streak) - 1;
  }
  entry.lastResult = passed ? "ok" : "ng";
  entry.lastAt = Date.now();
  progress[questionId] = entry;
  localStorage.setItem(progressKey(userId), JSON.stringify(progress));
  return entry;
}

export function getWeaknessScore(userId, char, basePriority) {
  const progress = getProgress(userId);
  const entry = progress[char];
  if (!entry) return basePriority * 10;
  const streakPenalty = entry.streak < 0 ? -entry.streak * 8 : -entry.streak * 3;
  return basePriority * 10 + streakPenalty;
}

export function getQuestionWeaknessScore(userId, questionId, basePriority) {
  const progress = getProgress(userId);
  const entry = progress[questionId];
  if (!entry) return basePriority * 10;
  const streakPenalty = entry.streak < 0 ? -entry.streak * 8 : -entry.streak * 3;
  return basePriority * 10 + streakPenalty;
}
