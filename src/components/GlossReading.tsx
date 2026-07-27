"use client";

// Pre-reading text with a language toggle; delegates word rendering to the
// shared Gloss primitives.

import { useState } from "react";
import { GlossText, LangToggle, type Lang } from "@/components/Gloss";

export function GlossReading({ text }: { text: string }) {
  const [lang, setLang] = useState<Lang>("ES");
  const paragraphs = text.split(/\n\n+/);

  return (
    <div>
      <div className="mb-4">
        <LangToggle lang={lang} setLang={setLang} />
      </div>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-4 last:mb-0">
          <GlossText text={p} lang={lang} />
        </p>
      ))}
    </div>
  );
}
