"use client";

import { useEffect, useRef } from "react";

/** Follow our checkout page's content height as Stripe changes its form. */
export function CheckoutFrame({ src, title, className }: { src: string; title: string; className: string }) {
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), [src]);
  return <iframe src={src} title={title} className={className} onLoad={(event) => {
    observer.current?.disconnect();
    const frame = event.currentTarget;
    const content = frame.contentDocument?.querySelector<HTMLElement>('[data-embedded-checkout="true"]');
    if (!content) return;
    const resize = () => { frame.style.height = `${Math.ceil(content.getBoundingClientRect().height)}px`; };
    observer.current = new ResizeObserver(resize);
    observer.current.observe(content);
    resize();
  }} />;
}
