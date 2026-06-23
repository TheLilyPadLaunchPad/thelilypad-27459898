import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- In-memory response cache (per-isolate) -----------------------------
// Reduces repeated Alchemy/DAS calls when users scroll back and forth, and
// when multiple components request the same wallet/collection concurrently.
// TTLs are intentionally short — NFT ownership changes on-chain.
const CACHE_TTL_MS = {
  wallet: 30_000,      // owner -> nft list
  asset: 120_000,      // single asset metadata (rarely changes)
  collection: 300_000, // collection metadata (rarely changes)
};
const MAX_CACHE_ENTRIES = 500;

type CacheEntry = { body: string; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

function cacheGet(key: string): string | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  // refresh LRU position
  responseCache.delete(key);
  responseCache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: string, ttlMs: number) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { body, expiresAt: Date.now() + ttlMs });
}

async function withCache(
  key: string,
  ttlMs: number,
  producer: () => Promise<unknown>,
): Promise<{ body: string; cached: boolean }> {
  const cached = cacheGet(key);
  if (cached) return { body: cached, cached: true };

  const existing = inflight.get(key);
  if (existing) return { body: await existing, cached: true };

  const promise = (async () => {
    const value = await producer();
    const body = JSON.stringify(value);
    cacheSet(key, body, ttlMs);
    return body;
  })();
  inflight.set(key, promise);
  try {
    const body = await promise;
    return { body, cached: false };
  } finally {
    inflight.delete(key);
  }
}

function cachedJson(body: string, cached: boolean, ttlMs: number) {
  const maxAge = Math.floor(ttlMs / 1000);
  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      "X-Cache": cached ? "HIT" : "MISS",
    },
  });
}

// Supported EVM networks
const EVM_NETWORKS = [
  "eth-mainnet",
  "polygon-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "base-mainnet",
];

// Solana RPC endpoints
const SOLANA_RPC = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};

interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

interface AlchemyNFT {
  tokenId: string;
  contract: {
    address: string;
    name?: string;
    symbol?: string;
  };
  name?: string;
  description?: string;
  image?: {
    cachedUrl?: string;
    originalUrl?: string;
    thumbnailUrl?: string;
  };
  raw?: {
    metadata?: NFTMetadata;
  };
  collection?: {
    name?: string;
  };
}

interface AlchemyResponse {
  ownedNfts: AlchemyNFT[];
  totalCount: number;
  pageKey?: string;
}

// DAS API response types for Solana
interface DASAsset {
  id: string;
  content?: {
    json_uri?: string;
    metadata?: {
      name?: string;
      description?: string;
      symbol?: string;
      image?: string;
      attributes?: Array<{ trait_type: string; value: string | number }>;
    };
    files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>;
    links?: {
      image?: string;
    };
  };
  ownership?: {
    owner?: string;
  };
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
  authorities?: Array<{
    address: string;
    scopes: string[];
  }>;
}

interface DASResponse {
  result?: DASAsset | DASAsset[] | {
    items?: DASAsset[];
    total?: number;
    page?: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

async function fetchEVMNFTs(
  apiKey: string,
  walletAddress: string,
  network: string,
  pageKey?: string
) {
  const baseUrl = `https://${network}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner`;

  const params = new URLSearchParams({
    owner: walletAddress,
    withMetadata: "true",
    pageSize: "20",
  });

  if (pageKey) {
    params.append("pageKey", pageKey);
  }

  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Alchemy API error: ${response.status} - ${errorText}`);
  }

  const data: AlchemyResponse = await response.json();

  const nfts = data.ownedNfts.map((nft) => ({
    tokenId: nft.tokenId,
    contractAddress: nft.contract.address,
    name: nft.name || nft.raw?.metadata?.name || `#${nft.tokenId}`,
    description: nft.description || nft.raw?.metadata?.description || "",
    image: nft.image?.cachedUrl || nft.image?.thumbnailUrl || nft.image?.originalUrl || nft.raw?.metadata?.image || "",
    collection: nft.collection?.name || nft.contract.name || "Unknown Collection",
    attributes: nft.raw?.metadata?.attributes || [],
  }));

  return {
    nfts,
    totalCount: data.totalCount,
    pageKey: data.pageKey,
  };
}

