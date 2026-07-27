// Server-side helper: read + verify the app session cookie set at launch.
import { cookies } from "next/headers";
import {
  APP_SESSION_COOKIE,
  verifyAppSession,
  type AppSession,
} from "@/lib/lti/session-jwt";

export async function getCurrentAppSession(): Promise<AppSession | null> {
  const token = cookies().get(APP_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyAppSession(token);
  } catch {
    return null;
  }
}
