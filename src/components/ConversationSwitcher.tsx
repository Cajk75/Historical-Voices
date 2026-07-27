"use client";

// Chooses the conversation experience: LIVE (Realtime API, hands-free) when
// the browser supports mic capture, with automatic fallback to the classic
// tap-to-talk ConversationRoom on any failure (no mic, blocked iframe
// permission, network, API error).

import { useEffect, useState } from "react";
import { LiveConversation } from "@/components/LiveConversation";
import { ConversationRoom } from "@/components/ConversationRoom";

type Persona = {
  slug: string;
  name: string;
  title: string;
  portrait: string;
  accentColor: string;
  greeting: string;
  starters: string[];
};

export function ConversationSwitcher({
  sessionId,
  persona,
}: {
  sessionId: string;
  persona: Persona;
}) {
  // Decide the mode only after mount — the server can't know mic capability,
  // and diverging from the SSR output causes hydration errors.
  const [mode, setMode] = useState<"live" | "classic" | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  useEffect(() => {
    const micCapable =
      !!navigator.mediaDevices?.getUserMedia &&
      typeof RTCPeerConnection !== "undefined";
    setMode(micCapable ? "live" : "classic");
  }, []);

  if (mode === null) {
    return (
      <main className="flex h-screen items-center justify-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </main>
    );
  }

  if (mode === "live") {
    return (
      <LiveConversation
        sessionId={sessionId}
        persona={persona}
        onFallback={(reason) => {
          setFallbackReason(reason);
          setMode("classic");
        }}
      />
    );
  }

  return (
    <>
      {fallbackReason && (
        <div className="mx-auto max-w-6xl px-4 pt-2">
          <p className="rounded-lg bg-accent/60 px-3 py-1.5 text-xs text-muted-foreground">
            Live voice unavailable ({fallbackReason}) — using tap-to-talk mode.
          </p>
        </div>
      )}
      <ConversationRoom sessionId={sessionId} persona={persona} />
    </>
  );
}
