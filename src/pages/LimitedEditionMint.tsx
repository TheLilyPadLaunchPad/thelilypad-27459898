import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Crown, 
  Gem, 
  Star, 
  Sparkles, 
  Shield, 
  Zap,
  ArrowLeft,
  Check,
  Lock,
  Clock,
  Users,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useWallet } from "@/providers/WalletProvider";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";

// Tier configuration
const TIERS = [
  {
    id: 1,
    name: "Bronze",
    icon: Shield,
    price: 0.5,
    supply: 1000,
    minted: 847,
    maxPerWallet: 5,
    benefits: ["Basic Access", "Community Chat", "Monthly Drops"],
    color: "from-amber-700 to-amber-900",
    borderColor: "border-amber-600",
    bgColor: "bg-amber-900/20",
    iconColor: "text-amber-500",
    badgeVariant: "secondary" as const,
  },
  {
    id: 2,
    name: "Silver",
    icon: Star,
    price: 1.0,
    supply: 500,
    minted: 312,
    maxPerWallet: 3,
    benefits: ["Bronze Benefits", "Priority Minting", "Exclusive Channels"],
    color: "from-slate-400 to-slate-600",
    borderColor: "border-slate-400",
    bgColor: "bg-slate-500/20",
    iconColor: "text-slate-300",
    badgeVariant: "secondary" as const,
  },
  {
    id: 3,
    name: "Gold",
    icon: Sparkles,
    price: 2.5,
    supply: 250,
    minted: 98,
    maxPerWallet: 2,
    benefits: ["Silver Benefits", "Airdrop Eligibility"],
    color: "from-yellow-500 to-yellow-700",
    borderColor: "border-yellow-500",
    bgColor: "bg-yellow-600/20",
    iconColor: "text-yellow-400",
    badgeVariant: "default" as const,
  },
  {
    id: 4,
    name: "Platinum",
    icon: Gem,
    price: 5.0,
    supply: 100,
    minted: 34,
    maxPerWallet: 2,
    benefits: ["Gold Benefits", "VIP Events", "Revenue Share"],
    color: "from-cyan-400 to-cyan-600",
    borderColor: "border-cyan-400",
    bgColor: "bg-cyan-500/20",
    iconColor: "text-cyan-300",
    badgeVariant: "default" as const,
  },
  {
    id: 5,
    name: "Diamond",
    icon: Zap,
    price: 10.0,
    supply: 50,
    minted: 12,
    maxPerWallet: 1,
    benefits: ["Platinum Benefits", "1-on-1 Creator Access", "Custom Perks"],
    color: "from-blue-400 to-purple-500",
    borderColor: "border-blue-400",
    bgColor: "bg-blue-500/20",
    iconColor: "text-blue-300",
    badgeVariant: "default" as const,
  },
  {
    id: 6,
    name: "Legendary",
    icon: Crown,
    price: 25.0,
    supply: 10,
    minted: 3,
    maxPerWallet: 1,
    benefits: ["All Benefits", "Lifetime Access", "Co-Creation Rights", "Exclusive 1/1 Art"],
    color: "from-purple-500 via-pink-500 to-orange-500",
    borderColor: "border-purple-500",
    bgColor: "bg-purple-600/20",
    iconColor: "text-purple-400",
    badgeVariant: "destructive" as const,
  },
];

