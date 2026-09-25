"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import styles from "./scrollable-option-cards.module.css";

export function ScrollableOptionCards({ children, className, "aria-label": label }: {
  children: ReactNode;
  className: string;
  "aria-label": string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const id = useId();
  const [edges, setEdges] = useState({ left: false, right: false });
  const overflowing = edges.left || edges.right;

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    function measure() {
      if (!element) return;
      const next = { left: element.scrollLeft > 2, right: element.scrollWidth - element.clientWidth - element.scrollLeft > 2 };
      setEdges((current) => current.left === next.left && current.right === next.right ? current : next);
    }
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [children]);

  function scroll(direction: number) {
    const element = rail.current;
    if (!element) return;
    const cardWidth = element.firstElementChild?.getBoundingClientRect().width || element.clientWidth * .8;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    element.scrollBy({ left: direction * (cardWidth + gap), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return <div className={styles.wrapper}>
    <div ref={rail} id={id} className={`${className} ${styles.rail}`} role="region" aria-label={label} tabIndex={overflowing ? 0 : undefined}>{children}</div>
    {overflowing ? <>
      <button type="button" className={`${styles.arrow} ${styles.left}`} aria-label={`Scroll ${label.replace(/ carousel$/, "").toLowerCase()} left`} aria-controls={id} disabled={!edges.left} onClick={() => scroll(-1)}><FiChevronLeft aria-hidden="true" /></button>
      <button type="button" className={`${styles.arrow} ${styles.right}`} aria-label={`Scroll ${label.replace(/ carousel$/, "").toLowerCase()} right`} aria-controls={id} disabled={!edges.right} onClick={() => scroll(1)}><FiChevronRight aria-hidden="true" /></button>
    </> : null}
  </div>;
}
