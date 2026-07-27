// Live Conversation stage (Step 2 of 3). Server component loads the session +
// persona and hands them to the client conversation room.

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/store";
import { getPersona } from "@/lib/personas";
import { getCurrentAppSession } from "@/lib/lti/current";
import { ConversationSwitcher } from "@/components/ConversationSwitcher";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
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
    <ConversationSwitcher
      sessionId={session.id}
      persona={{
        slug: persona.slug,
        name: persona.name,
        title: persona.title,
        portrait: persona.portrait,
        accentColor: persona.accentColor,
        greeting: persona.greeting,
        starters: persona.starters,
      }}
    />
  );
}
