import { supabase } from "@/integrations/supabase/client";

const BUCKET = "shop-items";

/**
 * Upload a file to the private `shop-items` bucket using a short-lived signed
 * upload URL minted by the `shop-item-upload-url` edge function.
 *
 * The endpoint validates the caller's JWT and enforces that the path is either
 * `<their-user-id>/...` or `platform/...` (admins only), so users can never
 * write over someone else's assets.
 */
export async function uploadShopItemFile(path: string, file: File): Promise<string> {
  const { data, error } = await supabase.functions.invoke("shop-item-upload-url", {
    body: { path },
  });

  if (error) {
    throw new Error(error.message || "Could not authorize upload");
  }
  if (!data?.token || !data?.path) {
    throw new Error(data?.error || "Could not authorize upload");
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(data.path, data.token, file, {
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  return data.path as string;
}

/** Resolve a stored shop-items path to a URL usable in the UI. */
export function getShopItemUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
