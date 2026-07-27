// Signed, short-lived tokens the app itself issues:
//  - OIDC "state"/"nonce" cookie during the login->launch handshake
//  - the app session cookie carrying the validated LTI identity
// Both are HS256-signed with SESSION_SECRET and stored in HttpOnly cookies.

import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const secret = new TextEncoder().encode(env.sessionSecret);

export const OIDC_STATE_COOKIE = "lti_oidc_state";
export const APP_SESSION_COOKIE = "hv_session";

export type OidcState = {
  state: string;
  nonce: string;
  issuer: string;
  clientId: string;
  // Where to send the user after a successful launch (Canvas target_link_uri)
  target?: string;
};

export async function signOidcState(payload: OidcState): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

export async function verifyOidcState(token: string): Promise<OidcState> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as OidcState;
}

export type AppSession = {
  sessionId: string;
  ltiUserId: string;
  userName?: string;
  roles: string[];
  isInstructor: boolean;
  personaSlug: string;
};

export async function signAppSession(payload: AppSession): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("6h")
    .sign(secret);
}

export async function verifyAppSession(token: string): Promise<AppSession> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as AppSession;
}

// URL-safe random token generator (state / nonce) without extra deps.
export function randomToken(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
