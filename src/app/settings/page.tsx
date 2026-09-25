"use client";

import { NotificationPreferences } from "@/components/notification-preferences";
import { AppShell } from "@/components/app-shell";
import sectionStyles from "@/components/app-page.module.css";
import { ProfileManager } from "@/app/profile/page";

export default function SettingsPage() {
  return (
    <AppShell
      kicker="Settings"
      title="Workspace settings"
      intro="Simple workspace defaults and notifications."
    >
      {({ loading, plan, isPro, ...state }) => (
        <div className={sectionStyles.stack}>
          <ProfileManager {...state} loading={loading} plan={plan} isPro={isPro} />

          <NotificationPreferences />
          <section className={sectionStyles.panel}>
            <div className={sectionStyles.sectionTop}>
              <div>
                <p className={sectionStyles.eyebrow}>Settings</p>
                <h2>Workspace defaults</h2>
              </div>
            </div>

            <div className={sectionStyles.settingsList}>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Default trip mode</h3>
                </div>
                <strong>Draft</strong>
              </div>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Published trips allowed</h3>
                </div>
                <strong>{loading ? "Loading..." : isPro ? "Unlimited" : "1 live trip"}</strong>
              </div>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Template access</h3>
                </div>
                <strong>{plan === "pro_organiser" ? "Available with Pro" : "Locked on free"}</strong>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
