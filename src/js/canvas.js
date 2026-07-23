// 手書き入力キャンバス。
// 内部的にはすべての座標を KanjiVG のお手本と同じ 0-109 の論理空間に正規化して保持する。
import { KANJIVG_VIEWBOX } from "./kanjivg.js";

export class HandwritingCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    // desynchronized はWebKitで描画順が乱れることがあるため使わない
    this.ctx = canvasEl.getContext("2d", { alpha: false });
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";
    this.strokes = []; // 確定済みストローク
    this.activeByPointer = new Map(); // pointerId -> 入力中のストローク(pointerType付き)
    this.answerChar = null; // 採点後にのみ表示する正解の文字
    this._pendingRedraw = false;
    this._resize();
    this._bindEvents();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width || this.canvas.clientWidth || 300);
    // CSSで高さを指定していない(正方形の漢字マス)場合は幅と同じ高さにする
    const height = Math.round(rect.height || width);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pixelWidth = width;
    this.pixelHeight = height;
    // 縦方向を基準にKanjiVGの0-109空間へ対応づける(横長キャンバスでは論理幅が109を超える)
    this.scale = height / KANJIVG_VIEWBOX;
    this._redraw();
  }

  _toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return { x: px / this.scale, y: py / this.scale };
  }

  // 描画は1フレームに1回にまとめる。pointermoveは書くスピードによっては
  // 1秒に何十回も発火するため、毎回同期的に全ストロークを再描画すると
  // 端末によっては処理が追いつかず、書いている最中に引っかかる原因になる。
  _scheduleRedraw() {
    if (this._pendingRedraw) return;
    this._pendingRedraw = true;
    requestAnimationFrame(() => {
      this._pendingRedraw = false;
      this._redraw();
    });
  }

  _bindEvents() {
    const canvas = this.canvas;
    canvas.style.touchAction = "none";
    // 素早く連続タップした際に、iOS Safariのテキスト選択(範囲選択)ジェスチャーが
    // 誤発動することがあるため、選択・右クリックメニューの開始自体を止める。
    canvas.addEventListener("selectstart", (e) => e.preventDefault());
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("dragstart", (e) => e.preventDefault());

    // iOS SafariはApple Pencilの Pointer Events 処理が不安定なことがある
    // (早く連続で書くと2画目以降が無反応になる)ため、指・ペンは枯れている
    // Touch Events で扱う。マウス(PC確認用)だけ Pointer Events で拾う。
    this._bindTouchEvents(canvas);
    this._bindMousePointerEvents(canvas);
  }

  _startStroke(id, x, y, pressure) {
    this._pruneStalePointers();
    const now = performance.now();
    this.activeByPointer.set(id, {
      lastT: now,
      points: [{ x, y, t: now, pressure: pressure || 0.5 }],
    });
    this._scheduleRedraw();
  }

  _extendStroke(id, points) {
    const stroke = this.activeByPointer.get(id);
    if (!stroke) return;
    const now = performance.now();
    for (const p of points) stroke.points.push(p);
    stroke.lastT = now;
    this._scheduleRedraw();
  }

  _endStroke(id) {
    const stroke = this.activeByPointer.get(id);
    if (!stroke) return;
    this.activeByPointer.delete(id);
    if (stroke.points.length >= 2) this.strokes.push(stroke);
    this._redraw();
  }

  _bindTouchEvents(canvas) {
    const toPoint = (t) => {
      const { x, y } = this._toLogical(t.clientX, t.clientY);
      return { x, y, t: performance.now(), pressure: t.force || 0.5 };
    };

    canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const p = toPoint(t);
          this._startStroke(t.identifier, p.x, p.y, p.pressure);
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          this._extendStroke(t.identifier, [toPoint(t)]);
        }
      },
      { passive: false }
    );

    const end = (e) => {
      for (const t of e.changedTouches) this._endStroke(t.identifier);
    };
    canvas.addEventListener("touchend", end, { passive: false });
    canvas.addEventListener("touchcancel", end, { passive: false });
  }

  // マウス(トラックパッド含む)だけを拾う。実機のタッチ/ペンはTouch Eventsで
  // 処理済みのため、ここで同じ入力を二重に扱わないようpointerTypeで絞る。
  _bindMousePointerEvents(canvas) {
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // 捕捉に失敗しても描画自体は継続する
      }
      const { x, y } = this._toLogical(e.clientX, e.clientY);
      this._startStroke(e.pointerId, x, y, e.pressure);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      if (!this.activeByPointer.has(e.pointerId)) return;
      e.preventDefault();
      const { x, y } = this._toLogical(e.clientX, e.clientY);
      this._extendStroke(e.pointerId, [{ x, y, t: performance.now(), pressure: e.pressure || 0.5 }]);
    });

    const end = (e) => {
      if (e.pointerType !== "mouse") return;
      this._endStroke(e.pointerId);
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  // pointerup/cancelを取りこぼした場合の保険。一定時間動きのないポインターは
  // 書き終わったものとみなして掃除し、以後の入力がブロックされ続けないようにする。
  _pruneStalePointers() {
    const now = performance.now();
    for (const [id, stroke] of this.activeByPointer) {
      if (now - stroke.lastT > 2000) {
        if (stroke.points.length >= 2) this.strokes.push(stroke);
        this.activeByPointer.delete(id);
      }
    }
  }

  // 採点後、書いたストロークの隣の余白に正解の文字を表示する(書いている間は非表示)
  showAnswer(char) {
    this.answerChar = char;
    this._scheduleRedraw();
  }

  clear() {
    this.strokes = [];
    this.activeByPointer.clear();
    this.answerChar = null;
    this._scheduleRedraw();
  }

  undo() {
    this.strokes.pop();
    this._scheduleRedraw();
  }

  isEmpty() {
    return this.strokes.length === 0;
  }

  // 論理座標(0-109空間)のストローク点列を返す
  getStrokes() {
    return this.strokes.map((s) => s.points);
  }

  _toPixel(pt) {
    return { x: pt.x * this.scale, y: pt.y * this.scale };
  }

  _drawPolyline(points, style) {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    Object.assign(ctx, style);
    const p0 = this._toPixel(points[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = this._toPixel(points[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  _redraw() {
    const ctx = this.ctx;
    // alpha:false のコンテキストは clearRect が透明ではなく黒になるため、白で塗りつぶす
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.pixelWidth, this.pixelHeight);

    for (const s of this.strokes) {
      this._drawPolyline(s.points, {
        strokeStyle: "#1a1a2e",
        lineWidth: 4,
      });
    }
    for (const s of this.activeByPointer.values()) {
      this._drawPolyline(s.points, {
        strokeStyle: "#1a1a2e",
        lineWidth: 4,
      });
    }

    if (this.answerChar) {
      const h = this.pixelHeight * 0.34;
      const margin = this.pixelHeight * 0.05;
      const fontSize = h * 0.72;
      ctx.font = `${fontSize}px serif`;
      const textWidth = ctx.measureText(this.answerChar).width;
      const w = Math.min(this.pixelWidth - margin * 2, Math.max(h, textWidth + h * 0.3));
      const boxX = this.pixelWidth - w - margin;
      const boxY = this.pixelHeight - h - margin;

      ctx.fillStyle = "#f3ede0";
      ctx.fillRect(boxX, boxY, w, h);
      ctx.strokeStyle = "#c8bfa8";
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, w, h);
      ctx.fillStyle = "#7a6a45";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.answerChar, boxX + w / 2, boxY + h / 2 + h * 0.05);
    }
  }
}
