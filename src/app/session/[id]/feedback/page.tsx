// Feedback dashboard (Step 3 of 3). Evaluates the transcript (if not already),
// persists it, renders a polished performance summary, and syncs the grade to
// Canvas via the <GradeSync> client component.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession, saveFeedback } from "@/lib/store";
import { getPersona } from "@/lib/personas";
import { getCurrentAppSession } from "@/lib/lti/current";
import { evaluateSession } from "@/lib/providers/feedback";
import { ScoreBar } from "@/components/ScoreBar";
import { GradeSync } from "@/components/GradeSync";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({
  params,
}: {
  params: { id: string };
}) {
  const app = await getCurrentAppSession();
  if (!app) redirect("/");
  const session = await getSession(params.id);
  if (!session) notFound();
  const persona = getPersona(session.personaSlug);
  if (!persona) notFound();

  // Evaluate on demand and persist. A failed save must never 500 the page —
  // the student still sees their feedback, and /api/grade will retry the save.
  let feedback = session.feedback;
  if (!feedback) {
    feedback = await evaluateSession(session.personaSlug, session.turns);
    try {
      await saveFeedback(session.id, feedback);
    } catch (e) {
      console.error("saveFeedback failed (rendering anyway):", e);
    }
  }

  const cefrBlurb: Record<string, string> = {
    A2: "Elementary — you can handle short, simple exchanges.",
    "A2+": "Upper-elementary — you're bridging into independent use.",
    B1: "Intermediate — you can deal with familiar topics on your own.",
    B2: "Upper-intermediate — you can interact with fluency and detail.",
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-widest text-primary">
        Session complete · Step 3 of 3
      </p>
      <h1 className="mt-1 text-3xl font-bold">Your feedback</h1>
      <p className="mt-1 text-muted-foreground">
        Conversation with {persona.name}
      </p>

      {/* Headline score + CEFR */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 text-center shadow-sm sm:col-span-1">
          <div className="text-5xl font-bold text-primary">
            {feedback.overallScore}
          </div>
          <div className="text-sm text-muted-foreground">out of 100</div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm sm:col-span-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{feedback.cefrLevel}</span>
            <span className="text-sm text-muted-foreground">
              estimated CEFR level
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {cefrBlurb[feedback.cefrLevel] ?? "Keep up the great practice!"}
          </p>
        </div>
      </div>

      {/* Skill breakdown */}
      <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Skill breakdown</h2>
        <div className="space-y-4">
          <ScoreBar label="Vocabulary range" value={feedback.vocabularyScore} />
          <ScoreBar label="Grammatical accuracy" value={feedback.grammarScore} />
          <ScoreBar
            label="Historical comprehension"
            value={feedback.comprehensionScore}
          />
        </div>
      </section>

      {/* Strengths */}
      <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">✅ What you did well</h2>
        <ul className="space-y-1.5 text-sm">
          {(feedback.strengths ?? []).map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-green-600">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Gentle corrections */}
      {(feedback.corrections ?? []).length > 0 && (
        <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">
            🌱 Gentle tips to grow (not mistakes to fear)
          </h2>
          <ul className="space-y-3 text-sm">
            {(feedback.corrections ?? []).map((c, i) => (
              <li key={i} className="rounded-lg bg-accent/40 p-3">
                <span className="line-through opacity-70">{c.original}</span>{" "}
                <span className="mx-1">→</span>
                <span className="font-semibold text-primary">
                  {c.suggestion}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">{c.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Summary */}
      <section className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <h2 className="mb-2 font-semibold">Summary</h2>
        <p className="text-sm leading-relaxed">{feedback.summary}</p>
      </section>

      {/* Canvas grade passback */}
      <GradeSync sessionId={session.id} isInstructor={app.isInstructor} />

      <div className="mt-8 flex items-center justify-between">
        <Link
          href={`/session/${session.id}`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Back to conversation
        </Link>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
