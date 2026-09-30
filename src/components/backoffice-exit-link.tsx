"use client";

import type { MouseEvent } from "react";
import { supabase } from "@/lib/supabase/client";

export function BackofficeExitLink({ className }: { className?: string }) {
  async function handleExit(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await supabase.auth.signOut({ scope: "local" });
    window.location.assign("/signin?next=/dashboard");
  }

  return (
    <a href="/signin?next=/dashboard" className={className} onClick={handleExit}>
      Return to app
    </a>
  );
}
