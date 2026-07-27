// Pre-Reading Stage — the student reads a ~200-word primary source before the
// live conversation opens. Each sentence is hover-translatable via <GlossText>.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/store";
import { getPersona } from "@/lib/personas";
import { getCurrentAppSession } from "@/lib/lti/current";
import { Button } from "@/components/ui/button";
import { GlossReading } from "@/components/GlossReading";

export const dynamic = "force-dynamic";

export default async function ReadingPage({
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-4">
        <div
          className="h-16 w-16 shrink-0 rounded-full bg-cover bg-center ring-2 ring-primary/30"
          style={{ backgroundImage: `url(${persona.portrait})` }}
          aria-hidden
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Pre-reading · Step 1 of 3
          </p>
          <h1 className="text-2xl font-bold">{persona.name}</h1>
          <p className="text-sm text-muted-foreground">
            {persona.title} · {persona.era}
          </p>
        </div>
      </div>

      <article className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{persona.reading.heading}</h2>
        <p className="mb-4 text-xs italic text-muted-foreground">
          {persona.reading.source}
        </p>
        <div className="space-y-4 text-[1.05rem] leading-relaxed text-card-foreground">
          <GlossReading text={persona.reading.excerpt} />
        </div>
      </article>

      <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-foreground">
          💡 Tip: Hover over any <span className="gloss-word">word</span> to see
          it in Spanish or Portuguese with a simpler English meaning.
        </p>
        <p className="mt-2 text-muted-foreground">
          After reading, you'll talk live with {persona.name}. Think about:{" "}
          <span className="italic">“{persona.comprehensionPrompt}”</span>
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Back
        </Link>
        <Link href={`/session/${session.id}`}>
          <Button size="lg">Start the conversation →</Button>
        </Link>
      </div>
    </main>
  );
}
