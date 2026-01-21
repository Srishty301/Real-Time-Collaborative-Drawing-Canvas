# Architecture Documentation

## Data Flow Diagram: 

### High-Level Flow

```
User Input → Client Processing → WebSocket → Server → Broadcast → Other Clients → Canvas Rendering
```

### Detailed Step-by-Step Flow

1. **User Input Capture** (`client/js/main.js`)
   - User moves mouse/touch on canvas
   - `CanvasEngine` captures pointer events (`down`, `move`, `up`)
   - Events include: `{ type, pt: {x, y}, isDown }`

2. **Client-Side Processing** (`client/js/main.js`)
   - **On `down`**: 
     - Emit `stroke:begin` with tool, color, width
     - Server responds with `{ strokeId }` via acknowledgment
     - Create local "live stroke" for instant feedback (client-side prediction)
   - **On `move`** (while drawing):
     - Queue points in `pointQueue` array
     - Flush queue every ~16ms (60fps) via `setTimeout`
     - Emit `stroke:point` for each queued point
     - Update local `liveCanvas` immediately
   - **On `up`**:
     - Flush remaining points
     - Emit `stroke:end` with `strokeId`
     - Clear local stroke state

3. **Server Processing** (`server/server.js` + `server/drawing-state.js`)
   - **`stroke:begin`**: 
     - Create stroke object in `DrawingState`
     - Assign unique `strokeId` (nanoid)
     - Broadcast `stroke:begin` to other clients in room
   - **`stroke:point`**: 
     - Append point to stroke's point array
     - Broadcast `stroke:point` to other clients (not sender)
   - **`stroke:end`**: 
     - Mark stroke as committed
     - Increment global version counter
     - Broadcast `stroke:commit` to ALL clients (including sender)

4. **Other Clients Receive** (`client/js/main.js`)
   - **`stroke:begin`**: Create new live stroke on `liveCanvas`
   - **`stroke:point`**: Append point to live stroke (updates `liveCanvas`)
   - **`stroke:commit`**: 
     - Move stroke from `liveCanvas` to `baseCanvas`
     - Redraw entire `baseCanvas` from committed stroke history
     - Clear live stroke

5. **Canvas Rendering** (`client/js/canvas.js`)
   - **Dual-layer architecture**:
     - `baseCanvas`: Committed strokes (redrawn on state changes)
     - `liveCanvas`: In-progress strokes (updated in real-time)
   - Both canvases are composited visually (liveCanvas on top)

### Visual Representation

```
┌─────────────┐
│   User A    │
│  (Browser)  │
└──────┬──────┘
       │ mouse events
       ▼
┌─────────────────┐      WebSocket      ┌──────────────┐
│  Client Engine   │◄───────────────────►│   Server    │
│  - Queue points  │   stroke:begin/     │  - Rooms    │
│  - Live canvas   │   point/end        │  - State    │
└─────────────────┘                      └──────┬───────┘
                                                 │ broadcast
                                                 ▼
                                        ┌─────────────┐
                                        │   User B    │
                                        │  (Browser)  │
                                        └─────────────┘
```

## WebSocket Protocol: 

### Protocol Overview

Uses **Socket.io** (WebSocket library) for bidirectional communication. All messages are JSON objects.

### Client → Server Messages

#### `room:join`
Join or create a room.

**Payload**:
```javascript
{
  room: string,    // Room ID (e.g., "lobby", "abc123")
  name: string     // User's display name
}
```

**Response**: Server emits `room:joined` (see below)

---

#### `cursor:update`
Update cursor position (throttled to ~30fps).

**Payload**:
```javascript
{
  x: number,      // Canvas X coordinate
  y: number,       // Canvas Y coordinate
  isDown: boolean, // Is mouse/touch pressed?
  tool: string     // "brush" or "eraser"
}
```

**Broadcast**: Server forwards to other clients as `cursor:update` (see below)

---

#### `stroke:begin`
Start a new stroke.

**Payload**:
```javascript
{
  tool: string,   // "brush" or "eraser"
  color: string,  // Hex color (e.g., "#111827")
  width: number   // Stroke width in pixels
}
```

