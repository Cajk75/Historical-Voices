// The tool's RSA keypair, used to (a) sign outgoing AGS client-credentials JWTs
// and (b) publish a JWKS so Canvas can verify us. In dev mode with no key set,
// we generate an ephemeral keypair at runtime and cache it on globalThis so the
// full OIDC + mock-platform flow works with zero configuration.

import {
  importPKCS8,
  importSPKI,
  exportJWK,
  generateKeyPair,
  type KeyLike,
} from "jose";
import { env } from "@/lib/env";

const g = globalThis as unknown as {
  __ltiKeys?: {
    privateKey: KeyLike;
    publicKey: KeyLike;
    kid: string;
  };
};

// A stable key id. For configured keys we derive it; for ephemeral dev keys we
// use a fixed dev kid (single process, so it is stable within a run).
async function loadKeys() {
  if (g.__ltiKeys) return g.__ltiKeys;

  if (env.lti.privateKey && env.lti.publicKey) {
    const privateKey = await importPKCS8(env.lti.privateKey, "RS256");
    const publicKey = await importSPKI(env.lti.publicKey, "RS256");
    const jwk = await exportJWK(publicKey);
    const kid = jwk.n ? jwk.n.slice(0, 16) : "hv-key-1";
    g.__ltiKeys = { privateKey, publicKey, kid };
    return g.__ltiKeys;
  }

  // Ephemeral dev keypair.
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  g.__ltiKeys = { privateKey, publicKey, kid: "hv-dev-key" };
  return g.__ltiKeys;
}

export async function getSigningKey() {
  const { privateKey, kid } = await loadKeys();
  return { privateKey, kid };
}

export async function getPublicJwks() {
  const { publicKey, kid } = await loadKeys();
  const jwk = await exportJWK(publicKey);
  return {
    keys: [
      {
        ...jwk,
        kid,
        use: "sig",
        alg: "RS256",
      },
    ],
  };
}

// Exposed for the mock platform: verify a token our own key signed.
export async function getVerificationKey() {
  const { publicKey } = await loadKeys();
  return publicKey;
}
