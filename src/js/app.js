import { loadQuestions, loadKanjiIndex, findQuestionByNumber, findQuestionByReference } from "./data.js";
import { loadKanjiStrokes } from "./kanjivg.js";
import { HandwritingCanvas } from "./canvas.js";
import { judgeKanji, judgeStrokeCountOnly } from "./judge.js";
import * as store from "./store.js";
import { buildSessionSummary } from "./sessionSummary.js";

function codepointOf(ch) {
  return ch.codePointAt(0).toString(16).padStart(5, "0");
}

// 答えを「漢字1文字ずつ」と「送り仮名のひとまとまり」に分割する。
// 送り仮名は文字数がわかると答えの推測材料になってしまうため、
// 何文字であっても常に1つの横長マスにまとめて書かせる。
function segmentAnswer(answer) {
  const segments = [];
  let kanaBuffer = "";
  const flushKana = () => {
    if (kanaBuffer) {
      segments.push({ type: "kana", text: kanaBuffer });
      kanaBuffer = "";
    }
  };
  for (const ch of answer) {
    if (KANJI_RE.test(ch)) {
      flushKana();
      segments.push({ type: "kanji", char: ch });
    } else {
      kanaBuffer += ch;
    }
  }
  flushKana();
  return segments;
}

function getQuestionDifficultyScore(question, userId) {
  const chars = [...question.answer].filter((c) => KANJI_RE.test(c));
  const charScore = chars.reduce((max, c) => {
    const entry = state.kanjiByChar.get(c);
    const basePriority = entry ? entry.priority : 2;
    return Math.max(max, store.getWeaknessScore(userId, c, basePriority));
  }, 0);

  const questionScore = store.getQuestionWeaknessScore(userId, question.id, question.mastery);
  return Math.max(charScore, questionScore);
}

const KANJI_RE = /[々一-鿿㐀-䶿]/;

const els = {
  userBadge: document.getElementById("userBadge"),
  screens: {
    loading: document.getElementById("screen-loading"),
    user: document.getElementById("screen-user"),
    home: document.getElementById("screen-home"),
    practice: document.getElementById("screen-practice"),
  },
  userList: document.getElementById("userList"),
  addUserForm: document.getElementById("addUserForm"),
  newUserName: document.getElementById("newUserName"),
  homeGreeting: document.getElementById("homeGreeting"),
  practiceLengthOptions: document.getElementById("practiceLengthOptions"),
  focusPageOptions: document.getElementById("focusPageOptions"),
  startPracticeBtn: document.getElementById("startPracticeBtn"),
  switchUserBtn: document.getElementById("switchUserBtn"),
  progressSummary: document.getElementById("progressSummary"),
  backHomeBtn: document.getElementById("backHomeBtn"),
  jumpQuestionForm: document.getElementById("jumpQuestionForm"),
  jumpInput: document.getElementById("jumpInput"),
  questionMeta: document.getElementById("questionMeta"),
  questionSentence: document.getElementById("questionSentence"),
  charBoxes: document.getElementById("charBoxes"),
  clearBtn: document.getElementById("clearBtn"),
  gradeBtn: document.getElementById("gradeBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finishSetBtn: document.getElementById("finishSetBtn"),
  resultArea: document.getElementById("resultArea"),
};

const state = {
  users: [],
  currentUserId: null,
  practiceLength: 10,
  focusPages: [], // 空 = 全体から出題。指定時はそのページ番号の問題だけに絞る(複数選択可)
  availablePages: [],
  questions: [],
  kanjiIndex: [],
  kanjiByChar: new Map(),
  recentQuestionIds: [],
  sessionSeenIds: new Set(),
  sessionAttemptCount: 0,
  currentQuestion: null,
  repeatQueue: [],
  retryCounts: new Map(),
  lastPickSource: null,
  charCanvases: [], // { char, canvas: HandwritingCanvas, ref }
  sessionResults: [],
};

function showScreen(name) {
  for (const [key, el] of Object.entries(els.screens)) {
    el.hidden = key !== name;
  }
}

function currentUserName() {
  return state.users.find((u) => u.id === state.currentUserId)?.name ?? "";
}

function renderUserBadge() {
  if (!state.currentUserId) {
    els.userBadge.hidden = true;
    return;
  }
  els.userBadge.hidden = false;
  els.userBadge.textContent = currentUserName();
}

function renderUserList() {
  state.users = store.getUsers();
  els.userList.innerHTML = "";
  for (const u of state.users) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "user-select-btn";
    btn.textContent = u.name;
    btn.addEventListener("click", () => selectUser(u.id));
    li.appendChild(btn);
    els.userList.appendChild(li);
  }
}

