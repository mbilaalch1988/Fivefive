# Sequence

Online multiplayer Sequence (the board/card game), playable from any phone or laptop browser.

## Stack
- **client/** — React 19 + Vite + Tailwind v4 + TypeScript
- **server/** — Node + Express + Socket.IO + TypeScript
- **shared/** — Pure-TS game engine (deck, board, rules, sequence detection)

## Local dev
```bash
npm install
npm run dev      # runs server (3001) and client (5173) together
npm test         # 28 game-engine tests
```

Open <http://localhost:5173>. Create a room and share the 4-letter code with friends on the same network (or wherever you've deployed this).

## Production
The server serves the built React client at the same origin, so the whole thing runs as one Node process:
```bash
npm run build    # builds client/dist
npm start        # runs server in production mode, serves client + API on $PORT
```

## Deploy to Render (free)
A [`render.yaml`](render.yaml) is included. After pushing this repo to GitHub:
1. Sign in to <https://render.com> with GitHub.
2. New → Blueprint → pick this repo.
3. Render reads `render.yaml`, provisions a free Node web service, and deploys.
4. You get a public URL like `https://sequence-xxxx.onrender.com`.

Free tier note: the service spins down after ~15 min idle (first request after that has a ~30s cold start). Fine for testing.
