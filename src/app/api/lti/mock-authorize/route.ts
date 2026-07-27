// DEV ONLY — simulates Canvas's OIDC authorization endpoint.
// The real Canvas would authenticate the user and form-POST an id_token back to
// our launch endpoint. Here we mint that id_token ourselves (signed with the
// tool's own key, which the mock platform's JWKS points at) and auto-submit it.
// Guarded by LTI_DEV_MODE so it never activates in a real deployment.

import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSigningKey } from "@/lib/lti/keys";
import { MOCK_ISSUER, MOCK_CLIENT_ID } from "@/lib/lti/platform";
import { CLAIM, INSTRUCTOR_ROLE, LEARNER_ROLE } from "@/lib/lti/claims";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!env.ltiDevMode) {
    return NextResponse.json({ error: "Dev mode disabled." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id") || MOCK_CLIENT_ID;
  const redirectUri = sp.get("redirect_uri") || `${env.appUrl}/api/lti/launch`;
  const state = sp.get("state") || "";
  const nonce = sp.get("nonce") || "";
  const loginHint = sp.get("login_hint") || "dev-user-1";
  const messageHint = sp.get("lti_message_hint") || "";

  // Parse hints: "role=instructor;persona=kahlo;name=Ana"
  const hints = Object.fromEntries(
    messageHint
      .split(";")
      .map((kv) => kv.split("="))
      .filter((a) => a.length === 2)
  );
  const isInstructor = hints.role === "instructor";
  const persona = hints.persona || "lincoln";
  const name = hints.name || (isInstructor ? "Prof. Dev Instructor" : "Dev Student");

  const { privateKey, kid } = await getSigningKey();

  const idToken = await new SignJWT({
    // Standard OIDC claims
    name,
    given_name: name.split(" ")[0],
    email: `${loginHint}@example.edu`,
    nonce,
    // LTI claims
    [CLAIM.messageType]: "LtiResourceLinkRequest",
    [CLAIM.version]: "1.3.0",
    [CLAIM.deploymentId]: "hv-dev-deployment-1",
    [CLAIM.targetLinkUri]: `${env.appUrl}/api/lti/launch`,
    [CLAIM.roles]: [isInstructor ? INSTRUCTOR_ROLE : LEARNER_ROLE],
    [CLAIM.resourceLink]: { id: `rl-${persona}`, title: "Historical Voices" },
    [CLAIM.context]: {
      id: "course-dev-101",
      label: "ESL-101",
      title: "Dev Course",
    },
    [CLAIM.custom]: { persona, canvas_course_id: "101" },
    // AGS endpoint — a fake line item; submitGrade() simulates for MOCK issuer.
    [CLAIM.ags]: {
      scope: [
        "https://purl.imsglobal.org/spec/lti-ags/scope/score",
        "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
      ],
      lineitem: `${env.appUrl}/mock-lineitem/1`,
    },
  })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(MOCK_ISSUER)
    .setSubject(loginHint)
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  // Auto-submit form (response_mode=form_post) back to the launch endpoint.
  const html = `<!doctype html><html><body onload="document.forms[0].submit()">
    <form method="POST" action="${redirectUri}">
      <input type="hidden" name="id_token" value="${idToken}" />
      <input type="hidden" name="state" value="${state}" />
      <noscript><button type="submit">Continue</button></noscript>
    </form>
  </body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
