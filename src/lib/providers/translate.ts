// Translation / ESL gloss adapter for hover-to-translate subtitles.
// mock   -> a small built-in ES/PT dictionary + heuristic passthrough.
// deepl  -> DeepL API (free tier supported via api-free.deepl.com).
// google -> Google Cloud Translation v2.

import { env } from "@/lib/env";

export type Lang = "ES" | "PT";

export type GlossResult = {
  source: string;
  target: string;
  lang: Lang;
  // A simplified English synonym / definition to scaffold comprehension.
  simpleEnglish?: string;
  provider: string;
};

export async function glossText(
  text: string,
  lang: Lang
): Promise<GlossResult> {
  const trimmed = text.trim();
  if (env.translate.provider === "deepl" && env.translate.deeplKey) {
    return deepl(trimmed, lang);
  }
  if (env.translate.provider === "google" && env.translate.googleKey) {
    return google(trimmed, lang);
  }
  return mockGloss(trimmed, lang);
}

async function deepl(text: string, lang: Lang): Promise<GlossResult> {
  const host = env.translate.deeplKey.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
  const res = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${env.translate.deeplKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ text, target_lang: lang }),
  });
  if (!res.ok) return mockGloss(text, lang);
  const json = (await res.json()) as any;
  return {
    source: text,
    target: json?.translations?.[0]?.text ?? text,
    lang,
    simpleEnglish: SIMPLE_ENGLISH[text.toLowerCase()],
    provider: "deepl",
  };
}

async function google(text: string, lang: Lang): Promise<GlossResult> {
  const target = lang === "ES" ? "es" : "pt";
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${env.translate.googleKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, target, source: "en", format: "text" }),
    }
  );
  if (!res.ok) return mockGloss(text, lang);
  const json = (await res.json()) as any;
  return {
    source: text,
    target: json?.data?.translations?.[0]?.translatedText ?? text,
    lang,
    simpleEnglish: SIMPLE_ENGLISH[text.toLowerCase()],
    provider: "google",
  };
}

// A tiny offline dictionary so hover-translate is demonstrable with no keys.
const DICT_ES: Record<string, string> = {
  liberty: "libertad",
  equal: "igual",
  nation: "nación",
  people: "gente / pueblo",
  rights: "derechos",
  dignity: "dignidad",
  freedom: "libertad",
  war: "guerra",
  peace: "paz",
  painting: "pintura",
  pain: "dolor",
  life: "vida",
  home: "hogar / casa",
  world: "mundo",
  justice: "justicia",
  equality: "igualdad",
  understand: "entender",
  remember: "recordar",
  brave: "valiente",
  heart: "corazón",
};
const DICT_PT: Record<string, string> = {
  liberty: "liberdade",
  equal: "igual",
  nation: "nação",
  people: "povo",
  rights: "direitos",
  dignity: "dignidade",
  freedom: "liberdade",
  war: "guerra",
  peace: "paz",
  painting: "pintura",
  pain: "dor",
  life: "vida",
  home: "lar / casa",
  world: "mundo",
  justice: "justiça",
  equality: "igualdade",
  understand: "entender",
  remember: "lembrar",
  brave: "corajoso",
  heart: "coração",
};
const SIMPLE_ENGLISH: Record<string, string> = {
  liberty: "freedom",
  consecrate: "make holy / honor",
  hallow: "make special / honor",
  proposition: "idea",
  endure: "last / survive",
  dignity: "self-respect",
  discrimination: "unfair treatment",
  threshold: "the beginning",
  sorrow: "deep sadness",
  contribution: "helpful part",
};

function mockGloss(text: string, lang: Lang): GlossResult {
  const key = text.toLowerCase().replace(/[.,!?;:]/g, "");
  const dict = lang === "ES" ? DICT_ES : DICT_PT;
  const oneWord = key.split(/\s+/).length === 1;
  const target =
    (oneWord && dict[key]) ||
    `[${lang}] ${text}`; // sentence-level: passthrough marker in mock mode
  return {
    source: text,
    target,
    lang,
    simpleEnglish: oneWord ? SIMPLE_ENGLISH[key] : undefined,
    provider: "mock-dictionary",
  };
}
