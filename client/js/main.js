import { createSocket } from "./websocket.js";
import { CanvasEngine } from "./canvas.js";

function qs(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function parseRoom() {
  const url = new URL(window.location.href);
  return url.searchParams.get("room") || "lobby";
}

function ensureName() {
  const key = "cc_name";
  let name = localStorage.getItem(key);
  if (!name) {
    name = prompt("Your name?", "Anonymous") || "Anonymous";
    name = name.trim() || "Anonymous";
    localStorage.setItem(key, name);
  }
  return name;
}

function throttleMs(fn, waitMs) {
  let last = 0;
  let timeout = null;
  let trailingArgs = null;
  return (...args) => {
    const now = performance.now();
    const remaining = waitMs - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
      return;
    }
    trailingArgs = args;
    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        last = performance.now();
        fn(...trailingArgs);
        trailingArgs = null;
      }, remaining);
    }
  };
}

function renderUsers(users, meId) {
  const ul = qs("usersList");
  ul.innerHTML = "";
  for (const u of users) {
    const li = document.createElement("li");
    li.className = "userRow";
    const av = document.createElement("div");
    av.className = "avatar";
    av.style.background = `${u.color}22`;
    av.style.borderColor = `${u.color}55`;
    av.textContent = (u.name || "?").slice(0, 1).toUpperCase();

    const meta = document.createElement("div");
    meta.className = "userMeta";
    const name = document.createElement("div");
    name.className = "userName";
    name.textContent = u.id === meId ? `${u.name} (you)` : u.name;
    const sub = document.createElement("div");
    sub.className = "userSub";
    sub.textContent = u.color;
    meta.appendChild(name);
    meta.appendChild(sub);
    li.appendChild(av);
    li.appendChild(meta);
    ul.appendChild(li);
  }
}

function upsertCursor(container, user) {
  let el = container.querySelector(`[data-user-id="${user.id}"]`);
  if (!el) {
    el = document.createElement("div");
    el.className = "cursor";
    el.dataset.userId = user.id;
    const dot = document.createElement("div");
    dot.className = "cursorDot";
    dot.style.background = user.color;
    const tag = document.createElement("div");
    tag.className = "cursorTag";
    tag.textContent = user.name;
    el.appendChild(dot);
    el.appendChild(tag);
    container.appendChild(el);
  }
  return el;
}

function removeCursor(container, userId) {
  const el = container.querySelector(`[data-user-id="${userId}"]`);
  if (el) el.remove();
}

const statusText = qs("statusText");
const latencyPill = qs("latencyPill");
const versionPill = qs("versionPill");

const toolSelect = qs("toolSelect");
const colorInput = qs("colorInput");
const widthInput = qs("widthInput");
const widthLabel = qs("widthLabel");
widthInput.addEventListener("input", () => {
  widthLabel.textContent = String(widthInput.value);
});

qs("newRoomBtn").addEventListener("click", () => {
  window.location.href = "/new-room";
});

const socket = createSocket();
const roomId = parseRoom();
const name = ensureName();
qs("roomLabel").textContent = `Room: ${roomId}`;

const engine = new CanvasEngine({
  baseCanvas: qs("baseCanvas"),
  liveCanvas: qs("liveCanvas"),
  wrapEl: qs("canvasWrap"),
});

let me = null;
let users = [];
let currentStrokeId = null;
let pointQueue = [];
let flushTimer = null;

function flushPoints() {
  flushTimer = null;
  if (!currentStrokeId) {
    pointQueue = [];
    return;
  }
  // Send queued points (individual messages) in a tight loop.
  // This keeps server protocol simple while still batching by time.
  const pts = pointQueue;
  pointQueue = [];
  for (const pt of pts) socket.emit("stroke:point", { strokeId: currentStrokeId, pt });
}

function enqueuePoint(pt) {
  pointQueue.push(pt);
  if (!flushTimer) flushTimer = setTimeout(flushPoints, 16); // ~60fps
}

const sendCursor = throttleMs((payload) => socket.emit("cursor:update", payload), 33);

