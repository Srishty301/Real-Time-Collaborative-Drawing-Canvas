function setHiDPICanvas(canvas, cssWidth, cssHeight) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, dpr };
}

function strokeToStyle(ctx, stroke) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.width;
  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }
}

function drawStrokeSegment(ctx, stroke, p0, p1) {
  strokeToStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}

function drawStrokeFull(ctx, stroke) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;
  strokeToStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

export class CanvasEngine {
  constructor({ baseCanvas, liveCanvas, wrapEl }) {
    this.baseCanvas = baseCanvas;
    this.liveCanvas = liveCanvas;
    this.wrapEl = wrapEl;

    this.base = { ctx: null };
    this.live = { ctx: null };

    this.strokes = new Map(); // strokeId -> stroke
    this.undone = new Set(); // strokeId
    this.liveStrokes = new Map(); // strokeId -> stroke (remote in-progress)

    this.onPointerEvent = null; // set by main.js
    this._isPointerDown = false;

    this.resizeObserver = new ResizeObserver(() => this.resizeToWrap());
    this.resizeObserver.observe(this.wrapEl);
    this.resizeToWrap();

    this._bindInput();
  }

  destroy() {
    this.resizeObserver.disconnect();
  }

  resizeToWrap() {
    const rect = this.wrapEl.getBoundingClientRect();
    const cssWidth = Math.floor(rect.width);
    const cssHeight = Math.floor(rect.height);
    this.base = setHiDPICanvas(this.baseCanvas, cssWidth, cssHeight);
    this.live = setHiDPICanvas(this.liveCanvas, cssWidth, cssHeight);
    this.redrawAll();
  }

  setSnapshot({ strokes, undone }) {
    this.strokes.clear();
    for (const s of strokes) this.strokes.set(s.id, s);
    this.undone = new Set(undone);
    this.liveStrokes.clear();
    this.redrawAll();
  }

  setUndone(undone) {
    this.undone = new Set(undone);
    this.redrawAll();
  }

  beginRemoteStroke(stroke) {
    this.liveStrokes.set(stroke.id, stroke);
  }

  appendRemotePoint(strokeId, pt) {
    const s = this.liveStrokes.get(strokeId) || this.strokes.get(strokeId);
    if (!s) return;
    const pts = s.points;
    const prev = pts.length > 0 ? pts[pts.length - 1] : null;
    pts.push(pt);
    if (prev) drawStrokeSegment(this.live.ctx, s, prev, pt);
    else {
      // single point dot
      strokeToStyle(this.live.ctx, s);
      this.live.ctx.beginPath();
      this.live.ctx.arc(pt.x, pt.y, s.width / 2, 0, Math.PI * 2);
      this.live.ctx.fillStyle = s.tool === "eraser" ? "rgba(0,0,0,1)" : s.color;
      this.live.ctx.fill();
    }
  }

  commitStroke(strokeId) {
    // Move from live -> committed store if needed.
    const s = this.liveStrokes.get(strokeId);
    if (s) {
      this.liveStrokes.delete(strokeId);
      this.strokes.set(strokeId, s);
    }
    this.redrawAll();
  }

  redrawAll() {
    if (!this.base.ctx || !this.live.ctx) return;
    this.base.ctx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    this.live.ctx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);

    // Draw committed strokes (excluding undone).
    for (const stroke of this.strokes.values()) {
      if (this.undone.has(stroke.id)) continue;
      drawStrokeFull(this.base.ctx, stroke);
    }

    // Draw live strokes on top.
    for (const stroke of this.liveStrokes.values()) {
      drawStrokeFull(this.live.ctx, stroke);
    }
  }

  _bindInput() {
    const getPoint = (ev) => {
      const rect = this.wrapEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      return { x, y };
    };

    const onPointerDown = (ev) => {
      ev.preventDefault();
      this._isPointerDown = true;
      this.wrapEl.setPointerCapture?.(ev.pointerId);
      const pt = getPoint(ev);
      this.onPointerEvent?.({ type: "down", pt });
    };
    const onPointerMove = (ev) => {
      const pt = getPoint(ev);
      this.onPointerEvent?.({ type: "move", pt, isDown: this._isPointerDown });
    };
    const onPointerUp = (ev) => {
      const pt = getPoint(ev);
      this._isPointerDown = false;
      this.onPointerEvent?.({ type: "up", pt });
    };

    // Pointer events cover mouse + touch + pen.
    this.wrapEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }
}


