type UserMetadata = {
  plan?: string | null;
  subscription_status?: string | null;
};

type AuthUserLike = {
  user_metadata?: UserMetadata | null;
  email?: string | null;
} | null;

const PRO_SUBSCRIPTION_STORAGE_KEY = "journi-pro-subscription-active";

function getStoredSubscriptionEmail() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(PRO_SUBSCRIPTION_STORAGE_KEY);
}

export function storeActiveSubscription(email: string | null | undefined) {
  if (typeof window === "undefined" || !email) {
    return;
  }

  window.localStorage.setItem(PRO_SUBSCRIPTION_STORAGE_KEY, email);
}

export function hasStoredActiveSubscription(user: AuthUserLike) {
  const email = user?.email ?? null;
  const storedEmail = getStoredSubscriptionEmail();

  return Boolean(email && storedEmail && storedEmail === email);
}

export function getAuthenticatedRoute(user: AuthUserLike) {
  return "/dashboard";
}
