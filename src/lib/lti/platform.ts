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

// CANVAS_ISSUER may be a comma-separated list of candidate issuers (useful for
// self-hosted Canvas, where the issuer may be the default canvas.instructure.com
// or the instance's own domain). All candidates share the same client/endpoints.
function issuerMatches(issuer: string): boolean {
  return env.canvas.issuer
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(issuer);
}

// Resolve by issuer (and optionally client_id). Configured Canvas first,
// then the dev mock platform when LTI_DEV_MODE is on.
export function resolvePlatform(
  issuer?: string,
  clientId?: string
): Platform | null {
  if (issuer && issuerMatches(issuer) && env.canvas.clientId) {
    return {
      issuer, // the matched candidate — used for jwt `iss` verification
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
  // initiation), use the configured Canvas (first candidate issuer).
  if (env.canvas.clientId && !issuer) {
    return {
      issuer: env.canvas.issuer.split(",")[0].trim(),
      clientId: env.canvas.clientId,
      authLoginUrl: env.canvas.authLoginUrl,
      authTokenUrl: env.canvas.authTokenUrl,
      jwksUrl: env.canvas.jwksUrl,
    };
  }
  if (env.ltiDevMode) return getMockPlatform();
  return null;
}
