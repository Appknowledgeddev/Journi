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
  const wasSignedOutForInactivity = searchParams.get("reason") === "inactive";
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

      <section className={`${styles.card} ${isBackofficeSignIn ? styles.backofficeCard : ""}`}>
        {!isBackofficeSignIn ? (
          <div className={styles.heading}>
            <p className={styles.formEyebrow}>Welcome back</p>
            <h1>Sign in</h1>
            <p>Enter your email and password to access your account.</p>
          </div>
        ) : null}

        {isBackofficeSignIn && wasSignedOutForInactivity ? (
          <p className={styles.sessionNotice}>You were signed out after 5 minutes of inactivity.</p>
        ) : null}

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

          {!isBackofficeSignIn ? (
            <div className={styles.row}>
              <label className={styles.checkbox}>
                <input type="checkbox" defaultChecked />
                <span>Remember me</span>
              </label>
              <Link href="/forgot-password" className={styles.link}>
                Forgot password?
              </Link>
            </div>
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
            <span>{isSubmitting ? "Signing in..." : isBackofficeSignIn ? "Continue to backoffice" : "Sign in"}</span>
            {!isSubmitting && isBackofficeSignIn ? <span aria-hidden="true">→</span> : null}
          </button>
        </form>

        {!isBackofficeSignIn ? (
          <p className={styles.footer}>
            Don&apos;t have an account?{" "}
            <Link href="/signup/free" className={styles.link}>
              Start with free plan
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
