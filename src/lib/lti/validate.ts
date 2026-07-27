// Validates an incoming LTI 1.3 launch id_token per the security spec:
//  - signature verified against the platform's JWKS (or our key for mock)
//  - iss matches the platform, aud contains our client_id
//  - nonce matches the one we issued during login initiation
//  - message type / version are correct
// Returns parsed LaunchClaims on success; throws on any failure.

import { jwtVerify, createRemoteJWKSet, decodeJwt } from "jose";
import { resolvePlatform, MOCK_ISSUER } from "@/lib/lti/platform";
import { getVerificationKey } from "@/lib/lti/keys";
import { parseLaunchClaims, CLAIM, type LaunchClaims } from "@/lib/lti/claims";

// Cache remote JWKS resolvers per issuer.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function validateLaunch(
  idToken: string,
  expectedNonce: string
): Promise<LaunchClaims> {
  // Peek at issuer/aud to select the platform before verifying.
  const unsafe = decodeJwt(idToken);
  const issuer = unsafe.iss as string;
  const aud = Array.isArray(unsafe.aud) ? unsafe.aud[0] : (unsafe.aud as string);

  const platform = resolvePlatform(issuer, aud);
  if (!platform) throw new Error(`Unknown LTI platform: ${issuer}`);

  let payload: any;
  if (platform.isMock || issuer === MOCK_ISSUER) {
    // Mock platform: token was self-signed with our own key.
    const key = await getVerificationKey();
    ({ payload } = await jwtVerify(idToken, key, {
      issuer,
      audience: platform.clientId,
    }));
  } else {
    let jwks = jwksCache.get(platform.jwksUrl);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(platform.jwksUrl));
      jwksCache.set(platform.jwksUrl, jwks);
    }
    ({ payload } = await jwtVerify(idToken, jwks, {
      issuer: platform.issuer,
      audience: platform.clientId,
    }));
  }

  // Nonce replay protection.
  if (!payload.nonce || payload.nonce !== expectedNonce) {
    throw new Error("LTI nonce mismatch — possible replay or stale launch.");
  }

  // Message type + version sanity.
  const messageType = payload[CLAIM.messageType];
  if (messageType !== "LtiResourceLinkRequest") {
    throw new Error(`Unsupported LTI message type: ${messageType}`);
  }
  const version = payload[CLAIM.version];
  if (version && !String(version).startsWith("1.3")) {
    throw new Error(`Unsupported LTI version: ${version}`);
  }

  return parseLaunchClaims(payload);
}
