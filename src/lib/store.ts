// Session store abstraction.
// Uses Prisma/Postgres when DATABASE_URL is set; otherwise an in-memory map so
// the whole app runs locally with zero infrastructure. The public API is the
// same either way, so routes never care which backend is active.

import { getPrisma } from "@/lib/db";
import type { ChatMessage } from "@/lib/providers/chat";
import type { Evaluation } from "@/lib/providers/feedback";

export type LearningSession = {
  id: string;
  issuer: string;
  clientId: string;
  ltiUserId: string;
  userName: string | null;
  roles: string[];
  contextId: string | null;
  resourceId: string | null;
  personaSlug: string;
  lineitemUrl: string | null;
  agsScopes: string[];
  status: "READING" | "CONVERSING" | "EVALUATED" | "GRADED";
  score: number | null;
  cefrLevel: string | null;
  turns: ChatMessage[];
  feedback: Evaluation | null;
  createdAt: number;
};

export type NewSessionInput = {
  issuer: string;
  clientId: string;
  ltiUserId: string;
  userName?: string | null;
  roles?: string[];
  contextId?: string | null;
  resourceId?: string | null;
  personaSlug: string;
  lineitemUrl?: string | null;
  agsScopes?: string[];
};

// ---- In-memory backend (dev / keyless) ----
// Held on globalThis so the map survives module reloads AND is shared across
// Next's separate module registries for route handlers vs. server components.
const globalForMem = globalThis as unknown as {
  __hvSessions?: Map<string, LearningSession>;
};
const mem: Map<string, LearningSession> =
  globalForMem.__hvSessions ?? (globalForMem.__hvSessions = new Map());

function genId(): string {
  // Stable, URL-safe id without extra deps.
  return (
    "s_" +
    Array.from({ length: 20 }, () =>
      "abcdefghijklmnopqrstuvwxyz0123456789".charAt(
        Math.floor(Math.random() * 36)
      )
    ).join("")
  );
}

export async function createSession(
  input: NewSessionInput
): Promise<LearningSession> {
  const prisma = getPrisma();
  if (prisma) {
    const s = await prisma.session.create({
      data: {
        issuer: input.issuer,
        clientId: input.clientId,
        ltiUserId: input.ltiUserId,
        userName: input.userName ?? null,
        roles: input.roles ?? [],
        contextId: input.contextId ?? null,
        resourceId: input.resourceId ?? null,
        personaSlug: input.personaSlug,
        lineitemUrl: input.lineitemUrl ?? null,
        agsScopes: input.agsScopes ?? [],
      },
    });
    return dbToSession(s, [], null);
  }

  const session: LearningSession = {
    id: genId(),
    issuer: input.issuer,
    clientId: input.clientId,
    ltiUserId: input.ltiUserId,
    userName: input.userName ?? null,
    roles: input.roles ?? [],
    contextId: input.contextId ?? null,
    resourceId: input.resourceId ?? null,
    personaSlug: input.personaSlug,
    lineitemUrl: input.lineitemUrl ?? null,
    agsScopes: input.agsScopes ?? [],
    status: "READING",
    score: null,
    cefrLevel: null,
    turns: [],
    feedback: null,
    createdAt: Date.now(),
  };
  mem.set(session.id, session);
  return session;
}

export async function getSession(
  id: string
): Promise<LearningSession | null> {
  const prisma = getPrisma();
  if (prisma) {
    const s = await prisma.session.findUnique({
      where: { id },
      include: { turns: { orderBy: { createdAt: "asc" } }, feedback: true },
    });
    if (!s) return null;
    const turns: ChatMessage[] = s.turns.map((t: any) => ({
      role: t.role === "STUDENT" ? "student" : "persona",
      text: t.text,
    }));
    return dbToSession(s, turns, s.feedback);
  }
  return mem.get(id) ?? null;
}

export async function appendTurn(
  id: string,
  turn: ChatMessage
): Promise<void> {
  const prisma = getPrisma();
  if (prisma) {
    await prisma.turn.create({
      data: {
        sessionId: id,
        role: turn.role === "student" ? "STUDENT" : "PERSONA",
        text: turn.text,
      },
    });
    await prisma.session.update({
      where: { id },
      data: { status: "CONVERSING" },
    });
    return;
  }
  const s = mem.get(id);
  if (s) {
    s.turns.push(turn);
    s.status = "CONVERSING";
  }
}

export async function saveFeedback(
  id: string,
  evalResult: Evaluation
): Promise<void> {
  const prisma = getPrisma();
  if (prisma) {
    await prisma.feedback.upsert({
      where: { sessionId: id },
      create: {
        sessionId: id,
        cefrLevel: evalResult.cefrLevel,
        vocabularyScore: evalResult.vocabularyScore,
        grammarScore: evalResult.grammarScore,
        comprehensionScore: evalResult.comprehensionScore,
        overallScore: evalResult.overallScore,
        corrections: evalResult.corrections as any,
        strengths: evalResult.strengths as any,
        summary: evalResult.summary,
      },
      update: {
        cefrLevel: evalResult.cefrLevel,
        vocabularyScore: evalResult.vocabularyScore,
        grammarScore: evalResult.grammarScore,
        comprehensionScore: evalResult.comprehensionScore,
        overallScore: evalResult.overallScore,
        corrections: evalResult.corrections as any,
        strengths: evalResult.strengths as any,
        summary: evalResult.summary,
      },
    });
    await prisma.session.update({
      where: { id },
      data: {
        status: "EVALUATED",
        score: evalResult.overallScore,
        cefrLevel: evalResult.cefrLevel,
      },
    });
    return;
  }
  const s = mem.get(id);
  if (s) {
    s.feedback = evalResult;
    s.status = "EVALUATED";
    s.score = evalResult.overallScore;
    s.cefrLevel = evalResult.cefrLevel;
  }
}

export async function markGraded(id: string): Promise<void> {
  const prisma = getPrisma();
  if (prisma) {
    await prisma.session.update({
      where: { id },
      data: { status: "GRADED" },
    });
    return;
  }
  const s = mem.get(id);
  if (s) s.status = "GRADED";
}

function dbToSession(
  s: any,
  turns: ChatMessage[],
  feedback: any
): LearningSession {
  return {
    id: s.id,
    issuer: s.issuer,
    clientId: s.clientId,
    ltiUserId: s.ltiUserId,
    userName: s.userName ?? null,
    roles: s.roles ?? [],
    contextId: s.contextId ?? null,
    resourceId: s.resourceId ?? null,
    personaSlug: s.personaSlug,
    lineitemUrl: s.lineitemUrl ?? null,
    agsScopes: s.agsScopes ?? [],
    status: s.status,
    score: s.score ?? null,
    cefrLevel: s.cefrLevel ?? null,
    createdAt: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(),
    turns,
    feedback: feedback
      ? {
          cefrLevel: feedback.cefrLevel,
          vocabularyScore: feedback.vocabularyScore,
          grammarScore: feedback.grammarScore,
          comprehensionScore: feedback.comprehensionScore,
          overallScore: feedback.overallScore,
          strengths: feedback.strengths,
          corrections: feedback.corrections,
          summary: feedback.summary,
          provider: "stored",
        }
      : null,
  };
}
