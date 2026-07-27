// Validates an incoming LTI 1.3 launch id_token per the security spec:
//  - signature verified against the platform's JWKS (or our key for mock)
//  - iss matches the platform, aud contains our client_id
//  - nonce matches the one we issued during login initiation
//  - message type / version are correct
// Returns parsed LaunchClaims on success; throws on any failure.

import { jwtVerify, createRemoteJWKSet, decodeJwt, errors } from "jose";
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
    const verifyOpts = {
      issuer: platform.issuer,
      audience: platform.clientId,
    };
    try {
      ({ payload } = await jwtVerify(idToken, jwks, verifyOpts));
    } catch (err) {
      // Some platforms (incl. self-hosted Canvas) publish several keys with
      // the same alg and sign tokens without a `kid` header. jose then can't
      // pick a single key — iterate the candidates and accept the one that
      // verifies. Signature security is unchanged: one of the platform's own
      // published keys must still validate the token.
      if (err instanceof errors.JWKSMultipleMatchingKeys) {
        let verified = false;
        for await (const candidate of err) {
          try {
            ({ payload } = await jwtVerify(idToken, candidate, verifyOpts));
            verified = true;
            break;
          } catch {
            // try next candidate
          }
        }
        if (!verified) throw new Error("No JWKS key verified the launch token.");
      } else {
        throw err;
      }
    }
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
