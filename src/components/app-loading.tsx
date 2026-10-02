"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { JourniLoader } from "./journi-loader";
import styles from "./app-shell.module.css";

const LoadingContext = createContext<{ busy: boolean; report: (id: string, active: boolean) => void }>({ busy: false, report: () => {} });

export function AppLoadingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const report = useCallback((id: string, active: boolean) => {
    setPending((current) => {
      if (current.has(id) === active) return current;
      const next = new Set(current);
      if (active) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ busy: pending.size > 0, report }), [pending, report]);
  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>;
}

/** Reports page data loading while keeping its fetch-owning component mounted. */
export function AppLoadingSignal({ active }: { active: boolean }) {
  const id = useId();
  const { report } = useContext(LoadingContext);
  useEffect(() => {
    report(id, active);
    return () => report(id, false);
  }, [id, active, report]);
  return null;
}

export function AppLoadingOverlay({ active = false, label }: { active?: boolean; label?: string }) {
  const { busy } = useContext(LoadingContext);
  const pathname = usePathname();
  const skeletonLayout = ["/trips", "/public-trips", "/my-connections"].includes(pathname) ? "cards" : undefined;
  const isLoading = active || busy;
  return <div className={styles.pageLoadingOverlay} data-loading={isLoading} aria-hidden={!isLoading} inert={!isLoading}>
    <JourniLoader title={label || "Getting things ready…"} detail="" skeletonLayout={skeletonLayout} />
  </div>;
}

export function AppLoadingContent({ active = false, children }: { active?: boolean; children: ReactNode }) {
  const { busy } = useContext(LoadingContext);
  const isLoading = active || busy;
  return <div className={styles.contentScroll} aria-busy={isLoading} inert={isLoading}>{children}</div>;
}
