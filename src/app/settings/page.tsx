"use client";

import { AppShell } from "@/components/app-shell";
import sectionStyles from "@/components/app-page.module.css";

const notificationSettings = [
  {
    title: "Traveller invites",
    description: "Get notified when new participants are invited into one of your trip hubs.",
    status: "On",
  },
  {
    title: "Votes and replies",
    description: "Keep up with shortlist votes, comments, and decisions as group planning moves forward.",
    status: "On",
  },
  {
    title: "Payment reminders",
    description: "Receive organiser nudges before trips need subscription or payment follow-up.",
    status: "Off",
  },
];

export default function SettingsPage() {
  return (
    <AppShell
      kicker="Settings"
      title="Workspace settings"
      intro="Simple workspace defaults and notifications."
    >
      {({ loading, plan, isPro }) => (
        <div className={sectionStyles.stack}>
          <section className={sectionStyles.panel}>
            <div className={sectionStyles.sectionTop}>
              <div>
                <p className={sectionStyles.eyebrow}>Settings</p>
                <h2>Workspace defaults</h2>
              </div>
            </div>

            <div className={sectionStyles.settingsList}>
              {notificationSettings.map((item) => (
                <div key={item.title} className={sectionStyles.settingsRow}>
                  <div>
                    <h3>{item.title}</h3>
                  </div>
                  <span
                    className={
                      item.status === "On"
                        ? sectionStyles.badgeSuccess
                        : sectionStyles.badge
                    }
                  >
                    {item.status}
                  </span>
                </div>
              ))}
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
