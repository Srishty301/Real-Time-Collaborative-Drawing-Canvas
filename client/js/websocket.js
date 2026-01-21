export function createSocket() {
  // Socket.io client is provided by /socket.io/socket.io.js
  // eslint-disable-next-line no-undef
  const socket = io({
    transports: ["websocket"],
  });
  return socket;
}


