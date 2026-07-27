"use client";

// The live conversation experience. Split view:
//   left  = animated avatar (AvatarStage)
//   right = rolling subtitle/transcript stream with hover-translate + controls
//
// Speech-to-text uses the browser Web Speech API (SpeechRecognition) in mock
// mode — zero latency, no key. When DEEPGRAM is configured you'd stream mic
// audio to /api/stt instead; the transcript contract is identical.
// Text-to-speech plays an audio data URL from the server when ElevenLabs is
// configured, else falls back to browser speechSynthesis.

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AvatarStage } from "@/components/AvatarStage";
import { GlossText, LangToggle, type Lang } from "@/components/Gloss";
import { Button } from "@/components/ui/button";

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
  const [input, setInput] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lang, setLang] = useState<Lang>("ES");
  const [micSupported, setMicSupported] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Speak the persona greeting once on mount — with the real voice when a TTS
  // provider is configured (fetched from /api/tts), else browser fallback.
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

  // Autoscroll the transcript.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines]);

  // ---- Text to speech ----
  const speak = useCallback(
    (text: string, audioUrl: string | null) => {
      setSpeaking(true);
      const done = () => setSpeaking(false);

      if (audioUrl) {
        const el = audioRef.current ?? new Audio();
        audioRef.current = el;
        el.src = audioUrl;
        el.onended = done;
        el.onerror = done;
        el.play().catch(done);
        return;
      }
      // Browser fallback.
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = persona.slug === "kahlo" ? 1.15 : 0.95;
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } else {
        // No TTS available: show speaking briefly for the animation.
        setTimeout(done, Math.min(4000, 800 + text.length * 35));
      }
    },
    [persona.slug]
  );

  // ---- Speech to text (browser) ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMicSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  const toggleMic = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      window.speechSynthesis?.cancel();
      setInput("");
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already started */
      }
    }
  };

  // ---- Send a turn ----
  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setShowHelp(false);
    setInput("");
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
    } finally {
      setBusy(false);
    }
  };

  const studentTurns = lines.filter((l) => l.role === "student").length;

  return (
    <main className="mx-auto flex h-screen max-w-6xl flex-col px-4 py-4">
      {/* header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-full bg-cover bg-center ring-2 ring-primary/30"
            style={{ backgroundImage: `url(${persona.portrait})` }}
          />
          <div>
            <h1 className="text-lg font-bold leading-tight">{persona.name}</h1>
            <p className="text-xs text-muted-foreground">{persona.title}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(`/session/${sessionId}/feedback`)}
          disabled={studentTurns < 1}
          title={
            studentTurns < 1 ? "Say at least one thing first" : "End & get feedback"
          }
        >
          Finish session →
        </Button>
      </div>

      {/* split view */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* avatar */}
        <div className="min-h-0">
          <AvatarStage
            name={persona.name}
            portrait={persona.portrait}
            accentColor={persona.accentColor}
            speaking={speaking}
            listening={listening}
          />
        </div>

        {/* transcript + controls */}
        <div className="flex min-h-0 flex-col rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-medium">Live subtitles</span>
            <LangToggle lang={lang} setLang={setLang} />
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {lines.map((line, i) => (
              <div
                key={i}
                className={
                  line.role === "student" ? "flex justify-end" : "flex justify-start"
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
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-secondary px-4 py-2 text-sm text-muted-foreground">
                  {persona.name} is thinking…
                </div>
              </div>
            )}
          </div>

          {/* Help Me Answer */}
          {showHelp && (
            <div className="border-t bg-accent/40 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Try starting your answer with…
              </p>
              <div className="flex flex-wrap gap-2">
                {persona.starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s + " ");
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

          {/* controls */}
          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <button
                onClick={toggleMic}
                disabled={!micSupported || busy}
                title={
                  micSupported
                    ? "Hold a conversation — click to talk"
                    : "Microphone speech recognition not supported in this browser; type instead"
                }
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-colors ${
                  listening
                    ? "animate-pulse bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                }`}
              >
                {listening ? "■" : "🎙️"}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={
                  listening ? "Listening…" : "Speak or type your reply in English…"
                }
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button onClick={() => send(input)} disabled={busy || !input.trim()}>
                Send
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => setShowHelp((v) => !v)}
                className="text-xs font-medium text-primary underline underline-offset-4"
              >
                💬 Help me answer
              </button>
              <span className="text-xs text-muted-foreground">
                {studentTurns} reply{studentTurns === 1 ? "" : "ies"} · hover a
                word to translate
              </span>
            </div>
          </div>
        </div>
      </div>
      <audio ref={audioRef} className="hidden" />
    </main>
  );
}
