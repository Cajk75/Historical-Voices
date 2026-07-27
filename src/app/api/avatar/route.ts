// Returns an avatar session descriptor for the client. In mock mode this tells
// the UI to render the CSS-animated portrait; with D-ID/Simli configured it
// returns the WebRTC connection details for the provider SDK.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/lti/current";
import { getSession } from "@/lib/store";
import { createAvatarSession } from "@/lib/providers/avatar";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const app = await getCurrentAppSession();
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await req.json().catch(() => ({}));
  const session = sessionId ? await getSession(sessionId) : null;
  const personaSlug = session?.personaSlug ?? app.personaSlug;
  const avatar = await createAvatarSession(personaSlug);
  return NextResponse.json(avatar);
}
