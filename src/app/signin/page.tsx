"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase/client";
import { getAuthenticatedRoute } from "@/lib/auth/routing";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const safeNextPath = nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null;
  const isBackofficeSignIn = safeNextPath === "/backoffice";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function routeAuthenticatedUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !user) {
        return;
      }

      router.replace(safeNextPath ?? getAuthenticatedRoute(user));
      router.refresh();
    }

    void routeAuthenticatedUser();

    return () => {
      mounted = false;
    };
  }, [router, safeNextPath]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    router.push(safeNextPath ?? getAuthenticatedRoute(data.user));
    router.refresh();
  }

  return (
    <main className={`${styles.page} ${isBackofficeSignIn ? styles.backofficePage : ""}`}>
      <div className={styles.backdrop} />
      <Link href="/" className={`${styles.pageLogo} ${isBackofficeSignIn ? styles.backofficePageLogo : ""}`}>
        <Image
          src={isBackofficeSignIn ? "/journi-backoffice-logo.png" : "/journi-logo-current.webp"}
          alt="Journi"
          width={isBackofficeSignIn ? 360 : 256}
          height={isBackofficeSignIn ? 120 : 256}
          className={styles.pageLogoImage}
          priority
        />
      </Link>

      {isBackofficeSignIn ? (
        <section className={styles.adminIntro} aria-label="Journi backoffice">
          <div className={styles.adminEyebrow}>
            <span className={styles.statusDot} />
            Journi operations
          </div>
          <h1>Everything behind the journey.</h1>
          <p>
            Secure access for the team managing travellers, trips, payments and
            platform operations.
          </p>
          <div className={styles.adminFeatures}>
            <span>Live oversight</span>
            <span>Protected access</span>
            <span>Full audit history</span>
          </div>
        </section>
      ) : null}

      <section className={`${styles.card} ${isBackofficeSignIn ? styles.backofficeCard : ""}`}>
        {isBackofficeSignIn ? (
          <div className={styles.adminMark} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3 5 6v5c0 4.8 2.9 8.4 7 10 4.1-1.6 7-5.2 7-10V6l-7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
        ) : null}
        <div className={styles.heading}>
          <p className={styles.formEyebrow}>{isBackofficeSignIn ? "Backoffice" : "Welcome back"}</p>
          <h1>{isBackofficeSignIn ? "Sign in to admin" : "Sign in"}</h1>
          <p>
            {isBackofficeSignIn
              ? "Use your authorised Journi team account to continue."
              : "Enter your email and password to access your account."}
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Email</span>
            <input
              type="email"
              placeholder={isBackofficeSignIn ? "name@company.com" : "you@example.com"}
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
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <div className={styles.row}>
            <label className={styles.checkbox}>
              <input type="checkbox" defaultChecked />
              <span>Remember me</span>
            </label>
            <Link href="/forgot-password" className={styles.link}>
              Forgot password?
            </Link>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
            <span>{isSubmitting ? "Signing in..." : isBackofficeSignIn ? "Continue to backoffice" : "Sign in"}</span>
            {!isSubmitting && isBackofficeSignIn ? <span aria-hidden="true">→</span> : null}
          </button>
        </form>

        {isBackofficeSignIn ? (
          <div className={styles.adminFooter}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>Restricted to authorised Journi administrators</span>
          </div>
        ) : (
          <p className={styles.footer}>
            Don&apos;t have an account?{" "}
            <Link href="/signup/free" className={styles.link}>
              Start with free plan
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
