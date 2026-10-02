"use client";

import { ListControls } from "@/components/list-controls";
import { AppLoadingSignal } from "@/components/app-loading";
import { ConnectionsEmptyState } from "@/components/connections-empty-state";

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
  const [search, setSearch] = useState("");
  const [photoFilter, setPhotoFilter] = useState("all");
  const [sort, setSort] = useState("az");
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

  const visibleProfiles = profiles.filter((profile) => {
    if (search.trim() && !`${profile.fullName} ${profile.bio}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
    return photoFilter === "all" || (photoFilter === "photo" ? Boolean(profile.avatarUrl) : !profile.avatarUrl);
  }).sort((a, b) => sort === "az" ? a.fullName.localeCompare(b.fullName) : b.fullName.localeCompare(a.fullName));

  return (
    <div className={styles.stack}>
      {connectionsError ? (
        <section className={styles.panel}>
          <p className={styles.formError}>{connectionsError}</p>
        </section>
      ) : null}

      <section aria-label="Connection profiles">
        <ListControls search={search} onSearch={setSearch} placeholder="Search names or bios" count={visibleProfiles.length} total={profiles.length}
          active={Boolean(search || photoFilter !== "all" || sort !== "az")} onReset={() => { setSearch(""); setPhotoFilter("all"); setSort("az"); }}
          filters={[
            { label: "Photo", value: photoFilter, onChange: setPhotoFilter, options: [{ value: "all", label: "Everyone" }, { value: "photo", label: "With photo" }, { value: "no-photo", label: "Without photo" }] },
            { label: "Sort", value: sort, onChange: setSort, options: [{ value: "az", label: "Name A–Z" }, { value: "za", label: "Name Z–A" }] },
          ]} />
        {!loadingConnections && profiles.length > 0 && visibleProfiles.length === 0 ? <p className={styles.muted}>No connections match your search and filters.</p> : null}
        <AppLoadingSignal active={loadingConnections} />
        {!loadingConnections && !connectionsError && profiles.length === 0 ? <ConnectionsEmptyState /> : null}
        <div className={styles.connectionProfileGrid}>
          {visibleProfiles.map((profile) => <article key={profile.id} className={styles.profileCardPreview} style={resolveProfileBackgroundStyle(profile)}>
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
