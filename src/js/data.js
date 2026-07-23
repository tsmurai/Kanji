// 問題データ・漢字インデックスの読み込み(GitHub Pagesなど静的ホスティング前提でfetch)
const DATA_BASE = new URL("../../data/", import.meta.url);
const KANJIVG_BASE = new URL("../../kanjivg/", import.meta.url);

let _questions = null;
let _kanjiIndex = null;
let _questionIndex = null;

export async function loadQuestions() {
  if (_questions) return _questions;
  const res = await fetch(new URL("questions.json", DATA_BASE));
  _questions = await res.json();
  return _questions;
}

export async function loadKanjiIndex() {
  if (_kanjiIndex) return _kanjiIndex;
  const res = await fetch(new URL("kanji_index.json", DATA_BASE));
  _kanjiIndex = await res.json();
  return _kanjiIndex;
}

export async function loadQuestionIndex() {
  if (_questionIndex) return _questionIndex;
  const res = await fetch(new URL("question_index.json", DATA_BASE));
  _questionIndex = await res.json();
  return _questionIndex;
}

export async function findQuestionByNumber(number) {
  const questions = await loadQuestions();
  const query = String(number).trim();
  return questions.find((q) => q.no === query || q.reference === query || q.id === query) ?? null;
}

export async function findQuestionByReference(reference) {
  const questions = await loadQuestions();
  const query = String(reference).trim();
  return questions.find((q) => q.reference === query || q.id === query) ?? null;
}

export async function getQuestionIdsByNumber(number) {
  const index = await loadQuestionIndex();
  const query = String(number).trim();
  return index?.byNumber?.[query] ?? [];
}

export function kanjivgUrl(codepoint) {
  return new URL(`${codepoint}.svg`, KANJIVG_BASE).toString();
}
