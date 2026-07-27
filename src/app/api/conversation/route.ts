// Handles one dialogue turn: persist the student's utterance, generate the
// persona's reply (OpenAI or mock), persist it, and synthesize speech (returns
// an audio data URL when a real TTS provider is configured, else null so the
// browser uses speechSynthesis). Guarded by the app session cookie.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/lti/current";
import { getSession, appendTurn } from "@/lib/store";
import { generatePersonaReply } from "@/lib/providers/chat";
import { synthesizeSpeech } from "@/lib/providers/tts";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string(),
  text: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const app = await getCurrentAppSession();
  if (!app) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { sessionId, text } = parsed.data;

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  // A user may only post to their own session.
  if (session.ltiUserId !== app.ltiUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Record student turn, then build history for the model.
  await appendTurn(sessionId, { role: "student", text });
  const updated = await getSession(sessionId);
  const history = updated?.turns ?? [{ role: "student" as const, text }];

  const reply = await generatePersonaReply(session.personaSlug, history);
  await appendTurn(sessionId, { role: "persona", text: reply });

  const speech = await synthesizeSpeech(session.personaSlug, reply);

  return NextResponse.json({
    reply,
    audioUrl: speech.audioUrl,
    ttsProvider: speech.provider,
  });
}
