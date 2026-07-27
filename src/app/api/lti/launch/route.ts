// Step 3 of the LTI 1.3 OIDC launch: the platform form-POSTs id_token + state
// back to this redirect_uri. We verify state against our cookie, validate the
// launch token (signature, nonce, claims), persist a learning session, set the
// app session cookie, and redirect the student into the pre-reading stage.

import { NextRequest, NextResponse } from "next/server";
import {
  OIDC_STATE_COOKIE,
  APP_SESSION_COOKIE,
  verifyOidcState,
  signAppSession,
} from "@/lib/lti/session-jwt";
import { validateLaunch } from "@/lib/lti/validate";
import { createSession } from "@/lib/store";
import { getPersona, PERSONAS } from "@/lib/personas";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const idToken = form.get("id_token") as string | null;
  const state = form.get("state") as string | null;

  if (!idToken || !state) {
    return errorPage("Missing id_token or state in launch request.");
  }

  // Verify the state cookie we set during login initiation.
  const stateCookie = req.cookies.get(OIDC_STATE_COOKIE)?.value;
  if (!stateCookie) {
    return errorPage(
      "Missing OIDC state cookie. Third-party cookies may be blocked, or the login step was skipped."
    );
  }

  let oidc;
  try {
    oidc = await verifyOidcState(stateCookie);
  } catch {
    return errorPage("Invalid or expired OIDC state.");
  }
  if (oidc.state !== state) {
    return errorPage("OIDC state mismatch — possible CSRF. Launch rejected.");
  }

  // Validate the launch token (signature + nonce + claims).
  let claims;
  try {
    claims = await validateLaunch(idToken, oidc.nonce);
  } catch (e) {
    return errorPage(`Launch validation failed: ${(e as Error).message}`);
  }

  // Choose the persona. Priority:
  //   1. ?persona= on the assignment's External Tool URL (per-assignment)
  //   2. the `persona` custom field from the Developer Key (tool-wide default)
  //   3. first persona in the library.
  let urlHint: string | undefined;
  if (claims.targetLinkUri) {
    try {
      urlHint =
        new URL(claims.targetLinkUri).searchParams.get("persona") ?? undefined;
    } catch {
      /* ignore malformed target link */
    }
  }
  const personaSlug =
    (urlHint && getPersona(urlHint)?.slug) ||
    (claims.personaHint && getPersona(claims.personaHint)?.slug) ||
    PERSONAS[0].slug;

  // Persist the learning session.
  const session = await createSession({
    issuer: claims.issuer,
    clientId: claims.clientId,
    ltiUserId: claims.userId,
    userName: claims.userName ?? null,
    roles: claims.roles,
    contextId: claims.contextId ?? null,
    resourceId: claims.resourceLinkId ?? null,
    personaSlug,
    lineitemUrl: claims.ags?.lineitem ?? null,
    agsScopes: claims.ags?.scopes ?? [],
  });

  const appSession = await signAppSession({
    sessionId: session.id,
    ltiUserId: claims.userId,
    userName: claims.userName,
    roles: claims.roles,
    isInstructor: claims.isInstructor,
    personaSlug,
  });

  // Instructors land on a chooser; learners go straight to their reading.
  const dest = claims.isInstructor
    ? `${env.appUrl}/choose?session=${session.id}`
    : `${env.appUrl}/session/${session.id}/reading`;

  const res = NextResponse.redirect(dest, { status: 302 });
  res.cookies.set(APP_SESSION_COOKIE, appSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 6,
  });
  // Clear the one-time state cookie.
  res.cookies.set(OIDC_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

function errorPage(message: string) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:640px;margin:auto">
      <h1 style="color:#b91c1c">LTI Launch Error</h1>
      <p>${message}</p>
      <p style="color:#6b7280">If you are testing locally, start from the app's dev launcher instead.</p>
    </body></html>`,
    { status: 400, headers: { "Content-Type": "text/html" } }
  );
}
