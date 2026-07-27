// Prisma client singleton. Only instantiated when DATABASE_URL is configured.
// In keyless dev mode the app uses the in-memory store instead (see store.ts).

import { env } from "@/lib/env";
import type { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient | null {
  if (!env.db.enabled) return null;
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  // Lazy require so the app builds/runs even before `prisma generate` has run
  // in a keyless environment.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient: PC } = require("@prisma/client");
  prisma = new PC();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma!;
  return prisma;
}
