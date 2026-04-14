"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TripUpgradeModal } from "@/components/trip-upgrade-modal";
import styles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";
import {
  clearTripOrganiserDraft,
  ParticipantInviteDraft,
  readTripOrganiserDraft,
  saveTripOrganiserDraft,
  TripOrganiserDraft,
} from "@/lib/trip-organiser/draft";

function hasHotelValue(option: TripOrganiserDraft["hotels"][number]) {
  return Boolean(option.name.trim());
}

function hasActivityValue(option: TripOrganiserDraft["activities"][number]) {
  return Boolean(option.title.trim());
}

function hasTransportValue(option: TripOrganiserDraft["transport"][number]) {
  return Boolean(option.mode.trim());
}

function hasDiningValue(option: TripOrganiserDraft["dining"][number]) {
  return Boolean(option.name.trim());
}

function formatDateLabel(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function FinaliseTripPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<TripOrganiserDraft | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [tripPassUnlocked, setTripPassUnlocked] = useState(false);

  useEffect(() => {
    setDraft(readTripOrganiserDraft());
    setIsLoadingDraft(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const checkoutComplete = searchParams.get("checkout") === "complete";
    const checkoutProduct = searchParams.get("product");
    const storedUnlock = window.sessionStorage.getItem("journi-trip-pass-unlock") === "true";

    if (checkoutComplete && checkoutProduct === "trip_pass") {
      window.sessionStorage.setItem("journi-trip-pass-unlock", "true");
      setTripPassUnlocked(true);
      return;
    }

    setTripPassUnlocked(storedUnlock);
  }, [searchParams]);

  return (
    <AppShell title="Finalise your trip">
      {({ userId, loading, email, isPro }) => {
        const inviteCount = draft?.invites?.length ?? 0;
        const canInviteTravellers = isPro || tripPassUnlocked;

        function persistDraftInviteChanges(nextInvites: ParticipantInviteDraft[]) {
          setDraft((current) => {
            if (!current) {
              return current;
            }

            const nextDraft = {
              ...current,
              invites: nextInvites,
              savedAt: new Date().toISOString(),
            };

            saveTripOrganiserDraft(nextDraft);
            return nextDraft;
          });
        }

        function handleAddInvite(event: React.FormEvent<HTMLFormElement>) {
          event.preventDefault();

          if (!draft) {
            setParticipantError("The trip draft needs to be ready before adding invitees.");
            return;
          }

          if (!canInviteTravellers) {
            setParticipantError(
              "Traveller invites are locked on free until you use the £39 Trip Pass or upgrade to Pro organiser.",
            );
            setShowUpgradeModal(true);
            return;
          }

          if (!participantEmail.trim()) {
            setParticipantError("Traveller email is required.");
            return;
          }

          const emailValue = participantEmail.trim().toLowerCase();
          const duplicateInvite = (draft.invites ?? []).some((invite) => invite.email === emailValue);

          if (duplicateInvite) {
            setParticipantError("That traveller has already been added to this trip review.");
            return;
          }

          persistDraftInviteChanges([
            ...(draft.invites ?? []),
            {
              fullName: participantName.trim(),
              email: emailValue,
            },
          ]);
          setParticipantName("");
          setParticipantEmail("");
          setParticipantError(null);
        }

        function handleRemoveInvite(emailToRemove: string) {
          if (!draft) {
            return;
          }

          persistDraftInviteChanges(
            (draft.invites ?? []).filter((invite) => invite.email !== emailToRemove),
          );
        }

        async function handleSaveTrip() {
          if (!draft) {
            setSaveError("The trip draft could not be found. Head back to the organiser first.");
            return;
          }

          if (!userId) {
            setSaveError("You need to be signed in before saving this trip.");
            return;
          }

          if (!draft.tripForm.title.trim()) {
            setSaveError("Trip name is required.");
            return;
          }

          setIsSaving(true);
          setSaveError(null);

          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.access_token) {
            setSaveError("Your session has expired. Please sign in again before saving.");
            setIsSaving(false);
            return;
          }

          const response = await fetch("/api/trip-organiser/finalise", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              draft,
              origin: window.location.origin,
            }),
          });

          const result = (await response.json().catch(() => null)) as
            | { error?: string; tripId?: string; warning?: string }
            | null;

          if (!response.ok || !result?.tripId) {
            setSaveError(result?.error || "Unable to save this trip right now.");
            setIsSaving(false);
            return;
          }

          const tripId = result.tripId;

          if (result.warning) {
            console.warn("[Journi Finalise]", result.warning);
          }

          clearTripOrganiserDraft();
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem("journi-trip-pass-unlock");
          }
          setIsSaving(false);
          router.push(
            result.warning
              ? `/trips/${tripId}?inviteWarning=${encodeURIComponent(result.warning)}`
              : `/trips/${tripId}`,
          );
        }

        return (
          <div className={styles.stack}>
            <section className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Final stage</p>
                  <h2>Review and save your trip</h2>
                  <p className={styles.muted}>
                    This is the final step. We’ll save the trip plus the hotels, activities,
                    transport, and dining you selected.
                  </p>
                </div>
              </div>

              {isLoadingDraft ? (
                <p className={styles.muted}>Loading your trip draft...</p>
              ) : null}

              {!isLoadingDraft && !draft ? (
                <div className={styles.stack}>
                  <p className={styles.muted}>
                    There isn’t a trip draft ready yet. Head back to the organiser and build the
                    trip first.
                  </p>
                  <div className={styles.headerActions}>
                    <Link href="/trip-organiser" className={styles.secondaryActionLink}>
                      Back to trip organiser
                    </Link>
                  </div>
                </div>
              ) : null}

              {draft ? (
                <div className={styles.stack}>
                  <div className={`${styles.tripBuilderCard} ${styles.tripBuilderCardNoFade}`}>
                    {draft.tripForm.coverImageUrl ? (
                      <div className={styles.tripImagePreviewWrap}>
                        <img
                          src={draft.tripForm.coverImageUrl}
                          alt={draft.tripForm.title || draft.tripForm.destination || "Trip cover"}
                          className={styles.imagePreview}
                        />
                        <div className={styles.tripImageTextOverlay}>
                          <h1 className={styles.tripImageTitle}>
                            {draft.tripForm.destination || "Your trip"}
                          </h1>
                          <p className={styles.tripImageSubtitle}>
                            {draft.tripForm.title || "Trip ready to save"}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.tripBuilderBody}>
                      {draft.tripForm.startsAt && draft.tripForm.endsAt ? (
                        <div className={styles.dateRangeInline}>
                          <div className={styles.dateRangeSummary}>
                            <span>{formatDateLabel(draft.tripForm.startsAt)}</span>
                            <span className={styles.dateRangeDivider}>to</span>
                            <span>{formatDateLabel(draft.tripForm.endsAt)}</span>
                          </div>
                        </div>
                      ) : null}

                      {draft.tripForm.description.trim() ? (
                        <div className={styles.field}>
                          <div className={styles.rowTop}>
                            <span>Description</span>
                          </div>
                          <p className={styles.muted}>{draft.tripForm.description}</p>
                        </div>
                      ) : null}

                      <div className={styles.grid2}>
                        <div className={styles.metricCard}>
                          <p className={styles.eyebrow}>Hotels</p>
                          <div className={styles.metricValue}>
                            {draft.hotels.filter(hasHotelValue).length}
                          </div>
                          <p className={styles.metricMeta}>Selected stays ready to save</p>
                        </div>
                        <div className={styles.metricCard}>
                          <p className={styles.eyebrow}>Activities</p>
                          <div className={styles.metricValue}>
                            {draft.activities.filter(hasActivityValue).length}
                          </div>
                          <p className={styles.metricMeta}>Chosen experiences for the trip</p>
                        </div>
                        <div className={styles.metricCard}>
                          <p className={styles.eyebrow}>Transport</p>
                          <div className={styles.metricValue}>
                            {draft.transport.filter(hasTransportValue).length}
                          </div>
                          <p className={styles.metricMeta}>Ways to get around</p>
                        </div>
                        <div className={styles.metricCard}>
                          <p className={styles.eyebrow}>Dining</p>
                          <div className={styles.metricValue}>
                            {draft.dining.filter(hasDiningValue).length}
                          </div>
                          <p className={styles.metricMeta}>Food and restaurant picks</p>
                        </div>
                      </div>

                      {draft.hotels.filter(hasHotelValue).length > 0 ? (
                        <div className={styles.optionFormCard}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Hotels</p>
                              <h3 className={styles.sectionHeading}>Ready to save</h3>
                            </div>
                          </div>
                          <div className={styles.tagRow}>
                            {draft.hotels.filter(hasHotelValue).map((hotel) => (
                              <span key={`${hotel.name}-${hotel.location}`} className={styles.badge}>
                                {hotel.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {draft.activities.filter(hasActivityValue).length > 0 ? (
                        <div className={styles.optionFormCard}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Activities</p>
                              <h3 className={styles.sectionHeading}>Ready to save</h3>
                            </div>
                          </div>
                          <div className={styles.tagRow}>
                            {draft.activities.filter(hasActivityValue).map((activity) => (
                              <span
                                key={`${activity.title}-${activity.location}`}
                                className={styles.badge}
                              >
                                {activity.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {draft.transport.filter(hasTransportValue).length > 0 ? (
                        <div className={styles.optionFormCard}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Transport</p>
                              <h3 className={styles.sectionHeading}>Ready to save</h3>
                            </div>
                          </div>
                          <div className={styles.tagRow}>
                            {draft.transport.filter(hasTransportValue).map((option) => (
                              <span
                                key={`${option.provider}-${option.arrivalLocation}-${option.mode}`}
                                className={styles.badge}
                              >
                                {option.provider || option.mode}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {draft.dining.filter(hasDiningValue).length > 0 ? (
                        <div className={styles.optionFormCard}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Dining</p>
                              <h3 className={styles.sectionHeading}>Ready to save</h3>
                            </div>
                          </div>
                          <div className={styles.tagRow}>
                            {draft.dining.filter(hasDiningValue).map((option) => (
                              <span key={`${option.name}-${option.location}`} className={styles.badge}>
                                {option.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className={styles.optionFormCard}>
                        <div className={styles.rowTop}>
                          <div>
                            <p className={styles.eyebrow}>Travellers</p>
                            <h3 className={styles.sectionHeading}>Invite people before you save</h3>
                            <p className={styles.muted}>
                              Add the people who should receive the first invitation to this trip.
                            </p>
                          </div>
                          <div className={styles.headerActions}>
                            {isPro ? (
                              <span className={styles.badgeSuccess}>Pro organiser</span>
                            ) : tripPassUnlocked ? (
                              <span className={styles.badgeSoft}>Trip Pass unlocked</span>
                            ) : (
                              <span className={styles.badgeLocked}>Trip Pass required</span>
                            )}
                            <span className={styles.badge}>{inviteCount} queued</span>
                          </div>
                        </div>

                        {!canInviteTravellers ? (
                          <div className={styles.publishGateCard}>
                            <p className={styles.publishGateCopy}>
                              On the free plan, traveller invites are locked until you use the £39
                              Trip Pass for this trip or upgrade the whole account to Pro organiser.
                            </p>
                            <div className={styles.headerActions}>
                              <button
                                type="button"
                                className={styles.secondaryAction}
                                onClick={() => setShowUpgradeModal(true)}
                              >
                                Unlock invites
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <form className={styles.inviteForm} onSubmit={handleAddInvite}>
                          <div className={styles.formGrid}>
                            <label className={styles.field}>
                              <span>Traveller name</span>
                              <input
                                value={participantName}
                                onChange={(event) => setParticipantName(event.target.value)}
                                placeholder="Sophie Hall"
                              />
                            </label>
                            <label className={styles.field}>
                              <span>Traveller email</span>
                              <input
                                type="email"
                                value={participantEmail}
                                onChange={(event) => setParticipantEmail(event.target.value)}
                                placeholder="traveller@example.com"
                              />
                            </label>
                          </div>

                          {participantError ? <p className={styles.formError}>{participantError}</p> : null}

                          <div className={styles.formActions}>
                            <button type="submit" className={styles.primaryAction}>
                              Add traveller
                            </button>
                          </div>
                        </form>

                        <div className={styles.participantsList}>
                          {inviteCount === 0 ? (
                            <div className={styles.emptyState}>
                              <p>No travellers queued yet.</p>
                            </div>
                          ) : (
                            (draft.invites ?? []).map((invite) => (
                              <article key={invite.email} className={styles.participantCard}>
                                <div className={styles.rowTop}>
                                  <span className={styles.rowTitle}>
                                    {invite.fullName || invite.email}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.inlineEditLink}
                                    onClick={() => handleRemoveInvite(invite.email)}
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className={styles.tripMetaRow}>
                                  <span>{invite.email}</span>
                                  <span>Invite queued</span>
                                </div>
                              </article>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {saveError ? <p className={styles.formError}>{saveError}</p> : null}

                  <div className={styles.headerActions}>
                    <Link href="/trip-organiser" className={styles.secondaryActionLink}>
                      Back to organiser
                    </Link>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={handleSaveTrip}
                      disabled={isSaving || loading}
                    >
                      {isSaving ? "Saving trip..." : "Save whole trip"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
            <TripUpgradeModal
              open={showUpgradeModal}
              email={email}
              tripId="finalise"
              returnPath="/trip-organiser/finalise?checkout=complete&product=trip_pass"
              onClose={() => setShowUpgradeModal(false)}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
