# Historical Voices — AI Operator Handoff Guide

> **Audience:** an AI assistant (or human) who needs to operate, extend, and
> create Canvas assignments with the Historical Voices LTI tool. This document
> is self-contained: everything needed to work with the system is here.
> Last updated: 2026-07-27.

---

## 1. What this system is

**Historical Voices** is a production ESL (English as a Second Language)
tutoring web app integrated into Canvas LMS via **LTI 1.3 Advantage**. The
student flow inside a Canvas assignment:

1. **Pre-reading** — a ~200-word primary source by a historical figure, with
   hover-to-translate (Spanish/Portuguese + simplified English) on every word.
2. **Live conversation** — the student *speaks* with an animated avatar of the
   figure via the OpenAI Realtime API (hands-free, interruptible, streaming
   subtitles). Falls back automatically to tap-to-talk + typed input if the
   microphone is unavailable.
3. **Feedback + grade** — GPT evaluates the transcript (vocabulary 30%,
   grammar 30%, historical comprehension 40%), shows a dashboard (CEFR level,
   skill bars, gentle corrections), and posts a 0–100 score to the Canvas
   gradebook via LTI AGS.

**Figures available:** `lincoln` (Gettysburg Address), `kahlo` (art &
self-expression), `roosevelt` (Universal Declaration of Human Rights).

---

## 2. Key facts & credentials map

| Thing | Value / location |
|---|---|
| Production URL | `https://historical-voices.vercel.app` |
| GitHub repo | `github.com/Cajk75/Historical-Voices` (push to `main` auto-deploys) |
| Local checkout | `~/Desktop/historical-voices` (Mac; `gh` CLI authed as collaborator `cajk76`) |
| Hosting | Vercel, team `aerios484-4081s-projects`, project `historical-voices` (CLI is authenticated on the Mac; `vercel env ls`, `vercel logs`, `vercel --prod` all work from the repo dir) |
| Database | Supabase Postgres, project ref `gngblvngttynybiqrxlw`, region us-east-1. **Must use pooler hosts** (`aws-0-us-east-1.pooler.supabase.com`, port 6543 w/ `?pgbouncer=true` for runtime, 5432 for `prisma db push`) — the direct `db.*.supabase.co` host is IPv6-only and unreachable from most networks |
| Canvas instance | `https://cca-cali.jinso.com` (self-hosted Canvas, Centro Cultural Colombo Americano Cali; admin login = admin@jinso.com) |
| Canvas Developer Key | **Client ID `10000000000004`**, name "Historical Voices", state ON |
| Installed in | Course 5 **Freedom250** (FR-250). Example assignment: id 5 |
| AI provider | Single OpenAI key powers everything: conversation (`gpt-4o-mini`), realtime voice (`gpt-realtime`), TTS (`gpt-4o-mini-tts`), translations, evaluation |
| Secrets | In `.env.local` (git-ignored) locally and Vercel env vars in production. **Never commit secrets** — GitHub push protection is active and has already blocked one accidental commit |

---

## 3. How to create a new Canvas assignment (the most common task)

Prereq: the tool is already installed in the course (see §6 if it's a new
course). In Canvas, as an instructor/admin:

1. **Assignments → + Assignment.**
2. **Assignment Name:** e.g. `Talk with Frida Kahlo`.
3. **Points:** `100` (the app posts 0–100; matching keeps the math obvious).
4. **Submission Type:** `External Tool`.
5. **Enter the External Tool URL** — this is where the figure is chosen:
   - Lincoln: `https://historical-voices.vercel.app/api/lti/launch?persona=lincoln`
   - Frida Kahlo: `https://historical-voices.vercel.app/api/lti/launch?persona=kahlo`
   - Eleanor Roosevelt: `https://historical-voices.vercel.app/api/lti/launch?persona=roosevelt`
   - (No `?persona=` → falls back to the Developer Key custom field, currently `lincoln`.)
