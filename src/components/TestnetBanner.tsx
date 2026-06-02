import React from "react";
import { useWallet } from "@/providers/WalletProvider";
import { FlaskConical, Droplets, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const TESTNET_FAUCET_URL = "https://faucet.solana.com";

export const TestnetBanner: React.FC = () => {
  const { network } = useWallet();

  if (network === "mainnet") {
    return null;
  }

  const label = "Solana Devnet";

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-amber-950">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-3 py-1.5 text-sm font-medium">
          <FlaskConical className="w-4 h-4" />
          <span>You are viewing the {label}</span>
          <span className="hidden sm:inline text-amber-800">—</span>
          <span className="hidden sm:inline text-amber-800">Transactions use test tokens with no real value</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs bg-amber-600/30 hover:bg-amber-600/50 text-amber-950"
            onClick={() => window.open(TESTNET_FAUCET_URL, "_blank")}
          >
            <Droplets className="w-3 h-3 mr-1" />
            Get Test SOL
            <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};
