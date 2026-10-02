import type { ReactNode } from "react";
import { BackofficeSessionGuard } from "@/components/backoffice-session-guard";
import styles from "./layout.module.css";

export default function BackofficeLayout({ children }: { children: ReactNode }) {
  return <div className={styles.lightTheme}><BackofficeSessionGuard>{children}</BackofficeSessionGuard></div>;
}
