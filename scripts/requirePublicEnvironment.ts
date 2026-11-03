const REQUIRED_PUBLIC_SETTINGS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

/** Fail before publishing a bundle that cannot initialize its hosted client. */
export function requirePublicEnvironment(env: Record<string, string | undefined>): void {
  const missing = REQUIRED_PUBLIC_SETTINGS.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required public connection settings: ${missing.join(", ")}. Restore the Lovable Cloud connection settings before publishing.`);
  }
}