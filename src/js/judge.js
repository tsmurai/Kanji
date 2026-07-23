// 手書きストロークとKanjiVGのお手本を比較して判定する。
// 3段階: 1) 画数不足の検出 2) 抜けた画の特定(マッチング) 3) とめ/はね/払いの形の正確さ
//
// 「はね」だけは厳密に判定し、それ以外(画数不足・抜けた画・とめ・払い)は
// 合否には影響させず、アドバイスとして表示するだけの緩め設定にしている。
import { resampleByLength, meanDistance, tailTurnAngle } from "./geometry.js";

const RESAMPLE_N = 20;
// マッチング距離のしきい値(0-109の論理空間上)。これを超える組み合わせは「別物」とみなす。
// 絞りすぎると、点の「灬」のような短い画や、多少崩れた正しい字形まで
// 広く不合格にしてしまうため、緩めに戻している。
const MATCH_DISTANCE_THRESHOLD = 38;
// 手書きの「はね」を合格とみなす角度のしきい値。
// KanjiVGのお手本は書道的に鋭く跳ねた理想形(実測84〜130度程度)だが、
// 実際の子供の手書きは正しく跳ねていても遥かに緩やかな角度にしかならない。
// お手本側の「この画は本来はねの画である」という判定(kanjivg.jsのHANE_ANGLE_THRESHOLD)とは
// 別物として、こちらは低めに設定する。
const USER_HANE_ANGLE_THRESHOLD = 10;
// 終端速度が「止まっている」とみなせる、最大速度に対する比率
const STOP_SPEED_RATIO = 0.35;
// 画数の過不足(抜け+余分の合計)は、お手本の画数に対してこの割合までは許容し不合格にしない。
const STROKE_COUNT_LENIENCY_RATIO = 0.3;

function speedProfile(points) {
  const speeds = [0];
  for (let i = 1; i < points.length; i++) {
    const dt = Math.max(1, points[i].t - points[i - 1].t);
    const dist = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    speeds.push(dist / dt);
  }
  return speeds;
}

// ストローク同士を貪欲法で対応づける(距離が小さい組から確定)
function matchStrokes(userStrokesRaw, refStrokes) {
  const userResampled = userStrokesRaw.map((s) => resampleByLength(s, RESAMPLE_N));
  const refResampled = refStrokes.map((s) => resampleByLength(s.points, RESAMPLE_N));

  const candidates = [];
  for (let u = 0; u < userResampled.length; u++) {
    for (let r = 0; r < refResampled.length; r++) {
      const d = meanDistance(userResampled[u], refResampled[r]);
      candidates.push({ u, r, d });
    }
  }
  candidates.sort((a, b) => a.d - b.d);

  const usedUser = new Set();
  const usedRef = new Set();
  const matches = [];
  for (const c of candidates) {
    if (c.d > MATCH_DISTANCE_THRESHOLD) break;
    if (usedUser.has(c.u) || usedRef.has(c.r)) continue;
    usedUser.add(c.u);
    usedRef.add(c.r);
    matches.push({ userIndex: c.u, refIndex: c.r, distance: c.d });
  }

  const missingStrokes = refStrokes.map((_, i) => i).filter((i) => !usedRef.has(i));
  const extraStrokes = userStrokesRaw.map((_, i) => i).filter((i) => !usedUser.has(i));

  matches.sort((a, b) => a.refIndex - b.refIndex);
  return { matches, missingStrokes, extraStrokes };
}

function judgeShape(userPoints, refStroke) {
  const expected = refStroke.shapeType;
  if (userPoints.length < 4) {
    return { refIndex: refStroke.index, expected, passed: true, uncertain: true, message: "判定に十分な点数がありません" };
  }

  const speeds = speedProfile(userPoints);
  const maxSpeed = Math.max(...speeds, 0.0001);
  const tailSpeed = speeds.slice(-Math.max(2, Math.floor(speeds.length * 0.15))).reduce((a, b) => a + b, 0) /
    Math.max(2, Math.floor(speeds.length * 0.15));
  const stopRatio = tailSpeed / maxSpeed;
  const turnAngle = tailTurnAngle(userPoints);

  if (expected === "hane") {
    const passed = turnAngle > USER_HANE_ANGLE_THRESHOLD;
    return {
      refIndex: refStroke.index,
      expected,
      passed,
      severity: "strict",
      message: passed ? "はねができています" : "はねが不十分です。書き終わりで軽く跳ね上げましょう",
    };
  }
  if (expected === "harai") {
    const passed = stopRatio > STOP_SPEED_RATIO;
    return {
      refIndex: refStroke.index,
      expected,
      passed,
      severity: "hint",
      message: passed ? "払いができています" : "書き終わりで止まらず、すっと払えるとなお良いです",
    };
  }
  // tome
  const passed = stopRatio <= STOP_SPEED_RATIO;
  return {
    refIndex: refStroke.index,
    expected,
    passed,
    severity: "hint",
    message: passed ? "しっかり止まっています" : "書き終わりで止められるとなお良いです",
  };
}

