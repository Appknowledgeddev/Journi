"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "@/app/signin/page.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
      setIsSubmitting(false);
      return;
    }

    setSuccess("We've emailed you a password reset link.");
    setIsSubmitting(false);
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
          <h1>Reset password</h1>
          <p>Enter your email and we&apos;ll send you a secure reset link.</p>
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

          {error ? <p className={styles.error}>{error}</p> : null}
          {success ? <p className={styles.success}>{success}</p> : null}

          <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className={styles.footer}>
          Remembered it?{" "}
          <Link href="/signin" className={styles.link}>
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
