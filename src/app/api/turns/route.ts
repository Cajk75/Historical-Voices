// Persists transcript turns from the live (Realtime) conversation so the
// feedback engine and grade passback see the same history as classic mode.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/lti/current";
import { getSession, appendTurn } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string(),
  role: z.enum(["student", "persona"]),
  text: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const app = await getCurrentAppSession();
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { sessionId, role, text } = parsed.data;

  const session = await getSession(sessionId);
  if (!session || session.ltiUserId !== app.ltiUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await appendTurn(sessionId, { role, text });
  return NextResponse.json({ ok: true });
}
