/**
 * useXRPLMint - Hook for minting single NFTs on XRPL
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { createXRPLClient, createXRPLWallet, getXRPLNetwork } from '@/chains/xrpl/client';
import { mintNFT } from '@/chains/xrpl/nft';
import type { XRPLNFTParams, XRPLMintResult } from '@/chains/xrpl/types';

export function useXRPLMint() {
    const [isMinting, setIsMinting] = useState(false);
    const [result, setResult] = useState<XRPLMintResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mint = useCallback(async (
        seed: string,
        params: XRPLNFTParams,
        network: 'mainnet' | 'testnet' = 'testnet'
    ) => {
        setIsMinting(true);
        setError(null);
        setResult(null);

        try {
            toast.loading('Minting NFT on XRPL...', { id: 'xrpl-mint' });

            const client = await createXRPLClient(network);
            const wallet = createXRPLWallet(seed);

            const mintResult = await mintNFT(client, wallet, params);

            await client.disconnect();

            setResult(mintResult);
            toast.success(`NFT minted! ID: ${mintResult.nftId}`, { id: 'xrpl-mint' });

            return mintResult;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to mint NFT';
            setError(errorMessage);
            toast.error(errorMessage, { id: 'xrpl-mint' });
            throw err;
        } finally {
            setIsMinting(false);
        }
    }, []);

    return {
        mint,
        isMinting,
        result,
        error,
    };
}
