# Historical Voices

An interactive **English-as-a-Second-Language** tutoring app that plugs directly
into **Canvas LMS via LTI 1.3 Advantage**. Students read a primary source by a
historical figure, hold a **live voice conversation** with an animated avatar of
that figure, get **real-time subtitles with hover-translation** for Spanish &
Portuguese speakers, and receive a **pedagogical feedback dashboard** whose score
is **synced back to the Canvas gradebook** via Assignment & Grade Services (AGS).

Figures included: **Abraham Lincoln**, **Frida Kahlo**, **Eleanor Roosevelt**.

---

## ✨ Runs with zero keys

Every external provider defaults to a **mock adapter**, so `npm run dev` gives you
the complete flow — LTI launch, conversation, subtitles, translation, feedback,
and (simulated) grade passback — with **no API keys and no database**. Add real
credentials one at a time to upgrade each capability; nothing else changes.

| Capability | Mock (default) | Real provider | Env to set |
|---|---|---|---|
| Conversation | Canned in-character replies | OpenAI `gpt-4o-mini` | `CHAT_PROVIDER=openai`, `OPENAI_API_KEY` |
| Feedback engine | Transparent heuristics | OpenAI structured eval | (same as chat) |
| Voice (TTS) | Browser `speechSynthesis` | ElevenLabs | `TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY` |
| Avatar | CSS-animated portrait | D-ID / Simli streaming | `AVATAR_PROVIDER=did`, `DID_API_KEY` |
| Speech-to-text | Browser `SpeechRecognition` | Deepgram Nova-2 | `STT_PROVIDER=deepgram`, `DEEPGRAM_API_KEY` |
| Translation | Built-in ES/PT dictionary | DeepL / Google | `TRANSLATE_PROVIDER=deepl`, `DEEPL_API_KEY` |
| Database | In-memory (per process) | Supabase Postgres | `DATABASE_URL`, `DIRECT_URL` |

---

## 🚀 Quick start (local)

```bash
npm install
cp .env.example .env.local     # defaults are all mock — no edits needed
npm run dev                    # http://localhost:3000
```

Open the home page and use the **Developer launcher** to simulate a Canvas LTI
1.3 launch as a student or instructor. This runs the real OIDC handshake
(login → authorize → launch) against a built-in mock platform.

> The dev launcher and mock platform only exist when `LTI_DEV_MODE="true"`.

### Turn on real AI
Add to `.env.local` and restart:
```bash
CHAT_PROVIDER="openai"
OPENAI_API_KEY="sk-..."
```

---

## 🏗️ Architecture

```
Next.js 14 App Router (TypeScript, Tailwind, shadcn-style UI)
├── src/app
│   ├── api/lti/login          OIDC 3rd-party login initiation
│   ├── api/lti/launch         id_token validation → session + app cookie
│   ├── api/lti/jwks           tool's public JWKS (register in Canvas)
│   ├── api/lti/mock-authorize  DEV ONLY — simulates Canvas auth server
│   ├── api/conversation       turn → persona reply (+ TTS)
│   ├── api/translate          hover-translate glosses
│   ├── api/stt                Deepgram fallback STT
│   ├── api/avatar             avatar session descriptor
│   ├── api/grade              AGS grade passback
│   ├── session/[id]/reading   pre-reading stage
│   ├── session/[id]           live conversation room
│   └── session/[id]/feedback  dashboard + Canvas sync
├── src/lib/lti                keys, JWKS, OIDC state, claims, validate, AGS
├── src/lib/providers          chat, tts, stt, avatar, translate, feedback
├── src/lib/personas.ts        the figure library (prompts + readings)
└── src/lib/store.ts           DB-or-memory session store
```

**LTI is implemented directly with `jose`** (not `ltijs`) so it fits Next.js
serverless routes on Vercel — no Express, no long-lived server.

---

## 🎓 Register in Canvas (LTI 1.3)

You need Canvas admin access → **Admin → Developer Keys → + LTI Key**.

