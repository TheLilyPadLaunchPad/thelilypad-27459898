import React from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useSolanaMint } from '@/hooks/useSolanaMint';
import { useMonadLaunch } from '@/hooks/useMonadLaunch';
import { SupportedChain, CHAINS } from '@/config/chains';

interface MintButtonProps {
    collectionId: string;
    candyMachineAddress: string; // on-chain candy-machine address (base58)
    collectionAddress: string; // on-chain collection address (base58)
    price: number; // price in native currency
    chain?: SupportedChain; // The chain this collection is on
}

/**
 * Multi-chain mint button that triggers minting for a deployed collection.
 * Supports Solana (full), XRP (limited), and Monad (full beta).
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

    // Get chain config for display
    const chainConfig = CHAINS[chain] || CHAINS.solana;
    const currencySymbol = chainConfig.symbol;

    // Check if chain supports minting via this button
    // XRP is handled via handleMint on the detail page directly for now, 
    // but the button should still show the correct info if rendered here.
    const isMintingSupported = chain === 'solana' || chain === 'monad';
    const isLoading = isSolanaLoading || isMonadLoading;

    const handleMint = async () => {
        if (!isMintingSupported) {
            toast.info(`${chainConfig.name} minting coming soon!`);
            return;
        }

        try {
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
            className="mt-2 w-full"
        >
            {isLoading
                ? 'Minting…'
                : !isMintingSupported
                    ? `${chainConfig.name} Coming Soon`
                    : `Mint for ${price} ${currencySymbol}`
            }
        </Button>
    );
}
