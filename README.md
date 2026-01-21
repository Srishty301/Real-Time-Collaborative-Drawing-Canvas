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

## Deploy

### Render (recommended)

1. Go to Render → **New** → **Blueprint**
2. Select this repo and deploy using `render.yaml`

### Vercel

**Important**: Vercel's serverless functions have limitations with WebSockets. For best results:

**Option 1: Full deployment on Vercel** (may have WebSocket limitations)
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project root
3. Follow prompts to deploy
4. Set environment variable `SOCKET_SERVER_URL` if using separate backend

**Option 2: Split deployment** (recommended for production)
- **Frontend**: Deploy `client/` folder to Vercel
- **Backend**: Deploy to Render/Railway (supports WebSockets)
- Set `SOCKET_SERVER_URL` in Vercel environment variables to your backend URL

### Heroku

This repo includes a `Procfile`, so you can deploy with standard Heroku Node steps.

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


