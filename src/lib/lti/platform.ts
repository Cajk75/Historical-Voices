// Resolves which registered Canvas platform an OIDC request belongs to.
// In dev mode a single built-in "mock" platform is available whose JWKS is the
// tool's OWN public key (so we can self-sign a launch token for local testing).

import { env } from "@/lib/env";

export type Platform = {
  issuer: string;
  clientId: string;
  authLoginUrl: string;
  authTokenUrl: string;
  jwksUrl: string;
  isMock?: boolean;
};

export const MOCK_ISSUER = "https://mock.canvas.local";
export const MOCK_CLIENT_ID = "hv-mock-client";

export function getMockPlatform(): Platform {
  return {
    issuer: MOCK_ISSUER,
    clientId: MOCK_CLIENT_ID,
    authLoginUrl: `${env.appUrl}/api/lti/mock-authorize`,
    authTokenUrl: `${env.appUrl}/api/lti/mock-token`,
    jwksUrl: `${env.appUrl}/api/lti/jwks`,
    isMock: true,
  };
}

// Resolve by issuer (and optionally client_id). Configured Canvas first,
// then the dev mock platform when LTI_DEV_MODE is on.
export function resolvePlatform(
  issuer?: string,
  clientId?: string
): Platform | null {
  if (issuer === env.canvas.issuer && env.canvas.clientId) {
    return {
      issuer: env.canvas.issuer,
      clientId: env.canvas.clientId,
      authLoginUrl: env.canvas.authLoginUrl,
      authTokenUrl: env.canvas.authTokenUrl,
      jwksUrl: env.canvas.jwksUrl,
    };
  }
  if (env.ltiDevMode && (!issuer || issuer === MOCK_ISSUER)) {
    return getMockPlatform();
  }
  // Fallback: if a real Canvas is configured but issuer wasn't passed (login
  // initiation), use the configured Canvas.
  if (env.canvas.clientId && !issuer) {
    return {
      issuer: env.canvas.issuer,
      clientId: env.canvas.clientId,
      authLoginUrl: env.canvas.authLoginUrl,
      authTokenUrl: env.canvas.authTokenUrl,
      jwksUrl: env.canvas.jwksUrl,
    };
  }
  if (env.ltiDevMode) return getMockPlatform();
  return null;
}