const LimitedEditionMint = () => {
  const navigate = useNavigate();
  const { isConnected, address, balance } = useWallet();
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [mintAmount, setMintAmount] = useState(1);
  const [isMinting, setIsMinting] = useState(false);

  const handleMint = async (tierId: number) => {
    if (!isConnected) {
      toast.error("Please connect your wallet first");
      return;
    }

    const tier = TIERS.find(t => t.id === tierId);
    if (!tier) return;

    const totalCost = tier.price * mintAmount;
    const numericBalance = parseFloat(balance || "0");
    if (numericBalance < totalCost) {
      toast.error(`Insufficient balance. Need ${totalCost} SOL`);
      return;
    }

    setIsMinting(true);
    try {
      // Simulate minting - replace with actual mint logic
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success(`Successfully minted ${mintAmount} ${tier.name} NFT(s)!`);
      setSelectedTier(null);
      setMintAmount(1);
    } catch (error) {
      toast.error("Minting failed. Please try again.");
    } finally {
      setIsMinting(false);
    }
  };

  const getTierProgress = (tier: typeof TIERS[0]) => {
    return (tier.minted / tier.supply) * 100;
  };

  const getRemainingSupply = (tier: typeof TIERS[0]) => {
    return tier.supply - tier.minted;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="text-center space-y-4">
            <Badge variant="outline" className="text-primary border-primary">
              <Sparkles className="w-3 h-3 mr-1" />
              Limited Edition
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Exclusive Membership Tiers
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose your tier and unlock exclusive benefits. Each tier offers unique perks and limited supply.
            </p>
          </div>
        </motion.div>

        {/* Stats Bar */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">1,910</p>
              <p className="text-sm text-muted-foreground">Total Supply</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-500">1,306</p>
              <p className="text-sm text-muted-foreground">Total Minted</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-500">604</p>
              <p className="text-sm text-muted-foreground">Remaining</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-500">6</p>
              <p className="text-sm text-muted-foreground">Tier Levels</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tier Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TIERS.map((tier, index) => {
            const TierIcon = tier.icon;
            const progress = getTierProgress(tier);
            const remaining = getRemainingSupply(tier);
            const isSoldOut = remaining === 0;
            const isSelected = selectedTier === tier.id;

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card 
                  className={`relative overflow-hidden transition-all duration-300 cursor-pointer hover:scale-[1.02] ${
                    isSelected ? `ring-2 ring-primary ${tier.bgColor}` : 'hover:border-primary/50'
                  } ${isSoldOut ? 'opacity-60' : ''}`}
                  onClick={() => !isSoldOut && setSelectedTier(isSelected ? null : tier.id)}
                >
                  {/* Gradient Header */}
                  <div className={`h-2 bg-gradient-to-r ${tier.color}`} />
                  
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${tier.bgColor}`}>
                          <TierIcon className={`w-6 h-6 ${tier.iconColor}`} />
                        </div>
                        <div>
                          <CardTitle className="text-xl">{tier.name}</CardTitle>
                          <CardDescription>Tier {tier.id}</CardDescription>
                        </div>
                      </div>
                      <Badge variant={tier.badgeVariant}>
                        {tier.price} SOL
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Supply Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Minted</span>
                        <span className="font-medium">{tier.minted} / {tier.supply}</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{remaining} remaining</span>
                        <span>{progress.toFixed(1)}% sold</span>
                      </div>
                    </div>

                    <Separator />

                    {/* Benefits */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Benefits
                      </p>
                      <ul className="space-y-1">
                        {tier.benefits.map((benefit, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Check className="w-3 h-3 text-green-500" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Separator />

                    {/* Mint Info */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        Max {tier.maxPerWallet} per wallet
                      </span>
                    </div>

                    {/* Mint Button */}
                    {isSoldOut ? (
                      <Button disabled className="w-full">
                        <Lock className="w-4 h-4 mr-2" />
                        Sold Out
                      </Button>
                    ) : isSelected ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-3">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMintAmount(Math.max(1, mintAmount - 1));
                            }}
                            disabled={mintAmount <= 1}
                          >
                            -
                          </Button>
                          <span className="text-lg font-bold w-8 text-center">{mintAmount}</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMintAmount(Math.min(tier.maxPerWallet, mintAmount + 1));
                            }}
                            disabled={mintAmount >= tier.maxPerWallet}
                          >
                            +
                          </Button>
                        </div>
                        <Button 
                          className={`w-full bg-gradient-to-r ${tier.color} hover:opacity-90`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMint(tier.id);
                          }}
                          disabled={isMinting || !isConnected}
                        >
                          {isMinting ? (
                            <>
                              <Clock className="w-4 h-4 mr-2 animate-spin" />
                              Minting...
                            </>
                          ) : (
                            <>
                              <Wallet className="w-4 h-4 mr-2" />
                              Mint for {(tier.price * mintAmount).toFixed(2)} SOL
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTier(tier.id);
                        }}
                      >
                        Select Tier
                      </Button>
                    )}
                  </CardContent>

                  {/* Sold Out Overlay */}
                  {isSoldOut && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                      <Badge variant="destructive" className="text-lg py-2 px-4">
                        SOLD OUT
                      </Badge>
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Wallet Connection Prompt */}
        {!isConnected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8"
          >
            <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
              <CardContent className="p-6 text-center">
                <Wallet className="w-12 h-12 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
                <p className="text-muted-foreground mb-4">
                  Connect your wallet to mint Limited Edition NFTs
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default LimitedEditionMint;
