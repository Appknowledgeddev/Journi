"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase/client";
import { getAuthenticatedRoute } from "@/lib/auth/routing";

export default function SignInPage() {
  const router = useRouter();
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

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    router.push(getAuthenticatedRoute(data.user));
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} />
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
        <div className={styles.heading}>
          <h1>Sign in</h1>
          <p>Enter your email and password to access your account.</p>
        </div>

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
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className={styles.footer}>
          Don&apos;t have an account?{" "}
          <Link href="/signup/free" className={styles.link}>
            Start with free plan
          </Link>
        </p>
      </section>
    </main>
  );
}
