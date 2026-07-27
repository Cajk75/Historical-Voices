"use client";

// Measures live audio amplitude (0..1) from either an <audio> element or a
// MediaStream, via the Web Audio API. Drives the avatar's mouth/head motion.

import { useEffect, useRef, useState } from "react";

// A media element can only ever be connected to one MediaElementSourceNode,
// so remember the graph per element across re-mounts.
const elementGraphs = new WeakMap<
  HTMLMediaElement,
  { ctx: AudioContext; analyser: AnalyserNode }
>();

export function useAudioLevel(
  source: HTMLMediaElement | MediaStream | null,
  active: boolean
): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!source || !active) {
      setLevel(0);
      return;
    }

    let analyser: AnalyserNode | null = null;
    let streamCtx: AudioContext | null = null;

    try {
      if (source instanceof MediaStream) {
        streamCtx = new AudioContext();
        const src = streamCtx.createMediaStreamSource(source);
        analyser = streamCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
      } else {
        let graph = elementGraphs.get(source);
        if (!graph) {
          const ctx = new AudioContext();
          const src = ctx.createMediaElementSource(source);
          const an = ctx.createAnalyser();
          an.fftSize = 256;
          src.connect(an);
          an.connect(ctx.destination); // keep audible
          graph = { ctx, analyser: an };
          elementGraphs.set(source, graph);
        }
        graph.ctx.resume().catch(() => {});
        analyser = graph.analyser;
      }
    } catch {
      // Autoplay policy or double-connect — fall back to a gentle fake pulse.
      let t = 0;
      const fake = () => {
        t += 0.15;
        setLevel(0.25 + 0.2 * Math.abs(Math.sin(t)));
        rafRef.current = requestAnimationFrame(fake);
      };
      rafRef.current = requestAnimationFrame(fake);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser!.getByteFrequencyData(data);
      // Focus on speech bands (skip the lowest bins), simple RMS.
      let sum = 0;
      const from = 2;
      const to = Math.min(data.length, 64);
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / (to - from)) / 255;
      // Smooth + normalize into a lively 0..1 range.
      setLevel((prev) => prev * 0.6 + Math.min(1, rms * 2.4) * 0.4);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamCtx?.close().catch(() => {});
      setLevel(0);
    };
  }, [source, active]);

  return level;
}
