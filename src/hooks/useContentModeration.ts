import { useCallback, useState } from "react";

type ContentType = "text" | "image" | "collection_name" | "collection_description" | "trait_name" | "comment";

interface ModerationResult {
  is_safe: boolean;
  score: number;
  reasons: string[];
  details: Record<string, any>;
  blocked_pattern_match?: string;
}

interface ModerationResponse {
  result: ModerationResult;
  action: "approved" | "blocked" | "flagged" | "review";
  blocked_pattern?: string;
  error?: string;
}

/**
 * Content moderation is disabled: the app makes no AI model calls.
 * Uploads are validated locally (file type, size, dimensions) and
 * anything inappropriate is handled by admins from the dashboard.
 */
export function useContentModeration() {
  const [isChecking] = useState(false);

  const quickCheck = useCallback((_text: string): boolean => true, []);

  const moderateContent = useCallback(async (
    _contentType: ContentType,
    _contentText?: string,
    _contentUrl?: string,
    _imageBase64?: string,
    _referenceId?: string,
    _referenceTable?: string
  ): Promise<ModerationResponse | null> => null, []);

  const moderateImage = useCallback(async (
    _imageBase64: string,
    _imageName?: string
  ): Promise<{ allowed: boolean; reason?: string }> => ({ allowed: true }), []);

  const validateContent = useCallback(async (
    _contentType: ContentType,
    _text: string,
    _showToast = true
  ): Promise<boolean> => true, []);

  return {
    isChecking,
    fetchBlockedPatterns: async () => { },
    quickCheck,
    moderateContent,
    moderateImage,
    validateContent,
    blockedPatterns: [] as string[],
  };
}
