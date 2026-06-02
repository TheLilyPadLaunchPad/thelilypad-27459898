import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/providers/WalletProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FlaskConical, Droplets, CheckCircle2, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";

const TESTNET_FAUCET_URL = "https://faucet.solana.com";

export const NetworkSwitch: React.FC = () => {
  const { network, switchNetwork, isConnected, chainType } = useWallet();

  const getNetworkLabel = (net: string) => {
    const chainName = chainType === 'monad' ? 'Monad' : 'Solana';
    switch (net) {
      case "mainnet": return `${chainName} Mainnet`;

      case "devnet": return `${chainName} Devnet`;
      default: return net;
    }
  };

  const getNetworkColor = (net: string) => {
    switch (net) {
      case "mainnet": return "bg-green-500/10 text-green-500 border-green-500/30";

      default: return "bg-purple-500/10 text-purple-500 border-purple-500/30";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
              {network === "mainnet" ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <FlaskConical className="w-4 h-4 text-purple-500" />
              )}
              <Badge
                variant="outline"
                className={`ml-1.5 cursor-pointer hover:bg-opacity-80 transition-all ${getNetworkColor(network)}`}
              >
                {getNetworkLabel(network)}
                <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => switchNetwork("mainnet")}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Mainnet</span>
              </div>
              {network === "mainnet" && <Check className="w-3 h-3 ml-auto" />}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => switchNetwork("devnet")}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span>Devnet</span>
              </div>
              {network === "devnet" && <Check className="w-3 h-3 ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {network !== "mainnet" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
          onClick={() => window.open(TESTNET_FAUCET_URL, "_blank")}
        >
          <Droplets className="w-3 h-3 mr-1" />
          Faucet
        </Button>
      )}
    </div>
  );
};
