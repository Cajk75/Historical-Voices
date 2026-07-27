"use client";

// The avatar presentation. Renders the amplitude-animated PersonaFace (mouth
// synced to real audio via `audioLevel`), with a pulsing halo and status badge.
// `compact` is the horizontal band used in embedded/iframe layouts.

import { PersonaFace } from "@/components/PersonaFace";

export function AvatarStage({
  name,
  personaSlug,
  accentColor,
  speaking,
  listening,
  audioLevel = 0,
  compact = false,
}: {
  name: string;
  personaSlug: string;
  accentColor: string;
  speaking: boolean;
  listening: boolean;
  audioLevel?: number;
  compact?: boolean;
}) {
  const bars = (count: number, cls: string) => (
    <div className={`flex items-end gap-1 ${cls}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="w-1 rounded-full transition-all duration-75"
          style={{
            backgroundColor: `hsl(${accentColor})`,
            height: speaking
              ? `${5 + audioLevel * (14 + ((i * 7) % 11))}px`
              : "5px",
          }}
        />
      ))}
    </div>
  );

  if (compact) {
    return (
      <div
        className="relative flex w-full items-center justify-center gap-4 overflow-hidden rounded-t-xl py-3"
        style={{
          background: `radial-gradient(circle at 50% 0%, hsl(${accentColor} / 0.22), hsl(${accentColor} / 0.04))`,
        }}
      >
        <div className="relative flex items-center justify-center">
          <div
            className="absolute h-20 w-20 rounded-full"
            style={{
              animation: speaking ? "hv-pulse-sm 1.4s ease-out infinite" : "none",
            }}
          />
          <div
            className="relative h-[5rem] w-[5rem] overflow-hidden rounded-full border-2"
            style={{ borderColor: `hsl(${accentColor})` }}
            aria-label={`${name} avatar`}
          >
            <PersonaFace slug={personaSlug} level={audioLevel} speaking={speaking} />
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          {bars(7, "h-6")}
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: `hsl(${accentColor} / 0.15)`,
              color: `hsl(${accentColor})`,
            }}
          >
            {speaking ? "🔊 Speaking…" : listening ? "🎙️ Listening…" : "● Live"}
          </span>
        </div>
        <style jsx>{`
          @keyframes hv-pulse-sm {
            0% {
              box-shadow: 0 0 0 0 hsl(${accentColor} / 0.45);
            }
            100% {
              box-shadow: 0 0 0 22px hsl(${accentColor} / 0);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-[320px] w-full flex-col items-center justify-center overflow-hidden rounded-xl"
      style={{
        background: `radial-gradient(circle at 50% 30%, hsl(${accentColor} / 0.25), hsl(${accentColor} / 0.05))`,
      }}
    >
      <div
        className="absolute h-56 w-56 rounded-full"
        style={{
          animation: speaking ? "hv-pulse 1.4s ease-out infinite" : "none",
        }}
      />
      <div
        className="relative h-52 w-52 overflow-hidden rounded-full ring-4"
        style={{
          // @ts-expect-error CSS var passthrough
          "--tw-ring-color": `hsl(${accentColor})`,
        }}
        aria-label={`${name} avatar`}
      >
        <PersonaFace slug={personaSlug} level={audioLevel} speaking={speaking} />
      </div>

      <div className="mt-5">{bars(9, "h-8")}</div>

      <div className="absolute bottom-3 left-3 rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white backdrop-blur">
        {speaking ? "🔊 Speaking…" : listening ? "🎙️ Listening…" : "● Live"}
      </div>

      <style jsx>{`
        @keyframes hv-pulse {
          0% {
            box-shadow: 0 0 0 0 hsl(${accentColor} / 0.5);
          }
          100% {
            box-shadow: 0 0 0 40px hsl(${accentColor} / 0);
          }
        }
      `}</style>
    </div>
  );
}