// Fetch a single Solana NFT using DAS API
async function fetchSolanaAsset(
  assetAddress: string,
  isDevnet: boolean = true
): Promise<DASAsset | null> {
  const rpcUrl = isDevnet ? SOLANA_RPC.devnet : SOLANA_RPC.mainnet;

  console.log(`Fetching Solana asset ${assetAddress} from ${rpcUrl}`);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",
      params: {
        id: assetAddress,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Solana DAS API error:", response.status, errorText);
    throw new Error(`Solana DAS API error: ${response.status} - ${errorText}`);
  }

  const data: DASResponse = await response.json();

  if (data.error) {
    console.error("DAS API returned error:", data.error);
    throw new Error(`DAS API error: ${data.error.message}`);
  }

  return data.result as DASAsset | null;
}

// Fetch NFTs owned by a wallet using DAS API
async function fetchSolanaAssetsByOwner(
  ownerAddress: string,
  isDevnet: boolean = true,
  page: number = 1,
  limit: number = 20
) {
  const rpcUrl = isDevnet ? SOLANA_RPC.devnet : SOLANA_RPC.mainnet;

  console.log(`Fetching Solana assets for owner ${ownerAddress} from ${rpcUrl}`);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAssetsByOwner",
      params: {
        ownerAddress,
        page,
        limit,
        displayOptions: {
          showCollectionMetadata: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Solana DAS API error:", response.status, errorText);
    throw new Error(`Solana DAS API error: ${response.status} - ${errorText}`);
  }

  const data: DASResponse = await response.json();

  if (data.error) {
    console.error("DAS API returned error:", data.error);
    throw new Error(`DAS API error: ${data.error.message}`);
  }

  const result = data.result as { items?: DASAsset[]; total?: number };
  const assets = result?.items || [];

  // Transform to common NFT format
  const nfts = assets.map((asset) => {
    const metadata = asset.content?.metadata;
    const imageUrl = metadata?.image ||
      asset.content?.links?.image ||
      asset.content?.files?.find(f => f.mime?.startsWith('image/'))?.cdn_uri ||
      asset.content?.files?.find(f => f.mime?.startsWith('image/'))?.uri ||
      "";

    // Find collection from grouping
    const collectionGroup = asset.grouping?.find(g => g.group_key === "collection");

    return {
      tokenId: asset.id,
      contractAddress: asset.id,
      name: metadata?.name || `Solana NFT`,
      description: metadata?.description || "",
      image: imageUrl,
      collection: collectionGroup?.group_value || "Solana Collection",
      attributes: (metadata?.attributes || []).map(attr => ({
        trait_type: attr.trait_type,
        value: String(attr.value),
      })),
    };
  });

  return {
    nfts,
    totalCount: result?.total || nfts.length,
    hasMore: nfts.length === limit,
    page,
  };
}

// Fetch collection info using DAS API
async function fetchSolanaCollection(
  collectionAddress: string,
  isDevnet: boolean = true
) {
  const rpcUrl = isDevnet ? SOLANA_RPC.devnet : SOLANA_RPC.mainnet;

  console.log(`Fetching Solana collection ${collectionAddress} from ${rpcUrl}`);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",
      params: {
        id: collectionAddress,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Solana DAS API error: ${response.status} - ${errorText}`);
  }

  const data: DASResponse = await response.json();

  if (data.error) {
    throw new Error(`DAS API error: ${data.error.message}`);
  }

  const asset = data.result as DASAsset;
  const metadata = asset?.content?.metadata;

  return {
    address: collectionAddress,
    name: metadata?.name || "Unknown Collection",
    symbol: metadata?.symbol || "",
    description: metadata?.description || "",
    image: metadata?.image || asset?.content?.links?.image || "",
    updateAuthority: asset?.authorities?.find(a => a.scopes.includes("full"))?.address || "",
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Public read-only endpoint: wallet-connected users have no Supabase JWT,
  // and the data returned is on-chain public NFT metadata. No auth required.

  try {
    const {
      walletAddress,
      network = "eth-mainnet",
      pageKey,
      // Solana specific params
      assetAddress,
      collectionAddress,
      isDevnet = true,
      page = 1,
    } = await req.json();

    // Handle single asset fetch (Solana)
    if (assetAddress && (network === "solana-mainnet" || network === "solana-devnet")) {
      const key = `asset:${network}:${assetAddress}`;
      const { body, cached } = await withCache(key, CACHE_TTL_MS.asset, async () => {
        console.log(`Fetching single Solana asset: ${assetAddress}`);
        const asset = await fetchSolanaAsset(assetAddress, network === "solana-devnet");
        if (!asset) return { __notFound: true };
        const metadata = asset.content?.metadata;
        return {
          asset: {
            tokenId: asset.id,
            contractAddress: asset.id,
            name: metadata?.name || "Solana NFT",
            description: metadata?.description || "",
            image: metadata?.image || asset.content?.links?.image || "",
            owner: asset.ownership?.owner || "",
            attributes: metadata?.attributes || [],
          },
        };
      });
      if (body.includes('"__notFound":true')) {
        return new Response(
          JSON.stringify({ error: "Asset not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return cachedJson(body, cached, CACHE_TTL_MS.asset);
    }

    // Handle collection fetch (Solana)
    if (collectionAddress && (network === "solana-mainnet" || network === "solana-devnet")) {
      const key = `collection:${network}:${collectionAddress}`;
      const { body, cached } = await withCache(key, CACHE_TTL_MS.collection, async () => {
        console.log(`Fetching Solana collection: ${collectionAddress}`);
        const collection = await fetchSolanaCollection(collectionAddress, network === "solana-devnet");
        return { collection };
      });
      return cachedJson(body, cached, CACHE_TTL_MS.collection);
    }

    // Handle wallet NFTs fetch
    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: "Wallet address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const walletKey = `wallet:${network}:${walletAddress}:${page ?? 1}:${pageKey ?? ""}`;
    type WalletResult =
      | { body: string; cached: boolean }
      | { __error: { status: number; message: string } };
    const result: WalletResult = await withCache(walletKey, CACHE_TTL_MS.wallet, async () => {
      console.log(`Fetching NFTs for ${walletAddress} on ${network}`);

      if (network === "solana-mainnet" || network === "solana-devnet") {
        return await fetchSolanaAssetsByOwner(
          walletAddress,
          network === "solana-devnet",
          page,
        );
      }
      if (EVM_NETWORKS.includes(network)) {
        const ALCHEMY_API_KEY = Deno.env.get("ALCHEMY_API_KEY");
        if (!ALCHEMY_API_KEY) {
          throw new Error("ALCHEMY_API_KEY_MISSING");
        }
        return await fetchEVMNFTs(ALCHEMY_API_KEY, walletAddress, network, pageKey);
      }
      throw new Error(`UNSUPPORTED_NETWORK:${network}`);
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ALCHEMY_API_KEY_MISSING") {
        return { __error: { status: 500, message: "Alchemy API key not configured" } };
      }
      if (msg.startsWith("UNSUPPORTED_NETWORK:")) {
        return { __error: { status: 400, message: `Unsupported network: ${msg.split(":")[1]}` } };
      }
      throw err;
    });

    if ("__error" in result) {
      return new Response(
        JSON.stringify({ error: result.__error.message }),
        { status: result.__error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return cachedJson(result.body, result.cached, CACHE_TTL_MS.wallet);
  } catch (error) {
    console.error("Error in fetch-nfts function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
