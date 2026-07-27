// Centralized, typed access to environment configuration.
// All provider flags default to "mock" so the app runs with zero secrets.

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  sessionSecret:
    process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me-please-000",
  ltiDevMode: process.env.LTI_DEV_MODE === "true",

  db: {
    url: process.env.DATABASE_URL ?? "",
    enabled: Boolean(process.env.DATABASE_URL),
  },

  lti: {
    privateKey: process.env.LTI_PRIVATE_KEY ?? "",
    publicKey: process.env.LTI_PUBLIC_KEY ?? "",
  },

  canvas: {
    issuer: process.env.CANVAS_ISSUER ?? "https://canvas.instructure.com",
    clientId: process.env.CANVAS_CLIENT_ID ?? "",
    authLoginUrl:
      process.env.CANVAS_AUTH_LOGIN_URL ??
      "https://sso.canvaslms.com/api/lti/authorize_redirect",
    authTokenUrl:
      process.env.CANVAS_AUTH_TOKEN_URL ??
      "https://sso.canvaslms.com/login/oauth2/token",
    jwksUrl:
      process.env.CANVAS_JWKS_URL ??
      "https://sso.canvaslms.com/api/lti/security/jwks",
  },

  chat: {
    provider: (process.env.CHAT_PROVIDER ?? "mock") as "mock" | "openai",
    openaiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
  },

  tts: {
    provider: (process.env.TTS_PROVIDER ?? "mock") as
      | "mock"
      | "openai"
      | "elevenlabs",
    key: process.env.ELEVENLABS_API_KEY ?? "",
    voices: {
      lincoln: process.env.ELEVENLABS_VOICE_LINCOLN ?? "",
      kahlo: process.env.ELEVENLABS_VOICE_KAHLO ?? "",
      roosevelt: process.env.ELEVENLABS_VOICE_ROOSEVELT ?? "",
    } as Record<string, string>,
  },

  avatar: {
    provider: (process.env.AVATAR_PROVIDER ?? "mock") as
      | "mock"
      | "did"
      | "simli",
    didKey: process.env.DID_API_KEY ?? "",
    simliKey: process.env.SIMLI_API_KEY ?? "",
  },

  stt: {
    provider: (process.env.STT_PROVIDER ?? "mock") as "mock" | "deepgram",
    key: process.env.DEEPGRAM_API_KEY ?? "",
  },

  translate: {
    provider: (process.env.TRANSLATE_PROVIDER ?? "mock") as
      | "mock"
      | "deepl"
      | "google",
    deeplKey: process.env.DEEPL_API_KEY ?? "",
    googleKey: process.env.GOOGLE_TRANSLATE_API_KEY ?? "",
  },
};

export type Env = typeof env;
