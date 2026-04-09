"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/app-page.module.css";

type TripCard = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
};

const tripCategoryBreakdown = [
  { label: "Hotels", progress: 80, colorClass: "progressFillBlue" },
  { label: "Activities", progress: 40, colorClass: "progressFillOrange" },
  { label: "Transport", progress: 70, colorClass: "progressFillPurple" },
  { label: "Dining", progress: 50, colorClass: "progressFillGreen" },
];

type TripFormState = {
  title: string;
  destination: string;
  description: string;
  status: string;
  startsAt: string;
  endsAt: string;
  coverImageUrl: string;
};

const initialTripForm: TripFormState = {
  title: "",
  destination: "",
  description: "",
  status: "draft",
  startsAt: "",
  endsAt: "",
  coverImageUrl: "",
};

function formatTripDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) {
    return "Dates to be confirmed";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const startLabel = startsAt ? formatter.format(new Date(startsAt)) : null;
  const endLabel = endsAt ? formatter.format(new Date(endsAt)) : null;

  if (startLabel && endLabel) {
    return `${startLabel} to ${endLabel}`;
  }

  return startLabel ?? endLabel ?? "Dates to be confirmed";
}

export default function TripsPage() {
  const [trips, setTrips] = useState<TripCard[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripError, setTripError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [tripForm, setTripForm] = useState<TripFormState>(initialTripForm);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadTrips() {
      setLoadingTrips(true);
      setTripError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      if (!user) {
        setUserId(null);
        setTrips([]);
        setLoadingTrips(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("trips")
        .select(
          "id, title, destination, description, status, starts_at, ends_at, cover_image_url",
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (!mounted) {
        return;
      }

      if (error) {
        setTripError(error.message);
        setTrips([]);
        setLoadingTrips(false);
        return;
      }

      setTrips((data ?? []) as TripCard[]);
      setLoadingTrips(false);
    }

    void loadTrips();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreateTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId) {
      setCreateError("You need to be signed in before creating a trip.");
      return;
    }

    if (!tripForm.title.trim()) {
      setCreateError("Trip name is required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    const payload = {
      owner_id: userId,
      title: tripForm.title.trim(),
      destination: tripForm.destination.trim() || null,
      description: tripForm.description.trim() || null,
      status: tripForm.status,
      starts_at: tripForm.startsAt || null,
      ends_at: tripForm.endsAt || null,
      cover_image_url: tripForm.coverImageUrl.trim() || null,
    };

    const { data, error } = await supabase
      .from("trips")
      .insert(payload)
      .select(
        "id, title, destination, description, status, starts_at, ends_at, cover_image_url",
      )
      .single();

    if (error) {
      setCreateError(error.message);
      setIsCreating(false);
      return;
    }

    setTrips((current) => [data as TripCard, ...current]);
    setTripForm(initialTripForm);
    setShowCreateForm(false);
    setIsCreating(false);
  }

  async function uploadTripImage(file: File) {
    if (!file) {
      return;
    }

    if (!userId) {
      setCreateError("You need to be signed in before uploading an image.");
      return;
    }

    setIsUploadingImage(true);
    setCreateError(null);

    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("trip-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      setCreateError(`Image upload failed: ${uploadError.message}`);
      setIsUploadingImage(false);
      return;
    }

    const { data } = supabase.storage.from("trip-images").getPublicUrl(filePath);

    setTripForm((current) => ({
      ...current,
      coverImageUrl: data.publicUrl,
    }));
    setIsUploadingImage(false);
  }

  async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await uploadTripImage(file);
    event.target.value = "";
  }

  async function handleImageDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingImage(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    await uploadTripImage(file);
  }

  return (
    <AppShell
      kicker="Trips"
      title="Your trips."
      intro="All of the trips you’ve created."
      headerAction={
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => setShowCreateForm(true)}
        >
          Add trip
        </button>
      }
    >
      {() => (
        <div className={styles.stack}>
          <section className={styles.tripListSection}>
            {tripError ? null : null}

            {!loadingTrips && !tripError && trips.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No trips yet.</p>
              </div>
            ) : null}

            {!tripError ? (
              <div className={styles.tripList}>
                {trips.map((trip) => (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className={styles.tripListCardLink}
                  >
                    <article className={styles.tripListCard}>
                      {trip.cover_image_url ? (
                        <img
                          src={trip.cover_image_url}
                          alt={trip.title}
                          className={styles.tripListImage}
                        />
                      ) : (
                        <div className={styles.tripListImageFallback} />
                      )}

                    <div className={styles.tripListBody}>
                      <div className={styles.rowTop}>
                        <span className={styles.rowTitle}>{trip.title}</span>
                        <span className={styles.badge}>{trip.status}</span>
                      </div>
                        <div className={styles.tripMetaRow}>
                          <span>{trip.destination || "Destination to be confirmed"}</span>
                          <span>{formatTripDateRange(trip.starts_at, trip.ends_at)}</span>
                        </div>
                      <p className={styles.muted}>
                        {trip.description || "No trip summary added yet."}
                      </p>

                      <div className={styles.tripCardMiniGrid}>
                        {tripCategoryBreakdown.map((category) => (
                          <div key={`${trip.id}-${category.label}`} className={styles.tripCardMiniItem}>
                            <div className={styles.tripCardMiniTop}>
                              <span>{category.label}</span>
                              <div
                                className={styles.tripCardMiniCircle}
                                style={
                                  {
                                    "--progress": `${category.progress}%`,
                                  } as CSSProperties
                                }
                              >
                                <span
                                  className={styles[category.colorClass as keyof typeof styles]}
                                />
                                <strong>{category.progress}%</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </Link>
                ))}
              </div>
            ) : null}
          </section>

          {showCreateForm ? (
            <div className={styles.modalOverlay} onClick={() => setShowCreateForm(false)}>
              <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
                <div className={styles.sectionTop}>
                  <div>
                    <p className={styles.eyebrow}>Create trip</p>
                    <h2>Add a new trip hub</h2>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => setShowCreateForm(false)}
                  >
                    Close
                  </button>
                </div>

                <form className={styles.tripForm} onSubmit={handleCreateTrip}>
                  <div className={styles.field}>
                    <span>Cover image</span>
                    <div
                      className={
                        isDraggingImage ? styles.dropzoneActive : styles.dropzone
                      }
                      onClick={() => imageInputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDraggingImage(true);
                      }}
                      onDragLeave={() => setIsDraggingImage(false)}
                      onDrop={handleImageDrop}
                    >
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelected}
                        className={styles.hiddenFileInput}
                      />
                      <strong>
                        {isUploadingImage ? "Uploading image..." : "Drop image here"}
                      </strong>
                      <small className={styles.fieldHint}>
                        or click to browse from your computer
                      </small>
                    </div>
                    <small className={styles.fieldHint}>
                      Uploads to the `trip-images` storage bucket.
                    </small>
                  </div>

                  {tripForm.coverImageUrl ? (
                    <div className={styles.imagePreviewCard}>
                      <img
                        src={tripForm.coverImageUrl}
                        alt="Trip cover preview"
                        className={styles.imagePreview}
                      />
                    </div>
                  ) : null}

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Trip name</span>
                      <input
                        value={tripForm.title}
                        onChange={(event) =>
                          setTripForm((current) => ({ ...current, title: event.target.value }))
                        }
                        placeholder="Mallorca Summer Getaway"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Destination</span>
                      <input
                        value={tripForm.destination}
                        onChange={(event) =>
                          setTripForm((current) => ({
                            ...current,
                            destination: event.target.value,
                          }))
                        }
                        placeholder="Mallorca"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Start date</span>
                      <input
                        type="date"
                        value={tripForm.startsAt}
                        onChange={(event) =>
                          setTripForm((current) => ({ ...current, startsAt: event.target.value }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span>End date</span>
                      <input
                        type="date"
                        value={tripForm.endsAt}
                        onChange={(event) =>
                          setTripForm((current) => ({ ...current, endsAt: event.target.value }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Status</span>
                      <select
                        value={tripForm.status}
                        onChange={(event) =>
                          setTripForm((current) => ({ ...current, status: event.target.value }))
                        }
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="confirmed">Confirmed</option>
                      </select>
                    </label>
                  </div>

                  <label className={styles.field}>
                    <span>Description</span>
                    <textarea
                      value={tripForm.description}
                      onChange={(event) =>
                        setTripForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Short summary of the trip plan"
                      rows={4}
                    />
                  </label>

                  {createError ? <p className={styles.formError}>{createError}</p> : null}

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.primaryAction} disabled={isCreating}>
                      {isCreating ? "Creating trip..." : "Create trip"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