**Acknowledgment** (callback):
```javascript
{
  strokeId: string  // Unique stroke ID (nanoid)
}
```

**Broadcast**: Server emits `stroke:begin` to other clients

---

#### `stroke:point`
Add a point to an in-progress stroke (streaming).

**Payload**:
```javascript
{
  strokeId: string,  // From stroke:begin acknowledgment
  pt: {
    x: number,       // Point X coordinate
    y: number        // Point Y coordinate
  }
}
```

**Broadcast**: Server forwards to other clients

---

#### `stroke:end`
Commit a stroke (mark as complete).

**Payload**:
```javascript
{
  strokeId: string  // Stroke to commit
}
```

**Broadcast**: Server emits `stroke:commit` to ALL clients (including sender)

---

#### `history:undo`
Undo the latest visible stroke globally.

**Payload**: `()` (no payload)

**Broadcast**: Server emits `history:changed` (see below)

---

#### `history:redo`
Redo the latest undone stroke globally.

**Payload**: `()` (no payload)

**Broadcast**: Server emits `history:changed` (see below)

---

#### `state:request`
Request full state snapshot (for reconnection/recovery).

**Payload**: `()` (no payload)

**Response**: Server emits `state:snapshot` (see below)

---

### Server → Client Messages

#### `room:joined`
Confirmation of room join with initial state.

**Payload**:
```javascript
{
  roomId: string,           // Room ID
  user: {                   // Current user info
    id: string,             // Socket ID
    name: string,           // Display name
    color: string           // Assigned color
  },
  users: Array<{            // All users in room
    id: string,
    name: string,
    color: string
  }>,
  state: {                  // Full canvas state
    version: number,        // Current version
    strokes: Array<Stroke>, // All committed strokes
    undone: Array<string>   // IDs of undone strokes
  }
}
```

---

#### `presence:user_joined`
Another user joined the room.

**Payload**:
```javascript
{
  user: { id, name, color },
  users: Array<{ id, name, color }>  // Updated user list
}
```

---

#### `presence:user_left`
A user left the room.

**Payload**:
```javascript
{
  userId: string,                    // Socket ID of user who left
  users: Array<{ id, name, color }>  // Updated user list
}
```

---

#### `cursor:update`
Another user's cursor moved.

**Payload**:
```javascript
{
  userId: string,    // Socket ID
  x: number,         // Canvas X
  y: number,         // Canvas Y
  isDown: boolean,   // Is drawing?
  tool: string,      // Current tool
  ts: number         // Timestamp
}
```

---

#### `stroke:begin`
Another user started a stroke.

**Payload**:
```javascript
{
  stroke: {
    id: string,           // strokeId
    userId: string,       // Socket ID
    userName: string,     // Display name
    userColor: string,    // User's color
    tool: string,         // "brush" or "eraser"
    color: string,        // Stroke color
    width: number,        // Stroke width
    points: Array<{x,y}>, // Initial points (may be empty)
    createdAt: number     // Timestamp
  }
}
```

---

#### `stroke:point`
Another user added a point to their stroke.

**Payload**:
```javascript
{
  strokeId: string,
  pt: { x: number, y: number }
}
```

---

#### `stroke:commit`
A stroke was committed (finished).

**Payload**:
```javascript
{
  strokeId: string,
  version: number  // New global version after commit
}
```

---

#### `history:changed`
Undo/redo state changed globally.

**Payload**:
```javascript
{
  version: number,           // Current version
  undone: Array<string>      // IDs of undone strokes
}
```

---

#### `state:snapshot`
Full state snapshot (for recovery).

**Payload**:
```javascript
{
  version: number,
  strokes: Array<Stroke>,    // All committed strokes
  undone: Array<string>       // IDs of undone strokes
}
```

---

## Undo/Redo Strategy: 

### Core Design Philosophy

**Undo/redo is stroke-level and global**, not per-user. The server maintains a single authoritative timeline of operations.

### Implementation Details

#### Server-Side (`server/drawing-state.js`)

