# Architecture

## Data flow diagram (text)

1. **Pointer events** (client) → sampled at ~60fps → queued points.
2. Client sends:
   - `stroke:begin` (one-time)
   - `stroke:point` (streaming)
   - `stroke:end` (commit)
3. Server updates authoritative state (`DrawingState`) and broadcasts:
   - `stroke:begin` / `stroke:point` (to other clients)
   - `stroke:commit` (to everyone, increments version)
4. Clients render:
   - **Live layer** (`liveCanvas`) for in-progress strokes
   - **Committed layer** (`baseCanvas`) for final stroke history
5. **Global undo/redo** modifies the server’s `undone` set and broadcasts `history:changed`.
6. Clients fully redraw the committed layer from stroke history when undo/redo changes.

## WebSocket protocol (Socket.io events)

### Client → Server

- `room:join` `{ room, name }`
- `cursor:update` `{ x, y, isDown, tool }`
- `stroke:begin` `{ tool, color, width }` (ack returns `{ strokeId }`)
- `stroke:point` `{ strokeId, pt: { x, y } }`
- `stroke:end` `{ strokeId }`
- `history:undo` `()`
- `history:redo` `()`
- `state:request` `()`

### Server → Client

- `room:joined` `{ roomId, user, users, state }`
- `presence:user_joined` `{ user, users }`
- `presence:user_left` `{ userId, users }`
- `cursor:update` `{ userId, x, y, isDown, tool, ts }`
- `stroke:begin` `{ stroke }`
- `stroke:point` `{ strokeId, pt }`
- `stroke:commit` `{ strokeId, version }`
- `history:changed` `{ version, undone }`
- `state:snapshot` `{ version, strokes, undone }`

## Undo/redo strategy (global)

### Key idea

Undo/redo is modeled as **operations on the global stroke list**, not per-user history:

- A **stroke commit** is an operation that adds a stroke id to the global timeline.
- A **global undo** always targets the **latest currently visible** committed stroke.
- Undo/redo are implemented by toggling membership in a server-authoritative **`undone` set**.

### Why this works

- Everyone receives the same ordered stream of commit + history operations.
- Rendering is deterministic by replaying the same stroke list and filtering by `undone`.
- “User A undoes User B” is intentionally allowed and consistent.

## Performance decisions

- **Dual canvas layers**:
  - `liveCanvas` renders high-frequency point segments without touching committed history.
  - `baseCanvas` redraws only on state changes (commit/undo/redo/snapshot).
- **Event batching**:
  - Client queues points and flushes every ~16ms to reduce overhead.
- **HiDPI handling**:
  - Canvases scale with `devicePixelRatio` to keep lines crisp.

## Conflict resolution

When strokes overlap:

- The canvas is a raster output, so the policy is **last stroke in the global commit order wins visually**.
- Because commit order is broadcast and authoritative, all clients end up with the same raster.


