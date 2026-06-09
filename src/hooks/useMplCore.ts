import { useMemo } from 'react';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { create, fetchAsset, fetchCollection } from '@metaplex-foundation/mpl-core';
import { SendTransactionError } from '@solana/web3.js';
import { useWallet } from '@/providers/WalletProvider';
import { initializeUmi } from '@/config/solana';
import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import { createCoreCollection as createCollectionAction } from '@/chains/solana/programs';
import { friendlyCollectionFetchError } from '@/lib/launchpad/verifyDeploy';

export interface CreateNftParams {
    name: string;
    uri: string;
    /** Optional collection address — asset will be created as part of the collection */
    collectionAddress?: string;
    /** Optional plugins to attach at creation time (cheaper than adding later) */
    plugins?: any[];
    /** Optional recipient — defaults to the signer */
    owner?: string;
}

export const useMplCore = () => {
    const { network, getSolanaProvider } = useWallet();

    const umi = useMemo(() => {
        const umiInstance = initializeUmi(network);

        const provider = getSolanaProvider();
        if (provider && provider.publicKey) {
            const wallet = {
                publicKey: provider.publicKey,
                signTransaction: provider.signTransaction?.bind(provider),
                signAllTransactions: provider.signAllTransactions?.bind(provider),
                signMessage: provider.signMessage ? provider.signMessage.bind(provider) : undefined,
            };
            umiInstance.use(walletAdapterIdentity(wallet));
        }

        return umiInstance;
    }, [network, getSolanaProvider]);

    const createCoreNft = async ({ name, uri, collectionAddress, plugins, owner }: CreateNftParams) => {
        try {
            if (!umi.identity.publicKey) {
                throw new Error("Wallet not connected");
            }

            const asset = generateSigner(umi);

            // Per Metaplex Core docs: when minting into a collection, pass the fetched
            // Collection object (not a publicKey) so the SDK can resolve update authority.
            const collection = collectionAddress
                ? await fetchCollection(umi, publicKey(collectionAddress))
                : undefined;

            const transaction = create(umi, {
                asset,
                ...(collection ? { collection } : {}),
                ...(owner ? { owner: publicKey(owner) } : {}),
                ...(plugins ? { plugins } : {}),
                name,
                uri,
            });

            const result = await transaction.sendAndConfirm(umi);

            return { signature: result.signature, assetAddress: asset.publicKey };
        } catch (error: any) {
            console.error("Error creating NFT:", error);

            if (error instanceof SendTransactionError && error.logs) {
                console.error("--- TRANSACTION LOGS ---");
                console.error(error.logs);
            }

            throw error;
        }
    };

    const fetchCoreAsset = async (assetAddress: string) => {
        try {
            const assetPubkey = publicKey(assetAddress);
            const asset = await fetchAsset(umi, assetPubkey);
            return asset;
        } catch (error) {
            console.error("Error fetching asset:", error);
            throw error;
        }
    };

    const fetchCoreCollection = async (collectionAddress: string) => {
        try {
            const collectionPubkey = publicKey(collectionAddress);
            const collection = await fetchCollection(umi, collectionPubkey);
            return collection;
        } catch (error) {
            console.error("Error fetching collection:", error);
            throw error;
        }
    };

    const createCoreCollection = async (params: { name: string; symbol: string; uri: string }) => {
        try {
            const result = await createCollectionAction(umi, params);
            return { collectionAddress: result.address };
        } catch (error) {
            console.error("Error creating collection:", error);
            throw error;
        }
    };

    return { umi, createCoreNft, fetchCoreAsset, fetchCoreCollection, createCoreCollection };
};
