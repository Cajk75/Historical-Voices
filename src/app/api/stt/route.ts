// Server-side speech-to-text fallback. Used when STT_PROVIDER=deepgram; the
// client posts a recorded audio blob and receives a transcript. In mock mode
// the browser's SpeechRecognition handles STT and this route returns empty.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/lti/current";
import { transcribeAudio } from "@/lib/providers/stt";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const app = await getCurrentAppSession();
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentType = req.headers.get("content-type") ?? "audio/webm";
  const buf = await req.arrayBuffer();
  const result = await transcribeAudio(buf, contentType);
  return NextResponse.json(result);
}
