import { useState, useCallback } from 'react';
import { publicKey, generateSigner, some, none, percentAmount, sol } from '@metaplex-foundation/umi';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
    create as createCore,
    fetchCollection,
} from '@metaplex-foundation/mpl-core';
import {
    fetchCandyMachine,
    mintV1,
    findCandyGuardPda,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { setComputeUnitPrice, setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import { SendTransactionError } from '@solana/web3.js';
import { useWallet } from '@/providers/WalletProvider';
import { initializeUmi, SolanaStandard } from '@/config/solana';
import { toast } from 'sonner';
import { buildProtocolMemo, MEMO_PROGRAM_ID } from '@/lib/solanaProtocol';
import { PLATFORM_WALLETS, getLaunchpadFeeSplit } from '@/config/treasury';
import { supabase } from '@/integrations/supabase/client';

export interface MintPhaseArgs {
    phaseId: string;
    price: number;
    merkleProof?: Uint8Array[];
    mintLimitId?: number;
    collectionId?: string;
}

export const useSolanaMint = () => {
    const { network, getSolanaProvider } = useWallet();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getUmi = useCallback(async () => {
        const provider = getSolanaProvider();
        if (!provider || !provider.publicKey) {
            throw new Error("Solana wallet not connected");
        }

        const umi = initializeUmi(network);
        const wallet = {
            publicKey: provider.publicKey,
            signTransaction: provider.signTransaction.bind(provider),
            signAllTransactions: provider.signAllTransactions.bind(provider),
            signMessage: provider.signMessage ? provider.signMessage.bind(provider) : undefined,
        };

        return umi.use(walletAdapterIdentity(wallet));
    }, [getSolanaProvider, network]);

    // Track mint transaction for fee accounting
    const trackMintTransaction = useCallback(async (
        signature: string,
        mintAddress: string,
        collectionId: string | undefined,
        phaseId: string,
        price: number,
        walletAddress: string
    ) => {
        if (!collectionId) {
            console.log("[Mint] No collection ID, skipping transaction tracking");
            return;
        }

        try {
            const feeSplit = getLaunchpadFeeSplit(price);

            // Record the mint transaction
            // Note: Using type assertion since nft_mints table may not be in generated types yet
            const { error: insertError } = await (supabase as any).from('nft_mints').insert({
                collection_id: collectionId,
                phase_id: phaseId,
                minter_address: walletAddress,
                mint_address: mintAddress,
                transaction_signature: signature,
                price_sol: price,
                platform_fee_sol: feeSplit.treasuryAmount + feeSplit.teamAmount + feeSplit.buybackAmount,
                creator_amount_sol: feeSplit.creatorAmount,
            });

            if (insertError) {
                console.warn("[Mint] Failed to track mint:", insertError);
            } else {
                console.log("[Mint] Transaction tracked successfully");
            }
        } catch (err) {
            console.warn("[Mint] Error tracking transaction:", err);
        }
    }, []);

    const mintNFT = useCallback(async (
        collectionAddress: string,
        metadata: {
            name: string;
            uri: string;
        }
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            let result;
            const nftSigner = generateSigner(umi);

            toast.loading(`Minting your NFT (Core)...`, { id: 'sol-mint' });

            // Create memo instruction for protocol identification
            const memoData = buildProtocolMemo('mint:nft', { standard: 'core' });
            const memoInstruction = {
                instruction: {
                    programId: publicKey(MEMO_PROGRAM_ID.toBase58()),
                    keys: [],
                    data: new Uint8Array(Buffer.from(memoData, 'utf-8')),
                },
                bytesCreatedOnChain: 0,
                signers: [],
            };

            const collection = await fetchCollection(umi, publicKey(collectionAddress));

            result = await createCore(umi, {
                asset: nftSigner,
                collection,
                name: metadata.name,
                uri: metadata.uri,
            })
                .add(memoInstruction)
                .add(setComputeUnitPrice(umi, { microLamports: 50_000 }))
                .sendAndConfirm(umi);

            toast.success(`Successfully minted!`, { id: 'sol-mint' });
            return {
                signature: result.signature,
                address: nftSigner.publicKey.toString()
            };
        } catch (err: any) {
            console.error("Solana minting error:", err);
            const msg = err.message || "Failed to mint on Solana";

            if (err instanceof SendTransactionError && err.logs) {
                console.error("--- TRANSACTION LOGS ---");
                console.error(err.logs);
            }

            setError(msg);
            toast.error(msg, { id: 'sol-mint' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi]);

    const mintFromCandyMachine = useCallback(async (
        candyMachineAddress: string,
        collectionAddress: string,
        phaseIdOrArgs?: string | MintPhaseArgs,
        legacyMintArgs?: any
    ) => {
        // Support both old signature (string, string, string, object) and new (string, string, MintPhaseArgs)
        const phaseArgs: MintPhaseArgs | undefined = typeof phaseIdOrArgs === 'string'
            ? { phaseId: phaseIdOrArgs, price: legacyMintArgs?.price || 0, collectionId: legacyMintArgs?.collectionId }
            : phaseIdOrArgs;
        setIsLoading(true);
        setError(null);
        try {
            const umi = await getUmi();
            const nftMint = generateSigner(umi);
            const walletAddress = umi.identity.publicKey.toString();

            toast.loading(`Minting from Candy Machine...`, { id: 'cm-mint' });
            console.log("[CM Mint] Address:", candyMachineAddress);
            console.log("[CM Mint] Phase:", phaseArgs?.phaseId);
            console.log("[CM Mint] Price:", phaseArgs?.price, "SOL");

            // Fetch the Candy Machine state
            const candyMachine = await fetchCandyMachine(umi, publicKey(candyMachineAddress));

            console.log("[CM Mint] Items minted:", candyMachine.itemsRedeemed.toString());
            console.log("[CM Mint] Items available:", candyMachine.data.itemsAvailable.toString());

            // Check if there are items left
            if (candyMachine.itemsRedeemed >= candyMachine.data.itemsAvailable) {
                throw new Error("Collection is sold out!");
            }

            // Determine if we need to use a Candy Guard
            // In Core Candy Machine, if the mintAuthority is the Candy Guard PDA, it's a "wrapped" machine
            const candyGuardPda = findCandyGuardPda(umi, { base: candyMachine.publicKey });
            const isWrapped = candyMachine.mintAuthority.toString() === candyGuardPda[0].toString();

            console.log("[CM Mint] Wrapped:", isWrapped);

            // Build mint arguments for guards
            const mintArgs: any = {};
            if (phaseArgs?.phaseId) {
                // If it's a guarded mint, we might need specific guard inputs
                // For example, if there's an allowList, we need the merkleProof
                if (phaseArgs.merkleProof) {
                    mintArgs.allowList = some({ merkleRoot: phaseArgs.merkleProof });
                }

                // solPayment usually doesn't need extra args in the instruction data 
                // but the SDK handles the treasury destination automatically if the guard is active
            }

            // Create memo instruction for protocol identification
            const memoData = buildProtocolMemo('mint:candy_machine', {
                phase: phaseArgs?.phaseId || 'public',
                price: String(phaseArgs?.price || 0),
            });
            const memoInstruction = {
                instruction: {
                    programId: publicKey(MEMO_PROGRAM_ID.toBase58()),
                    keys: [],
                    data: new Uint8Array(Buffer.from(memoData, 'utf-8')),
                },
                bytesCreatedOnChain: 0,
                signers: [],
            };

            // Build the mint transaction using mintV1 for guard support
            // mintV1 handles both wrapped (with guards) and unwrapped candy machines
            const tx = mintV1(umi, {
                candyMachine: candyMachine.publicKey,
                asset: nftMint,
                collection: candyMachine.collectionMint,
                group: phaseArgs?.phaseId ? some(phaseArgs.phaseId) : none(),
                mintArgs: mintArgs,
            })
                .add(memoInstruction)
                // Priority Fee: 50,000 microLamports for fast inclusion
                // Compute Limit: 600,000 CU to ensure complex guard logic processes safely
                .add(setComputeUnitPrice(umi, { microLamports: 50_000 }))
                .add(setComputeUnitLimit(umi, { units: 600_000 }));

            const result = await tx.sendAndConfirm(umi);
            const signatureStr = Buffer.from(result.signature).toString('base64');

            console.log("[CM Mint] Success! Signature:", signatureStr);
            console.log("[CM Mint] NFT Address:", nftMint.publicKey.toString());

            // Track the transaction for fee accounting
            if (phaseArgs?.collectionId && phaseArgs.price > 0) {
                await trackMintTransaction(
                    signatureStr,
                    nftMint.publicKey.toString(),
                    phaseArgs.collectionId,
                    phaseArgs.phaseId,
                    phaseArgs.price,
                    walletAddress
                );
            }

            toast.success(`Minted successfully!`, { id: 'cm-mint' });

            return {
                signature: result.signature,
                address: nftMint.publicKey.toString()
            };
        } catch (err: any) {
            console.error("CM mint error:", err);

            // Parse common errors
            let msg = err.message || "Candy Machine mint failed";

            if (err instanceof SendTransactionError && err.logs) {
                console.error("--- TRANSACTION LOGS ---");
                console.error(err.logs);
            }

            if (msg.includes("0x1")) {
                msg = "Insufficient funds for this mint";
            } else if (msg.includes("0x1770")) {
                msg = "Not on allowlist for this phase";
            } else if (msg.includes("0x1771")) {
                msg = "Mint limit exceeded for your wallet";
            } else if (msg.includes("0x1772")) {
                msg = "Minting has not started yet";
            } else if (msg.includes("0x1773")) {
                msg = "Minting has ended";
            }

            setError(msg);
            toast.error(msg, { id: 'cm-mint' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getUmi, trackMintTransaction]);

    return {
        isLoading,
        error,
        mintNFT,
        mintFromCandyMachine,
    };
};
