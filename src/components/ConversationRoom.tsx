"use client";

// The live conversation experience, built around an explicit turn-taking
// state machine so students always know what to do:
//
//   speaking   -> persona is talking (tap to skip ahead)
//   your_turn  -> big pulsing mic CTA: "Your turn — tap and speak"
//   listening  -> recording with live transcript; tap stop (or pause) to send
//   thinking   -> persona is composing a reply
//
// A visible goal ("Replies: 2 of 4") plus a finish banner make completion
// obvious. Voice comes from /api/tts + /api/conversation (OpenAI TTS when
// configured); STT uses the browser SpeechRecognition with typing fallback.

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
type Phase = "speaking" | "your_turn" | "listening" | "thinking";

// How many replies we ask students for before "Finish" is encouraged.
const GOAL_TURNS = 4;

export function ConversationRoom({
  sessionId,
  persona,
}: {
  sessionId: string;
  persona: Persona;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([
    { role: "persona", text: persona.greeting },
  ]);
  const [phase, setPhase] = useState<Phase>("speaking");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lang, setLang] = useState<Lang>("ES");
  const [micSupported, setMicSupported] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const shouldSendRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const studentTurns = lines.filter((l) => l.role === "student").length;
  const goalReached = studentTurns >= GOAL_TURNS;

  // Single audio element for TTS playback; measured for mouth animation.
  useEffect(() => {
    const el = new Audio();
    audioRef.current = el;
    setAudioEl(el);
  }, []);
  const audioLevel = useAudioLevel(audioEl, phase === "speaking");

  // ---- speak persona lines ----
  const speak = useCallback(
    (text: string, audioUrl: string | null) => {
      setPhase("speaking");
      const done = () => setPhase("your_turn");

      if (audioUrl) {
        const el = audioRef.current ?? new Audio();
        audioRef.current = el;
        el.src = audioUrl;
        el.onended = done;
        el.onerror = done;
        el.play().catch(done);
        return;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } else {
        setTimeout(done, Math.min(4000, 800 + text.length * 35));
      }
    },
    []
  );

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPhase("your_turn");
  }, []);

  // Greeting with real TTS on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, text: persona.greeting }),
        });
        const data = res.ok ? await res.json() : { audioUrl: null };
        if (!cancelled) speak(persona.greeting, data.audioUrl ?? null);
      } catch {
        if (!cancelled) speak(persona.greeting, null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines, phase]);

  // ---- send a turn ----
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setPhase("thinking");
      setShowHelp(false);
      setTyped("");
      setLiveTranscript("");
      setLines((l) => [...l, { role: "student", text: trimmed }]);

      try {
        const res = await fetch("/api/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, text: trimmed }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLines((l) => [...l, { role: "persona", text: data.reply }]);
        speak(data.reply, data.audioUrl ?? null);
      } catch {
        setLines((l) => [
          ...l,
          {
            role: "persona",
            text: "Forgive me — I lost my train of thought. Could you try again?",
          },
        ]);
        setPhase("your_turn");
      }
    },
    [sessionId, speak]
  );

  // ---- speech recognition ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMicSupported(false);
      setShowTyping(true);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      transcriptRef.current = transcript;
      setLiveTranscript(transcript);
    };
    rec.onend = () => {
      // Recognition stopped (user tapped stop, or silence timeout).
      if (shouldSendRef.current && transcriptRef.current.trim()) {
        shouldSendRef.current = false;
        send(transcriptRef.current);
      } else {
        shouldSendRef.current = false;
        setPhase((p) => (p === "listening" ? "your_turn" : p));
      }
    };
    rec.onerror = () => {
      shouldSendRef.current = false;
      setPhase((p) => (p === "listening" ? "your_turn" : p));
    };
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    };
  }, [send]);

  const startListening = () => {
    const rec = recognitionRef.current;
    if (!rec) {
      setShowTyping(true);
      return;
    }
    stopSpeaking();
    transcriptRef.current = "";
    setLiveTranscript("");
    try {
      rec.start();
      setPhase("listening");
    } catch {
      /* already running */
    }
  };

  const stopAndSend = () => {
    const rec = recognitionRef.current;
    shouldSendRef.current = true;
    try {
      rec?.stop();
    } catch {
      // If stop fails, send whatever we have.
      if (transcriptRef.current.trim()) send(transcriptRef.current);
    }
  };

  const cancelListening = () => {
    shouldSendRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setPhase("your_turn");
    setLiveTranscript("");
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
              {persona.title}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* progress goal */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              goalReached
                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                : "bg-secondary text-secondary-foreground"
            }`}
            title={`Reply ${GOAL_TURNS} times, then finish to get your grade`}
          >
            {goalReached ? "✓" : "🎯"} Replies: {Math.min(studentTurns, GOAL_TURNS)}/
            {GOAL_TURNS}
          </div>
          <Button
            variant={goalReached ? "default" : "outline"}
            size="sm"
            onClick={() => router.push(`/session/${sessionId}/feedback`)}
            disabled={studentTurns < 1}
            title={
              studentTurns < 1
                ? "Reply at least once first"
                : "End and get your feedback + grade"
            }
          >
            Finish {goalReached ? "→" : ""}
          </Button>
        </div>
      </div>

      {/* goal-reached banner */}
      {goalReached && phase === "your_turn" && (
        <div className="mb-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
          🎉 You reached the goal! Press <b>Finish</b> for your feedback and
          grade — or keep talking for extra practice.
        </div>
      )}

      {/* split view */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_1.1fr]">
        <div className="hidden min-h-0 lg:block">
          <AvatarStage
            name={persona.name}
            personaSlug={persona.slug}
            accentColor={persona.accentColor}
            speaking={phase === "speaking"}
            listening={phase === "listening"}
            audioLevel={audioLevel}
          />
        </div>

        {/* transcript + controls */}
        <div className="flex min-h-0 flex-col rounded-xl border bg-card">
          {/* always-visible animated avatar in embedded/small layouts */}
          <div className="lg:hidden">
            <AvatarStage
              name={persona.name}
              personaSlug={persona.slug}
              accentColor={persona.accentColor}
              speaking={phase === "speaking"}
              listening={phase === "listening"}
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
            {phase === "thinking" && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-secondary px-4 py-2 text-sm text-muted-foreground">
                  {persona.name} is thinking…
                </div>
              </div>
            )}
            {phase === "listening" && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl border-2 border-dashed border-destructive/50 bg-destructive/5 px-4 py-2 text-[0.95rem] italic text-muted-foreground">
                  {liveTranscript || "Listening… start speaking"}
                </div>
              </div>
            )}
          </div>

          {/* Help Me Answer */}
          {showHelp && phase === "your_turn" && (
            <div className="border-t bg-accent/40 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Try starting your answer with…
              </p>
              <div className="flex flex-wrap gap-2">
                {persona.starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setShowTyping(true);
                      setTyped(s + " ");
                      setShowHelp(false);
                    }}
                    className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-accent"
                  >
                    “{s}”
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---- state-driven control bar ---- */}
          <div className="border-t p-3">
            {phase === "speaking" && (
              <div className="flex flex-col items-center gap-1 py-1">
                <button
                  onClick={stopSpeaking}
                  className="text-sm font-medium text-muted-foreground underline underline-offset-4"
                >
                  🔊 {persona.name} is speaking — tap to skip
                </button>
              </div>
            )}

            {phase === "thinking" && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                {persona.name} is thinking…
              </div>
            )}

            {phase === "your_turn" && (
              <div className="flex flex-col items-center gap-2">
                {micSupported && !showTyping && (
                  <>
                    <button
                      onClick={startListening}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
                      style={{ animation: "hv-cta-pulse 2s ease-out infinite" }}
                      aria-label="Tap to speak your answer"
                    >
                      🎙️
                    </button>
                    <p className="text-sm font-semibold text-foreground">
                      Your turn — tap and speak in English
                    </p>
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        onClick={() => setShowTyping(true)}
                        className="text-muted-foreground underline underline-offset-4"
                      >
                        ⌨️ type instead
                      </button>
                      <button
                        onClick={() => setShowHelp((v) => !v)}
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        💬 help me answer
                      </button>
                    </div>
                  </>
                )}

                {(showTyping || !micSupported) && (
                  <div className="w-full">
                    <div className="flex items-end gap-2">
                      {micSupported && (
                        <button
                          onClick={startListening}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground hover:bg-primary/90"
                          aria-label="Speak instead"
                        >
                          🎙️
                        </button>
                      )}
                      <textarea
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send(typed);
                          }
                        }}
                        rows={1}
                        autoFocus
                        placeholder="Type your reply in English…"
                        className="max-h-28 min-h-[44px] flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button onClick={() => send(typed)} disabled={!typed.trim()}>
                        Send
                      </Button>
                    </div>
                    <div className="mt-1.5 text-center">
                      <button
                        onClick={() => setShowHelp((v) => !v)}
                        className="text-xs font-medium text-primary underline underline-offset-4"
                      >
                        💬 help me answer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {phase === "listening" && (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={stopAndSend}
                  className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-destructive text-2xl text-destructive-foreground shadow-lg"
                  aria-label="Tap when you finish speaking"
                >
                  ⏹
                </button>
                <p className="text-sm font-semibold text-destructive">
                  Listening… tap ⏹ when you finish
                </p>
                <button
                  onClick={cancelListening}
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <audio ref={audioRef} className="hidden" />
      <style jsx global>{`
        @keyframes hv-cta-pulse {
          0% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0.45);
          }
          70% {
            box-shadow: 0 0 0 18px hsl(var(--primary) / 0);
          }
          100% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0);
          }
        }
      `}</style>
    </main>
  );
}
