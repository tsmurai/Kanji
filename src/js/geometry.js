// ストローク(点列)の形状解析に使う共通ユーティリティ。

export function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

// 弧長に沿って等間隔に n 点へリサンプリングする(x,yのみ引き継ぐ)。
// endFraction(0-1)を指定すると、末尾のその割合より先は無視してリサンプリングする
// (はねの跳ね方など、末尾の形状差にマッチング距離を左右されたくない場合に使う)。
export function resampleByLength(points, n, endFraction = 1) {
  if (points.length < 2) return Array(n).fill(points[0] || { x: 0, y: 0 });
  const total = pathLength(points) * Math.max(0.05, Math.min(1, endFraction));
  if (total === 0) return Array(n).fill(points[0]);

  const out = [];
  let segIndex = 0;
  let segStartLen = 0;
  let segLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);

  for (let i = 0; i < n; i++) {
    const targetLen = (total * i) / (n - 1);
    while (segIndex < points.length - 2 && segStartLen + segLen < targetLen) {
      segStartLen += segLen;
      segIndex++;
      segLen = Math.hypot(
        points[segIndex + 1].x - points[segIndex].x,
        points[segIndex + 1].y - points[segIndex].y
      );
    }
    const t = segLen > 0 ? (targetLen - segStartLen) / segLen : 0;
    const a = points[segIndex];
    const b = points[segIndex + 1] || a;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

export function meanDistance(a, b) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  }
  return sum / n;
}

export function boundingBox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// 点列上で、始点からの弧長が target 以上になる最初の点(の手前で線形補間した点)を返す
function pointAtLength(points, target) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (acc + segLen >= target) {
      const t = segLen > 0 ? (target - acc) / segLen : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    acc += segLen;
  }
  return points[points.length - 1];
}

function angleAt(points, total, windowLen) {
  const a = pointAtLength(points, total - windowLen);
  const b = pointAtLength(points, total - windowLen * 0.5);
  const c = points[points.length - 1];

  const v1 = { x: b.x - a.x, y: b.y - a.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  // 区間が短すぎると、わずかな手ブレでも角度が不安定に大きく出てしまうため、
  // ある程度の長さがある区間でしか角度を測らない(複数窓のうちどれかがノイズで
  // 誤検出するのを防ぐ)。
  if (len1 < 4 || len2 < 4) return 0;
  const cos = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// 末尾付近での進行方向の変化角度(度)。大きいほど鋭く向きが変わっている。
// 手書きは書く速さによって点の密度が均一でない(ゆっくり書いた導入部に点が集中し、
// 素早く跳ね上げた終端は点がまばらになる)ため、点のインデックスではなく弧長を基準にする。
//
// はねの一跳ねの大きさはストロークによってまちまち(冠のように短い画の小さな跳ねもあれば、
// 貸の4画目のように長く大きくうねった末に跳ねる画もある)。窓を1つの固定サイズに決めると、
// 小さい跳ね用に狭くすれば大きい跳ねが薄まり、大きい跳ね用に広くすれば小さい跳ねが
// 導入部に埋もれる、という板挟みになる。そのため複数の窓サイズで測定し、
// 最も鋭い(=最大の)角度を採用する。
const TAIL_WINDOW_CANDIDATES = [5, 8, 13, 20, 32, 50];

export function tailTurnAngle(points) {
  const n = points.length;
  if (n < 3) return 0;
  const total = pathLength(points);
  if (total < 3) return 0;

  let best = 0;
  for (const w of TAIL_WINDOW_CANDIDATES) {
    const windowLen = Math.min(total * 0.6, w);
    const angle = angleAt(points, total, windowLen);
    if (angle > best) best = angle;
  }
  return best;
}