function selectUser(id) {
  state.currentUserId = id;
  store.setCurrentUserId(id);
  renderUserBadge();
  goHome();
}

function goHome() {
  els.homeGreeting.textContent = `${currentUserName()} さん、こんにちは`;
  renderPracticeLengthOptions();
  renderFocusPageOptions();
  renderProgressSummary();
  showScreen("home");
}

function renderPracticeLengthOptions() {
  const options = [5, 10, 20, 30];
  els.practiceLengthOptions.innerHTML = "";
  for (const value of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `practice-length-option${state.practiceLength === value ? " is-active" : ""}`;
    btn.textContent = `${value}問`;
    btn.addEventListener("click", () => {
      state.practiceLength = value;
      store.setPracticeLength(value);
      renderPracticeLengthOptions();
    });
    els.practiceLengthOptions.appendChild(btn);
  }
}

function renderFocusPageOptions() {
  const container = els.focusPageOptions;
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `practice-length-option${state.focusPages.length === 0 ? " is-active" : ""}`;
  allBtn.textContent = "指定なし(全体)";
  allBtn.addEventListener("click", () => {
    state.focusPages = [];
    store.setFocusPages(state.focusPages);
    renderFocusPageOptions();
  });
  container.appendChild(allBtn);

  for (const page of state.availablePages) {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = state.focusPages.includes(page);
    btn.className = `practice-length-option${isActive ? " is-active" : ""}`;
    btn.textContent = `${page}`;
    btn.addEventListener("click", () => {
      if (state.focusPages.includes(page)) {
        state.focusPages = state.focusPages.filter((p) => p !== page);
      } else {
        state.focusPages = [...state.focusPages, page];
      }
      store.setFocusPages(state.focusPages);
      renderFocusPageOptions();
    });
    container.appendChild(btn);
  }
}

function renderProgressSummary() {
  const progress = store.getProgress(state.currentUserId);
  // progressには漢字1文字ごとの記録のほか、問題ID(例: "P6-:6-1")や送り仮名の
  // まとまり(例: "って")の記録も同じ場所に入っているため、「苦手そうな漢字」には
  // 実際に漢字1文字のキーだけを対象にする。
  const kanjiKeys = Object.keys(progress).filter((k) => [...k].length === 1 && KANJI_RE.test(k));

  // エクセルの「結果」列が空欄の問題(追加されたばかりのページなど)は、
  // 一度解くまで優先的に出題される。あと何問残っているかを表示する。
  const unratedTotal = state.questions.filter((q) => q.mastery === null || q.mastery === undefined);
  const unratedRemaining = unratedTotal.filter((q) => !progress[q.id]).length;
  const unratedLine =
    unratedTotal.length > 0 && unratedRemaining > 0
      ? `<p>まだ一度も解いていない新しい問題: あと${unratedRemaining}問</p>`
      : "";

  if (kanjiKeys.length === 0) {
    els.progressSummary.innerHTML = `<p>まだ練習記録がありません。</p>${unratedLine}`;
    return;
  }
  const weakChars = kanjiKeys
    .filter((c) => progress[c].streak < 0)
    .sort((a, b) => progress[a].streak - progress[b].streak)
    .slice(0, 10);
  els.progressSummary.innerHTML =
    `<p>練習した漢字: ${kanjiKeys.length}字</p>` +
    (weakChars.length
      ? `<p>苦手そうな漢字: <span class="weak-chars">${weakChars.join(" ")}</span></p>`
      : "") +
    unratedLine;
}

// --- 出題選択 ---

function recordPick(id, source) {
  state.recentQuestionIds.push(id);
  if (state.recentQuestionIds.length > 8) state.recentQuestionIds.shift();
  state.lastPickSource = source;
}

const POOL_SIZE = 20;

