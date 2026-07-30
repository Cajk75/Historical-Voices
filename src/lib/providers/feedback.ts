// Feedback / evaluation engine.
// Analyzes the student's turns for vocabulary range, grammar, and historical
// comprehension, and produces a 0–100 score + CEFR estimate + gentle notes.
// mock   -> transparent heuristic scoring (no key).
// openai -> gpt-4o-mini structured evaluation.

import { env } from "@/lib/env";
import { getPersona } from "@/lib/personas";
import type { ChatMessage } from "@/lib/providers/chat";

export type Correction = { original: string; suggestion: string; why: string };

export type Evaluation = {
  cefrLevel: string; // A2 / B1 / B2 ...
  vocabularyScore: number; // 0–100
  grammarScore: number;
  comprehensionScore: number;
  overallScore: number;
  strengths: string[];
  corrections: Correction[];
  summary: string;
  provider: string;
};

export async function evaluateSession(
  personaSlug: string,
  history: ChatMessage[]
): Promise<Evaluation> {
  if (env.chat.provider === "openai" && env.chat.openaiKey) {
    try {
      return await openaiEval(personaSlug, history);
    } catch {
      // fall through to heuristic
    }
  }
  return heuristicEval(personaSlug, history);
}

// ---- OpenAI structured evaluation ----
async function openaiEval(
  personaSlug: string,
  history: ChatMessage[]
): Promise<Evaluation> {
  const persona = getPersona(personaSlug)!;
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.chat.openaiKey });

  const transcript = history
    .map((m) => `${m.role === "student" ? "STUDENT" : persona.name}: ${m.text}`)
    .join("\n");

  const sys = `You are an encouraging ESL assessor. Evaluate ONLY the STUDENT's
English in the transcript of a conversation with ${persona.name}. The student is
a native Spanish/Portuguese speaker. The historical comprehension question is:
"${persona.comprehensionPrompt}". Be kind and never shaming. Return STRICT JSON
matching this TypeScript type:
{ cefrLevel: string; vocabularyScore: number; grammarScore: number;
  comprehensionScore: number; overallScore: number; strengths: string[];
  corrections: { original: string; suggestion: string; why: string }[];
  summary: string }
Scores are 0–100. Include at most 3 gentle corrections. overallScore is the
weighted mean (vocab 30%, grammar 30%, comprehension 40%).`;

  const completion = await client.chat.completions.create({
    model: env.chat.model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: transcript || "(no student input)" },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);

  // Normalize aggressively — model output shape is untrusted, and a malformed
  // field must never crash the feedback page or the DB write.
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;
  };
  const vocabularyScore = num(parsed.vocabularyScore, 60);
  const grammarScore = num(parsed.grammarScore, 60);
  const comprehensionScore = num(parsed.comprehensionScore, 60);
  const overallScore = num(
    parsed.overallScore,
    Math.round(
      vocabularyScore * 0.3 + grammarScore * 0.3 + comprehensionScore * 0.4
    )
  );
  return {
    cefrLevel:
      typeof parsed.cefrLevel === "string" && parsed.cefrLevel.length <= 4
        ? parsed.cefrLevel
        : "A2",
    vocabularyScore,
    grammarScore,
    comprehensionScore,
    overallScore,
    strengths: Array.isArray(parsed.strengths)
      ? parsed.strengths.slice(0, 5).map(String)
      : ["Took part in the conversation — great start."],
    corrections: Array.isArray(parsed.corrections)
      ? parsed.corrections
          .filter((c: any) => c && c.original && c.suggestion)
          .slice(0, 3)
          .map((c: any) => ({
            original: String(c.original),
            suggestion: String(c.suggestion),
            why: String(c.why ?? ""),
          }))
      : [],
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary
        : "Good effort — keep practicing your English!",
    provider: "openai",
  };
}

