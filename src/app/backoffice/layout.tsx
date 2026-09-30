import type { ReactNode } from "react";
import { BackofficeSessionGuard } from "@/components/backoffice-session-guard";

export default function BackofficeLayout({ children }: { children: ReactNode }) {
  return <BackofficeSessionGuard>{children}</BackofficeSessionGuard>;
}

