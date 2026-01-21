# Real-Time Collaborative Drawing Canvas

Multi-user drawing application where multiple people can draw simultaneously on the same canvas with real-time synchronization.

## Features

- **Drawing Tools**: Brush, eraser, different colors, stroke width adjustment
- **Real-time Sync**: See other users' drawings as they draw (not after they finish)
- **User Indicators**: Show where other users are currently drawing (cursor positions)
- **Conflict Resolution**: Handle when multiple users draw in overlapping areas
- **Undo/Redo**: Works globally across all users
- **User Management**: Show who's online, assign colors to users

## 📁 Project Structure

### **Required Files**
```
collaborative-canvas/
├── client/
│   ├── index.html           # Main HTML file
│   ├── style.css            # Stylesheet
│   ├── config.js            # Socket.io server URL configuration
│   └── js/
│       ├── canvas.js        # Canvas drawing logic
│       ├── websocket.js    # WebSocket client (Socket.io)
│       └── main.js         # App initialization
├── server/
│   ├── server.js           # Express + WebSocket server
│   ├── rooms.js            # Room management
│   └── drawing-state.js    # Canvas state management
├── package.json            # Dependencies and scripts
├── README.md               # This file
└── ARCHITECTURE.md         # Technical architecture documentation
```

### **Additional Files** (for deployment)
```
├── .gitignore              # Git ignore rules
├── Procfile               # Heroku deployment config
├── render.yaml            # Render deployment config
└── vercel.json            # Vercel deployment config
```

## Setup Instructions

### Prerequisites

- Node.js (v20 or higher)
- npm

### Installation & Running

```bash
npm install
npm start
```

The server will start on `http://localhost:3000`. Open this URL in your browser.

**Note**: The setup should work with `npm install && npm start` as required.

## How to Test with Multiple Users

### Local Testing

1. **Start the server** (if not already running):
   ```bash
   npm start
   ```

2. **Open multiple browser windows/tabs**:
   - Open `http://localhost:3000` in one tab
   - Open `http://localhost:3000/?room=test123` in another tab (or use the same URL)
   - You can also use different browsers (Chrome, Firefox, Edge)

3. **Test real-time collaboration**:
   - Draw simultaneously in both windows
   - You should see strokes appear in real-time in the other window
   - Cursor positions should update as you move your mouse
   - Try undo/redo - it should affect the latest stroke globally

4. **Test room isolation**:
   - Open `http://localhost:3000/?room=room1` in one tab
   - Open `http://localhost:3000/?room=room2` in another tab
   - Drawings should be isolated per room

### Remote Testing (After Deployment)

1. Share the deployed URL with others
2. Use the same room parameter: `https://your-app.com/?room=shared-room`
3. Multiple users can join and draw simultaneously

## Scripts

- `npm start`: Run the production server
- `npm run dev`: Run with nodemon (auto-restart on file changes)


## Known Limitations / Bugs

### Current Limitations

1. **In-memory storage**: 
   - Rooms and drawings are stored in memory only
   - Server restart clears all state
   - No persistence between restarts

2. **Undo/Redo granularity**:
   - Undo/redo operates at the **stroke level** (entire strokes), not per-point
   - Cannot undo individual points within a stroke

3. **No authentication**:
   - Users are identified only by socket ID
   - No user accounts or login system
   - Anyone with the room URL can join

4. **No drawing persistence**:
   - Drawings are not saved to disk or database
   - Cannot load previous sessions

5. **Browser compatibility**:
   - Requires modern browsers with WebSocket support
   - May not work on very old browsers

### Known Bugs

- None currently reported, but edge cases may exist with:
  - Very rapid drawing (high-frequency events)
  - Network latency spikes
  - Browser tab switching (may pause WebSocket)

## Time Spent on the Project

Fill in before submission:

- **Design + architecture**: 4 hours
- **Server implementation**: 6 hours
- **Client canvas + UI**: 7 hours
- **Testing + polish**: 3 hours
- **Documentation**: 2 hours
- **Total**: 22 hours

## Technical Stack

- **Frontend**: JavaScript, HTML5 Canvas API
- **Backend**: Node.js + Express
- **Real-time**: Socket.io (WebSocket library)
- **No drawing libraries** - all canvas operations implemented from scratch
