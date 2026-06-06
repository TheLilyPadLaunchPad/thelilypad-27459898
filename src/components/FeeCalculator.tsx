import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Calculator, Fuel, Percent, Info, Sparkles, ArrowRight, Minus, Plus, TrendingDown, TrendingUp, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FeeCalculatorProps {
  defaultPrice?: number;
  defaultQuantity?: number;
  maxQuantity?: number;
  showNetworkToggle?: boolean;
  compact?: boolean;
}

type GasScenario = "low" | "average" | "high";

const PLATFORM_FEE_PERCENT = 2.0;
const BASE_GAS_LIMIT = 150000;
const PER_NFT_GAS = 50000;

// Gas price multipliers for different scenarios (in SOL)
const GAS_PRICES = {
  testnet: {
    low: 0.0000000005,
    average: 0.000000001,
    high: 0.000000003,
  },
  mainnet: {
    low: 0.00000001,
    average: 0.000000025,
    high: 0.00000008,
  },
};

const SCENARIO_INFO = {
  low: { label: "Low", icon: TrendingDown, description: "Off-peak hours, minimal congestion" },
  average: { label: "Avg", icon: Gauge, description: "Typical network conditions" },
  high: { label: "High", icon: TrendingUp, description: "Peak hours, high demand" },
};

export const FeeCalculator: React.FC<FeeCalculatorProps> = ({
  defaultPrice = 0.5,
  defaultQuantity = 1,
  maxQuantity = 10,
  showNetworkToggle = true,
  compact = false,
}) => {
  const [price, setPrice] = useState(defaultPrice);
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [isTestnet, setIsTestnet] = useState(true);
  const [gasScenario, setGasScenario] = useState<GasScenario>("average");

  const calculations = useMemo(() => {
    const mintCost = price * quantity;
    const platformFee = (mintCost * PLATFORM_FEE_PERCENT) / 100;

    // Gas calculation based on scenario
    const gasLimit = BASE_GAS_LIMIT + (PER_NFT_GAS * quantity);
    const network = isTestnet ? "testnet" : "mainnet";
    const gasPrice = GAS_PRICES[network][gasScenario];
    const gasFee = gasLimit * gasPrice;

    // Calculate range for all scenarios
    const gasFeeRange = {
      low: gasLimit * GAS_PRICES[network].low,
      high: gasLimit * GAS_PRICES[network].high,
    };

    const totalCost = mintCost + platformFee + gasFee;

    // Calculate per-NFT costs
    const costPerNft = totalCost / quantity;

    // Calculate gas savings for bulk (compare to minting individually)
    const individualGasTotal = (BASE_GAS_LIMIT + PER_NFT_GAS) * quantity * gasPrice;
    const gasSavings = quantity > 1 ? ((individualGasTotal - gasFee) / individualGasTotal) * 100 : 0;

    return {
      mintCost,
      platformFee,
      gasFee,
      gasFeeRange,
      totalCost,
      costPerNft,
      gasSavings,
      gasLimit,
    };
  }, [price, quantity, isTestnet, gasScenario]);

  const handleQuantityChange = (delta: number) => {
    setQuantity(prev => Math.min(maxQuantity, Math.max(1, prev + delta)));
  };

  const formatSOL = (value: number) => {
    if (value < 0.0001) return "<0.0001";
    return value.toFixed(4);
  };

  return (
    <Card className={compact ? "bg-card/50" : ""}>
      <CardHeader className={compact ? "pb-3" : ""}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="w-5 h-5 text-primary" />
          Fee Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Inputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Price Input */}
          <div className="space-y-2">
            <Label htmlFor="nft-price" className="text-sm flex items-center gap-1">
              NFT Price (SOL)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">The mint price per NFT set by the creator</p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="nft-price"
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
              className="h-10"
            />
          </div>

          {/* Quantity Input */}
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1">
              Quantity
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Number of NFTs to mint (max {maxQuantity})</p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => handleQuantityChange(-1)}
                disabled={quantity <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(maxQuantity, Math.max(1, parseInt(e.target.value) || 1)))}
                className="h-10 text-center"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => handleQuantityChange(1)}
                disabled={quantity >= maxQuantity}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Network Toggle */}
        {showNetworkToggle && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Fuel className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Network</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm ${!isTestnet ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                Mainnet
              </span>
              <Switch
                checked={isTestnet}
                onCheckedChange={setIsTestnet}
              />
              <span className={`text-sm ${isTestnet ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                Testnet
              </span>
            </div>
          </div>
        )}

        {/* Gas Price Scenario */}
        <div className="space-y-2">
          <Label className="text-sm flex items-center gap-1">
            Gas Price Scenario
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-48">
                  Gas prices vary based on network congestion. Select a scenario to estimate costs.
                </p>
              </TooltipContent>
            </Tooltip>
          </Label>
          <ToggleGroup
            type="single"
            value={gasScenario}
            onValueChange={(value) => value && setGasScenario(value as GasScenario)}
            className="w-full grid grid-cols-3 gap-1"
          >
            {(Object.keys(SCENARIO_INFO) as GasScenario[]).map((scenario) => {
              const { label, icon: Icon, description } = SCENARIO_INFO[scenario];
              return (
                <Tooltip key={scenario}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value={scenario}
                      className="flex-1 flex items-center justify-center gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-xs">{label}</span>
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </ToggleGroup>
        </div>

        <Separator />

        {/* Fee Breakdown */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Mint Cost</span>
            <span className="font-medium">{formatSOL(calculations.mintCost)} SOL</span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Percent className="w-3 h-3" />
              Platform Fee (2.5%)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Fee paid by the seller on each mint</p>
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="font-medium">{formatSOL(calculations.platformFee)} SOL</span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Fuel className="w-3 h-3" />
              Gas Fee ({SCENARIO_INFO[gasScenario].label})
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-48">
                    Network fee paid to validators. Gas limit: ~{calculations.gasLimit.toLocaleString()}
                    <br />
                    <span className="text-muted-foreground">
                      Range: {formatSOL(calculations.gasFeeRange.low)} - {formatSOL(calculations.gasFeeRange.high)} SOL
                    </span>
                  </p>
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="font-medium">~{formatSOL(calculations.gasFee)} SOL</span>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="font-semibold">Total Estimated Cost</span>
            <span className="font-bold text-lg text-primary">~{formatSOL(calculations.totalCost)} SOL</span>
          </div>

          {quantity > 1 && (
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>Per NFT</span>
              <span>~{formatSOL(calculations.costPerNft)} SOL</span>
            </div>
          )}
        </div>

        {/* Bulk Savings Tip */}
        {quantity > 1 && calculations.gasSavings > 5 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-primary">
              Bulk minting saves ~{calculations.gasSavings.toFixed(0)}% on gas fees compared to individual mints!
            </p>
          </div>
        )}

        {/* Link to Fees Page */}
        <Link
          to="/fees"
          className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors group"
        >
          Learn more about fees
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </CardContent>
    </Card>
  );
};
