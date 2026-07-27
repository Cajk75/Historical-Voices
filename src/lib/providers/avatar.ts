// Avatar / real-time lipsync adapter.
// mock  -> returns config for a CSS-animated portrait that "talks" while audio
//          plays (no external service, no cost).
// did   -> creates a D-ID streaming (WebRTC) session; returns SDP/ICE offer.
// simli -> returns Simli session credentials for the client SDK.
//
// The client reads `provider` and renders the matching avatar component.

import { env } from "@/lib/env";
import { getPersona } from "@/lib/personas";

export type AvatarSession = {
  provider: "mock" | "did" | "simli";
  personaSlug: string;
  portrait: string;
  // Real providers populate connection details for the browser SDK to consume.
  connection?: Record<string, unknown>;
  note?: string;
};

export async function createAvatarSession(
  personaSlug: string
): Promise<AvatarSession> {
  const persona = getPersona(personaSlug);
  if (!persona) throw new Error(`Unknown persona: ${personaSlug}`);

  if (env.avatar.provider === "did" && env.avatar.didKey) {
    return didSession(personaSlug, persona.portrait);
  }
  if (env.avatar.provider === "simli" && env.avatar.simliKey) {
    return {
      provider: "simli",
      personaSlug,
      portrait: persona.portrait,
      connection: { apiKeyConfigured: true },
      note: "Provide a Simli faceId per persona and initialize the Simli client SDK on the frontend.",
    };
  }
  return {
    provider: "mock",
    personaSlug,
    portrait: persona.portrait,
    note: "Animated portrait synced to audio amplitude. No external avatar service.",
  };
}

// D-ID Streams: create a stream, return the id + offer for the browser to answer.
// Stubbed to the documented shape; wire real replicas/presenters when keys exist.
async function didSession(
  personaSlug: string,
  portrait: string
): Promise<AvatarSession> {
  try {
    const res = await fetch("https://api.d-id.com/talks/streams", {
      method: "POST",
      headers: {
        Authorization: `Basic ${env.avatar.didKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_url: `${env.appUrl}${portrait}`,
      }),
    });
    if (!res.ok) throw new Error(`D-ID ${res.status}`);
    const json = (await res.json()) as any;
    return {
      provider: "did",
      personaSlug,
      portrait,
      connection: {
        streamId: json.id,
        sessionId: json.session_id,
        offer: json.offer,
        iceServers: json.ice_servers,
      },
    };
  } catch (e) {
    // Fail soft to mock so a session is never blocked by avatar issues.
    return {
      provider: "mock",
      personaSlug,
      portrait,
      note: `D-ID unavailable (${(e as Error).message}); using animated portrait.`,
    };
  }
}