/**
 * @param userStrokesRaw 手書きストローク配列。各要素は {x,y,t,pressure} の点列。
 * @param refData kanjivg.js の loadKanjiStrokes() が返すお手本データ
 */
export function judgeKanji(userStrokesRaw, refData) {
  const refStrokes = refData.strokes;
  const strokeCountDiff = userStrokesRaw.length - refStrokes.length;

  const { matches, missingStrokes, extraStrokes } = matchStrokes(userStrokesRaw, refStrokes);

  const shapeResults = matches.map(({ userIndex, refIndex }) =>
    judgeShape(userStrokesRaw[userIndex], refStrokes[refIndex])
  );

  // 「はね」だけは合否に直結させる。それ以外はアドバイス表示のみ。
  const haneFails = shapeResults.filter((r) => r.severity === "strict" && !r.passed && !r.uncertain);
  const hintIssues = shapeResults.filter((r) => r.severity === "hint" && !r.passed && !r.uncertain);

  // 画数の過不足も、お手本の画数に対して一定割合までは大目に見る(抜け+余分の合計で判定)
  const strokeAllowance = Math.max(1, Math.floor(refStrokes.length * STROKE_COUNT_LENIENCY_RATIO));
  const strokeCountOk = missingStrokes.length + extraStrokes.length <= strokeAllowance;

  const overallOk = strokeCountOk && haneFails.length === 0;

  // 画数が同じでも位置・形がずれていると「抜け」と「余分」が同数同時に出てしまい、
  // 一見矛盾したメッセージになる。実際には画が入れ替わっている(形が違う)ということなので、
  // その場合は専用の言い回しにする。
  const mismatchedCount = Math.min(missingStrokes.length, extraStrokes.length);
  const netMissing = missingStrokes.length - mismatchedCount;
  const netExtra = extraStrokes.length - mismatchedCount;

  let summary;
  if (overallOk) {
    summary = "よく書けています！";
  } else if (haneFails.length > 0) {
    summary = "はねを確認しましょう";
  } else if (netMissing > 0 && netExtra === 0) {
    summary = `画が${netMissing}画足りないようです`;
  } else if (netExtra > 0 && netMissing === 0) {
    summary = "余分な画があるようです";
  } else if (mismatchedCount > 0) {
    summary = "形が違う画があるようです";
  } else {
    summary = "もう一度お手本を見て練習してみましょう";
  }

  return {
    refStrokeCount: refStrokes.length,
    userStrokeCount: userStrokesRaw.length,
    strokeCountDiff,
    matches,
    missingStrokes,
    extraStrokes,
    netMissing,
    netExtra,
    mismatchedCount,
    shapeResults,
    haneFails,
    hintIssues,
    overallOk,
    summary,
  };
}

/**
 * 送り仮名など、複数文字を1つの横長マスにまとめて書かせる場合の簡易判定。
 * 1文字ずつの形・とめ/はね/払いまでは判定できないため、書いた総画数が
 * お手本の合計画数に対して大きく外れていないかだけを緩めにチェックする。
 *
 * @param userStrokesRaw 手書きストローク配列
 * @param expectedStrokeCount お手本の合計画数(区間内の各文字の画数の合計)
 */
export function judgeStrokeCountOnly(userStrokesRaw, expectedStrokeCount) {
  const userStrokeCount = userStrokesRaw.length;
  const allowance = Math.max(1, Math.ceil(expectedStrokeCount * STROKE_COUNT_LENIENCY_RATIO));
  const diff = userStrokeCount - expectedStrokeCount;
  const overallOk = Math.abs(diff) <= allowance;

  return {
    refStrokeCount: expectedStrokeCount,
    userStrokeCount,
    strokeCountDiff: diff,
    overallOk,
    summary: overallOk
      ? "よく書けています！"
      : diff < 0
        ? "画数が足りないようです"
        : "画数が多いようです",
  };
}
