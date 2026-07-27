"use client";

// Fires the Canvas AGS grade passback when the feedback dashboard loads (for
// learners) and reports the result. Instructors see a note instead of a grade.

import { useEffect, useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; score: number; simulated: boolean; detail: string }
  | { kind: "error"; detail: string };

export function GradeSync({
  sessionId,
  isInstructor,
}: {
  sessionId: string;
  isInstructor: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (isInstructor) return;
    let cancelled = false;
    (async () => {
      setState({ kind: "syncing" });
      try {
        const res = await fetch("/api/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", detail: data.detail ?? data.error });
        } else {
          setState({
            kind: "done",
            score: data.score,
            simulated: data.simulated,
            detail: data.detail,
          });
        }
      } catch (e) {
        if (!cancelled)
          setState({ kind: "error", detail: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, isInstructor]);

  if (isInstructor) {
    return (
      <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        👩‍🏫 Instructor preview — no grade is recorded for instructors.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border p-4 text-sm">
      {state.kind === "syncing" && (
        <span className="text-muted-foreground">
          ⏳ Sending your grade to the Canvas gradebook…
        </span>
      )}
      {state.kind === "done" && (
        <span className="text-green-700 dark:text-green-400">
          ✅ Grade {state.score}/100 {state.simulated ? "prepared" : "posted"} to
          Canvas.
          <span className="block text-xs text-muted-foreground">
            {state.detail}
          </span>
        </span>
      )}
      {state.kind === "error" && (
        <span className="text-destructive">
          ⚠️ Grade sync issue: {state.detail}
        </span>
      )}
    </div>
  );
}
