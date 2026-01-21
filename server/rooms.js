const { nanoid } = require("nanoid");
const { DrawingState } = require("./drawing-state");

/**
 * Simple in-memory room manager.
 * - Not persisted; restarting the server clears rooms.
 * - Each room has a DrawingState + user list.
 */
class Rooms {
  constructor() {
    this.rooms = new Map(); // roomId -> { state: DrawingState, users: Map(socketId -> user) }
  }

  ensureRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        state: new DrawingState(),
        users: new Map(),
      });
    }
    return this.rooms.get(roomId);
  }

  createRoom() {
    const roomId = nanoid(8);
    this.ensureRoom(roomId);
    return roomId;
  }

  addUser(roomId, socketId, user) {
    const room = this.ensureRoom(roomId);
    room.users.set(socketId, user);
  }

  removeUser(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return { roomDeleted: false };
    room.users.delete(socketId);
    if (room.users.size === 0) {
      this.rooms.delete(roomId);
      return { roomDeleted: true };
    }
    return { roomDeleted: false };
  }

  getUsers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values());
  }

  getState(roomId) {
    const room = this.ensureRoom(roomId);
    return room.state;
  }
}

module.exports = { Rooms };


