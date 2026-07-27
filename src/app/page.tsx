// Landing / developer launcher.
// In dev mode this simulates a Canvas LTI launch so you can walk the whole flow
// without a real Canvas. In production it just describes the tool (real students
// always arrive via the Canvas OIDC login endpoint, never this page).

import Link from "next/link";
import { PERSONAS } from "@/lib/personas";
import { env } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function Home() {
  const devMode = env.ltiDevMode;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          LTI 1.3 · Canvas · ESL
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Historical Voices
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
          Students practice English by reading a primary source, then holding a
          live voice conversation with an animated historical figure — with
          real-time subtitles, hover translation for Spanish & Portuguese
          speakers, and automatic grade passback to the Canvas gradebook.
        </p>
      </header>

      {devMode ? (
        <section className="mb-10">
          <h2 className="mb-1 text-xl font-semibold">Developer launcher</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            These buttons simulate a Canvas LTI 1.3 launch (OIDC login →
            authorize → launch) so you can test the full flow locally. Real
            students launch from within Canvas.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {PERSONAS.map((p) => (
              <Card key={p.slug} className="overflow-hidden">
                <div
                  className="aspect-square w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${p.portrait})` }}
                  aria-hidden
                />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{p.focus}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <a
                    href={`/api/lti/login?iss=https://mock.canvas.local&client_id=hv-mock-client&login_hint=stu-${p.slug}&lti_message_hint=role%3Dlearner%3Bpersona%3D${p.slug}%3Bname%3DAna%20Silva`}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Launch as student
                  </a>
                  <a
                    href={`/api/lti/login?iss=https://mock.canvas.local&client_id=hv-mock-client&login_hint=inst-${p.slug}&lti_message_hint=role%3Dinstructor%3Bpersona%3D${p.slug}`}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
                  >
                    Launch as instructor
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <Card className="mb-10">
          <CardContent className="py-6 text-muted-foreground">
            This is an LTI 1.3 tool. Add it to a Canvas course as an assignment
            or module item to begin. See the README for registration steps.
          </CardContent>
        </Card>
      )}

      <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        <h3 className="mb-2 font-semibold text-card-foreground">
          Integration endpoints
        </h3>
        <ul className="space-y-1 font-mono text-xs">
          <li>OIDC login: <span className="text-foreground">/api/lti/login</span></li>
          <li>Launch (redirect URI): <span className="text-foreground">/api/lti/launch</span></li>
          <li>Public JWKS: <span className="text-foreground">/api/lti/jwks</span></li>
        </ul>
        <p className="mt-3">
          Providers: chat=<b>{env.chat.provider}</b>, tts=<b>{env.tts.provider}</b>,{" "}
          avatar=<b>{env.avatar.provider}</b>, stt=<b>{env.stt.provider}</b>,{" "}
          translate=<b>{env.translate.provider}</b>.{" "}
          {env.db.enabled ? "DB connected." : "In-memory store (no DB)."}
        </p>
      </section>

      <footer className="mt-10 text-xs text-muted-foreground">
        <Link href="/api/lti/jwks" className="underline">
          View JWKS
        </Link>
      </footer>
    </main>
  );
}
