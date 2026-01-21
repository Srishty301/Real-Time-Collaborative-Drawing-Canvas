const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Rooms } = require("./rooms");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // For local dev simplicity; tighten in production.
  cors: { origin: true, credentials: true },
});

const rooms = new Rooms();

app.use(express.static(path.join(__dirname, "..", "client")));

app.get("/health", (req, res) => res.json({ ok: true }));

// Optional: create a new room (bonus convenience)
app.get("/new-room", (req, res) => {
  const roomId = rooms.createRoom();
  res.redirect(`/?room=${roomId}`);
});

const USER_COLORS = [
  "#e11d48",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function pickColor(usersCount) {
  return USER_COLORS[usersCount % USER_COLORS.length];
}

io.on("connection", (socket) => {
  let roomId = null;
  let user = null;

  // Used by the client to estimate RTT (for a tiny latency pill).
  socket.on("ping", (ack) => {
    if (typeof ack === "function") ack();
  });

  socket.on("room:join", ({ room, name }) => {
    roomId = room || "lobby";
    const existingUsers = rooms.getUsers(roomId);
    user = {
      id: socket.id,
      name: (name || "Anonymous").slice(0, 24),
      color: pickColor(existingUsers.length),
    };

    rooms.addUser(roomId, socket.id, user);
    socket.join(roomId);

    const state = rooms.getState(roomId).snapshot();

    socket.emit("room:joined", {
      roomId,
      user,
      users: rooms.getUsers(roomId),
      state,
    });

    socket.to(roomId).emit("presence:user_joined", {
      user,
      users: rooms.getUsers(roomId),
    });
  });

  socket.on("cursor:update", (payload) => {
    if (!roomId || !user) return;
    // payload: {x,y,isDown,tool}
    socket.to(roomId).emit("cursor:update", {
      userId: user.id,
      x: payload.x,
      y: payload.y,
      isDown: !!payload.isDown,
      tool: payload.tool || "brush",
      ts: Date.now(),
    });
  });

  socket.on("stroke:begin", (payload, ack) => {
    if (!roomId || !user) return;
    const state = rooms.getState(roomId);
    const stroke = state.beginStroke({
      userId: user.id,
      userName: user.name,
      userColor: user.color,
      tool: payload.tool,
      color: payload.color,
      width: payload.width,
    });

    // Broadcast begin so others can create a live stroke.
    socket.to(roomId).emit("stroke:begin", { stroke });
    if (typeof ack === "function") ack({ strokeId: stroke.id });
  });

  socket.on("stroke:point", (payload) => {
    if (!roomId || !user) return;
    const state = rooms.getState(roomId);
    const stroke = state.appendPoint(payload.strokeId, payload.pt);
    if (!stroke) return;
    socket.to(roomId).emit("stroke:point", {
      strokeId: payload.strokeId,
      pt: payload.pt,
    });
  });

  socket.on("stroke:end", (payload) => {
    if (!roomId || !user) return;
    const state = rooms.getState(roomId);
    const stroke = state.commitStroke(payload.strokeId);
    if (!stroke) return;
    io.to(roomId).emit("stroke:commit", {
      strokeId: payload.strokeId,
      version: state.version,
    });
  });

  socket.on("history:undo", () => {
    if (!roomId || !user) return;
    const state = rooms.getState(roomId);
    const res = state.undo();
    if (!res) return;
    io.to(roomId).emit("history:changed", {
      version: state.version,
      undone: Array.from(state.undone.values()),
    });
  });

  socket.on("history:redo", () => {
    if (!roomId || !user) return;
    const state = rooms.getState(roomId);
    const res = state.redo();
    if (!res) return;
    io.to(roomId).emit("history:changed", {
      version: state.version,
      undone: Array.from(state.undone.values()),
    });
  });

  socket.on("state:request", () => {
    if (!roomId || !user) return;
    const state = rooms.getState(roomId).snapshot();
    socket.emit("state:snapshot", state);
  });

  socket.on("disconnect", () => {
    if (!roomId || !user) return;
    rooms.removeUser(roomId, socket.id);
    socket.to(roomId).emit("presence:user_left", {
      userId: socket.id,
      users: rooms.getUsers(roomId),
    });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});