function pickNextQuestion() {
  const lastId = state.recentQuestionIds[state.recentQuestionIds.length - 1];

  // 間違えた問題はやり直しキューへ積むが、
  // ・直前に出したばかりの問題は連続で出さない
  // ・やり直しを連続採用しない(新しい問題と交互に出し、キューが出題を独占しないようにする)
  const canPickRepeat =
    state.repeatQueue.length > 0 &&
    state.repeatQueue[0].id !== lastId &&
    state.lastPickSource !== "repeat";

  if (canPickRepeat) {
    const repeatCandidate = state.repeatQueue.shift();
    recordPick(repeatCandidate.id, "repeat");
    return repeatCandidate;
  }

  // ページ指定があれば、そのページの問題だけに絞ってから出題を選ぶ
  const pool0 = state.focusPages.length === 0
    ? state.questions
    : state.questions.filter((q) => state.focusPages.includes(q.page));
  const sourceQuestions = pool0.length > 0 ? pool0 : state.questions;

  const scored = sourceQuestions.map((q) => ({
    q,
    score: getQuestionDifficultyScore(q, state.currentUserId),
    chars: [...q.answer].filter((c) => KANJI_RE.test(c)),
  }));

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  // 同じスコアの問題は数十〜百問単位で並ぶ(まだ一度も解いていない問題など)。
  // 上位20件で機械的に切ると境界の同点分が常に切り捨てられ、毎回同じ問題ばかりになるため、
  // 20件目と同点のものはすべて候補に含めたうえで抽選する。
  const cutoff = scored[Math.min(POOL_SIZE, scored.length) - 1].score;
  const tiered = scored.filter((s) => s.score >= cutoff);
  const pool = tiered.filter((s) => !state.recentQuestionIds.includes(s.q.id));
  const candidates = pool.length > 0 ? pool : tiered;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];

  recordPick(pick.q.id, "pool");
  return pick.q;
}

const MAX_RETRIES_PER_QUESTION = 2;

async function startPractice() {
  state.repeatQueue = [];
  state.recentQuestionIds = [];
  state.sessionSeenIds = new Set();
  state.sessionAttemptCount = 0;
  state.sessionResults = [];
  state.retryCounts = new Map();
  state.lastPickSource = null;
  state.currentQuestion = null;
  showScreen("practice");
  await loadNextQuestion();
}

async function renderQuestion(q) {
  state.currentQuestion = q;
  state.sessionSeenIds.add(q.id);
  state.sessionAttemptCount += 1;

  els.questionMeta.textContent = `No.${q.no} / ${q.reference}`;
  els.questionSentence.innerHTML = q.sentence.replace(
    /【(.+?)】/,
    '<span class="blank">【$1】</span>'
  );
  els.resultArea.innerHTML = "";
  els.nextBtn.hidden = true;
  els.finishSetBtn.hidden = true;
  els.gradeBtn.hidden = false;
  els.gradeBtn.disabled = false;

  els.charBoxes.innerHTML = "";
  state.charCanvases = [];

  for (const segment of segmentAnswer(q.answer)) {
    const wrapper = document.createElement("div");
    const canvasEl = document.createElement("canvas");
    const feedback = document.createElement("div");
    const actions = document.createElement("div");
    const undoBtn = document.createElement("button");
    feedback.className = "char-feedback";
    actions.className = "char-box-actions";
    undoBtn.type = "button";
    undoBtn.className = "char-box-action-btn";
    undoBtn.textContent = "1文字消す";

    // 漢字マスと送り仮名マスで同じ配線をする。
    // (以前は送り仮名側の分岐が先に continue していたため、ボタンが無反応だった)
    const bindUndo = (hwCanvas) => {
      undoBtn.addEventListener("click", () => {
        hwCanvas.clear();
        feedback.textContent = "";
      });
    };

    if (segment.type === "kana") {
      // 送り仮名は文字数が答えの手がかりにならないよう、常に同じ横長の1マスにまとめる
      wrapper.className = "char-box char-box--kana";
      canvasEl.className = "handwriting-canvas handwriting-canvas--wide";
      // このマスには送り仮名が何文字か入るため、「1文字消す」ではなくマスごと消す
      undoBtn.textContent = "書き直す";
      wrapper.appendChild(canvasEl);
      wrapper.appendChild(feedback);
      actions.appendChild(undoBtn);
      wrapper.appendChild(actions);
      els.charBoxes.appendChild(wrapper);

      const hwCanvas = new HandwritingCanvas(canvasEl);
      const record = { text: segment.text, canvas: hwCanvas, feedbackEl: feedback, isKana: true };
      state.charCanvases.push(record);
      bindUndo(hwCanvas);

      Promise.all([...segment.text].map((ch) => loadKanjiStrokes(codepointOf(ch))))
        .then((refs) => {
          record.expectedStrokeCount = refs.reduce((sum, r) => sum + r.strokeCount, 0);
        })
        .catch(() => {
          feedback.textContent = "お手本データが見つかりませんでした";
        });
      continue;
    }

    wrapper.className = "char-box";
    canvasEl.className = "handwriting-canvas";
    wrapper.appendChild(canvasEl);
    wrapper.appendChild(feedback);
    actions.appendChild(undoBtn);
    wrapper.appendChild(actions);
    els.charBoxes.appendChild(wrapper);

    const hwCanvas = new HandwritingCanvas(canvasEl);
    const entry = state.kanjiByChar.get(segment.char);
    const record = { char: segment.char, canvas: hwCanvas, feedbackEl: feedback, entry, isKana: false };
    state.charCanvases.push(record);
    bindUndo(hwCanvas);

    if (entry) {
      loadKanjiStrokes(entry.codepoint)
        .then((ref) => {
          record.ref = ref;
        })
        .catch(() => {
          feedback.textContent = "お手本データが見つかりませんでした";
        });
    }
  }
}

