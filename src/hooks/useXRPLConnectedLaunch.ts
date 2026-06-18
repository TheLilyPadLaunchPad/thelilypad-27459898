/**
 * useXRPLConnectedLaunch — Live-connected XRPL launch path.
 *
 * Unlike `useXRPLLaunch` (which signs with a raw seed for dev/testing),
 * this hook drives signing through the user's connected Joey Wallet via
 * `signXRPLTransaction` and submits the signed blob to the live XRPL
 * cluster. No private key ever leaves the wallet.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Client, convertStringToHex } from 'xrpl';
import { createXRPLClient } from '@/chains/xrpl/client';
import { useWallet } from '@/providers/WalletProvider';
import { validateXRPLUri, validateXRPLTransferFee } from '@/chains/xrpl/validate';

export interface XRPLConnectedLaunchItem {
    name: string;
    uri: string; // ipfs://… or https://… (will be hex-encoded for the ledger)
}

export interface XRPLConnectedLaunchParams {
    network: 'mainnet' | 'testnet';
    collection: {
        name: string;
        description: string;
        uri: string;        // ipfs://… collection metadata URI
        taxon: number;
        transferFeePct: number; // 0–50
        flags?: number;     // default tfTransferable (8)
    };
    items: XRPLConnectedLaunchItem[];
    onProgress?: (current: number, total: number) => void;
}

export interface XRPLConnectedLaunchResult {
    domainTxHash: string;
    nfts: Array<{ name: string; uri: string; txHash: string }>;
}

async function signAndSubmit(
    client: Client,
    signer: (txJson: any, net: 'mainnet' | 'testnet') => Promise<any>,
    net: 'mainnet' | 'testnet',
    txJson: any
): Promise<{ hash: string; meta: any }> {
    // Joey returns autofilled + signed blob; we submit & wait for validation.
    const signed = await signer(txJson, net);
    const txBlob: string | undefined =
        signed?.tx_blob || signed?.signedTransaction || signed?.result?.tx_blob;
    if (!txBlob) {
        throw new Error('Wallet did not return a signed tx_blob');
    }
    const res = await client.submitAndWait(txBlob);
    const meta = (res.result as any).meta;
    if (meta?.TransactionResult && meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`XRPL tx failed: ${meta.TransactionResult}`);
    }
    return { hash: res.result.hash, meta };
}

export function useXRPLConnectedLaunch() {
    const { address, signXRPLTransaction } = useWallet();
    const [isLaunching, setIsLaunching] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [result, setResult] = useState<XRPLConnectedLaunchResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const launch = useCallback(async (params: XRPLConnectedLaunchParams) => {
        if (!address) throw new Error('Connect an XRPL wallet first');
        if (!validateXRPLUri(params.collection.uri)) {
            throw new Error('Collection URI exceeds 256-byte XRPL limit');
        }
        for (const item of params.items) {
            if (!validateXRPLUri(item.uri)) {
                throw new Error(`Item URI exceeds 256-byte XRPL limit: ${item.name}`);
            }
        }

        const transferFee = validateXRPLTransferFee(params.collection.transferFeePct);
        const flags = params.collection.flags ?? 8; // tfTransferable

        setIsLaunching(true);
        setError(null);
        setResult(null);
        setProgress({ current: 0, total: params.items.length });

        const client = await createXRPLClient(params.network);
        try {
            toast.loading('Setting collection domain on XRPL…', { id: 'xrpl-launch' });

            // 1. AccountSet → write collection URI into Domain field.
            const { hash: domainTxHash } = await signAndSubmit(
                client,
                signXRPLTransaction,
                params.network,
                {
                    TransactionType: 'AccountSet',
                    Account: address,
                    Domain: convertStringToHex(params.collection.uri),
                }
            );

            // 2. Sequentially mint each NFT.
            const nfts: XRPLConnectedLaunchResult['nfts'] = [];
            for (let i = 0; i < params.items.length; i++) {
                const item = params.items[i];
                toast.loading(`Minting ${i + 1}/${params.items.length}…`, { id: 'xrpl-launch' });

                const txJson: any = {
                    TransactionType: 'NFTokenMint',
                    Account: address,
                    URI: convertStringToHex(item.uri),
                    Flags: flags,
                    NFTokenTaxon: params.collection.taxon,
                };
                if (transferFee > 0 && (flags & 8) !== 0) {
                    txJson.TransferFee = transferFee;
                }

                const { hash } = await signAndSubmit(
                    client,
                    signXRPLTransaction,
                    params.network,
                    txJson
                );

                nfts.push({ name: item.name, uri: item.uri, txHash: hash });
                setProgress({ current: i + 1, total: params.items.length });
                params.onProgress?.(i + 1, params.items.length);
            }

            const launchResult: XRPLConnectedLaunchResult = { domainTxHash, nfts };
            setResult(launchResult);
            toast.success(`Launched ${nfts.length} XRPL NFTs`, { id: 'xrpl-launch' });
            return launchResult;
        } catch (err: any) {
            const msg = err?.message || 'Failed to launch XRPL collection';
            setError(msg);
            toast.error(msg, { id: 'xrpl-launch' });
            throw err;
        } finally {
            try { await client.disconnect(); } catch { /* noop */ }
            setIsLaunching(false);
        }
    }, [address, signXRPLTransaction]);

    return { launch, isLaunching, progress, result, error };
}