// ---- Heuristic (mock) evaluation ----
// Transparent, explainable metrics so the dashboard is meaningful with no key.
function heuristicEval(
  personaSlug: string,
  history: ChatMessage[]
): Evaluation {
  const persona = getPersona(personaSlug)!;
  const studentTurns = history.filter((m) => m.role === "student");
  const allText = studentTurns.map((t) => t.text).join(" ");
  const words = allText.toLowerCase().match(/[a-záéíóúñçãõ']+/gi) ?? [];
  const uniqueWords = new Set(words);

  // Vocabulary: type-token ratio + raw volume, mapped to 0–100.
  const ttr = words.length ? uniqueWords.size / words.length : 0;
  const volumeBonus = Math.min(30, words.length); // up to +30 for engaging
  const vocabularyScore = clamp(
    Math.round(ttr * 70 + volumeBonus + 20),
    30,
    100
  );

  // Grammar: proxy from sentence structure signals (very rough, transparent).
  const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgLen = sentences.length ? words.length / sentences.length : 0;
  const capitalized = sentences.filter((s) =>
    /^\s*[A-ZÁÉÍÓÚÑ]/.test(s)
  ).length;
  const grammarScore = clamp(
    Math.round(
      55 +
        Math.min(20, avgLen * 2) +
        (sentences.length ? (capitalized / sentences.length) * 20 : 0)
    ),
    40,
    100
  );

  // Comprehension: keyword overlap with the persona's comprehension prompt.
  const promptKeywords = keywords(persona.comprehensionPrompt);
  const hit = promptKeywords.filter((k) => uniqueWords.has(k)).length;
  const comprehensionScore = clamp(
    Math.round(
      40 + (promptKeywords.length ? (hit / promptKeywords.length) * 60 : 0)
    ),
    30,
    100
  );

  const overallScore = Math.round(
    vocabularyScore * 0.3 + grammarScore * 0.3 + comprehensionScore * 0.4
  );

  const cefrLevel =
    overallScore >= 85
      ? "B2"
      : overallScore >= 70
        ? "B1"
        : overallScore >= 55
          ? "A2+"
          : "A2";

  const strengths: string[] = [];
  if (uniqueWords.size >= 15)
    strengths.push(`Used ${uniqueWords.size} different words — nice range.`);
  if (studentTurns.length >= 3)
    strengths.push("Kept the conversation going with several replies.");
  if (hit >= 1)
    strengths.push("Touched on the key ideas from the reading.");
  if (strengths.length === 0)
    strengths.push("Took the first step and spoke in English — great start.");

  // Gentle, generic corrections seeded from common ES/PT-speaker patterns.
  const corrections: Correction[] = detectCommonErrors(allText).slice(0, 3);

  const summary = `You spoke ${studentTurns.length} time(s) with ${persona.name} and used ${uniqueWords.size} unique words. Your estimated level is ${cefrLevel}. Comprehension of the reading looks ${comprehensionScore >= 70 ? "strong" : "developing"}. Keep practicing speaking in full sentences — you are making real progress!`;

  return {
    cefrLevel,
    vocabularyScore,
    grammarScore,
    comprehensionScore,
    overallScore,
    strengths,
    corrections,
    summary,
    provider: "heuristic-mock",
  };
}

function detectCommonErrors(text: string): Correction[] {
  const out: Correction[] = [];
  const t = ` ${text.toLowerCase()} `;
  if (/\bi has\b/.test(t))
    out.push({
      original: "I has",
      suggestion: "I have",
      why: "With 'I', use 'have' (not 'has').",
    });
  if (/\bpeoples\b/.test(t))
    out.push({
      original: "peoples",
      suggestion: "people",
      why: "'People' is already plural — no final 's' needed here.",
    });
  if (/\bmore better\b/.test(t))
    out.push({
      original: "more better",
      suggestion: "better",
      why: "'Better' is already comparative; drop 'more'.",
    });
  if (/\bi am agree\b/.test(t))
    out.push({
      original: "I am agree",
      suggestion: "I agree",
      why: "'Agree' is a verb: say 'I agree' (no 'am').",
    });
  return out;
}

function keywords(s: string): string[] {
  const stop = new Set([
    "the","and","did","say","what","why","and","that","this","with","for",
    "was","are","were","does","she","her","his","him","them","they","you",
    "did","ask","the","who","how","all","men","are","created","according",
    "matter","matters","begin","begins","said","asked",
  ]);
  return Array.from(
    new Set(
      (s.toLowerCase().match(/[a-z']+/g) ?? []).filter(
        (w) => w.length > 3 && !stop.has(w)
      )
    )
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
