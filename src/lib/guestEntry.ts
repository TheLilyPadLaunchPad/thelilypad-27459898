/**
 * Guest entry — lets visitors browse the app without connecting a wallet.
 * Wallet connection happens in-app, per chain, when an action needs it.
 */

const ENTRY_KEY = "lp_entered";

export const hasEnteredApp = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ENTRY_KEY) === "true";
  } catch {
    return false;
  }
};

export const markEnteredApp = () => {
  try {
    localStorage.setItem(ENTRY_KEY, "true");
  } catch {
    /* storage unavailable — session-only browsing */
  }
};

export const clearEnteredApp = () => {
  try {
    localStorage.removeItem(ENTRY_KEY);
  } catch {
    /* noop */
  }
};

/** Entry-screen URL that remembers where the visitor was going. */
export const authUrl = (returnTo?: string): string => {
  const target =
    returnTo ??
    (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
  if (!target || target === "/" || target.startsWith("/auth")) return "/auth";
  return `/auth?returnTo=${encodeURIComponent(target)}`;
};

/** Only allow same-app paths as return targets. */
export const safeReturnTo = (raw: string | null): string | null =>
  raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/auth") ? raw : null;
