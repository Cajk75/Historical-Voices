// LTI Advantage — Assignment & Grade Services (AGS) grade passback.
// Flow:
//  1. Mint a client-credentials JWT (client assertion), signed with our key.
//  2. Exchange it at the platform token endpoint for an access token scoped to
//     AGS score publishing.
//  3. POST a Score object to the line item's /scores endpoint.
// In dev/mock mode (no real lineitem, or MOCK issuer) we short-circuit and
// return a simulated success so the full flow is demonstrable offline.

import { SignJWT } from "jose";
import { getSigningKey } from "@/lib/lti/keys";
import { resolvePlatform, MOCK_ISSUER } from "@/lib/lti/platform";
import { randomToken } from "@/lib/lti/session-jwt";

const AGS_SCORE_SCOPE =
  "https://purl.imsglobal.org/spec/lti-ags/scope/score";

export type GradeResult = {
  ok: boolean;
  simulated: boolean;
  detail: string;
};

export async function submitGrade(params: {
  issuer: string;
  clientId: string;
  ltiUserId: string;
  lineitemUrl: string | null;
  scoreGiven: number; // 0–100
  scoreMaximum?: number;
  comment?: string;
  timestamp: string; // ISO string (passed in — Date.now is fine at call site)
}): Promise<GradeResult> {
  const {
    issuer,
    clientId,
    ltiUserId,
    lineitemUrl,
    scoreGiven,
    scoreMaximum = 100,
    comment,
    timestamp,
  } = params;

  // Dev/mock: no real platform to talk to.
  if (issuer === MOCK_ISSUER || !lineitemUrl) {
    return {
      ok: true,
      simulated: true,
      detail: `Simulated grade passback: ${scoreGiven}/${scoreMaximum} for user ${ltiUserId}. (No real Canvas line item in dev mode.)`,
    };
  }

  const platform = resolvePlatform(issuer, clientId);
  if (!platform) {
    return { ok: false, simulated: false, detail: "Unknown platform." };
  }

  // 1 + 2: get an access token.
  const accessToken = await getAgsAccessToken(
    platform.authTokenUrl,
    clientId,
    timestamp
  );

  // 3: POST the score.
  const scoreUrl = lineitemUrl.includes("?")
    ? lineitemUrl.replace("?", "/scores?")
    : `${lineitemUrl}/scores`;

  const res = await fetch(scoreUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/vnd.ims.lis.v1.score+json",
    },
    body: JSON.stringify({
      userId: ltiUserId,
      scoreGiven,
      scoreMaximum,
      comment,
      timestamp,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      simulated: false,
      detail: `Score POST failed (${res.status}): ${body.slice(0, 300)}`,
    };
  }
  return {
    ok: true,
    simulated: false,
    detail: `Grade ${scoreGiven}/${scoreMaximum} posted to Canvas Gradebook.`,
  };
}

async function getAgsAccessToken(
  tokenUrl: string,
  clientId: string,
  timestamp: string
): Promise<string> {
  const { privateKey, kid } = await getSigningKey();

  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(tokenUrl)
    .setJti(randomToken(16))
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      scope: AGS_SCORE_SCOPE,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AGS token request failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as any;
  if (!json.access_token) throw new Error("No access_token in AGS response.");
  return json.access_token as string;
}
