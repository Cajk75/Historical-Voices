// Hover-translate endpoint for the ESL scaffolding UI.
import { NextRequest, NextResponse } from "next/server";
import { glossText, type Lang } from "@/lib/providers/translate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text") ?? "";
  const lang = (req.nextUrl.searchParams.get("lang") ?? "ES") as Lang;
  if (!text.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  const gloss = await glossText(text, lang === "PT" ? "PT" : "ES");
  return NextResponse.json(gloss);
}
