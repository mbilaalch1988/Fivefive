# Sequence

Online multiplayer Sequence (the board/card game), playable from any phone or laptop browser.

🎮 **Live at [play.fivefive.app](https://play.fivefive.app)**

## Stack
- **client/** — React 19 + Vite + Tailwind v4 + TypeScript
- **server/** — Node + Express + Socket.IO + TypeScript
- **shared/** — Pure-TS game engine (deck, board, rules, sequence detection)
- **Postgres** (Supabase) — scoreboard persistence (optional, opt-in via `DATABASE_URL`)
- **Supabase Auth** — Google OAuth sign-in (optional, opt-in via `VITE_SUPABASE_*`)

## Local dev
```bash
npm install
npm run dev      # runs server (3001) and client (5173) together
npm test         # 28 game-engine tests
```

Open <http://localhost:5173>. Create a room and share the 4-letter code.

## Production
Server serves the built React client at the same origin — whole thing runs as one Node process:
```bash
npm run build    # builds client/dist
npm start        # runs server in production mode, serves client + API on $PORT
```

## Deploy to Render (free)
A [`render.yaml`](render.yaml) is included. After pushing this repo to GitHub:
1. Sign in to <https://render.com> with GitHub.
2. New → Blueprint → pick this repo.
3. Render reads `render.yaml`, provisions a free Node web service, and deploys.

Free tier spins down after ~15 min idle; first request after = ~30 s cold start.

## Optional: scoreboard persistence

Without these env vars, scores live only in server memory and reset on restart.

In Render dashboard → service → Environment:

| Key | Value |
|---|---|
| `DATABASE_URL` | Supabase Postgres URI: `postgresql://postgres.<project-ref>:<password>@aws-<region>.pooler.supabase.com:5432/postgres` |

Schema migration runs automatically on server startup.

## Optional: Google sign-in

Without these env vars, the Sign-in section hides and only anonymous (type-a-name) play is available.

### One-time Supabase + Google Cloud setup

1. **In Supabase** → Authentication → Providers → Google → enable. Note the callback URL Supabase shows you (looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
2. **In Google Cloud Console** (<https://console.cloud.google.com>):
   - Create a project (or use an existing one).
   - APIs & Services → OAuth consent screen → set up External or Internal, app name "Sequence", your email, save.
   - APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.
   - **Authorized redirect URIs**: paste the Supabase callback URL from step 1.
   - **Authorized JavaScript origins**: add your deploy URL (e.g. `https://sequence-xxxx.onrender.com`) and `http://localhost:5173` for dev.
   - Create. Copy the **Client ID** and **Client secret**.
3. **Back in Supabase** → Google provider → paste Client ID + Client Secret → Save.
4. **In Supabase** → Authentication → URL Configuration → add your deploy URL (e.g. `https://sequence-xxxx.onrender.com`) to **Redirect URLs** and set **Site URL** to the same. For dev, also add `http://localhost:5173`.

### Env vars (Render dashboard)

| Key | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → Project API keys → **anon / public** (NOT service_role) |
| `SUPABASE_JWT_SECRET` *(optional but recommended)* | Supabase → Settings → API → **JWT Secret** |

⚠️ Use the **anon** key in `VITE_SUPABASE_ANON_KEY`, not the service_role key. The anon key is designed to be public in client bundles; the service_role key is a server-only secret.

`SUPABASE_JWT_SECRET` is what lets the server verify access tokens from signed-in players. When set, signed-in player stats are tied to the immutable Supabase `auth.users.id` (so renaming or playing on another device keeps their history). Without it, sign-in still works for name autofill, but stats are still keyed by display name — same as anonymous play.

After saving the env vars, Render redeploys. The "Sign in with Google" button appears on the landing screen; signed-in users get their Google profile name auto-filled.

### Local dev with auth

Create `client/.env.local`:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...your-anon-key...
```
Restart `npm run dev`. Make sure `http://localhost:5173` is in Supabase's allowed redirect URLs.
