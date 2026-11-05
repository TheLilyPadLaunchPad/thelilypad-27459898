import { supabase } from "@/integrations/supabase/client";

/** Verifies a Turnstile token on the server. Throws if verification fails. */
export async function verifyTurnstile(token: string | null, action: string): Promise<void> {
  if (!token) throw new Error("Please complete the human check first.");
  const { data, error } = await supabase.functions.invoke("verify-turnstile", {
    body: { token, action },
  });
  if (error || !data?.success) {
    throw new Error("Human check failed. Please try again.");
  }
}
