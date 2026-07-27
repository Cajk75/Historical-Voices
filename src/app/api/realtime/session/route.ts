// Mints an ephemeral OpenAI Realtime client secret for a live voice session
// with the caller's persona. The browser uses this short-lived key to open a
// WebRTC connection directly to OpenAI — our real API key never leaves the
// server. Auth-gated by the LTI app session; persona comes from the session.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/lti/current";
import { getSession } from "@/lib/store";
import { getPersona } from "@/lib/personas";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Voice casting for the Realtime models.
const REALTIME_VOICES: Record<string, string> = {
  lincoln: "cedar",
  kahlo: "coral",
  roosevelt: "marin",
};

const VOICE_DIRECTION: Record<string, string> = {
  lincoln:
    "Deliver your speech slowly and solemnly, with the measured gravity of a 19th-century statesman.",
  kahlo:
    "Speak English with a gentle Mexican-Spanish accent and musical, passionate intonation. Pronounce Spanish words natively.",
  roosevelt:
    "Speak with a warm, patrician mid-Atlantic accent — measured, kindly, encouraging.",
};

export async function POST(req: NextRequest) {
  const app = await getCurrentAppSession();
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!env.chat.openaiKey) {
    return NextResponse.json(
      { error: "Realtime unavailable: no OpenAI key configured." },
      { status: 503 }
    );
  }

  const { sessionId } = await req.json().catch(() => ({}));
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session || session.ltiUserId !== app.ltiUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const persona = getPersona(session.personaSlug);
  if (!persona) {
    return NextResponse.json({ error: "Unknown persona" }, { status: 400 });
  }

  const instructions = `${persona.systemPrompt}

${VOICE_DIRECTION[persona.slug] ?? ""}

This is a LIVE VOICE conversation. Keep every reply under 45 words. Speak at a
calm, slightly slow pace suitable for an English learner. Begin the very first
response by greeting the student and asking what they understood from your text.`;

  const model = "gpt-realtime";
  const body = {
    session: {
      type: "realtime",
      model,
      instructions,
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: { type: "semantic_vad" },
        },
        output: {
          voice: REALTIME_VOICES[persona.slug] ?? "cedar",
        },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.chat.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Realtime session failed (${res.status})`, detail: detail.slice(0, 400) },
      { status: 502 }
    );
  }

  const json = (await res.json()) as any;
  return NextResponse.json({
    clientSecret: json.value ?? json.client_secret?.value,
    model,
  });
}
