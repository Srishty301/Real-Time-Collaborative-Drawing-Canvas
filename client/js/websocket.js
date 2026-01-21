export function createSocket() {
  // Use configurable server URL (set in config.js or via window.SOCKET_SERVER_URL)
  const url = window.SOCKET_SERVER_URL || window.location.origin;
  
  // Socket.io client is loaded from CDN or provided by server
  // eslint-disable-next-line no-undef
  const socket = io(url, {
    transports: ["websocket"],
  });
  return socket;
}


