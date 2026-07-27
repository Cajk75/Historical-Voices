// Conversational engine adapter.
// mock  -> deterministic, persona-flavored canned replies (no key needed).
// openai -> gpt-4o-mini with the persona system prompt.

import { env } from "@/lib/env";
import { getPersona } from "@/lib/personas";

export type ChatMessage = { role: "student" | "persona"; text: string };

export async function generatePersonaReply(
  personaSlug: string,
  history: ChatMessage[]
): Promise<string> {
  const persona = getPersona(personaSlug);
  if (!persona) throw new Error(`Unknown persona: ${personaSlug}`);

  if (env.chat.provider === "openai" && env.chat.openaiKey) {
    return openaiReply(personaSlug, history);
  }
  return mockReply(personaSlug, history);
}

// ---- OpenAI ----
async function openaiReply(
  personaSlug: string,
  history: ChatMessage[]
): Promise<string> {
  const persona = getPersona(personaSlug)!;
  // Lazy import so the app builds/runs without the package configured.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.chat.openaiKey });

  const messages = [
    { role: "system" as const, content: persona.systemPrompt },
    ...history.map((m) => ({
      role: (m.role === "student" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.text,
    })),
  ];

  const completion = await client.chat.completions.create({
    model: env.chat.model,
    messages,
    temperature: 0.8,
    max_tokens: 160,
  });
  return (
    completion.choices[0]?.message?.content?.trim() ??
    "Forgive me, my thoughts wandered. Could you say that again?"
  );
}

// ---- Mock ----
// Produces a plausible, in-character, ESL-friendly reply without any API.
function mockReply(personaSlug: string, history: ChatMessage[]): string {
  const persona = getPersona(personaSlug)!;
  const lastStudent = [...history].reverse().find((m) => m.role === "student");
  const turnCount = history.filter((m) => m.role === "persona").length;

  if (!lastStudent) return persona.greeting;

  const echo = lastStudent.text.trim().replace(/[.?!]+$/, "");
  const followUps: Record<string, string[]> = {
    lincoln: [
      `That is well said. When you speak of "${short(echo)}", I hear a good heart. Now tell me — do you think all people are truly equal? Why?`,
      `You understand more than you know. In my time, the nation was divided. What do you think unites people, even in hard times?`,
      `A fine thought. Remember, the work belongs to the living. What would you do to help others be free?`,
    ],
    kahlo: [
      `Ah, "${short(echo)}" — yes! I painted my truth, my pain, my joy. And you, what feeling would you paint if you could? Tell me.`,
      `You feel it, I can tell. Color is a language. Which color speaks for your heart today, and why?`,
      `Bueno — that means "good." Life is hard, but we say Viva la vida. What gives you strength when things are difficult?`,
    ],
    roosevelt: [
      `Thank you for that. "${short(echo)}" is a thoughtful start. Rights begin in small places — your home, your school. Where do you see fairness, or unfairness, near you?`,
      `Well reasoned. Dignity means being treated with respect. Can you describe a time someone treated you with dignity?`,
      `You are learning quickly. Every citizen has a part to play. What small action could you take to help someone's rights?`,
    ],
  };
  const bank = followUps[personaSlug] ?? followUps.lincoln;
  return bank[turnCount % bank.length];
}

function short(s: string): string {
  const words = s.split(/\s+/).slice(0, 6).join(" ");
  return words.length ? words : "what you shared";
}
