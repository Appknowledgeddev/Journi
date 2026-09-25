"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markAssumedSession } from "@/lib/auth/assumed-session";
import { supabase } from "@/lib/supabase/client";

export default function AssumeAccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function assumeAccount() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type") === "magiclink" ? "magiclink" : null;
      const next = searchParams.get("next") || "/dashboard";

      if (!tokenHash || !type) {
        setError("This account access link is missing its verification token.");
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (!mounted) {
        return;
      }

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      markAssumedSession();
      router.replace(next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    }

    void assumeAccount();

    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#eef1f4",
        color: "#111827",
        fontFamily: "Manrope, Arial, sans-serif",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "min(100%, 420px)",
          border: "1px solid #cfd6df",
          background: "#ffffff",
          padding: 18,
        }}
      >
        <strong suppressHydrationWarning>{error ? "Unable to assume account" : "Opening selected view"}</strong>
        <p suppressHydrationWarning style={{ margin: "8px 0 0", color: error ? "#9a3412" : "#64748b" }}>
          {error || "Signing in as the selected user and taking you to the requested page."}
        </p>
      </section>
    </main>
  );
}
