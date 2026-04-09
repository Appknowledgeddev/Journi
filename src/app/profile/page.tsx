"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import sectionStyles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";

export default function ProfilePage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handlePasswordUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.trim().length < 8) {
      setPasswordError("Use at least 8 characters for the new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("The passwords do not match.");
      return;
    }

    setPasswordLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordError(error.message);
      setPasswordLoading(false);
      return;
    }

    setPasswordSuccess("Password updated.");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordLoading(false);
  }

  async function handlePasswordReset(email: string) {
    if (!email) {
      setPasswordError("No email is available for this account.");
      return;
    }

    setPasswordError(null);
    setPasswordSuccess(null);
    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/signin`,
    });

    if (error) {
      setPasswordError(error.message);
      setResetLoading(false);
      return;
    }

    setPasswordSuccess("Password reset email sent.");
    setResetLoading(false);
  }

  return (
    <AppShell
      kicker="Profile"
      title="Your account"
      intro="Account details for your Journi workspace."
    >
      {({ email, loading, plan, subscriptionStatus, isPro }) => (
        <div className={sectionStyles.stack}>
          <section className={sectionStyles.panel}>
            <div className={sectionStyles.sectionTop}>
              <div>
                <p className={sectionStyles.eyebrow}>Account</p>
                <h2>Profile summary</h2>
              </div>
              <span className={isPro ? sectionStyles.badgeSuccess : sectionStyles.badge}>
                {loading ? "Loading..." : isPro ? "Pro active" : "Free plan"}
              </span>
            </div>

            <div className={sectionStyles.settingsList}>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Email</h3>
                </div>
                <strong>{loading ? "Loading..." : email || "No email found"}</strong>
              </div>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Plan</h3>
                </div>
                <strong>{plan === "pro_organiser" ? "Pro organiser" : "Free organiser"}</strong>
              </div>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Subscription</h3>
                </div>
                <strong>{subscriptionStatus ?? "No active subscription"}</strong>
              </div>
            </div>
          </section>

          <section className={sectionStyles.panel}>
            <div className={sectionStyles.sectionTop}>
              <div>
                <p className={sectionStyles.eyebrow}>Security</p>
                <h2>Password</h2>
              </div>
            </div>

            <form className={sectionStyles.tripForm} onSubmit={handlePasswordUpdate}>
              <div className={sectionStyles.formGrid}>
                <label className={sectionStyles.field}>
                  <span>New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter a new password"
                    autoComplete="new-password"
                  />
                </label>
                <label className={sectionStyles.field}>
                  <span>Confirm password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat the new password"
                    autoComplete="new-password"
                  />
                </label>
              </div>

              {passwordError ? <p className={sectionStyles.formError}>{passwordError}</p> : null}
              {passwordSuccess ? (
                <p className={sectionStyles.formSuccess}>{passwordSuccess}</p>
              ) : null}

              <div className={sectionStyles.headerActions}>
                <button
                  type="submit"
                  className={sectionStyles.primaryAction}
                  disabled={passwordLoading}
                >
                  {passwordLoading ? "Updating..." : "Update password"}
                </button>
                <button
                  type="button"
                  className={sectionStyles.secondaryAction}
                  disabled={resetLoading || loading}
                  onClick={() => handlePasswordReset(email)}
                >
                  {resetLoading ? "Sending..." : "Send reset email"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}
