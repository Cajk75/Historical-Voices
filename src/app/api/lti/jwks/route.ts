// Publishes the tool's public JWKS so Canvas can verify our AGS client
// assertions. Register this URL as the "JWK Method: Public JWK URL" in the
// Canvas Developer Key: {APP_URL}/api/lti/jwks
import { NextResponse } from "next/server";
import { getPublicJwks } from "@/lib/lti/keys";

export const dynamic = "force-dynamic";

export async function GET() {
  const jwks = await getPublicJwks();
  return NextResponse.json(jwks, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
