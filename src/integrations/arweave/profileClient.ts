import {
    uploadMetadataToArweave,
    getIrysMutableUrl
} from "@/integrations/arweave/legacyClient";
import { queryIrysByTags } from "@/integrations/arweave/graphql";
import { UserProfile } from "@/hooks/useUserProfile";

/**
 * Discovery tags for User Profiles on Arweave
 */
export const getProfileTags = (walletAddress: string) => [
    { name: "App-Name", value: "TheLilyPad_User_Profiles" },
    { name: "Content-Type", value: "application/json" },
    { name: "Type", value: "User_Profile" },
    { name: "Wallet-Address", value: walletAddress.toLowerCase() },
    { name: "Version", value: "V1" }
];

/**
 * Finds the latest Profile Root TX for a specific wallet address
 */
export async function discoverUserProfile(walletAddress: string): Promise<string | null> {
    try {
        console.log(`[ArweaveProfile] Discovering profile for ${walletAddress}...`);

        const queryTags = [
            { name: "App-Name", values: ["TheLilyPad_User_Profiles"] },
            { name: "Type", values: ["User_Profile"] },
            { name: "Wallet-Address", values: [walletAddress.toLowerCase()] }
        ];

        const results = await queryIrysByTags(queryTags, 1, "DESC");

        if (results && results.length > 0) {
            return results[0].node.id;
        }

        return null;
    } catch (e) {
        console.warn("[ArweaveProfile] Discovery failed:", e);
        return null;
    }
}

/**
 * Fetches a decentralized user profile from Arweave
 */
export async function getDecentralizedProfile(walletAddress: string): Promise<UserProfile | null> {
    try {
        const rootTxId = await discoverUserProfile(walletAddress);
        if (!rootTxId) return null;

        const url = getIrysMutableUrl(rootTxId);
        const response = await fetch(url);
        if (!response.ok) return null;

        return await response.json();
    } catch (e) {
        console.warn("[ArweaveProfile] Fetch failed:", e);
        return null;
    }
}

/**
 * Saves a user profile to Arweave using Irys mutable references.
 * Automatically chains the mutation if an existing profile is found.
 */
export async function saveDecentralizedProfile(
    profile: Partial<UserProfile>,
    wallet: any
): Promise<string> {
    if (!wallet.address) throw new Error("Wallet address required to save profile");

    console.log(`[ArweaveProfile] Saving decentralized profile for ${wallet.address}...`);

    // 1. Check for existing profile to chain the mutation
    const existingRoot = await discoverUserProfile(wallet.address);

    // 2. Prepare the profile data (ensure wallet_address is correct)
    const profileData = {
        ...profile,
        wallet_address: wallet.address,
        updated_at: new Date().toISOString(),
        created_at: profile.created_at || new Date().toISOString()
    };

    // 3. Upload with Root-TX (if existing) to maintain a single mutable URL history
    // and include discovery tags so it can be found by address.
    const tags = getProfileTags(wallet.address);

    const newUri = await uploadMetadataToArweave(
        profileData,
        wallet,
        true, // isMutable
        existingRoot || undefined,
        tags
    );

    const newRoot = newUri.split('/').pop();
    console.log(`[ArweaveProfile] Profile saved. Root: ${newRoot}`);
    return newRoot || newUri;
}
