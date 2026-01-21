const { nanoid } = require("nanoid");

/**
 * Global undo/redo model:
 * - We store "strokes" (draw operations) in a map by id.
 * - Undo/redo are "control ops" that toggle visibility of an existing stroke id.
 * - The authoritative visible set is computed by applying control ops in order.
 *
 * This makes global undo/redo deterministic across users:
 * - Undo always targets the latest visible stroke (no matter who drew it).
 * - Redo re-applies the most recently undone stroke (stack-like).
 *
 * Conflict resolution:
 * - When multiple users draw over same pixels, last-applied stroke wins visually.
 * - Because everyone replays the same ordered op-log, the final raster is consistent.
 */
class DrawingState {
  constructor() {
    this.version = 0;
    this.ops = []; // append-only list: {type, ...}
    this.strokes = new Map(); // strokeId -> stroke (tool/color/width/points)
    this.undone = new Set(); // strokeIds currently undone (hidden)
    this.undoStack = []; // strokeIds in undo order (top = last undone)
    this.redoStack = []; // strokeIds available to redo (top = last redoable)
  }

  snapshot() {
    // We send only strokes + undone set; clients can deterministically render.
    return {
      version: this.version,
      strokes: Array.from(this.strokes.values()),
      undone: Array.from(this.undone.values()),
    };
  }

  beginStroke({ userId, userName, userColor, tool, color, width }) {
    const strokeId = nanoid(12);
    const stroke = {
      id: strokeId,
      userId,
      userName,
      userColor,
      tool,
      color,
      width,
      points: [],
      createdAt: Date.now(),
    };
    this.strokes.set(strokeId, stroke);
    // New drawing invalidates redo history (global).
    this.redoStack = [];
    return stroke;
  }

  appendPoint(strokeId, pt) {
    const stroke = this.strokes.get(strokeId);
    if (!stroke) return null;
    stroke.points.push(pt);
    return stroke;
  }

  commitStroke(strokeId) {
    const stroke = this.strokes.get(strokeId);
    if (!stroke) return null;
    // If it was previously undone (shouldn't happen for new strokes), re-show it.
    if (this.undone.has(strokeId)) this.undone.delete(strokeId);
    this.ops.push({ type: "stroke_commit", strokeId });
    this.version += 1;
    return stroke;
  }

  getVisibleStrokesInOrder() {
    // Deterministic order: commit-time order (ops order), filter undone.
    const out = [];
    for (const op of this.ops) {
      if (op.type !== "stroke_commit") continue;
      if (this.undone.has(op.strokeId)) continue;
      const stroke = this.strokes.get(op.strokeId);
      if (stroke) out.push(stroke);
    }
    return out;
  }

  undo() {
    // Find latest visible committed stroke.
    for (let i = this.ops.length - 1; i >= 0; i--) {
      const op = this.ops[i];
      if (op.type !== "stroke_commit") continue;
      const strokeId = op.strokeId;
      if (this.undone.has(strokeId)) continue;
      this.undone.add(strokeId);
      this.undoStack.push(strokeId);
      this.redoStack.push(strokeId);
      this.ops.push({ type: "undo", strokeId });
      this.version += 1;
      return { strokeId };
    }
    return null;
  }

  redo() {
    // Redo the most recently undone stroke (stack behavior).
    while (this.redoStack.length > 0) {
      const strokeId = this.redoStack.pop();
      if (!this.undone.has(strokeId)) continue; // already visible
      this.undone.delete(strokeId);
      this.ops.push({ type: "redo", strokeId });
      this.version += 1;
      return { strokeId };
    }
    return null;
  }
}

module.exports = { DrawingState };


