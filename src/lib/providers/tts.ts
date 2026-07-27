// Text-to-speech adapter.
// mock       -> returns null; the browser uses the Web Speech API (speechSynthesis).
// elevenlabs -> returns MP3 audio bytes as a base64 data URL.

import { env } from "@/lib/env";

export type TtsResult = {
  // data URL (audio/mpeg) when a real provider is used, else null (browser TTS)
  audioUrl: string | null;
  provider: string;
};

export async function synthesizeSpeech(
  personaSlug: string,
  text: string
): Promise<TtsResult> {
  if (env.tts.provider === "elevenlabs" && env.tts.key) {
    return elevenLabs(personaSlug, text);
  }
  return { audioUrl: null, provider: "browser-speechSynthesis" };
}

async function elevenLabs(
  personaSlug: string,
  text: string
): Promise<TtsResult> {
  const voiceId =
    env.tts.voices[personaSlug] || "21m00Tcm4TlvDq8ikWAM"; // default ElevenLabs voice
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.tts.key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) {
    // Fail soft: fall back to browser TTS rather than breaking the session.
    return { audioUrl: null, provider: "browser-speechSynthesis (elevenlabs failed)" };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    audioUrl: `data:audio/mpeg;base64,${buf.toString("base64")}`,
    provider: "elevenlabs",
  };
}
