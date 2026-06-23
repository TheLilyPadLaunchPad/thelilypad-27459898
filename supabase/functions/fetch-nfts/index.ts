import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      console.log(`Fetching single Solana asset: ${assetAddress}`);
      const asset = await fetchSolanaAsset(assetAddress, network === "solana-devnet");

      if (!asset) {
        return new Response(
          JSON.stringify({ error: "Asset not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const metadata = asset.content?.metadata;
      return new Response(
        JSON.stringify({
          asset: {
            tokenId: asset.id,
            contractAddress: asset.id,
            name: metadata?.name || "Solana NFT",
            description: metadata?.description || "",
            image: metadata?.image || asset.content?.links?.image || "",
            owner: asset.ownership?.owner || "",
            attributes: metadata?.attributes || [],
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle collection fetch (Solana)
    if (collectionAddress && (network === "solana-mainnet" || network === "solana-devnet")) {
      console.log(`Fetching Solana collection: ${collectionAddress}`);
      const collection = await fetchSolanaCollection(collectionAddress, network === "solana-devnet");

      return new Response(
        JSON.stringify({ collection }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle wallet NFTs fetch
    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: "Wallet address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching NFTs for ${walletAddress} on ${network}`);

    let result;

    if (network === "solana-mainnet" || network === "solana-devnet") {
      // Use DAS API for Solana
      result = await fetchSolanaAssetsByOwner(
        walletAddress,
        network === "solana-devnet",
        page
      );
    } else if (EVM_NETWORKS.includes(network)) {
      const ALCHEMY_API_KEY = Deno.env.get("ALCHEMY_API_KEY");
      if (!ALCHEMY_API_KEY) {
        console.error("ALCHEMY_API_KEY is not configured");
        return new Response(
          JSON.stringify({ error: "Alchemy API key not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = await fetchEVMNFTs(ALCHEMY_API_KEY, walletAddress, network, pageKey);
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported network: ${network}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${result.totalCount} total NFTs, returning ${result.nfts.length}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-nfts function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
