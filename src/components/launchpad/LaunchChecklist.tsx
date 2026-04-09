import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Circle,
  Image,
  FileText,
  Layers,
  Clock,
  Rocket,
  Users,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Globe,
  Twitter,
  MessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Phase {
  id: string;
  name: string;
  price: string;
  maxPerWallet: number;
  supply: number;
  startTime: string | null;
  endTime: string | null;
  requiresAllowlist: boolean;
}

interface Collection {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  banner_url: string | null;
  total_supply: number;
  phases: unknown;
  contract_address: string | null;
  layers_metadata?: unknown;
  artworks_metadata?: unknown;
  collection_type?: string;
  social_twitter?: string | null;
  social_discord?: string | null;
  social_website?: string | null;
  social_telegram?: string | null;
  chain?: string;
}

interface LaunchChecklistProps {
  collection: Collection;
  onEditClick: () => void;
  onDeployClick: () => void;
  onAllowlistClick: () => void;
}

interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  guidance: string;
  isComplete: boolean;
  icon: React.ElementType;
  action?: {
    label: string;
    onClick: () => void;
  };
  optional?: boolean;
}

export function LaunchChecklist({ 
  collection, 
  onEditClick, 
  onDeployClick,
  onAllowlistClick 
}: LaunchChecklistProps) {
  const phases = useMemo(() => {
    try {
      return (collection.phases as Phase[]) || [];
    } catch {
      return [];
    }
  }, [collection.phases]);

  const hasValidPhases = useMemo(() => {
    return phases.length > 0 && phases.some(p => p.supply > 0 && p.maxPerWallet > 0);
  }, [phases]);

  const hasArtwork = useMemo(() => {
    if (collection.collection_type === "generative") {
      const layers = collection.layers_metadata as Array<{ traits?: unknown[] }> | null;
      return layers && Array.isArray(layers) && layers.length > 0 && 
             layers.some(l => l.traits && Array.isArray(l.traits) && l.traits.length > 0);
    } else {
      const artworks = collection.artworks_metadata as unknown[] | null;
      return artworks && Array.isArray(artworks) && artworks.length > 0;
    }
  }, [collection.collection_type, collection.layers_metadata, collection.artworks_metadata]);

  const hasAllowlistPhases = useMemo(() => {
    return phases.some(p => p.requiresAllowlist);
  }, [phases]);

  const hasSocialLinks = useMemo(() => {
    return !!(collection.social_twitter || collection.social_discord || 
              collection.social_website || collection.social_telegram);
  }, [collection]);

  const steps: ChecklistStep[] = useMemo(() => [
    {
      id: "basic-info",
      title: "Basic Information",
      description: "Collection name, symbol, and description",
      guidance: "Add a compelling name and description that will help collectors understand your project. The symbol is used for the token identifier (e.g., BAYC, PUNK).",
      isComplete: !!(collection.name && collection.symbol && collection.description),
      icon: FileText,
      action: {
        label: "Edit Info",
        onClick: onEditClick
      }
    },
    {
      id: "cover-image",
      title: "Collection Image",
      description: "Cover image for your collection",
      guidance: "Upload a high-quality square image (recommended 500x500px) that represents your collection. This appears on the launchpad and marketplace.",
      isComplete: !!collection.image_url,
      icon: Image,
      action: {
        label: "Upload Image",
        onClick: onEditClick
      }
    },
    {
      id: "banner-image",
      title: "Banner Image",
      description: "Hero banner for collection page",
      guidance: "Add a wide banner image (recommended 1920x400px) that displays at the top of your collection page. This helps create a professional appearance.",
      isComplete: !!collection.banner_url,
      icon: Image,
      action: {
        label: "Upload Banner",
        onClick: onEditClick
      },
      optional: true
    },
    {
      id: "artwork",
      title: collection.collection_type === "generative" ? "Trait Layers" : "Artwork",
      description: collection.collection_type === "generative" 
        ? "Upload layer images for generative art" 
        : "Upload your NFT artwork files",
      guidance: collection.collection_type === "generative"
        ? "Create layers (background, body, accessories, etc.) and upload trait images for each. Set rarity weights to control how often each trait appears."
        : "Upload individual artwork files for each NFT in your collection. You can add metadata and attributes for each piece.",
      isComplete: hasArtwork,
      icon: Layers,
      action: {
        label: "Manage Artwork",
        onClick: onEditClick
      }
    },
    {
      id: "mint-phases",
      title: "Mint Phases",
      description: "Configure pricing and mint schedule",
      guidance: "Set up mint phases (Team, Allowlist, Public, etc.) with pricing, max per wallet, and timing. Multiple phases allow for fair distribution and reward early supporters.",
      isComplete: hasValidPhases,
      icon: Clock,
      action: {
        label: "Configure Phases",
        onClick: onEditClick
      }
    },
    {
      id: "allowlist",
      title: "Allowlist Setup",
      description: "Add addresses for allowlist phases",
      guidance: "If you have allowlist phases, add wallet addresses that are eligible. You can import from CSV or add manually. Set max mint amounts per address.",
      isComplete: !hasAllowlistPhases, // Complete if no allowlist phases, or they need to configure it
      icon: Users,
      action: hasAllowlistPhases ? {
        label: "Manage Allowlist",
        onClick: onAllowlistClick
      } : undefined,
      optional: !hasAllowlistPhases
    },
    {
      id: "social-links",
      title: "Social Links",
      description: "Add Twitter, Discord, and website",
      guidance: "Connect your community! Add links to your Twitter, Discord server, and project website so collectors can follow your project and join the community.",
      isComplete: hasSocialLinks,
      icon: Globe,
      action: {
        label: "Add Links",
        onClick: onEditClick
      },
      optional: true
    },
    ...([{
      id: "deploy",
      title: "Deploy Contract",
      description: "Deploy your NFT smart contract to the blockchain",
      guidance: "Once everything is ready, deploy your smart contract to the blockchain. This makes your collection live and enables minting. This step requires gas fees.",
      isComplete: !!collection.contract_address,
      icon: Rocket,
      action: {
        label: "Deploy Now",
        onClick: onDeployClick
      }
    }])
  ], [collection, hasValidPhases, hasArtwork, hasAllowlistPhases, hasSocialLinks, onEditClick, onDeployClick, onAllowlistClick]);

  const requiredSteps = steps.filter(s => !s.optional);
  const completedRequired = requiredSteps.filter(s => s.isComplete).length;
  const progress = (completedRequired / requiredSteps.length) * 100;

  const nextStep = steps.find(s => !s.isComplete && !s.optional);
  const isReadyToDeploy = requiredSteps.filter(s => s.id !== "deploy").every(s => s.isComplete);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Launch Checklist
            </CardTitle>
            <CardDescription className="mt-1">
              Complete these steps to launch your collection
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {completedRequired}/{requiredSteps.length}
            </div>
            <div className="text-xs text-muted-foreground">steps complete</div>
          </div>
        </div>
        <Progress value={progress} className="h-2 mt-4" />
        {isReadyToDeploy && !collection.contract_address && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">Ready to deploy! Click "Deploy Now" to launch your collection.</span>
          </div>
        )}
        {nextStep && !isReadyToDeploy && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">
              <span className="font-medium">Next:</span> {nextStep.title}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isNext = nextStep?.id === step.id;
          
          return (
            <div
              key={step.id}
              className={cn(
                "p-4 rounded-lg border transition-all",
                step.isComplete 
                  ? "bg-green-500/5 border-green-500/20" 
                  : isNext
                  ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                  : "bg-muted/30 border-border"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-2 rounded-full shrink-0",
                  step.isComplete 
                    ? "bg-green-500/20 text-green-500"
                    : isNext
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {step.isComplete ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={cn(
                      "font-medium",
                      step.isComplete && "text-green-600 dark:text-green-400"
                    )}>
                      {step.title}
                    </h4>
                    {step.optional && (
                      <Badge variant="outline" className="text-xs">Optional</Badge>
                    )}
                    {step.isComplete && (
                      <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30 text-xs">
                        Complete
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {step.description}
                  </p>
                  
                  {/* Expanded guidance for incomplete steps */}
                  {!step.isComplete && (
                    <div className="mt-3 p-3 rounded-md bg-background/50 border border-border/50">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.guidance}
                      </p>
                      {step.action && (
                        <Button 
                          size="sm" 
                          className="mt-3"
                          variant={isNext ? "default" : "outline"}
                          onClick={step.action.onClick}
                        >
                          {step.action.label}
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
