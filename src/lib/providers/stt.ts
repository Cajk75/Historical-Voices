// Speech-to-text adapter.
// mock     -> the browser's SpeechRecognition API does STT client-side; this
//             server route is only used as a fallback/echo for mock mode.
// deepgram -> Nova-2 pre-recorded transcription of an uploaded audio blob.

import { env } from "@/lib/env";

export type SttResult = { transcript: string; provider: string };

export async function transcribeAudio(
  audio: ArrayBuffer,
  mimeType: string
): Promise<SttResult> {
  if (env.stt.provider === "deepgram" && env.stt.key) {
    return deepgram(audio, mimeType);
  }
  // Mock mode: real capture happens in-browser (Web Speech API). If audio is
  // posted here in mock mode, we cannot transcribe it — return an empty string
  // so the client falls back to its own recognition transcript.
  return { transcript: "", provider: "browser-SpeechRecognition" };
}

async function deepgram(
  audio: ArrayBuffer,
  mimeType: string
): Promise<SttResult> {
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${env.stt.key}`,
        "Content-Type": mimeType || "audio/webm",
      },
      body: audio,
    }
  );
  if (!res.ok) return { transcript: "", provider: "deepgram (failed)" };
  const json = (await res.json()) as any;
  const transcript =
    json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  return { transcript, provider: "deepgram" };
}
