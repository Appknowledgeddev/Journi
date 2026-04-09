"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  FiChevronDown,
  FiHome,
  FiMapPin,
  FiMenu,
  FiSettings,
  FiUser,
  FiX,
} from "react-icons/fi";
import { Menu, MenuItem, Sidebar } from "react-pro-sidebar";
import { hasStoredActiveSubscription } from "@/lib/auth/routing";
import { supabase } from "@/lib/supabase/client";
import { UpgradePlanModal } from "./upgrade-plan-modal";
import styles from "./app-shell.module.css";

type Plan = "free" | "pro_organiser";

type ShellState = {
  userId: string | null;
  email: string;
  loading: boolean;
  plan: Plan;
  subscriptionStatus: string | null;
  isPro: boolean;
};

type AppShellProps = {
  kicker: string;
  title: string;
  intro: string;
  children: (state: ShellState) => ReactNode;
  headerBadge?: string;
  headerAction?: ReactNode;
};

const navLinks = [
  { label: "Dashboard", href: "/dashboard", icon: <FiHome /> },
  { label: "My trips", href: "/trips", icon: <FiMapPin /> },
];

export function AppShell({
  kicker,
  title,
  intro,
  children,
  headerBadge,
  headerAction,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    function applyUser(user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]) {
      if (!mounted) {
        return;
      }

      if (!user) {
        setEmail("");
        setUserId(null);
        setPlan("free");
        setSubscriptionStatus(null);
        setLoading(false);
        router.push("/signin");
        router.refresh();
        return;
      }

      setEmail(user.email ?? "");
      setUserId(user.id);
      setPlan(user.user_metadata?.plan === "pro_organiser" ? "pro_organiser" : "free");
      setSubscriptionStatus(
        user.user_metadata?.subscription_status ??
          (hasStoredActiveSubscription(user) ? "active" : null),
      );

      void fetch("/api/travellers/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email ?? "",
        }),
      });

      setLoading(false);
    }

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      applyUser(user);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/signin");
    router.refresh();
  }

  const isPro = useMemo(
    () => plan === "pro_organiser" && subscriptionStatus === "active",
    [plan, subscriptionStatus],
  );

  const shellState: ShellState = {
    userId,
    email,
    loading,
    plan,
    subscriptionStatus,
    isPro,
  };

  const planLabel =
    plan === "pro_organiser"
      ? subscriptionStatus === "active"
        ? "Pro organiser"
        : "Pro organiser pending"
      : "Free plan";
  const avatarLetter = (email || "J").trim().charAt(0).toUpperCase();

  return (
    <main className={styles.page}>
      <div className={sidebarCollapsed ? styles.appShellCollapsed : styles.appShell}>
        <Sidebar
          collapsed={sidebarCollapsed}
          width="290px"
          collapsedWidth="96px"
          transitionDuration={260}
          rootStyles={{
            backgroundColor: "transparent",
            borderRight: "1px solid rgba(255, 255, 255, 0.06)",
            height: "100vh",
          }}
          className={sidebarCollapsed ? styles.sidebarCollapsed : styles.sidebar}
        >
          <div className={styles.sidebarTop}>
            <button
              type="button"
              className={sidebarCollapsed ? styles.menuButtonCollapsed : styles.menuButton}
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <FiMenu /> : <FiX />}
            </button>
          </div>

          <Menu
            className={sidebarCollapsed ? styles.sidebarNavCollapsed : styles.sidebarNav}
            menuItemStyles={{
              button: ({ active }) => ({
                minHeight: sidebarCollapsed ? 48 : 44,
                width: sidebarCollapsed ? 48 : "100%",
                borderRadius: sidebarCollapsed ? 18 : 16,
                marginBottom: sidebarCollapsed ? 12 : 10,
                marginInline: sidebarCollapsed ? "auto" : "0",
                paddingInline: sidebarCollapsed ? 0 : 14,
                color: active ? "#183153" : "rgba(255,255,255,0.92)",
                backgroundColor: active ? "#ffffff" : "rgba(255,255,255,0.04)",
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
                transition: "all 180ms ease",
              }),
              icon: {
                color: "currentColor",
                fontSize: "16px",
                marginInlineEnd: sidebarCollapsed ? 0 : 10,
                minWidth: sidebarCollapsed ? "auto" : "16px",
              },
              label: {
                fontWeight: 700,
                fontSize: "0.9rem",
              },
            }}
          >
            {navLinks.map((item) => (
              <MenuItem
                key={item.href}
                active={pathname === item.href}
                icon={item.icon}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => router.push(item.href)}
              >
                <div
                  className={
                    sidebarCollapsed ? styles.navItemMainCollapsed : styles.navItemMain
                  }
                >
                  <span>{item.label}</span>
                </div>
              </MenuItem>
            ))}
          </Menu>
        </Sidebar>

        <section className={styles.mainPanel}>
          <header className={styles.topNav}>
            <Link href="/dashboard" className={styles.topLogo}>
              <Image
                src="/journi-logo-app.png"
                alt="Journi"
                width={220}
                height={78}
                className={styles.topLogoImage}
                priority
              />
            </Link>

            <div className={styles.topActions}>
              <div className={styles.profileMenu}>
                <button
                  type="button"
                  className={styles.profileButton}
                  onClick={() => setProfileOpen((current) => !current)}
                  aria-expanded={profileOpen}
                  aria-label="Open profile menu"
                >
                  <span className={styles.avatar}>{loading ? "…" : avatarLetter}</span>
                  <span className={styles.profileButtonMeta}>
                    <span className={styles.profileButtonText}>
                      {loading ? "Loading..." : email || "Journi organiser"}
                    </span>
                    <span className={styles.profileButtonPlan}>{loading ? "..." : planLabel}</span>
                  </span>
                  <FiChevronDown className={profileOpen ? styles.profileChevronOpen : styles.profileChevron} />
                </button>

                {profileOpen ? (
                  <div className={styles.profileDropdown}>
                    <div className={styles.profileDropdownHeader}>
                      <span className={styles.avatarLarge}>{loading ? "…" : avatarLetter}</span>
                      <div>
                        <p className={styles.profileName}>
                          {loading ? "Loading organiser..." : email || "Journi organiser"}
                        </p>
                        <p className={styles.profilePlan}>{planLabel}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setProfileOpen(false);
                        if (isPro) {
                          router.push("/subscription");
                          return;
                        }

                        setUpgradeOpen(true);
                      }}
                    >
                      <FiChevronDown />
                      <span>{isPro ? "Manage subscription" : "Update plan"}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setProfileOpen(false);
                        router.push("/profile");
                      }}
                    >
                      <FiUser />
                      <span>Profile</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setProfileOpen(false);
                        router.push("/settings");
                      }}
                    >
                      <FiSettings />
                      <span>Settings</span>
                    </button>
                    <button type="button" className={styles.dropdownItem} onClick={handleLogout}>
                      <FiX />
                      <span>Log out</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <div className={styles.contentScroll}>
            <header className={styles.pageHeader}>
              <div className={styles.pageHeaderLeft}>
                <p className={styles.kicker}>{kicker}</p>
                <h1>{loading ? "Loading your workspace..." : title}</h1>
                <p className={styles.intro}>{intro}</p>
              </div>

              {headerAction ? headerAction : null}
              {!headerAction && headerBadge ? (
                <span className={styles.headerBadge}>{headerBadge}</span>
              ) : null}
            </header>

            {children(shellState)}
          </div>
        </section>
      </div>

      <UpgradePlanModal
        open={upgradeOpen}
        email={email}
        onClose={() => setUpgradeOpen(false)}
      />
    </main>
  );
}
