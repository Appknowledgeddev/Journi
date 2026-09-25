"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiBell } from "react-icons/fi";
import { supabase } from "@/lib/supabase/client";
import styles from "./app-shell.module.css";

type Notification = {
  id: string;
  title: string;
  message: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export function AccountNotifications({ userId, open, onToggle, onClose }: {
  userId: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const mutating = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || mutating.current) return;
    const request = ++generation.current;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted.current || request !== generation.current || session?.user.id !== userId) return;
      // RLS includes notifications addressed to this user's ID or email.
      const [items, unread] = await Promise.all([
        supabase.from("user_notifications")
          .select("id,title,message,action_url,read_at,created_at")
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("user_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      ]);
      if (!mounted.current || request !== generation.current) return;
      if (items.error || unread.error) throw new Error("Unable to load notifications.");
      setNotifications(items.data || []);
      setUnreadCount(unread.count || 0);
      setError(null);
    } catch {
      if (mounted.current && request === generation.current) setError("Unable to load notifications. Please try again.");
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(refreshVisible, 30_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) {
        ++generation.current;
        setNotifications([]);
        setUnreadCount(null);
        setError(null);
      }
    });
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      subscription.unsubscribe();
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function markRead(notification?: Notification) {
    if (mutating.current || !userId) return;
    mutating.current = true;
    ++generation.current;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.id !== userId) throw new Error("Account changed.");
      if (!notification?.read_at) {
        let query = supabase.from("user_notifications")
          .update({ read_at: new Date().toISOString() }).is("read_at", null);
        if (notification) query = query.eq("id", notification.id);
        const { error: updateError } = await query;
        if (updateError) throw updateError;
      }
      if (!mounted.current) return;
      mutating.current = false;
      await refresh();
      if (!mounted.current) return;
      if (notification?.action_url) {
        const target = new URL(notification.action_url, window.location.origin);
        if (target.origin === window.location.origin && ["http:", "https:"].includes(target.protocol)) {
          onClose();
          router.push(`${target.pathname}${target.search}${target.hash}`);
        }
      }
    } catch {
      if (mounted.current) setError("Unable to open or mark notifications as read. Please try again.");
    } finally {
      mutating.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <div className={styles.notificationsMenu}>
      <button type="button" className={`${styles.notificationButton} journi-tour-notifications`}
        onClick={onToggle} aria-expanded={open}
        aria-label={unreadCount === null ? "Open notifications" : `Open notifications, ${unreadCount} unread`}>
        <FiBell />
        {unreadCount !== null && unreadCount > 0 ? (
          <span className={styles.notificationBadge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        ) : null}
      </button>
      {open ? (
        <div className={styles.notificationsDropdown}>
          <div className={styles.notificationsHeader}>
            <div>
              <p className={styles.notificationsTitle}>Notifications</p>
              <p className={styles.notificationsMeta} aria-live="polite">
                {unreadCount === null ? (error ? "Notifications unavailable" : "Loading notifications…") : `${unreadCount} unread`}
              </p>
            </div>
            {unreadCount !== null && unreadCount > 0 ? (
              <button type="button" className={styles.notificationsReadAll} disabled={saving} onClick={() => void markRead()}>Mark all read</button>
            ) : null}
          </div>
          {error ? <p className={styles.notificationsMeta} role="alert">{error} <button type="button" onClick={() => void refresh()}>Retry</button></p> : null}
          <div className={styles.notificationsList}>
            {unreadCount !== null && notifications.length === 0 ? <p className={styles.notificationsMeta}>You have no notifications yet.</p> : null}
            {notifications.map((notification) => (
              <button key={notification.id} type="button" className={styles.notificationItem} disabled={saving}
                onClick={() => void markRead(notification)}>
                <span className={styles.notificationDot} style={{ visibility: notification.read_at ? "hidden" : "visible" }} />
                <span className={styles.notificationCopy}>
                  <span className={styles.notificationItemTitle}>{notification.title}</span>
                  <span className={styles.notificationItemDetail}>{notification.message}</span>
                </span>
                <time className={styles.notificationTime} dateTime={notification.created_at} title={new Date(notification.created_at).toLocaleString()}>
                  {new Date(notification.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </time>
              </button>
            ))}
          </div>
          {notifications.length === 50 ? <p className={styles.notificationsMeta}>Showing your latest 50 notifications.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
