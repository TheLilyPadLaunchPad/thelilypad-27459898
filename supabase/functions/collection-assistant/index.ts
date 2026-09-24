import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText } from "npm:ai";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json({ error: "AI is not configured" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { collectionId, messages } = body ?? {};
  if (typeof collectionId !== "string" || !Array.isArray(messages) || messages.length === 0 || messages.length > 30)
    return json({ error: "Invalid request" }, 400);
  const history = messages
    .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: collection } = await sb
    .from("collections")
    .select("id,name,description,symbol,chain,total_supply,minted,mint_price,status,contract_address,royalty_percentage,is_revealed")
    .eq("id", collectionId)
    .maybeSingle();
  if (!collection) return json({ error: "Collection not found" }, 404);

  const { data: listings } = await sb
    .from("marketplace_listings")
    .select("price,currency,status,created_at,nft:nfts(name,token_id,attributes)")
    .eq("status", "active")
    .eq("nft.collection_id", collectionId)
    .order("price", { ascending: true })
    .limit(25);
  const active = (listings ?? []).filter((l: any) => l.nft);
  const floor = active.length ? active[0].price : null;

  const facts = JSON.stringify({ collection, marketplace: { activeListings: active.length, floor, listings: active } });

  const lovable = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });

  try {
    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      system:
        "You are The Lily Pad's collection assistant. Answer collectors' questions about this NFT collection and its marketplace listings using ONLY the facts provided. If the facts don't cover it, say you don't know. Be concise (under 150 words). Never give financial advice or price predictions.\n\nFACTS:\n" +
        facts,
      messages: history,
      abortSignal: req.signal,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false, include: ["reasoning.encrypted_content"] } },
      onError: ({ error }) => console.error("assistant stream error", error),
    });
    return result.toTextStreamResponse({ headers: cors });
  } catch (e: any) {
    const status = e?.statusCode || e?.status || 500;
    console.error("assistant error", status, e?.message);
    if (status === 402) return json({ error: "AI credits have run out. Please top up to keep using the assistant." }, 402);
    if (status === 429) return json({ error: "The assistant is busy right now. Please try again in a moment." }, 429);
    return json({ error: "The assistant couldn't answer right now." }, status);
  }
});
