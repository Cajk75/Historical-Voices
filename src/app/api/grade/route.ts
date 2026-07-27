// Pushes the session's final score to the Canvas gradebook via AGS. Ensures an
// evaluation exists first (evaluating on demand if needed). Instructors are not
// graded. In dev/mock mode the passback is simulated and reported as such.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/lti/current";
import { getSession, saveFeedback, markGraded } from "@/lib/store";
import { evaluateSession } from "@/lib/providers/feedback";
import { submitGrade } from "@/lib/lti/ags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const app = await getCurrentAppSession();
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await req.json().catch(() => ({}));
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.ltiUserId !== app.ltiUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (app.isInstructor) {
    return NextResponse.json({
      ok: true,
      simulated: true,
      detail: "Instructors are not graded.",
    });
  }

  // Ensure we have an evaluation.
  let feedback = session.feedback;
  if (!feedback) {
    feedback = await evaluateSession(session.personaSlug, session.turns);
    await saveFeedback(session.id, feedback);
  }

  const result = await submitGrade({
    issuer: session.issuer,
    clientId: session.clientId,
    ltiUserId: session.ltiUserId,
    lineitemUrl: session.lineitemUrl,
    scoreGiven: feedback.overallScore,
    scoreMaximum: 100,
    comment: `CEFR ${feedback.cefrLevel}. ${feedback.summary}`,
    timestamp: new Date().toISOString(),
  });

  if (result.ok) await markGraded(session.id);

  return NextResponse.json({ score: feedback.overallScore, ...result });
}