1. **State Structure**:
   ```javascript
   {
     strokes: Map<strokeId, Stroke>,  // All committed strokes
     undone: Set<strokeId>,           // IDs of undone strokes
     version: number                  // Monotonically increasing version
   }
   ```

2. **Undo Operation** (`undo()`):
   - Find the **latest committed stroke** that is NOT in `undone` set
   - Add that stroke ID to `undone` set
   - Increment `version`
   - Broadcast `history:changed` with new `version` and `undone` array

3. **Redo Operation** (`redo()`):
   - Find the **latest undone stroke** (highest version in `undone` set)
   - Remove that stroke ID from `undone` set
   - Increment `version`
   - Broadcast `history:changed`

#### Client-Side (`client/js/canvas.js`)

1. **Rendering Logic** (`setUndone(undone)`):
   - Client receives `history:changed` with `undone` array
   - **Full redraw** of `baseCanvas`:
     - Clear canvas
     - Iterate through all committed strokes in order
     - Skip strokes whose ID is in `undone` set
     - Draw remaining strokes

2. **Determinism**:
   - All clients receive the same `undone` set
   - All clients render strokes in the same order (commit order)
   - Result: **identical canvas state** across all clients

### Why This Works

- **Single source of truth**: Server maintains authoritative state
- **Deterministic rendering**: Same input (strokes + undone) → same output
- **Conflict-free**: "User A undoes User B's stroke" is handled naturally
- **Simple mental model**: Undo = "hide latest visible stroke", Redo = "show latest hidden stroke"

### Limitations

- **Stroke-level only**: Cannot undo individual points within a stroke
- **Global timeline**: No per-user undo history
- **Full redraw**: Every undo/redo redraws entire canvas (acceptable for typical stroke counts)

---

## Performance Decisions: 

### 1. Dual Canvas Layers (`baseCanvas` + `liveCanvas`)

**Decision**: Separate canvases for committed vs. live strokes.

**Why**:
- **Live strokes** update at high frequency (~60fps) with point streaming
- **Committed strokes** only change on commit/undo/redo (low frequency)
- **Separation prevents**: Redrawing entire canvas on every point update
- **Performance gain**: ~10-100x faster for live drawing (only update small live layer)

**Trade-off**: Slightly more complex rendering logic, but massive performance win.

---

### 2. Point Batching / Queue Flushing

**Decision**: Queue points and flush every ~16ms instead of sending immediately.

**Why**:
- Reduces WebSocket message overhead (fewer individual messages)
- Smooths out network bursts
- Still maintains ~60fps visual update rate
- Reduces server load

**Implementation**: `flushTimer` with `setTimeout(flushPoints, 16)` in `client/js/main.js`

**Trade-off**: Slight latency (~16ms), but negligible for drawing UX.

---

### 3. Client-Side Prediction (Optimistic Updates)

**Decision**: Draw locally immediately, then sync with server.

**Why**:
- **Instant feedback**: User sees their stroke immediately (0ms latency)
- **Server sync**: Confirms and broadcasts to others
- **Best of both worlds**: Low perceived latency + consistency

**Implementation**: Create local stroke on `down` event before server acknowledgment.

---

### 4. Full Redraw on Undo/Redo

**Decision**: Redraw entire `baseCanvas` when undo/redo changes.

**Why**:
- **Simplicity**: No need to track which strokes changed
- **Correctness**: Guarantees correct final state
- **Performance**: Acceptable for typical stroke counts (<1000 strokes)
- **Future-proof**: Easy to optimize later (e.g., incremental redraw) if needed

**Trade-off**: May be slow with 1000+ strokes, but acceptable for typical use.

---

### 5. HiDPI Canvas Scaling

**Decision**: Scale canvas by `devicePixelRatio` for crisp lines on retina displays.

**Why**:
- Modern displays have high pixel density (2x, 3x)
- Without scaling, lines appear blurry
- **Implementation**: Set `canvas.width = logicalWidth * devicePixelRatio`

**Trade-off**: Slightly more complex coordinate math, but essential for quality.

---

### 6. Cursor Update Throttling

**Decision**: Throttle cursor updates to ~30fps (33ms intervals).

