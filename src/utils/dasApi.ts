import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { dasApi, DasApiAssetList } from '@metaplex-foundation/digital-asset-standard-api';

// Cache the Umi instance to avoid recreating it on every call
let umiInstance: ReturnType<typeof createUmi> | null = null;
let currentEndpoint: string | null = null;

export const getDasUmi = (endpoint: string) => {
    if (umiInstance && currentEndpoint === endpoint) {
        return umiInstance;
    }

    const umi = createUmi(endpoint).use(dasApi());
    umiInstance = umi;
    currentEndpoint = endpoint;

    return umi;
};

/**
 * Fetch assets by group (e.g., collection) using DAS API
 * @param endpoint - RPC endpoint URL
 * @param groupKey - Group key (e.g., "collection")
 * @param groupValue - Group value (e.g., collection address)
 * @param page - Page number (default: 1)
 * @param limit - Items per page (default: 50)
 * @returns Promise<DasApiAssetList>
 */
export async function getAssetsByGroup(
    endpoint: string,
    groupKey: string,
    groupValue: string,
    page: number = 1,
    limit: number = 50
): Promise<DasApiAssetList> {
    const umi = getDasUmi(endpoint);
    
    return await (umi.rpc as any).getAssetsByGroup({
        groupKey,
        groupValue,
        page,
        limit,
        sortBy: { sortBy: 'created', sortDirection: 'desc' }
    }) as DasApiAssetList;
}
