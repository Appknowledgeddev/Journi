"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedExpenseNumber({ value, currency }: { value: number; currency?: string }) {
  const target = Number.isFinite(value) ? value : 0;
  const [displayed, setDisplayed] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const from = current.current;
    let start: number | undefined;
    let frame: number;
    function tick(time: number) {
      start ??= time;
      const progress = motion.matches ? 1 : Math.min((time - start) / 850, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = progress === 1 ? target : from + (target - from) * eased;
      setDisplayed(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  function format(number: number) {
    if (!currency) return Math.round(number).toLocaleString("en-GB");
    try { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(number); }
    catch { return `${number.toFixed(2)} (${currency})`; }
  }

  return <span aria-label={format(target)}><span aria-hidden="true">{format(displayed)}</span></span>;
}
