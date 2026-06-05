import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ModerationRequest {
  content_type: "text" | "image" | "collection_name" | "collection_description" | "trait_name" | "comment";
  content_text?: string;
  content_url?: string;
  image_base64?: string;
  reference_id?: string;
  reference_table?: string;
  auto_reject?: boolean;
}

interface ModerationResult {
  is_safe: boolean;
  score: number;
  reasons: string[];
  details: Record<string, any>;
  blocked_pattern_match?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Require authentication — anonymous callers must not consume AI API credits
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId: string = user.id;

    const body: ModerationRequest = await req.json();
    const { content_type, content_text, content_url, image_base64, reference_id, reference_table, auto_reject = true } = body;

    if (!content_text && !content_url && !image_base64) {
      return new Response(
        JSON.stringify({ error: "Either content_text, content_url, or image_base64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Moderation] Processing ${content_type} content`);

    // Step 1: Quick pattern matching check
    const { data: blockedPatterns } = await supabase
      .from("blocked_patterns")
      .select("pattern, reason")
      .eq("is_active", true);

    let patternMatch: string | null = null;
    let patternReason: string | null = null;

    if (content_text && blockedPatterns) {
      const lowerText = content_text.toLowerCase();
      for (const { pattern, reason } of blockedPatterns) {
        if (lowerText.includes(pattern.toLowerCase())) {
          patternMatch = pattern;
          patternReason = reason;
          break;
        }
      }
    }

    // If pattern matched and auto_reject is true, return immediately
    if (patternMatch && auto_reject) {
      const result: ModerationResult = {
        is_safe: false,
        score: 1.0,
        reasons: ["content_policy_violation"],
        details: { blocked_by: "policy" },
      };

      // Log to moderation queue (server-side only, includes the matched pattern for audit)
      if (userId) {
        await supabase.from("moderation_queue").insert({
          content_type,
          content_text,
          content_url,
          reference_id,
          reference_table,
          submitted_by: userId,
          status: "auto_rejected",
          ai_score: 1.0,
          ai_reasons: [patternReason || "nsfw"],
          ai_details: { blocked_by: "pattern_match", matched_pattern: patternMatch },
        });
      }

      console.log(`[Moderation] Blocked by pattern (server-side log only)`);

      // Do NOT include blocked_pattern_match or the pattern in the response —
      // exposing it would let callers enumerate the blocked patterns table.
      return new Response(
        JSON.stringify({ result, action: "blocked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: AI-based moderation
    let aiResult: ModerationResult = {
      is_safe: true,
      score: 0,
      reasons: ["clean"],
      details: {},
    };

    // Image moderation using vision model
    if (content_type === "image" && (image_base64 || content_url)) {
      const imageSystemPrompt = `You are an image content moderation AI. Analyze the following image and determine if it contains any inappropriate material.

Respond with a JSON object containing:
- "is_safe": boolean (true if image is appropriate, false if it contains violations)
- "score": number between 0 and 1 (0 = completely safe, 1 = extremely inappropriate)
- "reasons": array of strings from these categories: ["nsfw", "violence", "hate_speech", "illegal", "clean"]
- "details": object with specific findings including what was detected

Categories to check:
- NSFW: Sexual content, nudity, suggestive poses, adult themes
- Violence: Gore, blood, weapons, graphic violence
- Hate speech: Hate symbols, discriminatory imagery, hate groups
- Illegal: Drug paraphernalia, illegal activities

This is for NFT art - be strict about adult content. Artistic nudity should still be flagged. Cartoon/anime NSFW content should also be flagged.`;

      try {
        const imageContent = image_base64
          ? { type: "image_url", image_url: { url: image_base64 } }
          : { type: "image_url", image_url: { url: content_url } };

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: imageSystemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: "Analyze this image for content moderation:" },
                  imageContent
                ]
              }
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.error("[Moderation] Rate limited by AI gateway");
            return new Response(
              JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (response.status === 402) {
            console.error("[Moderation] Payment required for AI gateway");
            return new Response(
              JSON.stringify({ error: "AI service requires payment. Please add credits." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          throw new Error(`AI gateway error: ${response.status}`);
        }

        const aiResponse = await response.json();
        const aiContent = aiResponse.choices?.[0]?.message?.content;

        if (aiContent) {
          try {
            const parsed = JSON.parse(aiContent);
            aiResult = {
              is_safe: parsed.is_safe ?? true,
              score: parsed.score ?? 0,
              reasons: parsed.reasons ?? ["clean"],
              details: parsed.details ?? {},
            };
            console.log(`[Moderation] Image analysis complete: score=${aiResult.score}, reasons=${aiResult.reasons.join(",")}`);
          } catch (parseError) {
            console.error("[Moderation] Failed to parse AI response:", parseError);
          }
        }
      } catch (aiError) {
        console.error("[Moderation] Image AI analysis error:", aiError);
      }
    }
    // Text content moderation
    else if (content_text) {
      const systemPrompt = `You are a content moderation AI. Analyze the following content and determine if it contains any inappropriate material.

Respond with a JSON object containing:
- "is_safe": boolean (true if content is appropriate, false if it contains violations)
- "score": number between 0 and 1 (0 = completely safe, 1 = extremely inappropriate)
- "reasons": array of strings from these categories: ["nsfw", "violence", "hate_speech", "spam", "harassment", "illegal", "clean"]
- "details": object with specific findings

Categories to check:
- NSFW: Sexual content, nudity, adult themes
- Violence: Gore, threats, graphic violence
- Hate speech: Discrimination, slurs, hate groups
- Spam: Promotional content, phishing
- Harassment: Bullying, personal attacks
- Illegal: Drug promotion, illegal activities

Be strict but fair. If content is borderline, lean towards flagging it for review.`;

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Analyze this content:\n\n"${content_text}"` }
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.error("[Moderation] Rate limited by AI gateway");
            return new Response(
              JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (response.status === 402) {
            console.error("[Moderation] Payment required for AI gateway");
            return new Response(
              JSON.stringify({ error: "AI service requires payment. Please add credits." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          throw new Error(`AI gateway error: ${response.status}`);
        }

        const aiResponse = await response.json();
        const aiContent = aiResponse.choices?.[0]?.message?.content;

        if (aiContent) {
          try {
            const parsed = JSON.parse(aiContent);
            aiResult = {
              is_safe: parsed.is_safe ?? true,
              score: parsed.score ?? 0,
              reasons: parsed.reasons ?? ["clean"],
              details: parsed.details ?? {},
            };
          } catch (parseError) {
            console.error("[Moderation] Failed to parse AI response:", parseError);
          }
        }
      } catch (aiError) {
        console.error("[Moderation] AI analysis error:", aiError);
      }
    }

    // Determine final status
    let status: string;
    let action: string;

    if (!aiResult.is_safe && aiResult.score >= 0.8 && auto_reject) {
      status = "auto_rejected";
      action = "blocked";
    } else if (!aiResult.is_safe && aiResult.score >= 0.5) {
      status = "pending";
      action = "flagged";
    } else if (aiResult.score > 0.2) {
      status = "pending";
      action = "review";
    } else {
      status = "auto_approved";
      action = "approved";
    }

    // Log to moderation queue if user is authenticated
    if (userId) {
      await supabase.from("moderation_queue").insert({
        content_type,
        content_text,
        content_url,
        reference_id,
        reference_table,
        submitted_by: userId,
        status,
        ai_score: aiResult.score,
        ai_reasons: aiResult.reasons,
        ai_details: aiResult.details,
      });
    }

    console.log(`[Moderation] Result: ${action} (score: ${aiResult.score})`);

    return new Response(
      JSON.stringify({
        result: aiResult,
        action,
        blocked_pattern: patternMatch,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Moderation] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