engine.onPointerEvent = async (ev) => {
  if (!me) return;

  const tool = toolSelect.value;
  const width = Number(widthInput.value);
  const color = colorInput.value;

  if (ev.type === "down") {
    const beginPayload = { tool, width, color };
    statusText.textContent = "Drawing…";
    socket.emit("stroke:begin", beginPayload, (ack) => {
      currentStrokeId = ack?.strokeId || null;
      if (!currentStrokeId) return;
      // Create local live stroke so we can see instantly (client-side prediction).
      const stroke = {
        id: currentStrokeId,
        userId: me.id,
        userName: me.name,
        userColor: me.color,
        tool,
        color,
        width,
        points: [ev.pt],
        createdAt: Date.now(),
      };
      engine.beginRemoteStroke(stroke);
      engine.appendRemotePoint(currentStrokeId, ev.pt);
      enqueuePoint(ev.pt);
    });
    sendCursor({ ...ev.pt, isDown: true, tool });
    return;
  }

  if (ev.type === "move") {
    sendCursor({ ...ev.pt, isDown: !!ev.isDown, tool });
    if (!ev.isDown || !currentStrokeId) return;
    engine.appendRemotePoint(currentStrokeId, ev.pt);
    enqueuePoint(ev.pt);
    return;
  }

  if (ev.type === "up") {
    sendCursor({ ...ev.pt, isDown: false, tool });
    if (!currentStrokeId) return;
    enqueuePoint(ev.pt);
    flushPoints();
    socket.emit("stroke:end", { strokeId: currentStrokeId });
    currentStrokeId = null;
    statusText.textContent = "Synced";
  }
};

qs("undoBtn").addEventListener("click", () => socket.emit("history:undo"));
qs("redoBtn").addEventListener("click", () => socket.emit("history:redo"));

// Socket events
socket.on("connect", () => {
  statusText.textContent = "Connected. Joining room…";
  socket.emit("room:join", { room: roomId, name });
});

socket.on("disconnect", () => {
  statusText.textContent = "Disconnected. Reconnecting…";
});

socket.on("room:joined", ({ roomId: joinedRoom, user, users: us, state }) => {
  me = user;
  users = us;
  qs("meAvatar").textContent = (me.name || "?").slice(0, 1).toUpperCase();
  qs("meAvatar").style.background = `${me.color}22`;
  qs("meAvatar").style.borderColor = `${me.color}55`;
  qs("meName").textContent = me.name;
  qs("meId").textContent = me.id;
  qs("roomLabel").textContent = `Room: ${joinedRoom}`;

  renderUsers(users, me.id);
  engine.setSnapshot(state);
  versionPill.textContent = `v${state.version}`;
  statusText.textContent = "Synced";
});

socket.on("presence:user_joined", ({ users: us }) => {
  users = us;
  renderUsers(users, me?.id);
});

socket.on("presence:user_left", ({ userId, users: us }) => {
  users = us;
  renderUsers(users, me?.id);
  removeCursor(qs("cursors"), userId);
});

socket.on("cursor:update", (msg) => {
  if (!me) return;
  const u = users.find((x) => x.id === msg.userId);
  if (!u) return;
  const c = qs("cursors");
  const el = upsertCursor(c, u);
  el.style.left = `${msg.x}px`;
  el.style.top = `${msg.y}px`;
});

socket.on("stroke:begin", ({ stroke }) => {
  engine.beginRemoteStroke(stroke);
});

socket.on("stroke:point", ({ strokeId, pt }) => {
  engine.appendRemotePoint(strokeId, pt);
});

socket.on("stroke:commit", ({ strokeId, version }) => {
  engine.commitStroke(strokeId);
  versionPill.textContent = `v${version}`;
});

socket.on("history:changed", ({ version, undone }) => {
  engine.setUndone(undone);
  versionPill.textContent = `v${version}`;
});

// Basic latency display (socket.io ping)
setInterval(() => {
  if (!socket.connected) return;
  const start = performance.now();
  socket.timeout(1000).emit("ping", () => {
    const ms = Math.round(performance.now() - start);
    latencyPill.textContent = `${ms} ms`;
  });
}, 1500);


