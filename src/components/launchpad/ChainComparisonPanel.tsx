/**
 * ChainComparisonPanel — side-by-side overview of every supported chain:
 * supported wallets, mint options, and deployment status.
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Clock, Wallet, Sparkles, Rocket, ArrowRight } from "lucide-react";
import { ChainIcon } from "@/components/launchpad/ChainSelector";
import { CHAINS, SupportedChain } from "@/config/chains";
import { cn } from "@/lib/utils";

interface ChainComparisonPanelProps {
  onLaunch?: (chain: SupportedChain) => void;
}

interface ChainFacts {
  wallets: string[];
  mintOptions: string[];
  deployStatus: "live" | "soon";
  deployNote: string;
}

const CHAIN_FACTS: Record<SupportedChain, ChainFacts> = {
  solana: {
    wallets: ["Phantom", "Solflare", "WalletConnect (Reown)"],
    mintOptions: ["Metaplex Core", "Candy Machine", "Compressed NFTs", "Music NFTs", "MPL-Hybrid (404)"],
    deployStatus: "live",
    deployNote: "Full deploy & mint",
  },
  monad: {
    wallets: ["MetaMask", "Rabby", "Any EVM wallet"],
    mintOptions: ["ERC-721A Factory", "Generative collections", "1-of-1 art"],
    deployStatus: "live",
    deployNote: "Full deploy & mint",
  },
  xrpl: {
    wallets: ["Joey Wallet"],
    mintOptions: ["XLS-20 NFTs", "Generative collections", "1-of-1 art"],
    deployStatus: "live",
    deployNote: "Full deploy & mint",
  },
  robinhood: {
    wallets: ["Robinhood Wallet", "MetaMask", "Any EVM wallet"],
    mintOptions: ["ERC-721 metadata", "OpenSea CSV export", "1-of-1 art"],
    deployStatus: "soon",
    deployNote: "Generate & export — minting soon",
  },
};

const CHAIN_ORDER: SupportedChain[] = ["solana", "monad", "xrpl", "robinhood"];

export function ChainComparisonPanel({ onLaunch }: ChainComparisonPanelProps) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          Compare Chains
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Wallets, mint options and deployment status for every supported chain.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {CHAIN_ORDER.map((chainId) => {
            const chain = CHAINS[chainId];
            const facts = CHAIN_FACTS[chainId];
            const live = facts.deployStatus === "live";
            return (
              <div
                key={chainId}
                className="rounded-xl border border-border/70 bg-muted/20 p-4 flex flex-col gap-4"
              >
                {/* Chain header */}
                <div className="flex items-center gap-2.5">
                  <ChainIcon chain={chainId} className="w-6 h-6 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{chain.name}</p>
                    <p className="text-[10px] text-muted-foreground">{chain.nftStandard}</p>
                  </div>
                  <Badge
                    variant={live ? "default" : "secondary"}
                    className={cn(
                      "text-[9px] h-4 px-1.5 shrink-0 gap-1",
                      live && "bg-primary/20 text-primary border-primary/30 border"
                    )}
                  >
                    {live ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                    {live ? "Live" : "Soon"}
                  </Badge>
                </div>

                {/* Wallets */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1 mb-1.5">
                    <Wallet className="w-3 h-3" /> Wallets
                  </p>
                  <ul className="space-y-1">
                    {facts.wallets.map((w) => (
                      <li key={w} className="text-xs flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-primary shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mint options */}
                <div className="flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1 mb-1.5">
                    <Sparkles className="w-3 h-3" /> Mint Options
                  </p>
                  <ul className="space-y-1">
                    {facts.mintOptions.map((m) => (
                      <li key={m} className="text-xs flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-primary shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Deployment status */}
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium border",
                    live
                      ? "bg-primary/10 text-primary border-primary/25"
                      : "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {facts.deployNote}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
