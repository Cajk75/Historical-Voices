// Text-to-speech adapter.
// mock       -> returns null; the browser uses the Web Speech API (speechSynthesis).
// openai     -> gpt-4o-mini-tts with per-persona voice + delivery instructions.
// elevenlabs -> returns MP3 audio bytes as a base64 data URL.

import { env } from "@/lib/env";

export type TtsResult = {
  // data URL (audio/mpeg) when a real provider is used, else null (browser TTS)
  audioUrl: string | null;
  provider: string;
};

// Voice casting per figure for OpenAI TTS. `instructions` shape delivery —
// pacing, register, accent color — so each figure sounds like themselves.
const OPENAI_VOICES: Record<
  string,
  { voice: string; instructions: string }
> = {
  lincoln: {
    voice: "onyx",
    instructions:
      "You are Abraham Lincoln in 1863. Speak slowly and solemnly, with the measured, deliberate gravity of a 19th-century American statesman. Warm but weighty. Slight pauses at commas, as if weighing every word.",
  },
  kahlo: {
    voice: "coral",
    instructions:
      "You are Frida Kahlo. Speak English with a gentle Mexican-Spanish accent and musical intonation. Passionate, warm, and playful, with expressive rises and falls. Pronounce Spanish words natively.",
  },
  roosevelt: {
    voice: "sage",
    instructions:
      "You are Eleanor Roosevelt in 1948. Speak with a warm, patrician mid-Atlantic accent — measured, kindly, and encouraging, like a wise teacher addressing a student she believes in.",
  },
};

export async function synthesizeSpeech(
  personaSlug: string,
  text: string
): Promise<TtsResult> {
  if (env.tts.provider === "openai" && env.chat.openaiKey) {
    return openaiTts(personaSlug, text);
  }
  if (env.tts.provider === "elevenlabs" && env.tts.key) {
    return elevenLabs(personaSlug, text);
  }
  return { audioUrl: null, provider: "browser-speechSynthesis" };
}

// ---- OpenAI TTS ----
async function openaiTts(
  personaSlug: string,
  text: string
): Promise<TtsResult> {
  const cast = OPENAI_VOICES[personaSlug] ?? OPENAI_VOICES.lincoln;
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.chat.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: cast.voice,
      instructions: cast.instructions,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    // Fail soft to browser TTS rather than breaking the conversation.
    return {
      audioUrl: null,
      provider: `browser-speechSynthesis (openai tts ${res.status})`,
    };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    audioUrl: `data:audio/mpeg;base64,${buf.toString("base64")}`,
    provider: "openai-tts",
  };
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
