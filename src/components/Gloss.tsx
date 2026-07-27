"use client";

// Shared hover-translate primitives used by both the pre-reading page and the
// live subtitle stream. GlossText renders text with every content word
// hover-translatable into the given target language.

import { useState, useCallback, useRef } from "react";

export type Lang = "ES" | "PT";

type Gloss = { target: string; simpleEnglish?: string; provider: string };

const cache = new Map<string, Gloss>();

export function GlossText({ text, lang }: { text: string; lang: Lang }) {
  return (
    <>
      {text.split(/(\s+)/).map((tok, j) =>
        /\S/.test(tok) ? (
          <GlossWord key={j} word={tok} lang={lang} />
        ) : (
          <span key={j}>{tok}</span>
        )
      )}
    </>
  );
}

export function GlossWord({ word, lang }: { word: string; lang: Lang }) {
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [open, setOpen] = useState(false);
  const clean = word.replace(/[^A-Za-zÀ-ÿ']/g, "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!clean) return;
    const key = `${lang}:${clean.toLowerCase()}`;
    if (cache.has(key)) return setGloss(cache.get(key)!);
    try {
      const res = await fetch(
        `/api/translate?text=${encodeURIComponent(clean)}&lang=${lang}`
      );
      const data = (await res.json()) as Gloss;
      cache.set(key, data);
      setGloss(data);
    } catch {
      /* ignore */
    }
  }, [clean, lang]);

  if (!clean) return <span>{word}</span>;

  return (
    <span
      className="gloss-word relative"
      onMouseEnter={() => {
        timer.current = setTimeout(() => {
          setOpen(true);
          load();
        }, 120);
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current);
        setOpen(false);
      }}
    >
      {word}
      {open && (
        <span className="absolute bottom-full left-1/2 z-30 mb-1 w-max max-w-xs -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-sm shadow-lg">
          <span className="block font-semibold text-primary">
            {gloss?.target ?? "…"}
          </span>
          {gloss?.simpleEnglish && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              ≈ {gloss.simpleEnglish}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function LangToggle({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Translate:</span>
      {(["ES", "PT"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
            lang === l
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
        >
          {l === "ES" ? "ES" : "PT"}
        </button>
      ))}
    </div>
  );
}
