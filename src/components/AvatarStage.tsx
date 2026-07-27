"use client";

// The animated avatar. In mock mode this is a CSS-animated portrait that
// "speaks" (pulsing halo + animated mouth bars) while audio plays. When a real
// provider (D-ID / Simli) is wired, swap the portrait block for the provider's
// <video> element fed by the WebRTC stream — the speaking/idle contract stays.

import { useEffect, useState } from "react";

export function AvatarStage({
  name,
  portrait,
  accentColor,
  speaking,
  listening,
}: {
  name: string;
  portrait: string;
  accentColor: string;
  speaking: boolean;
  listening: boolean;
}) {
  return (
    <div
      className="relative flex h-full min-h-[320px] w-full flex-col items-center justify-center overflow-hidden rounded-xl"
      style={{
        background: `radial-gradient(circle at 50% 30%, hsl(${accentColor} / 0.25), hsl(${accentColor} / 0.05))`,
      }}
    >
      {/* pulsing halo when speaking */}
      <div
        className="absolute h-56 w-56 rounded-full transition-all duration-300"
        style={{
          boxShadow: speaking
            ? `0 0 0 0 hsl(${accentColor} / 0.5)`
            : "none",
          animation: speaking ? "hv-pulse 1.4s ease-out infinite" : "none",
        }}
      />
      <div
        className="relative h-44 w-44 rounded-full bg-cover bg-center ring-4 transition-transform"
        style={{
          backgroundImage: `url(${portrait})`,
          // subtle "nod" while speaking
          transform: speaking ? "scale(1.03)" : "scale(1)",
          // ring color follows accent
          // @ts-expect-error CSS var passthrough
          "--tw-ring-color": `hsl(${accentColor})`,
        }}
        aria-label={`${name} avatar`}
      />

      {/* mouth / amplitude bars */}
      <div className="mt-5 flex h-8 items-end gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-1.5 rounded-full"
            style={{
              backgroundColor: `hsl(${accentColor})`,
              height: speaking ? undefined : "6px",
              animation: speaking
                ? `hv-bars 0.6s ease-in-out ${i * 0.08}s infinite alternate`
                : "none",
            }}
          />
        ))}
      </div>

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
        @keyframes hv-bars {
          from {
            height: 6px;
          }
          to {
            height: 30px;
          }
        }
      `}</style>
    </div>
  );
}
