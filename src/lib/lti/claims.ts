// LTI 1.3 claim namespaces and the parsed shape we extract from a launch token.

export const CLAIM = {
  messageType: "https://purl.imsglobal.org/spec/lti/claim/message_type",
  version: "https://purl.imsglobal.org/spec/lti/claim/version",
  deploymentId: "https://purl.imsglobal.org/spec/lti/claim/deployment_id",
  targetLinkUri: "https://purl.imsglobal.org/spec/lti/claim/target_link_uri",
  resourceLink: "https://purl.imsglobal.org/spec/lti/claim/resource_link",
  roles: "https://purl.imsglobal.org/spec/lti/claim/roles",
  context: "https://purl.imsglobal.org/spec/lti/claim/context",
  custom: "https://purl.imsglobal.org/spec/lti/claim/custom",
  ags: "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint",
} as const;

export const INSTRUCTOR_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor";
export const LEARNER_ROLE =
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner";

export type LaunchClaims = {
  issuer: string;
  clientId: string; // aud
  deploymentId: string;
  userId: string; // sub
  userName?: string;
  email?: string;
  roles: string[];
  isInstructor: boolean;
  contextId?: string;
  courseId?: string; // custom_canvas_course_id
  resourceLinkId?: string;
  targetLinkUri?: string;
  // Optional custom param letting Canvas pin a specific figure to this link.
  personaHint?: string;
  // AGS grade passback
  ags?: {
    scopes: string[];
    lineitem?: string;
    lineitems?: string;
  };
};

export function parseLaunchClaims(payload: any): LaunchClaims {
  const roles: string[] = payload[CLAIM.roles] ?? [];
  const custom = payload[CLAIM.custom] ?? {};
  const ags = payload[CLAIM.ags];
  const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;

  return {
    issuer: payload.iss,
    clientId: aud,
    deploymentId: payload[CLAIM.deploymentId],
    userId: payload.sub,
    userName: payload.name ?? payload.given_name,
    email: payload.email,
    roles,
    isInstructor: roles.some((r) => r.includes("#Instructor")),
    contextId: payload[CLAIM.context]?.id,
    courseId: custom.canvas_course_id ?? custom.course_id,
    resourceLinkId: payload[CLAIM.resourceLink]?.id,
    targetLinkUri: payload[CLAIM.targetLinkUri],
    personaHint: custom.persona,
    ags: ags
      ? {
          scopes: ags.scope ?? [],
          lineitem: ags.lineitem,
          lineitems: ags.lineitems,
        }
      : undefined,
  };
}