**Why**:
- Cursor position is less critical than stroke points
- Reduces WebSocket traffic
- Still smooth enough for UX

**Implementation**: `throttleMs(sendCursor, 33)` in `client/js/main.js`

---

### 7. In-Memory State (No Database)

**Decision**: Store all state in memory (`Map` and `Set`).

**Why**:
- **Simplicity**: No database setup required
- **Performance**: Fast lookups (O(1) for Map/Set)
- **Suitable for**: Demo/prototype, small-scale usage

**Trade-off**: State lost on restart, not suitable for production persistence.

---

## Conflict Resolution: 

### The Problem

When multiple users draw simultaneously:
- Strokes may overlap visually
- Network latency causes out-of-order delivery
- Need consistent final state across all clients

### Our Solution: **Last-Write-Wins with Deterministic Ordering**

#### Key Principles

1. **Server is authoritative**: Server assigns commit order (via `version` counter)
2. **Raster rendering**: Canvas is a pixel buffer; later strokes overwrite earlier ones
3. **Deterministic commit order**: All clients receive commits in the same order

#### How It Works

1. **During Drawing** (before commit):
   - Multiple users can draw simultaneously
   - Each stroke is "live" on their own `liveCanvas`
   - Other users see live strokes in real-time
   - **No conflict** - live strokes are separate visual layers

2. **On Commit** (`stroke:end`):
   - Server receives commit request
   - Server assigns **monotonically increasing version number**
   - Server broadcasts `stroke:commit` with version to ALL clients
   - **Commit order is deterministic**: First `stroke:end` received = lower version

3. **Rendering Order**:
   - Clients render strokes in **commit order** (by version)
   - Later strokes (higher version) are drawn on top
   - **Visual result**: Last committed stroke wins (covers overlapping areas)

4. **Consistency Guarantee**:
   - All clients receive commits in the same order (server broadcasts)
   - All clients render in the same order (by version)
   - **Result**: Identical canvas state across all clients

### Example Scenario

**User A** draws a red circle (strokeId: `abc`, version: 1)
**User B** draws a blue square overlapping the circle (strokeId: `def`, version: 2)

**Final state** (all clients):
- Red circle drawn first (version 1)
- Blue square drawn on top (version 2)
- Blue square **covers** overlapping area of red circle
- **Consistent** across all clients

### Edge Cases Handled

1. **Network reordering**: Server processes `stroke:end` in receive order, not send order
2. **Simultaneous commits**: Server serializes commits (one at a time via version counter)
3. **Undo during drawing**: Undo only affects committed strokes, not live strokes
4. **User disconnects mid-stroke**: Uncommitted strokes are discarded (only committed strokes persist)

### Limitations

- **No true conflict resolution**: We don't try to merge overlapping strokes intelligently
- **Last-write-wins**: Simple but may not be desired for all use cases
- **No stroke locking**: Users can draw over each other's work freely

### Why This Approach

- **Simplicity**: Easy to understand and implement
- **Performance**: No complex conflict resolution logic
- **Consistency**: Guarantees all clients see the same result
- **Suitable for**: Collaborative drawing (where overwriting is expected)

---

## Additional Architecture Notes

### Room Management (`server/rooms.js`)

- **In-memory storage**: `Map<roomId, RoomState>`
- **Room isolation**: Each room has separate `DrawingState` instance
- **User tracking**: `Map<socketId, User>` per room
- **Auto-cleanup**: Rooms persist until server restart (no TTL currently)

### Error Handling

- **Missing room**: Server creates room on first join
- **Invalid strokeId**: Server ignores invalid `stroke:point` / `stroke:end`
- **Disconnect**: Server removes user from room, broadcasts `presence:user_left`
- **Reconnection**: Client can request `state:snapshot` to recover

### Scalability Considerations

- **Current**: Single Node.js process, in-memory state
- **Limitations**: 
  - Cannot scale horizontally (state not shared)
  - Memory usage grows with stroke count
- **Future improvements**:
  - Redis for shared state
  - Horizontal scaling with sticky sessions
  - Stroke pruning (limit history size)
