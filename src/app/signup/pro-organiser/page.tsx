"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import styles from "./signup.module.css";
import { supabase } from "@/lib/supabase/client";
import { getAuthenticatedRoute } from "@/lib/auth/routing";

export default function ProOrganiserSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState("");
  const [existingAccountEmail, setExistingAccountEmail] = useState("");

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
    setExistingAccountEmail("");
    setIsSubmitting(true);

    const accountCheckResponse = await fetch("/api/auth/check-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

    const accountCheck = (await accountCheckResponse.json()) as {
      exists?: boolean;
      error?: string;
    };

    if (!accountCheckResponse.ok) {
      setError(accountCheck.error || "Unable to check whether this account exists.");
      setIsSubmitting(false);
      return;
    }

    if (accountCheck.exists) {
      setExistingAccountEmail(email);
      setIsSubmitting(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          plan: "pro_organiser",
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.push("/signup/pro-organiser/payment");
      router.refresh();
      return;
    }

    setEmailSentTo(email);
    setIsSubmitting(false);
  }

  const showConfirmation = Boolean(emailSentTo);
  const showExistingAccount = Boolean(existingAccountEmail);

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
        <p className={styles.kicker}>Pro organiser</p>
        <h1>
          {showConfirmation
            ? "Check your inbox."
            : showExistingAccount
              ? "Account already exists."
              : "Create your organiser account."}
        </h1>
        <p className={styles.lead}>
          {showConfirmation
            ? `We've emailed ${emailSentTo} so you can approve your account. Once you've confirmed it, log back in to continue to payment.`
            : showExistingAccount
              ? `${existingAccountEmail} is already registered with Journi. Sign in first, then use Update plan to move to Pro.`
            : "Set up your account first. After that, we’ll take you through the Pro Organiser payment step."}
        </p>

        {showExistingAccount ? (
          <div className={styles.confirmationPanel}>
            <p>
              This email already has a Journi account. Sign in to continue, then choose
              Update plan from the account menu if you want Pro Organiser.
            </p>
            <Link href="/signin" className={styles.primaryButton}>
              Go to sign in
            </Link>
            <Link href="/forgot-password" className={styles.link}>
              Forgot password?
            </Link>
          </div>
        ) : showConfirmation ? (
          <div className={styles.confirmationPanel}>
            <p>
              Your Pro account is waiting for approval. After you confirm your email, head
              back to sign in and we&apos;ll take you straight to the payment screen.
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
              {isSubmitting ? "Creating account..." : "Create Pro account"}
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
