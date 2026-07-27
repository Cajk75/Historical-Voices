// Generates the tool's RSA keypair for LTI 1.3 (RS256 signing + JWKS).
// Usage: npm run keys:generate
// Prints PEM values to paste into .env.local as LTI_PRIVATE_KEY / LTI_PUBLIC_KEY.
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose";

const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});

const priv = await exportPKCS8(privateKey);
const pub = await exportSPKI(publicKey);

// Escape newlines so the multiline PEM fits on a single .env line.
const enc = (s) => JSON.stringify(s);

console.log("\n# --- Paste these into .env.local ---\n");
console.log(`LTI_PRIVATE_KEY=${enc(priv)}`);
console.log(`LTI_PUBLIC_KEY=${enc(pub)}`);
console.log(
  "\n# Keep the private key secret. The public key is served at /api/lti/jwks\n"
);
