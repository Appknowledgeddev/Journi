"use client";

import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import sectionStyles from "@/components/app-page.module.css";
import shellStyles from "@/components/app-shell.module.css";
import {
  clampProfilePosition,
  profileBackgroundPatterns,
  resolveProfileBackgroundStyle,
} from "@/lib/profile-card";
import { supabase } from "@/lib/supabase/client";

type ProfileManagerProps = {
  email: string;
  fullName: string;
  bio: string;
  avatarUrl: string;
  backgroundUrl: string;
  backgroundPattern: string;
  avatarPositionX: number;
  avatarPositionY: number;
  backgroundPositionX: number;
  backgroundPositionY: number;
  loading: boolean;
  plan: "free" | "pro_organiser";
  subscriptionStatus: string | null;
  isPro: boolean;
  profileComplete: boolean;
};

export function ProfileManager({
  email,
  fullName: currentFullName,
  bio: currentBio,
  avatarUrl: currentAvatarUrl,
  backgroundUrl: currentBackgroundUrl,
  backgroundPattern: currentBackgroundPattern,
  avatarPositionX: currentAvatarPositionX,
  avatarPositionY: currentAvatarPositionY,
  backgroundPositionX: currentBackgroundPositionX,
  backgroundPositionY: currentBackgroundPositionY,
  loading,
  plan,
  subscriptionStatus,
  isPro,
  profileComplete,
}: ProfileManagerProps) {
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundPattern, setBackgroundPattern] = useState("");
  const [avatarPositionX, setAvatarPositionX] = useState(50);
  const [avatarPositionY, setAvatarPositionY] = useState(50);
  const [backgroundPositionX, setBackgroundPositionX] = useState(50);
  const [backgroundPositionY, setBackgroundPositionY] = useState(50);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  const [draggingBackground, setDraggingBackground] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const avatarStageRef = useRef<HTMLDivElement | null>(null);
  const backgroundStageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFullName(currentFullName || "");
    setBio(currentBio || "");
    setAvatarUrl(currentAvatarUrl || "");
    setBackgroundUrl(currentBackgroundUrl || "");
    setBackgroundPattern(currentBackgroundPattern || "");
    setAvatarPositionX(currentAvatarPositionX ?? 50);
    setAvatarPositionY(currentAvatarPositionY ?? 50);
    setBackgroundPositionX(currentBackgroundPositionX ?? 50);
    setBackgroundPositionY(currentBackgroundPositionY ?? 50);
  }, [
    currentAvatarPositionX,
    currentAvatarPositionY,
    currentBackgroundPattern,
    currentBackgroundPositionX,
    currentBackgroundPositionY,
    currentBackgroundUrl,
    currentBio,
    currentFullName,
    currentAvatarUrl,
  ]);

  async function handleImageSelected(
    event: React.ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "background",
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      if (kind === "avatar") {
        setAvatarUploading(false);
      } else {
        setBackgroundUploading(false);
      }
      return;
    }

    setProfileError(null);
    setProfileSuccess(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfileError("You need to be signed in before uploading a profile image.");
      setAvatarUploading(false);
      setBackgroundUploading(false);
      return;
    }

    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `profiles/${user.id}/${kind}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("trip-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      setProfileError(`Profile image upload failed: ${uploadError.message}`);
      setAvatarUploading(false);
      setBackgroundUploading(false);
      return;
    }

    const { data } = supabase.storage.from("trip-images").getPublicUrl(filePath);
    if (kind === "avatar") {
      setAvatarUrl(data.publicUrl);
      setAvatarPositionX(50);
      setAvatarPositionY(50);
      setAvatarUploading(false);
      setProfileSuccess("Profile image ready to save.");
    } else {
      setBackgroundUrl(data.publicUrl);
      setBackgroundPattern("");
      setBackgroundPositionX(50);
      setBackgroundPositionY(50);
      setBackgroundUploading(false);
      setProfileSuccess("Background image ready to save.");
    }
  }

  async function handleImageDrop(file: File, kind: "avatar" | "background") {
    setProfileError(null);
    setProfileSuccess(null);

    if (kind === "avatar") {
      setAvatarUploading(true);
    } else {
      setBackgroundUploading(true);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfileError("You need to be signed in before uploading a profile image.");
      setAvatarUploading(false);
      setBackgroundUploading(false);
      return;
    }

    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `profiles/${user.id}/${kind}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("trip-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      setProfileError(`Profile image upload failed: ${uploadError.message}`);
      setAvatarUploading(false);
      setBackgroundUploading(false);
      return;
    }

    const { data } = supabase.storage.from("trip-images").getPublicUrl(filePath);

    if (kind === "avatar") {
      setAvatarUrl(data.publicUrl);
      setAvatarPositionX(50);
      setAvatarPositionY(50);
      setAvatarUploading(false);
      setDraggingAvatar(false);
      setProfileSuccess("Profile image ready to save.");
    } else {
      setBackgroundUrl(data.publicUrl);
      setBackgroundPattern("");
      setBackgroundPositionX(50);
      setBackgroundPositionY(50);
      setBackgroundUploading(false);
      setDraggingBackground(false);
      setProfileSuccess("Background image ready to save.");
    }
  }

  async function handleProfileUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!fullName.trim()) {
      setProfileError("Add your name so people can recognise you in invites and connections.");
      return;
    }

    if (!bio.trim()) {
      setProfileError("Add a short bio so people know who they are planning with.");
      return;
    }

    if (!backgroundUrl.trim() && !backgroundPattern.trim()) {
      setProfileError("Add a background for your profile card.");
      return;
    }

    if (!avatarUrl.trim()) {
      setProfileError("Add a profile image.");
      return;
    }

    setProfileLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.auth.updateUser({
      data: {
        ...(user?.user_metadata ?? {}),
        full_name: fullName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl || null,
        profile_background_url: backgroundUrl || null,
        profile_background_pattern: backgroundPattern || null,
        avatar_position_x: avatarPositionX,
        avatar_position_y: avatarPositionY,
        background_position_x: backgroundPositionX,
        background_position_y: backgroundPositionY,
      },
    });

    if (error) {
      setProfileError(error.message);
      setProfileLoading(false);
      return;
    }

    setProfileSuccess("Profile updated.");
    window.dispatchEvent(
      new CustomEvent("journi:profile-saved", {
        detail: {
          profileComplete: Boolean(
            fullName.trim() &&
              bio.trim() &&
              avatarUrl.trim() &&
              (backgroundUrl.trim() || backgroundPattern.trim()),
          ),
        },
      }),
    );
    setProfileLoading(false);
  }

  function updatePositionFromPointer(
    event: ReactPointerEvent<HTMLElement>,
    element: HTMLElement | null,
    setX: (value: number) => void,
    setY: (value: number) => void,
  ) {
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const nextX = ((event.clientX - rect.left) / rect.width) * 100;
    const nextY = ((event.clientY - rect.top) / rect.height) * 100;
    setX(clampProfilePosition(nextX));
    setY(clampProfilePosition(nextY));
  }

  const backgroundStyle = resolveProfileBackgroundStyle({
    backgroundUrl,
    backgroundPattern,
    backgroundPositionX,
    backgroundPositionY,
  });

  const avatarStyle = avatarUrl
    ? ({ objectPosition: `${avatarPositionX}% ${avatarPositionY}%` } as CSSProperties)
    : undefined;

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

  async function handlePasswordReset() {
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
    <div className={sectionStyles.stack}>
      <section className={sectionStyles.panel} style={{ display: "grid", justifyItems: "center" }}>
        <form className={shellStyles.profilePrompt} onSubmit={handleProfileUpdate}>
          <div className={shellStyles.profilePromptIntro}>
            <p className={shellStyles.profilePromptEyebrow}>Your account</p>
            <h3>Build your profile card.</h3>
            <p>
              Update the same card travellers see across Journi. Add your name and bio first, then
              finish the photo and background whenever you like.
            </p>
          </div>

          <div className={shellStyles.profilePromptCardPreview}>
            <div
              ref={backgroundStageRef}
              className={
                draggingBackground
                  ? shellStyles.profilePromptCardCoverDragging
                  : shellStyles.profilePromptCardCover
              }
              style={backgroundStyle}
              onDragOver={(event) => {
                event.preventDefault();
                setDraggingBackground(true);
              }}
              onDragLeave={() => setDraggingBackground(false)}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void handleImageDrop(file, "background");
                } else {
                  setDraggingBackground(false);
                }
              }}
              onPointerDown={(event) =>
                updatePositionFromPointer(
                  event,
                  backgroundStageRef.current,
                  setBackgroundPositionX,
                  setBackgroundPositionY,
                )
              }
              onPointerMove={(event) => {
                if (event.buttons !== 1) {
                  return;
                }

                updatePositionFromPointer(
                  event,
                  backgroundStageRef.current,
                  setBackgroundPositionX,
                  setBackgroundPositionY,
                );
              }}
            >
              {!backgroundUrl && !backgroundPattern ? (
                <div className={shellStyles.profilePromptCardCoverPlaceholder}>
                  Drop background here or use the controls below
                </div>
              ) : null}
            </div>

            <div className={shellStyles.profilePromptCardBody}>
              <div
                ref={avatarStageRef}
                className={
                  draggingAvatar
                    ? shellStyles.profilePromptAvatarButtonDragging
                    : shellStyles.profilePromptAvatarButton
                }
                onDragOver={(event) => {
                  event.preventDefault();
                  setDraggingAvatar(true);
                }}
                onDragLeave={() => setDraggingAvatar(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    void handleImageDrop(file, "avatar");
                  } else {
                    setDraggingAvatar(false);
                  }
                }}
                onPointerDown={(event) =>
                  updatePositionFromPointer(
                    event,
                    avatarStageRef.current,
                    setAvatarPositionX,
                    setAvatarPositionY,
                  )
                }
                onPointerMove={(event) => {
                  if (event.buttons !== 1) {
                    return;
                  }

                  updatePositionFromPointer(
                    event,
                    avatarStageRef.current,
                    setAvatarPositionX,
                    setAvatarPositionY,
                  );
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className={shellStyles.profilePromptAvatarImage}
                    style={avatarStyle}
                  />
                ) : (
                  <span className={shellStyles.profilePromptAvatarPlaceholder}>
                    {(fullName || email || "J").trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                className={shellStyles.profilePromptNameInput}
              />

              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Add a short bio that tells travellers who you are."
                rows={3}
                className={shellStyles.profilePromptBioInput}
              />
            </div>
          </div>

          <div className={shellStyles.profilePromptControls}>
            <div className={shellStyles.profilePromptControlGroup}>
              <strong>Background</strong>
              <div className={shellStyles.profilePromptBackgroundSwitcher}>
                <button
                  type="button"
                  className={shellStyles.profilePromptCycleButton}
                  onClick={() => {
                    const currentIndex = profileBackgroundPatterns.findIndex(
                      (pattern) => pattern.id === backgroundPattern,
                    );
                    const nextIndex =
                      currentIndex <= 0
                        ? profileBackgroundPatterns.length - 1
                        : currentIndex - 1;
                    const nextPattern = profileBackgroundPatterns[nextIndex];
                    setBackgroundPattern(nextPattern.id);
                    setBackgroundUrl("");
                    setBackgroundPositionX(50);
                    setBackgroundPositionY(50);
                  }}
                  aria-label="Previous background"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={shellStyles.profilePromptInlineAction}
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={backgroundUploading}
                >
                  {backgroundUploading
                    ? "Uploading..."
                    : backgroundUrl
                      ? "Change uploaded background"
                      : "Upload image"}
                </button>
                <button
                  type="button"
                  className={shellStyles.profilePromptCycleButton}
                  onClick={() => {
                    const currentIndex = profileBackgroundPatterns.findIndex(
                      (pattern) => pattern.id === backgroundPattern,
                    );
                    const nextIndex =
                      currentIndex >= profileBackgroundPatterns.length - 1 ? 0 : currentIndex + 1;
                    const nextPattern = profileBackgroundPatterns[nextIndex];
                    setBackgroundPattern(nextPattern.id);
                    setBackgroundUrl("");
                    setBackgroundPositionX(50);
                    setBackgroundPositionY(50);
                  }}
                  aria-label="Next background"
                >
                  ›
                </button>
              </div>
              <p className={shellStyles.profilePromptHelper}>
                Drop an image onto the cover, upload your own, or cycle through built-in
                backgrounds.
              </p>
            </div>

            <div className={shellStyles.profilePromptControlGroup}>
              <strong>Profile photo</strong>
              <div className={shellStyles.profilePromptPhotoActions}>
                <button
                  type="button"
                  className={shellStyles.profilePromptInlineAction}
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? "Uploading..." : avatarUrl ? "Change photo" : "Upload photo"}
                </button>
              </div>
              <p className={shellStyles.profilePromptHelper}>
                Drop a photo on the circle, then drag inside it to reposition the crop.
              </p>
            </div>

            <input
              ref={backgroundInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => {
                setBackgroundUploading(true);
                void handleImageSelected(event, "background");
              }}
              hidden
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => {
                setAvatarUploading(true);
                void handleImageSelected(event, "avatar");
              }}
              hidden
            />

            {profileError ? <p className={shellStyles.profilePromptError}>{profileError}</p> : null}
            {profileSuccess ? <p className={sectionStyles.formSuccess}>{profileSuccess}</p> : null}
          </div>

          <div className={shellStyles.profilePromptActions}>
            <button
              type="submit"
              className={shellStyles.profilePromptAction}
              disabled={profileLoading}
            >
              {profileLoading ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <section className={sectionStyles.panel}>
        <div className={sectionStyles.sectionTop}>
          <div>
            <p className={sectionStyles.eyebrow}>Security</p>
            <h2>Password</h2>
          </div>
        </div>

        <form className={sectionStyles.tripForm} onSubmit={handlePasswordUpdate}>
        </form>
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
          {passwordSuccess ? <p className={sectionStyles.formSuccess}>{passwordSuccess}</p> : null}

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
              onClick={handlePasswordReset}
            >
              {resetLoading ? "Sending..." : "Send reset email"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppShell
      kicker="Profile"
      title="Your account"
      intro="Account details for your Journi workspace."
    >
      {(state) => <ProfileManager {...state} />}
    </AppShell>
  );
}
