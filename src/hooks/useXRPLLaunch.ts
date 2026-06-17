/**
 * useXRPLLaunch - Hook for deploying collections and batch minting on XRPL
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { createXRPLClient, createXRPLWallet } from '@/chains/xrpl/client';
import { batchMintNFTs } from '@/chains/xrpl/domain';
import type { XRPLBatchMintParams, XRPLBatchMintResult } from '@/chains/xrpl/types';

export interface XRPLMintResult {
    nftId: string;
    name: string;
    txHash: string;
}

export function useXRPLLaunch() {
    const [isLaunching, setIsLaunching] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [result, setResult] = useState<XRPLBatchMintResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const launch = useCallback(async (
        seed: string,
        params: XRPLBatchMintParams,
        network: 'mainnet' | 'testnet' = 'testnet'
    ) => {
        setIsLaunching(true);
        setError(null);
        setResult(null);
        setProgress({ current: 0, total: params.items.length });

        try {
            toast.loading('Deploying XRPL collection...', { id: 'xrpl-launch' });

            const client = await createXRPLClient(network);
            const wallet = createXRPLWallet(seed);

            const launchResult = await batchMintNFTs(client, wallet, {
                ...params,
                onProgress: (current, total) => {
                    setProgress({ current, total });
                    toast.loading(`Minting ${current}/${total}...`, { id: 'xrpl-launch' });
                },
            });

            await client.disconnect();

            setResult(launchResult);
            toast.success(`Collection launched! ${launchResult.nfts.length} NFTs minted`, { id: 'xrpl-launch' });

            return launchResult;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to launch collection';
            setError(errorMessage);
            toast.error(errorMessage, { id: 'xrpl-launch' });
            throw err;
        } finally {
            setIsLaunching(false);
        }
    }, []);

    return {
        launch,
        isLaunching,
        progress,
        result,
        error,
    };
}
