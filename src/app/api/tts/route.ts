// Synthesizes speech for persona lines that don't come from /api/conversation
// (currently the opening greeting). Auth-gated by the app session; the persona
// slug comes from the caller's session so it can't be abused to voice
// arbitrary personas cross-session.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/lti/current";
import { getSession } from "@/lib/store";
import { synthesizeSpeech } from "@/lib/providers/tts";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string(),
  text: z.string().min(1).max(600),
});

export async function POST(req: NextRequest) {
  const app = await getCurrentAppSession();
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { sessionId, text } = parsed.data;

  const session = await getSession(sessionId);
  if (!session || session.ltiUserId !== app.ltiUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const speech = await synthesizeSpeech(session.personaSlug, text);
  return NextResponse.json(speech);
}
