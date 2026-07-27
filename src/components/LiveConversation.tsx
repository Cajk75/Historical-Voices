"use client";

// LIVE voice conversation via the OpenAI Realtime API over WebRTC.
// The student simply talks — the persona answers in ~1s with natural speech,
// can be interrupted, and the avatar's mouth is driven by the real audio.
// Transcripts stream into the subtitle pane (hover-translatable) and every
// finalized turn is persisted via /api/turns so grading works identically to
// classic mode. On any fatal error we hand control back to the classic
// tap-to-talk experience (onFallback).

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AvatarStage } from "@/components/AvatarStage";
import { GlossText, LangToggle, type Lang } from "@/components/Gloss";
import { Button } from "@/components/ui/button";
import { useAudioLevel } from "@/hooks/useAudioLevel";

type Persona = {
  slug: string;
  name: string;
  title: string;
  portrait: string;
  accentColor: string;
  greeting: string;
  starters: string[];
};

type Line = { role: "student" | "persona"; text: string };
type Status = "connecting" | "live" | "ended" | "error";

const GOAL_TURNS = 4;

export function LiveConversation({
  sessionId,
  persona,
  onFallback,
}: {
  sessionId: string;
  persona: Persona;
  onFallback: (reason: string) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connecting");
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState(""); // persona transcript streaming in
  const [personaTalking, setPersonaTalking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lang, setLang] = useState<Lang>("ES");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const partialRef = useRef("");
  const talkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const audioLevel = useAudioLevel(remoteStream, personaTalking);
  const studentTurns = lines.filter((l) => l.role === "student").length;
  const goalReached = studentTurns >= GOAL_TURNS;

  const persistTurn = useCallback(
    (role: "student" | "persona", text: string) => {
      fetch("/api/turns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, role, text }),
      }).catch(() => {});
    },
    [sessionId]
  );

  // Keep the "speaking" flag alive while transcript deltas arrive.
  const bumpTalking = useCallback(() => {
    setPersonaTalking(true);
    if (talkTimerRef.current) clearTimeout(talkTimerRef.current);
    talkTimerRef.current = setTimeout(() => setPersonaTalking(false), 900);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1. Ephemeral key from our server.
        const tokenRes = await fetch("/api/realtime/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({}));
          throw new Error(err.error ?? `token ${tokenRes.status}`);
        }
        const { clientSecret, model } = await tokenRes.json();
        if (!clientSecret) throw new Error("No client secret returned.");

        // 2. Microphone.
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        micRef.current = mic;

        // 3. WebRTC peer connection to OpenAI.
        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        mic.getTracks().forEach((t) => pc.addTrack(t, mic));

        pc.ontrack = (e) => {
          const stream = e.streams[0];
          setRemoteStream(stream);
          const el = audioElRef.current ?? new Audio();
          audioElRef.current = el;
          el.srcObject = stream;
          el.autoplay = true;
          el.play().catch(() => {});
        };

        const dc = pc.createDataChannel("oai-events");
        dc.onmessage = (e) => {
          let ev: any;
          try {
            ev = JSON.parse(e.data);
          } catch {
            return;
          }
          const t = ev.type as string;

          // Persona speech transcript (GA + beta event names).
          if (
            t === "response.output_audio_transcript.delta" ||
            t === "response.audio_transcript.delta"
          ) {
            partialRef.current += ev.delta ?? "";
            setPartial(partialRef.current);
            bumpTalking();
          } else if (
            t === "response.output_audio_transcript.done" ||
            t === "response.audio_transcript.done"
          ) {
            const text = (ev.transcript ?? partialRef.current).trim();
            partialRef.current = "";
            setPartial("");
            if (text) {
              setLines((l) => [...l, { role: "persona", text }]);
              persistTurn("persona", text);
            }
          } else if (t === "conversation.item.input_audio_transcription.completed") {
            const text = (ev.transcript ?? "").trim();
            if (text) {
              setLines((l) => [...l, { role: "student", text }]);
              persistTurn("student", text);
            }
          } else if (t === "output_audio_buffer.stopped") {
            setPersonaTalking(false);
          } else if (t === "error") {
            // Non-fatal server events are logged; fatal ones end the session.
            console.warn("realtime error event", ev);
          }
        };
        dc.onopen = () => {
          setStatus("live");
          // Ask the persona to open the conversation.
          dc.send(JSON.stringify({ type: "response.create" }));
        };

        pc.onconnectionstatechange = () => {
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setStatus((s) => (s === "live" ? "error" : s));
          }
        };

        // 4. SDP exchange.
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdpRes = await fetch(
          `https://api.openai.com/v1/realtime/calls?model=${model}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${clientSecret}`,
              "Content-Type": "application/sdp",
            },
            body: offer.sdp,
          }
        );
        if (!sdpRes.ok) throw new Error(`SDP exchange failed (${sdpRes.status})`);
        const answer = await sdpRes.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      } catch (err) {
        if (!cancelled) {
          console.warn("live conversation failed:", err);
          onFallback((err as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
      micRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      if (talkTimerRef.current) clearTimeout(talkTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines, partial]);

  const toggleMute = () => {
    const mic = micRef.current;
    if (!mic) return;
    const next = !muted;
    mic.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const finish = () => {
    micRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    router.push(`/session/${sessionId}/feedback`);
  };

  return (
    <main className="mx-auto flex h-screen max-w-6xl flex-col px-4 py-3">
      {/* header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-full bg-cover bg-center ring-2 ring-primary/30"
            style={{ backgroundImage: `url(${persona.portrait})` }}
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-tight">
              {persona.name}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {status === "live" ? "🔴 Live conversation" : persona.title}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              goalReached
                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {goalReached ? "✓" : "🎯"} Replies:{" "}
            {Math.min(studentTurns, GOAL_TURNS)}/{GOAL_TURNS}
          </div>
          <Button
            variant={goalReached ? "default" : "outline"}
            size="sm"
            onClick={finish}
            disabled={studentTurns < 1}
            title={
              studentTurns < 1
                ? "Say at least one thing first"
                : "End and get your feedback + grade"
            }
          >
            Finish {goalReached ? "→" : ""}
          </Button>
        </div>
      </div>

      {goalReached && (
        <div className="mb-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
          🎉 You reached the goal! Press <b>Finish</b> for your feedback and
          grade — or keep talking for extra practice.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_1.1fr]">
        <div className="hidden min-h-0 lg:block">
          <AvatarStage
            name={persona.name}
            personaSlug={persona.slug}
            accentColor={persona.accentColor}
            speaking={personaTalking}
            listening={status === "live" && !personaTalking && !muted}
            audioLevel={audioLevel}
          />
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border bg-card">
          <div className="lg:hidden">
            <AvatarStage
              name={persona.name}
              personaSlug={persona.slug}
              accentColor={persona.accentColor}
              speaking={personaTalking}
              listening={status === "live" && !personaTalking && !muted}
              audioLevel={audioLevel}
              compact
            />
          </div>
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-medium">Live subtitles</span>
            <LangToggle lang={lang} setLang={setLang} />
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
          >
            {status === "connecting" && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  Connecting your live conversation with {persona.name}…
                  <br />
                  <span className="text-xs">
                    Your browser will ask for microphone permission.
                  </span>
                </p>
              </div>
            )}
            {lines.map((line, i) => (
              <div
                key={i}
                className={
                  line.role === "student"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-[0.95rem] leading-relaxed ${
                    line.role === "student"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {line.role === "persona" ? (
                    <GlossText text={line.text} lang={lang} />
                  ) : (
                    line.text
                  )}
                </div>
              </div>
            ))}
            {partial && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-secondary px-4 py-2 text-[0.95rem] leading-relaxed text-secondary-foreground opacity-80">
                  {partial}
                </div>
              </div>
            )}
          </div>

          {/* live control bar */}
          <div className="border-t p-3">
            {status === "live" ? (
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={toggleMute}
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow ${
                    muted
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                  title={muted ? "Unmute microphone" : "Mute microphone"}
                >
                  {muted ? "🔇" : "🎙️"}
                </button>
                <div className="text-sm">
                  {muted ? (
                    <span className="font-medium text-destructive">
                      Microphone muted — tap to unmute
                    </span>
                  ) : personaTalking ? (
                    <span className="text-muted-foreground">
                      {persona.name} is speaking — you can interrupt
                    </span>
                  ) : (
                    <span className="font-semibold">
                      Just speak — {persona.name} is listening
                    </span>
                  )}
                </div>
              </div>
            ) : status === "connecting" ? (
              <p className="text-center text-xs text-muted-foreground">
                Trouble connecting?{" "}
                <button
                  onClick={() => onFallback("user chose classic")}
                  className="underline underline-offset-4"
                >
                  Use tap-to-talk mode instead
                </button>
              </p>
            ) : (
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className="text-destructive">Connection lost.</span>
                <button
                  onClick={() => onFallback("connection lost")}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Continue in tap-to-talk mode
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
