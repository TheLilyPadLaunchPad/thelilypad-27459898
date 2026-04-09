/**
 * ChainGuard — renders children only when the connected wallet matches the required chain.
 * Use this around any chain-specific UI or action to prevent cross-chain bleed.
 */
import React from "react";
import { useWallet } from "@/providers/WalletProvider";
import { useChain } from "@/providers/ChainProvider";
import { CHAINS, type SupportedChain } from "@/config/chains";
import { ChainIcon } from "@/components/launchpad/ChainSelector";
import { Button } from "@/components/ui/button";

interface ChainGuardProps {
    /** The chain this section requires */
    chain: SupportedChain;
    children: React.ReactNode;
    /** Optional override message */
    message?: string;
    /** If true, show a muted placeholder instead of a full error card */
    soft?: boolean;
}

/** Map wallet ChainType → SupportedChain */
function walletToSupportedChain(chainType: string | undefined): SupportedChain {
    if (chainType === "monad" || chainType === "ethereum") return "monad";
    return "solana";
}

export function ChainGuard({ chain, children, message, soft = false }: ChainGuardProps) {
    const { chainType, isConnected } = useWallet();
    const walletChain = walletToSupportedChain(chainType);
    const chainConfig = CHAINS[chain];

    // Not connected — show connect prompt
    if (!isConnected) {
        if (soft) return <span className="text-xs text-muted-foreground">Connect wallet</span>;
        return (
            <div className="flex flex-col items-center gap-3 py-10 text-center border border-dashed rounded-xl border-border">
                <ChainIcon chain={chain} className="w-8 h-8 opacity-40" />
                <p className="font-medium">Connect your {chainConfig.name} wallet to continue</p>
                <p className="text-sm text-muted-foreground">{chainConfig.walletLabels.connect}</p>
            </div>
        );
    }

    // Wrong chain — show switch prompt
    if (walletChain !== chain) {
        const msg = message || `Switch to ${chainConfig.name} to use this feature.`;
        if (soft) return <span className="text-xs text-muted-foreground">{msg}</span>;
        return (
            <div className="flex flex-col items-center gap-3 py-10 text-center border border-dashed rounded-xl border-amber-500/30 bg-amber-500/5">
                <ChainIcon chain={chain} className="w-8 h-8" />
                <p className="font-semibold">Wrong Chain Connected</p>
                <p className="text-sm text-muted-foreground">{msg}</p>
                <p className="text-xs text-muted-foreground">
                    Currently on <strong>{CHAINS[walletChain]?.name ?? chainType}</strong> — need <strong>{chainConfig.name}</strong>
                </p>
            </div>
        );
    }

    return <>{children}</>;
}

/**
 * useChainGuard — hook version that returns whether the current wallet chain matches.
 * Use for deploy guards inside event handlers.
 */
export function useChainGuard(requiredChain: SupportedChain) {
    const { chainType, isConnected, address } = useWallet();
    const walletChain = walletToSupportedChain(chainType);

    return {
        isReady: isConnected && !!address && walletChain === requiredChain,
        walletChain,
        isConnected,
        mismatch: isConnected && walletChain !== requiredChain,
        errorMessage: !isConnected
            ? "Wallet not connected."
            : `Wallet is on ${CHAINS[walletChain]?.name ?? walletChain} but need ${CHAINS[requiredChain]?.name}.`,
    };
}
