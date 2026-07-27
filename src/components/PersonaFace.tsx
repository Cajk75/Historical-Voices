"use client";

// Inline animated SVG faces for the three figures. The mouth opens with the
// live audio level, eyes blink on a natural cadence, and the head bobs subtly
// while speaking. `level` is 0..1 from useAudioLevel.

import { useEffect, useState } from "react";

export function PersonaFace({
  slug,
  level,
  speaking,
}: {
  slug: string;
  level: number;
  speaking: boolean;
}) {
  const [blink, setBlink] = useState(false);

  // Natural-ish blinking: every 2.5–5s, 120ms closed.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => alive && setBlink(false), 120);
        loop();
      }, 2500 + Math.random() * 2500);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // Mouth openness: gate tiny noise, exaggerate speech.
  const open = speaking ? Math.max(0, Math.min(1, level * 1.4 - 0.06)) : 0;
  const bob = speaking ? Math.sin(Date.now() / 260) * level * 3 : 0;
  const eyeRy = blink ? 0.6 : 7;

  const common = {
    style: {
      transform: `translateY(${bob}px) rotate(${bob * 0.25}deg)`,
      transformOrigin: "50% 60%",
      transition: "transform 80ms linear",
      width: "100%",
      height: "100%",
    } as React.CSSProperties,
    viewBox: "0 0 400 400",
    xmlns: "http://www.w3.org/2000/svg",
  };

  if (slug === "kahlo") {
    return (
      <svg {...common} role="img" aria-label="Frida Kahlo">
        <defs>
          <linearGradient id="bgk" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c8467a" />
            <stop offset="1" stopColor="#7a2450" />
          </linearGradient>
        </defs>
        <rect width="400" height="400" fill="url(#bgk)" rx="200" />
        <path
          d="M105 150 Q100 60 200 55 Q300 60 295 150 Q300 100 200 95 Q100 100 105 150Z"
          fill="#1c1109"
        />
        <circle cx="150" cy="80" r="16" fill="#f2c14e" />
        <circle cx="200" cy="68" r="16" fill="#e8563f" />
        <circle cx="250" cy="80" r="16" fill="#f2c14e" />
        <circle cx="150" cy="80" r="6" fill="#7a2450" />
        <circle cx="200" cy="68" r="6" fill="#7a2450" />
        <circle cx="250" cy="80" r="6" fill="#7a2450" />
        <ellipse cx="200" cy="170" rx="82" ry="92" fill="#e3b48c" />
        <path
          d="M158 148 Q200 135 242 148 Q200 143 158 148Z"
          stroke="#1c1109"
          strokeWidth="7"
          fill="none"
        />
        <ellipse cx="170" cy="165" rx="9" ry={eyeRy} fill="#2b1a10" />
        <ellipse cx="230" cy="165" rx="9" ry={eyeRy} fill="#2b1a10" />
        {/* mouth: closed smile -> open ellipse */}
        {open < 0.08 ? (
          <path
            d="M178 212 Q200 224 222 212 Q200 219 178 212Z"
            fill="#a02040"
          />
        ) : (
          <ellipse
            cx="200"
            cy="216"
            rx={13 + open * 6}
            ry={3 + open * 14}
            fill="#5f1023"
          />
        )}
        <path d="M120 300 Q200 250 280 300 L280 400 L120 400Z" fill="#2e8b57" />
        <path
          d="M120 320 Q200 285 280 320"
          stroke="#f2c14e"
          strokeWidth="8"
          fill="none"
        />
      </svg>
    );
  }

  if (slug === "roosevelt") {
    return (
      <svg {...common} role="img" aria-label="Eleanor Roosevelt">
        <defs>
          <linearGradient id="bgr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2f8f74" />
            <stop offset="1" stopColor="#1c5a49" />
          </linearGradient>
        </defs>
        <rect width="400" height="400" fill="url(#bgr)" rx="200" />
        <path
          d="M110 165 Q100 70 200 66 Q300 70 290 165 Q285 110 255 100 Q230 130 200 118 Q170 130 145 100 Q115 110 110 165Z"
          fill="#8a7f74"
        />
        <ellipse cx="200" cy="170" rx="80" ry="90" fill="#ecdccb" />
        <ellipse cx="172" cy="165" rx="8" ry={blink ? 0.6 : 6} fill="#3a3228" />
        <ellipse cx="228" cy="165" rx="8" ry={blink ? 0.6 : 6} fill="#3a3228" />
        {open < 0.08 ? (
          <path
            d="M175 205 Q200 220 225 205"
            stroke="#9a6b5a"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <ellipse
            cx="200"
            cy="210"
            rx={12 + open * 6}
            ry={3 + open * 12}
            fill="#6b3f33"
          />
        )}
        <g fill="#f7f3ea">
          <circle cx="150" cy="272" r="7" />
          <circle cx="172" cy="285" r="7" />
          <circle cx="200" cy="290" r="7" />
          <circle cx="228" cy="285" r="7" />
          <circle cx="250" cy="272" r="7" />
        </g>
        <path d="M130 305 Q200 270 270 305 L270 400 L130 400Z" fill="#3a6b8f" />
      </svg>
    );
  }

  // default: lincoln
  return (
    <svg {...common} role="img" aria-label="Abraham Lincoln">
      <defs>
        <linearGradient id="bgl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b4a7a" />
          <stop offset="1" stopColor="#1b2f52" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#bgl)" rx="200" />
      <circle cx="200" cy="150" r="90" fill="#e8d9c5" />
      <path
        d="M110 140 Q120 55 200 60 Q285 55 292 145 Q270 95 200 92 Q135 92 110 140Z"
        fill="#20160f"
      />
      {/* beard behind the mouth */}
      <path
        d="M120 150 Q130 265 200 285 Q272 265 282 150 Q265 210 200 220 Q138 210 120 150Z"
        fill="#241a12"
      />
      <ellipse cx="168" cy="150" rx="9" ry={eyeRy} fill="#2b2018" />
      <ellipse cx="232" cy="150" rx="9" ry={eyeRy} fill="#2b2018" />
      {/* mouth sits in the beard gap */}
      {open < 0.08 ? (
        <path
          d="M182 196 Q200 203 218 196"
          stroke="#4a3527"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <ellipse
          cx="200"
          cy="201"
          rx={12 + open * 6}
          ry={2.5 + open * 12}
          fill="#3a2418"
        />
      )}
      <path d="M150 300 L200 250 L250 300 L250 400 L150 400Z" fill="#f5f2ec" />
      <path d="M200 250 L210 320 L200 340 L190 320Z" fill="#1a1a1a" />
      <rect x="150" y="330" width="100" height="70" fill="#1c1c1c" />
    </svg>
  );
}
