// Instructor view after launch. Explains the assigned figure for this Canvas
// link and lets the instructor preview the student experience. Which figure a
// link uses is controlled by the `persona` custom parameter in Canvas (see
// README); instructors can preview any figure here.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/store";
import { PERSONAS, getPersona } from "@/lib/personas";
import { getCurrentAppSession } from "@/lib/lti/current";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ChoosePage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  const app = await getCurrentAppSession();
  if (!app) redirect("/");
  const session = searchParams.session
    ? await getSession(searchParams.session)
    : null;
  const assigned = session ? getPersona(session.personaSlug) : undefined;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-widest text-primary">
        Instructor view
      </p>
      <h1 className="mt-1 text-3xl font-bold">Historical Voices — setup</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Welcome{app.userName ? `, ${app.userName}` : ""}. This assignment link is
        set to{" "}
        <b>{assigned ? assigned.name : "a default figure"}</b>. Students who open
        it will read the primary source, converse live, and be graded
        automatically. Preview the full experience below.
      </p>

      {session && assigned && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/session/${session.id}/reading`}>
            <Button>Preview student flow →</Button>
          </Link>
          <Link href={`/session/${session.id}/feedback`}>
            <Button variant="outline">Preview feedback dashboard</Button>
          </Link>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-xl font-semibold">Available figures</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {PERSONAS.map((p) => (
          <Card key={p.slug}>
            <div
              className="aspect-video w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${p.portrait})` }}
            />
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <p>{p.focus}</p>
              <p className="mt-2 font-mono">
                custom: <span className="text-foreground">persona={p.slug}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <b className="text-foreground">To pin a figure to a Canvas link:</b> in
        the assignment's app configuration, add a custom field{" "}
        <code className="rounded bg-background px-1">persona=kahlo</code> (or{" "}
        <code className="rounded bg-background px-1">lincoln</code> /{" "}
        <code className="rounded bg-background px-1">roosevelt</code>).
      </div>
    </main>
  );
}
