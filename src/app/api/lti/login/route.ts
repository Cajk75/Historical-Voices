// Step 1 of the LTI 1.3 OIDC launch: third-party-initiated login.
// Canvas calls this (GET or POST) with iss, login_hint, target_link_uri,
// client_id, and lti_message_hint. We create state+nonce, remember them in a
// signed HttpOnly cookie, and redirect the browser to the platform's OIDC
// authorization endpoint with response_mode=form_post.

import { NextRequest, NextResponse } from "next/server";
import { resolvePlatform } from "@/lib/lti/platform";
import { env } from "@/lib/env";
import {
  signOidcState,
  randomToken,
  OIDC_STATE_COOKIE,
} from "@/lib/lti/session-jwt";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const params =
    req.method === "GET"
      ? Object.fromEntries(req.nextUrl.searchParams)
      : Object.fromEntries((await req.formData()).entries() as any);

  const issuer = (params.iss as string) || env.canvas.issuer;
  const clientId =
    (params.client_id as string) || undefined;
  const loginHint = (params.login_hint as string) || "";
  const messageHint = (params.lti_message_hint as string) || "";
  const targetLinkUri =
    (params.target_link_uri as string) || `${env.appUrl}/api/lti/launch`;

  const platform = resolvePlatform(issuer, clientId);
  if (!platform) {
    return NextResponse.json(
      { error: "No matching LTI platform registered for this issuer." },
      { status: 400 }
    );
  }

  const state = randomToken(24);
  const nonce = randomToken(24);

  // Build the OIDC auth request.
  const authUrl = new URL(platform.authLoginUrl);
  const q = authUrl.searchParams;
  q.set("scope", "openid");
  q.set("response_type", "id_token");
  q.set("response_mode", "form_post");
  q.set("prompt", "none");
  q.set("client_id", platform.clientId);
  q.set("redirect_uri", `${env.appUrl}/api/lti/launch`);
  q.set("state", state);
  q.set("nonce", nonce);
  q.set("login_hint", loginHint);
  if (messageHint) q.set("lti_message_hint", messageHint);

  const stateJwt = await signOidcState({
    state,
    nonce,
    issuer: platform.issuer,
    clientId: platform.clientId,
    target: targetLinkUri,
  });

  const res = NextResponse.redirect(authUrl.toString(), { status: 302 });
  res.cookies.set(OIDC_STATE_COOKIE, stateJwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // SameSite=None is required because the launch POST comes cross-site from
    // Canvas back to us inside an iframe. Needs Secure in production.
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
