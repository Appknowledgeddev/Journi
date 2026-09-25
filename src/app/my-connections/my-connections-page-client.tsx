"use client";

import { useEffect, useState } from "react";
import { type ConnectionProfile } from "@/lib/connection-profile";
import { resolveProfileBackgroundStyle } from "@/lib/profile-card";
import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";

type InviteApiResponse = { connectionProfiles?: ConnectionProfile[]; error?: string };

function MyConnectionsManager({
  userId,
  loading,
}: {
  userId: string | null;
  loading: boolean;
}) {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadConnections() {
      if (loading) {
        return;
      }

      setLoadingConnections(true);
      setProfiles([]);
      setConnectionsError(null);

      if (!userId) {
        setConnectionsError("You need to be signed in before viewing connections.");
        setLoadingConnections(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setConnectionsError("You need to be signed in before viewing connections.");
        setLoadingConnections(false);
        return;
      }

      const response = await fetch("/api/travellers/invites?profiles=1", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as InviteApiResponse;

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setConnectionsError(result.error || "Unable to load connections.");
        setLoadingConnections(false);
        return;
      }

      setProfiles(result.connectionProfiles ?? []);
      setLoadingConnections(false);
    }

    void loadConnections().catch(() => {
      if (mounted) { setConnectionsError("Unable to load connection profiles. Please try again."); setLoadingConnections(false); }
    });

    return () => {
      mounted = false;
    };
  }, [loading, userId]);

  return (
    <div className={styles.stack}>
      {connectionsError ? (
        <section className={styles.panel}>
          <p className={styles.formError}>{connectionsError}</p>
        </section>
      ) : null}

      <section aria-label="Connection profiles">
        {loadingConnections ? <p className={styles.muted}>Loading profile cards…</p> : null}
        {!loadingConnections && !connectionsError && profiles.length === 0 ? <p className={styles.muted}>Your connections’ profile cards will appear here once they’ve completed their profiles.</p> : null}
        <div className={styles.connectionProfileGrid}>
          {profiles.map((profile) => <article key={profile.id} className={styles.profileCardPreview} style={resolveProfileBackgroundStyle(profile)}>
            <div className={styles.profileCardPreviewBody}>
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className={styles.profileCardPreviewAvatar} style={{ objectPosition: `${profile.avatarPositionX}% ${profile.avatarPositionY}%` }} /> : <span className={styles.profileCardPreviewAvatarPlaceholder}>{profile.fullName.charAt(0).toUpperCase()}</span>}
              <h3>{profile.fullName}</h3>
              <p>{profile.bio}</p>
            </div>
          </article>)}
        </div>
      </section>
    </div>
  );
}

export function MyConnectionsPageClient() {
  return (
    <AppShell
      title="Keep the people you plan with close."
      compactTitle
    >
      {({ userId, loading }) => <MyConnectionsManager userId={userId} loading={loading} />}
    </AppShell>
  );
}