6. **Leave "Load This Tool In A New Tab" UNCHECKED** — the owner wants the
   embedded experience. (Exception: if live-voice mic permission is blocked in
   the iframe on the deployment's Canvas, checking it is the workaround.)
7. **Save & Publish.**

Verification checklist after creating: open the assignment as the teacher
(instructor view renders a setup/preview page), then **Student View** (course →
Settings → View as Student, or the "Student View" button) → complete a short
conversation → Finish → check the **Gradebook** shows the score for Test
Student.

**Grading behavior to explain to teachers:**
- The score posts automatically when the student presses **Finish** (goal: 4
  replies; they can finish after 1).
- Retakes: each launch is a fresh session; finishing again **overwrites** the
  gradebook score with the newest one (not best-of).
- Instructors are never graded; they see a preview UI instead.

---

## 4. Architecture (what lives where)

Next.js 14 App Router (TypeScript, Tailwind), deployed on Vercel serverless.
LTI is implemented directly with the `jose` library (NOT `ltijs` — it doesn't
fit serverless).

```
src/app/api/lti/login       OIDC 3rd-party-initiated login (GET+POST)
src/app/api/lti/launch      validates id_token, creates session, sets cookie,
                            picks persona (?persona= > custom field > default)
src/app/api/lti/jwks        the tool's public JWKS (Canvas fetches this)
src/app/api/lti/mock-authorize  DEV ONLY fake Canvas (guarded by LTI_DEV_MODE)
src/app/api/conversation    classic-mode turn: persist, GPT reply, TTS audio
src/app/api/tts             TTS for the greeting line
src/app/api/realtime/session  mints ephemeral gpt-realtime client secrets
src/app/api/turns           persists live-mode transcript turns
src/app/api/translate       hover-gloss endpoint (OpenAI ES/PT + simple English)
src/app/api/grade           evaluates if needed + AGS score POST to Canvas
src/app/session/[id]/reading   pre-reading stage
src/app/session/[id]           conversation (ConversationSwitcher: live→classic)
src/app/session/[id]/feedback  dashboard + GradeSync (fires AGS on load)
src/app/choose              instructor landing
src/lib/personas.ts         THE PERSONA LIBRARY (see §5)
src/lib/lti/*               keys, claims, validate, ags, session-jwt, platform
src/lib/providers/*         chat, tts, stt, translate, feedback, avatar adapters
src/lib/store.ts            Prisma/Postgres store (in-memory fallback keyless)
src/components/LiveConversation.tsx   WebRTC realtime client
src/components/ConversationRoom.tsx   tap-to-talk fallback client
src/components/PersonaFace.tsx        amplitude-animated SVG faces
prisma/schema.prisma        Session / Turn / Feedback / Platform tables
```

**LTI flow in one paragraph:** Canvas hits `/api/lti/login` (issuer +
login_hint) → we set a signed state/nonce cookie and redirect to Canvas's
`authorize_redirect` → Canvas form-POSTs a JWT `id_token` to
`/api/lti/launch` → we verify signature against Canvas's JWKS, check
state+nonce, parse claims (user, roles, course, AGS lineitem), create a
`Session` row, set an HttpOnly app cookie (`hv_session`, HS256), and redirect
learners to `/session/{id}/reading`. Grade passback (`src/lib/lti/ags.ts`)
mints a client-credentials JWT signed with our private key, exchanges it at
Canvas's token endpoint for an AGS-scoped access token, and POSTs a Score to
`{lineitem}/scores`.

**Session/auth model:** every API route re-verifies the `hv_session` cookie
and checks the session's `ltiUserId` matches — one student cannot touch
another's session.

---

## 5. Adding a NEW persona (second most common task)

Everything is driven by `src/lib/personas.ts`. Add an entry to `PERSONAS`:

```ts
{
  slug: "einstein",              // used in URLs: ?persona=einstein
  name: "Albert Einstein",
  title: "Theoretical Physicist",
  era: "1879–1955",
  focus: "Curiosity, imagination, and science",
  accentColor: "260 50% 45%",    // hsl triple, drives the theme
  portrait: "/personas/einstein.svg",   // create this file (see below)
  reading: { heading, source, excerpt },  // ~200 words, public domain / adapted
  comprehensionPrompt: "…the question the feedback engine grades against…",
  systemPrompt: `You ARE Albert Einstein …  ${SCAFFOLDING_RULES}`, // keep the shared rules!
  greeting: "…first spoken line…",
  starters: ["…", "…", "…"],     // 3 sentence starters for "Help me answer"
}
```

Then touch these (all optional but recommended):

| File | What to add |
|---|---|
| `public/personas/<slug>.svg` | 400×400 stylized portrait (used on cards/headers). Copy an existing file as a template. |
| `src/components/PersonaFace.tsx` | An animated inline-SVG face branch for the slug (mouth ellipse driven by `open`, eyes by `blink`). If you skip this, the Lincoln face is used as fallback — visibly wrong, so don't skip. |
| `src/lib/providers/tts.ts` → `OPENAI_VOICES` | `{ voice, instructions }` for classic-mode TTS. Voices: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse. |
| `src/app/api/realtime/session/route.ts` → `REALTIME_VOICES` + `VOICE_DIRECTION` | Voice for live mode (gpt-realtime set includes cedar, marin + the above) and a delivery instruction. |

Persona-writing guidance that matters pedagogically:
- Keep `SCAFFOLDING_RULES` appended to every system prompt — it enforces short
  replies, one question at a time, no shaming, modeling corrections implicitly.
- The reading excerpt should be public-domain or adapted-paraphrase.
- `comprehensionPrompt` is what the evaluator checks understanding against —
  make it answerable from the excerpt alone.

Then: `npx tsc --noEmit` → commit → push to `main` (auto-deploys) → create a
Canvas assignment with `?persona=<slug>`.

---

## 6. Installing the tool in ANOTHER course or ANOTHER Canvas instance

**Same Canvas (cca-cali.jinso.com), new course:** course → Settings → Apps →
+ App → Configuration Type "By Client ID" → `10000000000004` → Install. Then
create assignments per §3.

**A different Canvas instance:** three steps.
1. Admin → Developer Keys → + LTI Key (Manual Entry) with:
   - Target Link URI + Redirect URI: `https://historical-voices.vercel.app/api/lti/launch`
   - OIDC Initiation URL: `https://historical-voices.vercel.app/api/lti/login`
   - JWK Method: **Public JWK URL** = `https://historical-voices.vercel.app/api/lti/jwks`
   - LTI Advantage Services ON: "create and view assignment data",
     "view assignment data", "create and update submission results"
   - Additional Settings: custom field `persona=lincoln`, Privacy **PUBLIC**
   - Placements: Link Selection, Assignment Selection
   - Save, toggle ON, copy the Client ID.
2. Update Vercel env (comma-append supports multiple platforms is NOT yet
   implemented for client IDs — currently ONE Canvas at a time; multi-tenant
   would need the `Platform` DB table wired into `resolvePlatform`):
   - `CANVAS_ISSUER` — may be a **comma-separated candidate list**; self-hosted
     Canvas often uses `https://canvas.instructure.com` as issuer even on a
     custom domain. Current value: `https://canvas.instructure.com,https://cca-cali.jinso.com`.
   - `CANVAS_CLIENT_ID`, `CANVAS_AUTH_LOGIN_URL` (`{canvas}/api/lti/authorize_redirect`),
     `CANVAS_AUTH_TOKEN_URL` (`{canvas}/login/oauth2/token`),
     `CANVAS_JWKS_URL` (`{canvas}/api/lti/security/jwks`).
   - Redeploy (`vercel --prod --yes` or push any commit).
3. Install by Client ID in the target course.

---

## 7. Environment variables (Vercel production, mirrored in .env.local)

| Var | Current | Notes |
|---|---|---|
| `APP_URL` | `https://historical-voices.vercel.app` | must equal the deployed origin exactly |
| `SESSION_SECRET` | (random 64 hex) | signs state + app cookies |
| `LTI_DEV_MODE` | `true` | enables the home-page demo launcher + mock platform. **Set `false` before real students use it** |
| `CHAT_PROVIDER` | `openai` | `mock` works keyless |
| `OPENAI_API_KEY` | set | powers chat, realtime, TTS, translate, evaluation |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | |
| `TTS_PROVIDER` | `openai` | `mock`=browser voice, `elevenlabs` ready if key added |
| `TRANSLATE_PROVIDER` | `openai` | `deepl`/`google` adapters exist |
| `STT_PROVIDER` | `mock` | browser SpeechRecognition; `deepgram` adapter ready |
| `AVATAR_PROVIDER` | `mock` | animated SVG faces; `did`/`simli` stubs exist |
| `DATABASE_URL` | Supabase pooler :6543 `?pgbouncer=true` | |
| `DIRECT_URL` | Supabase pooler :5432 | used by `prisma db push` |
| `LTI_PRIVATE_KEY`/`LTI_PUBLIC_KEY` | set (PEM, escaped newlines) | tool keypair; JWKS serves the public half. Regenerate: `npm run keys:generate` |
| `CANVAS_*` | see §6 | |

Change an env var: `vercel env rm NAME production --yes && printf '%s' "value" | vercel env add NAME production`, then redeploy.

---

## 8. Dev & test workflow

```bash
cd ~/Desktop/historical-voices
npm run dev                  # http://localhost:3000 (APP_URL in .env.local is :3007 — match the port)
npx tsc --noEmit             # typecheck (build gate)
npm run build                # full production build check
git push origin main         # deploys production automatically
```

- **Local testing without Canvas:** the home page has a "Developer launcher"
  (only when `LTI_DEV_MODE=true`) that simulates the full OIDC flow as student
  or instructor for any persona. The mock platform self-signs launch tokens.
- **Testing in Canvas without touching real students:** Student View ("View as
  Student") launches as Test Student — full flow including a REAL gradebook
  entry you can verify, and Reset Student clears it.
- **Reading production data:** `Session`/`Turn`/`Feedback` tables in Supabase
  (Table Editor in the dashboard, or Prisma with `DIRECT_URL`).
- **Logs:** `vercel logs <deployment-url>` from the repo dir.

---

## 9. Gotchas discovered the hard way (do not re-learn these)

1. **Supabase direct host is IPv6-only** on free tier → always the pooler
   hosts (§2). `P1001 can't reach` = you used `db.*.supabase.co`.
2. **Self-hosted Canvas issuer ambiguity** → `CANVAS_ISSUER` accepts a
   comma-separated candidate list; `resolvePlatform` matches per-token.
3. **This Canvas publishes multiple JWKS keys without `kid`** → jose throws
   `JWKSMultipleMatchingKeys`; `validate.ts` iterates candidates. Keep that.
4. **TextEdit strips leading dots** when saving dotfiles → a secrets file once
   became `env.vercel.local` (untracked pattern) and nearly got committed;
   `.gitignore` now has `env*.local`. Never `git add -A` blindly around new
   env-ish files.
5. **Hydration:** anything depending on `navigator`/mic must decide **after
   mount** (see ConversationSwitcher) or SSR mismatches crash the tree.
6. **Mic in iframes:** if the Canvas iframe lacks `allow="microphone"`, live
   mode falls back automatically; workaround = "Load in new tab" per
   assignment.
7. **A media element can only get one MediaElementSourceNode** — the
   `useAudioLevel` hook keeps a WeakMap; don't create new Audio elements per
   utterance.
8. **GitHub push protection is on** — a blocked push means a secret is in the
   commit; fix with `git reset --soft` + recommit, don't force or "allow".

---

## 10. Costs (order of magnitude, current usage)

| Feature | Cost |
|---|---|
| Classic conversation turn (chat+TTS) | ~$0.01–0.03 |
| Live realtime conversation | ~$0.10–0.30 **per minute** |
| Evaluation per session | <$0.01 |
| Hover translations | negligible (cached) |
| Vercel / Supabase | free tiers currently |

If piloting with a class, consider adding a session time cap for live mode.

---

## 11. Backlog the owner knows about (candidates for next work)

- Assessment hardening: retake policy (currently newest-wins), owner wants to
  supply their own CEFR rubric for the evaluator prompt.
- Gloss tooltip clips at the panel's left edge for left-most words.
- `LTI_DEV_MODE=false` before real launch (removes public demo launcher).
- Optional providers: ElevenLabs (voice character/cloning), Deepgram (STT),
  D-ID/Simli (video talking-head avatar) — adapters already scaffolded.
- Multi-tenant Canvas support via the `Platform` DB table.
