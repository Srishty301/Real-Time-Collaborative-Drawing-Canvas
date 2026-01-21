# Collaborative Canvas (Real-Time)

Multi-user drawing canvas with real-time streaming, presence, cursor indicators, and **global undo/redo**.

## Setup

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Test with multiple users

- Open **two tabs** (or two different browsers).
- Use the same room link: `http://localhost:3000/?room=myroom`
- Draw at the same time; you should see each other’s strokes live + cursor indicators.

## Scripts

- `npm start`: run server
- `npm run dev`: run with nodemon

## Known limitations / bugs

- Rooms and drawings are **in-memory** (server restart clears state).
- Undo/redo is global and deterministic, but it’s **stroke-level only** (not per-point).
- No auth; users are identified by socket id.

## Time spent

Fill in before submission:
- Design + architecture: __ hours
- Server: __ hours
- Client canvas + UI: __ hours
- Testing + polish: __ hours


