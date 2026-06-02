import React from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useSolanaMint } from '@/hooks/useSolanaMint';
import { useMonadLaunch } from '@/hooks/useMonadLaunch';
import { useMockMode } from '@/hooks/useMockMode';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/integrations/supabase/client';
import { SupportedChain, CHAINS } from '@/config/chains';
import { Coins } from 'lucide-react';

interface MintButtonProps {
    collectionId: string;
    candyMachineAddress: string; // on-chain candy-machine address (base58)
    collectionAddress: string; // on-chain collection address (base58)
    price: number; // price in native currency
    chain?: SupportedChain; // The chain this collection is on
}

/**
 * Multi-chain mint button that triggers minting for a deployed collection.
 * Supports Solana (full) and Monad (full beta).
 */
export function MintButton({
    collectionId,
    candyMachineAddress,
    collectionAddress,
    price,
    chain = 'solana'
}: MintButtonProps) {
    const { isLoading: isSolanaLoading, mintFromCandyMachine } = useSolanaMint();
    const { isCreating: isMonadLoading, mintNFT: mintMonadNFT } = useMonadLaunch();
    const { isMockMode } = useMockMode();
    const { profile } = useUserProfile();

    // Get chain config for display
    const chainConfig = CHAINS[chain] || CHAINS.solana;
    const currencySymbol = isMockMode ? "LPT" : chainConfig.symbol;

    // Check if chain supports minting via this button
    const isMintingSupported = chain === 'solana' || chain === 'monad';
    const isLoading = isSolanaLoading || isMonadLoading;

    const handleMint = async () => {
        if (!isMintingSupported) {
            toast.info(`${chainConfig.name} minting coming soon!`);
            return;
        }

        try {
            if (isMockMode) {
                if (!profile) throw new Error("Please connect your wallet/profile.");
                const balance = Number(profile.native_token_balance || 0);
                if (balance < price) {
                    throw new Error(`Insufficient LPT balance. You need ${price} LPT.`);
                }

                // Deduct LPT
                const { error: deductError } = await supabase
                  .from("user_profiles")
                  .update({ native_token_balance: balance - price })
                  .eq("id", profile.id);
                if (deductError) throw deductError;

                // Record transaction
                await supabase.from("token_transactions").insert({
                  user_id: profile.id,
                  amount: -price,
                  transaction_type: "purchase",
                  reference_id: collectionId,
                });

                // Fetch collection creator
                const { data: collection } = await supabase
                  .from("collections")
                  .select("creator_id")
                  .eq("id", collectionId)
                  .single();

                if (collection?.creator_id) {
                    const { data: creatorProfile } = await supabase
                        .from("user_profiles")
                        .select("native_token_balance")
                        .eq("id", collection.creator_id)
                        .maybeSingle();
                        
                    if (creatorProfile) {
                        await supabase
                          .from("user_profiles")
                          .update({ native_token_balance: Number(creatorProfile.native_token_balance || 0) + price })
                          .eq("id", collection.creator_id);

                        await supabase.from("token_transactions").insert({
                          user_id: collection.creator_id,
                          amount: price,
                          transaction_type: "sale",
                          reference_id: collectionId,
                        });
                    }
                }

                toast.success('Mint succeeded! (Mock Web2 Mode)');
                return;
            }

            if (chain === 'solana') {
                await mintFromCandyMachine(
                    candyMachineAddress,
                    collectionAddress,
                    {
                        phaseId: 'public',
                        price,
                    }
                );
            } else if (chain === 'monad') {
                await mintMonadNFT(
                    collectionAddress,
                    1,
                    price.toString()
                );
            }
            toast.success('Mint succeeded! 🎉');
        } catch (e: any) {
            console.error('Mint error', e);
            toast.error(e.message || 'Mint failed. See console for details.');
        }
    };

    return (
        <Button
            size="sm"
            onClick={handleMint}
            disabled={isLoading || !isMintingSupported}
            className="mt-2 w-full gap-2"
        >
            {isMockMode && <Coins className="w-4 h-4" />}
            {isLoading
                ? 'Minting...'
                : !isMintingSupported
                    ? `${chainConfig.name} Coming Soon`
                    : `Mint for ${price} ${currencySymbol}`
            }
        </Button>
    );
}
