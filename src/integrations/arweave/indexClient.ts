import {
    uploadMetadataToArweave,
    getIrysMutableUrl,
    queryIrysByTags
} from "@/integrations/arweave/legacyClient";

/**
 * Decentralized Index Entry for a Collection
 */
export interface IndexedCollection {
    id: string;
    name: string;
    symbol: string;
    description: string;
    chain: string;
    contract_address: string;
    image_url: string;
    manifest_uri: string;
    created_at: string;
    creator_address: string;
    is_dynamic: boolean;
}

/**
 * The Master Index Structure
 */
export interface DecentralizedIndex {
    name: string;
    version: string;
    updatedAt: string;
    collections: IndexedCollection[];
}

// Key tags for finding the index on Arweave without a hardcoded Root TX
const DISCOVERY_TAGS = [
    { name: "App-Name", value: "TheLilyPad_NFT_Marketplace" },
    { name: "Content-Type", value: "application/json" },
    { name: "Type", value: "Collection_Registry" },
    { name: "Index-Version", value: "V1" }
];

const DEFAULT_INDEX_ROOT = "LILYPAD_MARKETPLACE_INDEX_ROOT_V1";

/**
 * Discovers the latest index Root TX by searching Arweave tags.
 * This removes the need for a hardcoded VITE_INDEX_ROOT_TX once an index exists.
 */
export async function discoverLatestIndex(): Promise<string | null> {
    try {
        console.log("[ArweaveIndex] Attempting tag-based discovery...");

        // Convert discovery tags to the format expected by queryIrysByTags
        const queryTags = DISCOVERY_TAGS.map(t => ({ name: t.name, values: [t.value] }));

        // Find the most recent transaction with these tags
        const results = await queryIrysByTags(queryTags, 1, "DESC");

        if (results && results.length > 0) {
            const latestTx = results[0].node.id;
            console.log("[ArweaveIndex] Discovered index root:", latestTx);
            return latestTx;
        }

        console.log("[ArweaveIndex] No index found via discovery tags.");
        return null;
    } catch (e) {
        console.warn("[ArweaveIndex] Discovery failed:", e);
        return null;
    }
}

/**
 * Fetches the decentralized index from Arweave.
 * If no rootTxId is provided, it attempts to discover the latest one via tags.
 */
export async function getDecentralizedIndex(rootTxId?: string): Promise<DecentralizedIndex> {
    try {
        let activeRoot = rootTxId;

        // If no root provided, try discovery
        if (!activeRoot || activeRoot === DEFAULT_INDEX_ROOT) {
            activeRoot = await discoverLatestIndex() || DEFAULT_INDEX_ROOT;
        }

        // If we still have fallback, return empty
        if (activeRoot === DEFAULT_INDEX_ROOT) {
            return {
                name: "The Lily Pad Index",
                version: "1.0.0",
                updatedAt: new Date().toISOString(),
                collections: []
            };
        }

        const url = getIrysMutableUrl(activeRoot);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Index not found or not yet created");

        return await response.json();
    } catch (e) {
        console.warn("[ArweaveIndex] Fetch failed, returning empty index", e);
        return {
            name: "The Lily Pad Index",
            version: "1.0.0",
            updatedAt: new Date().toISOString(),
            collections: []
        };
    }
}

/**
 * Adds a new collection to the decentralized index and re-uploads it.
 */
export async function addToDecentralizedIndex(
    collection: IndexedCollection,
    wallet: any,
    rootTxId?: string
): Promise<string> {
    console.log("[ArweaveIndex] Updating index with new collection:", collection.name);

    // 1. Fetch current index (will attempt discovery if rootTxId is undefined)
    const activeRoot = rootTxId || await discoverLatestIndex() || undefined;
    const index = await getDecentralizedIndex(activeRoot);

    // 2. Prevent duplicates (check by contract address)
    const exists = index.collections.some(c =>
        c.contract_address.toLowerCase() === collection.contract_address.toLowerCase()
    );

    if (!exists) {
        index.collections.unshift(collection);
        index.updatedAt = new Date().toISOString();
    } else {
        console.log("[ArweaveIndex] Collection already exists in index.");
        return activeRoot || "ALREADY_INDEXED";
    }

    // 3. Upload mutated index to Arweave with discovery tags
    try {
        const newUri = await uploadMetadataToArweave(
            index,
            wallet,
            true, // isMutable
            activeRoot,
            DISCOVERY_TAGS
        );

        const newRoot = newUri.split('/').pop();
        console.log("[ArweaveIndex] Index successfully updated. New root:", newRoot);
        return newRoot || newUri;
    } catch (err) {
        console.warn("[ArweaveIndex] Failed to update discovered index (likely ownership). Starting fresh index chain...", err);
        const newUri = await uploadMetadataToArweave(
            index,
            wallet,
            true, // isMutable
            undefined, // Start fresh
            DISCOVERY_TAGS
        );
        const newRoot = newUri.split('/').pop();
        return newRoot || newUri;
    }
}
