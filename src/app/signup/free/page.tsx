"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase/client";
import { getAuthenticatedRoute } from "@/lib/auth/routing";

export default function FreePlanPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState("");

  useEffect(() => {
    let mounted = true;

    async function routeAuthenticatedUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !user) {
        return;
      }

      router.replace(getAuthenticatedRoute(user));
      router.refresh();
    }

    void routeAuthenticatedUser();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          plan: "free",
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.push(getAuthenticatedRoute(data.user));
      router.refresh();
      return;
    }

    setEmailSentTo(email);
    setIsSubmitting(false);
  }

  const showConfirmation = Boolean(emailSentTo);

  return (
    <main className={styles.page}>
      <div className={styles.overlay} />
      <Link href="/" className={styles.pageLogo}>
        <Image
          src="/journi-logo-app.png"
          alt="Journi"
          width={320}
          height={112}
          className={styles.pageLogoImage}
          priority
        />
      </Link>

      <section className={styles.card}>
        <p className={styles.kicker}>Free plan</p>
        <h1>{showConfirmation ? "Check your inbox." : "Create your free account."}</h1>
        <p className={styles.lead}>
          {showConfirmation
            ? `We've emailed ${emailSentTo} so you can approve your account. Once you've confirmed it, log back in and we'll take you to your dashboard.`
            : "Start with 1 active trip, up to 5 participants, basic voting, 10 itinerary items, and shared notes."}
        </p>

        {showConfirmation ? (
          <div className={styles.confirmationPanel}>
            <p>
              Your free account is waiting for approval. After you confirm your email,
              sign back in and we&apos;ll drop you into your organiser dashboard.
            </p>
            <Link href="/signin" className={styles.primaryButton}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className={styles.field}>
              <span>Password</span>
              <input
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            {error ? <p className={styles.error}>{error}</p> : null}

            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create free account"}
            </button>
          </form>
        )}

        <p className={styles.footer}>
          Already have an account?{" "}
          <Link href="/signin" className={styles.link}>
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