async function loadNextQuestion() {
  if (state.currentQuestion && state.repeatQueue.length === 0 && state.sessionAttemptCount >= state.practiceLength) {
    const summary = buildSessionSummary(state.sessionResults, state.practiceLength);
    els.resultArea.innerHTML = `<p class="ok">${summary.message}</p>`;
    els.nextBtn.hidden = true;
    els.finishSetBtn.hidden = false;
    els.gradeBtn.hidden = true;
    return;
  }

  const q = pickNextQuestion();
  if (!q) {
    els.resultArea.innerHTML = '<p class="warn">出題できる問題が見つかりませんでした。</p>';
    return;
  }
  await renderQuestion(q);
}

function finishPracticeSet() {
  goHome();
}

async function jumpToQuestionByInput() {
  const query = els.jumpInput.value.trim();
  if (!query) return;

  const byNumber = await findQuestionByNumber(query);
  const q = byNumber ?? (await findQuestionByReference(query));

  if (!q) {
    els.resultArea.innerHTML = '<p class="warn">該当する問題が見つかりませんでした。</p>';
    return;
  }

  els.jumpInput.value = "";
  showScreen("practice");
  await renderQuestion(q);
}

function clearCanvases() {
  for (const c of state.charCanvases) {
    c.canvas.clear();
    c.feedbackEl.innerHTML = "";
  }
  els.resultArea.innerHTML = "";
  els.nextBtn.hidden = true;
  els.gradeBtn.hidden = false;
}

function gradeAll() {
  if (state.charCanvases.length === 0) return;

  const emptyOnes = state.charCanvases.filter((c) => c.canvas.isEmpty());
  if (emptyOnes.length > 0) {
    els.resultArea.innerHTML = `<p class="warn">すべてのマスに書いてから採点してください</p>`;
    return;
  }

  let questionPassed = true;
  for (const c of state.charCanvases) {
    if (c.isKana) {
      const answerText = c.text;
      if (c.expectedStrokeCount == null) {
        c.feedbackEl.innerHTML = `<p class="warn">お手本データが読み込めていません</p>`;
        questionPassed = false;
        c.canvas.showAnswer(answerText);
        continue;
      }
      const strokes = c.canvas.getStrokes();
      const result = judgeStrokeCountOnly(strokes, c.expectedStrokeCount);
      renderCharFeedback(c, result, answerText);
      c.canvas.showAnswer(answerText);
      store.recordResult(state.currentUserId, answerText, result.overallOk);
      store.recordQuestionResult(state.currentUserId, state.currentQuestion.id, result.overallOk);
      if (!result.overallOk) questionPassed = false;
      continue;
    }

    if (!c.ref) {
      c.feedbackEl.innerHTML = `<p class="warn">お手本データが読み込めていません</p>`;
      questionPassed = false;
      c.canvas.showAnswer(c.char);
      continue;
    }
    const strokes = c.canvas.getStrokes();
    const result = judgeKanji(strokes, c.ref);
    renderCharFeedback(c, result, c.char);
    c.canvas.showAnswer(c.char);
    store.recordResult(state.currentUserId, c.char, result.overallOk);
    store.recordQuestionResult(state.currentUserId, state.currentQuestion.id, result.overallOk);
    if (!result.overallOk) questionPassed = false;
  }

  if (!questionPassed) {
    const qid = state.currentQuestion.id;
    const retries = state.retryCounts.get(qid) ?? 0;
    const alreadyQueued = state.repeatQueue.some((q) => q.id === qid);
    // このセッション内での再挑戦回数に上限を設け、同じ問題が延々と居座らないようにする。
    // (それでも苦手なら、次回セッション以降で優先度スコアにより自然に再出題される)
    if (!alreadyQueued && retries < MAX_RETRIES_PER_QUESTION) {
      state.repeatQueue.push(state.currentQuestion);
      state.retryCounts.set(qid, retries + 1);
    }
  }

  state.sessionResults.push({ questionId: state.currentQuestion.id, passed: questionPassed });

  if (state.sessionAttemptCount >= state.practiceLength) {
    const summary = buildSessionSummary(state.sessionResults, state.practiceLength);
    els.resultArea.innerHTML = `<p class="ok">${summary.message}</p>`;
    els.finishSetBtn.hidden = false;
  } else {
    els.resultArea.innerHTML = `<p class="${questionPassed ? "ok" : "warn"}">${questionPassed ? "よくできました！" : "もう一度お手本を見て練習してみましょう"}</p>`;
    els.finishSetBtn.hidden = true;
  }

  els.gradeBtn.hidden = true;
  els.nextBtn.hidden = false;
}