1. **Method:** Enter manually (or paste the JSON config below).
2. **Target Link URI:** `https://YOUR_APP.vercel.app/api/lti/launch`
3. **OpenID Connect Initiation URL:** `https://YOUR_APP.vercel.app/api/lti/login`
4. **JWK Method:** *Public JWK URL* → `https://YOUR_APP.vercel.app/api/lti/jwks`
5. **Redirect URIs:** `https://YOUR_APP.vercel.app/api/lti/launch`
6. **Placements:** Assignment Selection, Link Selection, Course Navigation (as desired).
7. **Privacy Level:** Public (so `name` is sent for feedback).
8. Under **LTI Advantage Services**, enable:
   - *Can create and view assignment data in the gradebook* (AGS)
   - *Can view assignment data / submission data* as needed.
9. Add a **custom field** to pin a figure to a link:
   `persona=lincoln` (or `kahlo` / `roosevelt`).

After saving, copy the generated **Client ID** and turn the key **ON**. Then in
the target course: **Settings → Apps → + App → By Client ID** and paste it.

### Set these env vars from the Canvas key
```bash
CANVAS_ISSUER="https://canvas.instructure.com"      # or your instance issuer
CANVAS_CLIENT_ID="10000000000xxx"                    # from the Developer Key
CANVAS_AUTH_LOGIN_URL="https://sso.canvaslms.com/api/lti/authorize_redirect"
CANVAS_AUTH_TOKEN_URL="https://sso.canvaslms.com/login/oauth2/token"
CANVAS_JWKS_URL="https://sso.canvaslms.com/api/lti/security/jwks"
LTI_DEV_MODE="false"
```
> Canvas issuer & endpoints vary by region/instance. For Instructure-hosted
> Canvas the SSO host is usually `sso.canvaslms.com`; self-hosted uses your own
> domain. Confirm from your Developer Key's "View Deployment" details.

### Generate the tool keypair
```bash
npm run keys:generate     # prints LTI_PRIVATE_KEY / LTI_PUBLIC_KEY for .env
```
If you skip this in production the app generates an **ephemeral** key per cold
start — fine for launch verification, but set a stable keypair before real grade
passback so your JWKS `kid` stays constant.

---

## ▲ Deploy to Vercel

1. Push this folder to a Git repo and **Import** it in Vercel.
2. Set **Environment Variables** (Production) — at minimum:
   `APP_URL` (= your Vercel URL), `SESSION_SECRET`, `LTI_PRIVATE_KEY`,
   `LTI_PUBLIC_KEY`, the `CANVAS_*` values, `OPENAI_API_KEY`, and your
   `DATABASE_URL` / `DIRECT_URL`.
3. Deploy. `APP_URL` **must** exactly match the deployed origin or OIDC redirect
   URIs won't match and Canvas will reject the launch.
4. Register the three endpoints in Canvas (above) using the deployed URL.

### Database (Supabase) before production
```bash
# .env.local / Vercel:
DATABASE_URL="postgresql://...pooler...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...:5432/postgres"

npm run db:push        # creates tables from prisma/schema.prisma
```
Without a database the store is in-memory and resets on every serverless cold
start — never ship that to production.

---

## 🔐 Notes on cookies inside Canvas

Canvas launches the tool inside an **iframe**, so the OIDC state and app-session
cookies are set `SameSite=None; Secure` in production (handled automatically when
`NODE_ENV=production`). This requires HTTPS — Vercel provides it. If a browser
blocks third-party cookies entirely, use the "Open in new tab" placement.

## 🧪 What to try in dev
- Launch as **student** → read → converse (type or 🎙️ mic) → **Finish session**
  → see the dashboard and a **simulated** grade passback.
- Launch as **instructor** → land on the setup/preview page (no grade recorded).
- Toggle **ES/PT** and hover any subtitle word to see the translation gloss.
- Click **Help me answer** for sentence starters.

## ⚠️ Security
- `.env.local`, `*.pem`, and generated keys are git-ignored. Never commit secrets.
- Store all keys in Vercel env vars (or `.env.local`), not in code or chat.
- The dev mock authorize endpoint is hard-gated behind `LTI_DEV_MODE`.
