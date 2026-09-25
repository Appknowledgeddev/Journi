export const ASSUMED_SESSION_STORAGE_KEY = "journi-assumed-session";

export function markAssumedSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(ASSUMED_SESSION_STORAGE_KEY, "true");
}

export function isAssumedSession() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(ASSUMED_SESSION_STORAGE_KEY) === "true";
}