function renderCharFeedback(record, result, text) {
  const label = result.overallOk ? "○" : "×";
  const lines = [
    `<div class="feedback-title ${result.overallOk ? "ok" : "ng"}">${label} ${text}</div>`,
  ];

  if (!result.overallOk) {
    lines.push(`<div class="feedback-detail">画数: ${result.userStrokeCount}/${result.refStrokeCount}</div>`);

    for (const h of result.haneFails ?? []) {
      lines.push(`<div class="feedback-detail ng">${h.refIndex + 1}画目: ${h.message}</div>`);
    }
    // 画数が同じでも位置・形がずれていると「抜け」と「余分」が同数出るため、
    // その場合は「入れ替わっている(形が違う)」とまとめて伝え、矛盾した表示を避ける。
    if (result.mismatchedCount > 0) {
      lines.push(`<div class="feedback-detail ng">形が違う画があるようです</div>`);
    }
    if (result.netMissing > 0) {
      const nums = result.missingStrokes.slice(0, result.netMissing).map((i) => `${i + 1}`).join("、");
      lines.push(`<div class="feedback-detail ng">${nums}画目あたりが足りないようです</div>`);
    }
    if (result.netExtra > 0) {
      lines.push(`<div class="feedback-detail ng">余分な画があるようです</div>`);
    }
    for (const h of result.hintIssues ?? []) {
      lines.push(`<div class="feedback-detail hint">${h.refIndex + 1}画目: ${h.message}</div>`);
    }
  }

  record.feedbackEl.innerHTML = lines.join("");
}

// --- init ---

function bindEvents() {
  els.addUserForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.newUserName.value.trim();
    if (!name) return;
    const user = store.addUser(name);
    els.newUserName.value = "";
    renderUserList();
    selectUser(user.id);
  });

  els.startPracticeBtn.addEventListener("click", startPractice);
  els.switchUserBtn.addEventListener("click", () => {
    renderUserList();
    showScreen("user");
  });
  els.backHomeBtn.addEventListener("click", goHome);
  els.jumpQuestionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void jumpToQuestionByInput();
  });
  els.clearBtn.addEventListener("click", clearCanvases);
  els.gradeBtn.addEventListener("click", gradeAll);
  els.nextBtn.addEventListener("click", loadNextQuestion);
  els.finishSetBtn.addEventListener("click", finishPracticeSet);
}

async function init() {
  bindEvents();
  renderUserList();

  state.practiceLength = store.getPracticeLength();
  state.focusPages = store.getFocusPages();
  const [questions, kanjiIndex] = await Promise.all([loadQuestions(), loadKanjiIndex()]);
  state.questions = questions;
  state.kanjiIndex = kanjiIndex;
  state.kanjiByChar = new Map(kanjiIndex.map((e) => [e.char, e]));
  state.availablePages = [...new Set(questions.map((q) => q.page).filter((p) => p !== null))].sort((a, b) => a - b);

  const currentId = store.getCurrentUserId();
  if (currentId) {
    state.currentUserId = currentId;
    renderUserBadge();
    goHome();
  } else {
    showScreen("user");
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

init();
