import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDasUmi } from "@/utils/dasApi";
import { getSolanaRpcUrl, NetworkType } from "@/config/solana";
import { publicKey } from "@metaplex-foundation/umi";
import { DasApiAsset, DasApiAssetList } from "@metaplex-foundation/digital-asset-standard-api";

export interface NFT {
  tokenId: string;
  contractAddress: string;
  name: string;
  description: string;
  image: string;
  collection: string;
  attributes: Array<{ trait_type: string; value: string }>;
  standard?: string;
  isCompressed?: boolean;
}

interface UseWalletNFTsResult {
  nfts: NFT[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

// Check if network is Solana
const isSolanaNetwork = (network: string) =>
  network === "solana-mainnet" || network === "solana-devnet";

const getNetworkType = (network: string): NetworkType => {
  if (network === "solana-mainnet") return "mainnet";
  if (network === "solana-devnet") return "devnet";
  return "devnet"; // Default fallback
};

export function useWalletNFTs(
  walletAddress: string | null,
  network: string = "eth-mainnet"
): UseWalletNFTsResult {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageKey, setPageKey] = useState<string | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchNFTs = useCallback(async (loadMore = false) => {
    if (!walletAddress) {
      setNfts([]);
      setTotalCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const isSolana = isSolanaNetwork(network);

      if (isSolana) {
        const networkType = getNetworkType(network);
        const rpcUrl = getSolanaRpcUrl(networkType);

        // Initialize Umi with DAS API
        const umi = getDasUmi(rpcUrl);
        const owner = publicKey(walletAddress);
        const page = loadMore ? currentPage + 1 : 1;
        const limit = 50;

        // Fetch assets using DAS API
        const assets = await (umi.rpc as any).getAssetsByOwner({
          owner,
          page,
          limit,
          sortBy: { sortBy: 'created', sortDirection: 'desc' }
        }) as DasApiAssetList;

        // Filter to only NFT-type assets (exclude fungible tokens, SOL, SPL tokens)
        const nftAssets = assets.items.filter((asset: DasApiAsset) => {
          const iface = asset.interface;
          // Only keep known NFT interfaces
          return (
            iface === 'V1_NFT' ||
            iface === 'MplCoreAsset' ||
            iface === 'ProgrammableNFT' ||
            iface === 'MplCoreCollection' ||
            (asset.compression?.compressed === true) // compressed NFTs
          );
        });

        // Map DAS assets to our NFT interface
        const mappedNfts: NFT[] = nftAssets.map((asset: DasApiAsset) => {
          // Find collection grouping
          const collectionGroup = asset.grouping.find(
            (g: any) => g.group_key === 'collection'
          );

          // Get image URL — prefer DAS cdn_uri (already proxied), then raw uri.
          // Never fall back to json_uri: that is a JSON metadata file, not an image.
          const imageFile = (asset.content.files as any[])?.find(
            (f: any) => f.mime?.startsWith('image/')
          );
          const image =
            (asset.content.links as any)?.image ||
            imageFile?.cdn_uri ||
            imageFile?.uri ||
            "";

          // Map attributes
          const attributes = asset.content.metadata.attributes?.map((attr: any) => ({
            trait_type: attr.trait_type || "Unknown",
            value: attr.value?.toString() || ""
          })) || [];

          // Determine standard and compression
          const isCompressed = asset.compression?.compressed || false;
          let standard = "Standard";

          if (asset.interface === "MplCoreAsset") standard = "Core";
          else if (isCompressed) standard = "Compressed";
          else if (asset.interface === "V1_NFT") standard = "Standard";

          return {
            tokenId: asset.id,
            contractAddress: asset.id, // For Solana, the mint address is the contract address
            name: asset.content.metadata.name || "Unknown Asset",
            description: asset.content.metadata.description || "",
            image,
            collection: collectionGroup?.group_value || "Unknown Collection",
            attributes,
            standard,
            isCompressed
          };
        });

        if (loadMore) {
          setNfts((prev) => [...prev, ...mappedNfts]);
          setCurrentPage(page);
        } else {
          setNfts(mappedNfts);
          setCurrentPage(1);
        }

        // DAS total includes all asset types; use it as upper bound
        // but check if we got a full page of NFTs to determine hasMore
        setTotalCount(loadMore ? nfts.length + mappedNfts.length : mappedNfts.length);
        setHasMore(assets.items.length === limit && mappedNfts.length > 0);

      } else {
        // Legacy Supabase/Alchemy path for non-Solana (or if we revert)
        const { data, error: fnError } = await supabase.functions.invoke("fetch-nfts", {
          body: {
            walletAddress,
            network,
            pageKey: loadMore ? pageKey : undefined,
            page: 0, // Alchemy doesn't use page numbers this way usually
            isDevnet: false,
          },
        });

        if (fnError) throw new Error(fnError.message);
        if (data.error) throw new Error(data.error);

        const newNfts = data.nfts || [];

        if (loadMore) {
          setNfts((prev) => [...prev, ...newNfts]);
        } else {
          setNfts(newNfts);
        }

        setTotalCount(data.totalCount || 0);
        setPageKey(data.pageKey);
        setHasMore(!!data.pageKey);
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch NFTs";
      setError(message);
      console.error("Error fetching NFTs:", err);

      if (!loadMore) {
        toast.error("Failed to load NFTs");
      }
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, network, pageKey, currentPage]);

  const loadMore = useCallback(async () => {
    if (hasMore && !isLoading) {
      await fetchNFTs(true);
    }
  }, [fetchNFTs, hasMore, isLoading]);

  const refresh = useCallback(async () => {
    setPageKey(undefined);
    setCurrentPage(1);
    setNfts([]);
    await fetchNFTs(false);
  }, [fetchNFTs]);

  // Reset and fetch when wallet or network changes
  useEffect(() => {
    setNfts([]);
    setPageKey(undefined);
    setCurrentPage(1);
    setHasMore(false);
    fetchNFTs(false);
  }, [walletAddress, network]);

  return {
    nfts,
    totalCount,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}

// Hook to fetch a single Solana asset using DAS
export function useSolanaAsset(assetAddress: string | null, isDevnet: boolean = true) {
  const [asset, setAsset] = useState<NFT | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAsset = useCallback(async () => {
    if (!assetAddress) {
      setAsset(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const networkType: NetworkType = isDevnet ? "devnet" : "mainnet";
      const rpcUrl = getSolanaRpcUrl(networkType);
      const umi = getDasUmi(rpcUrl);
      const assetId = publicKey(assetAddress);

      const dasAsset = await (umi.rpc as any).getAsset(assetId) as DasApiAsset;

      // Map single asset
      const collectionGroup = dasAsset.grouping.find(
        (g: any) => g.group_key === 'collection'
      );

      const image =
        (dasAsset.content.links as any)?.image ||
        (dasAsset.content.files as any[])?.find((f: any) => f.mime?.startsWith('image/'))?.uri ||
        dasAsset.content.json_uri ||
        "";

      const mappedAsset: NFT = {
        tokenId: dasAsset.id,
        contractAddress: dasAsset.id,
        name: dasAsset.content.metadata.name || "Unknown Asset",
        description: dasAsset.content.metadata.description || "",
        image,
        collection: collectionGroup?.group_value || "Unknown Collection",
        attributes: dasAsset.content.metadata.attributes?.map((attr: any) => ({
          trait_type: attr.trait_type || "Unknown",
          value: attr.value?.toString() || ""
        })) || []
      };

      setAsset(mappedAsset);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch asset";
      setError(message);
      console.error("Error fetching Solana asset:", err);
    } finally {
      setIsLoading(false);
    }
  }, [assetAddress, isDevnet]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  return { asset, isLoading, error, refresh: fetchAsset };
}

// Hook to fetch a Solana collection
// Keeping this using the edge function for now as DAS getCollection logic is different/simpler but might not return full collection metadata object as expected by UI yet
// Or we can map it if we really want to go full DAS.
// For now, let's leave it as is to minimize regression risk on collection pages, unless requested.
export function useSolanaCollection(collectionAddress: string | null, isDevnet: boolean = true) {
  const [collection, setCollection] = useState<{
    address: string;
    name: string;
    symbol: string;
    description: string;
    image: string;
    updateAuthority: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCollection = useCallback(async () => {
    if (!collectionAddress) {
      setCollection(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("fetch-nfts", {
        body: {
          collectionAddress,
          network: isDevnet ? "solana-devnet" : "solana-mainnet",
        },
      });

      if (fnError) {
        throw new Error(fnError.message || "Failed to fetch collection");
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setCollection(data.collection || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch collection";
      setError(message);
      console.error("Error fetching Solana collection:", err);
    } finally {
      setIsLoading(false);
    }
  }, [collectionAddress, isDevnet]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  return { collection, isLoading, error, refresh: fetchCollection };
}
