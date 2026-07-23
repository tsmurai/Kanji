export function buildSessionSummary(results, practiceLength) {
  const total = Math.max(practiceLength, results.length);
  const passed = results.filter((result) => result.passed).length;
  const failed = Math.max(0, total - passed);

  return {
    total,
    passed,
    failed,
    message: `${total}問の練習が終わりました。${passed}問正解・${failed}問不正解です。`,
  };
}
