import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Shuffle, Eye, Download, Sparkles, Info, Image as ImageIcon, FileJson, Package, Loader2, Images, FolderArchive, BarChart3, Archive, Cloud, ExternalLink, Copy, Check, Zap, Settings2, ShieldCheck } from "lucide-react";
import { Layer, Trait, BlendMode } from "./LayerManager";
import { TraitRule, RuleType } from "./TraitRulesManager";
import { NFTImageCompositor } from "./NFTImageCompositor";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { dataUrlToBlob } from "@/lib/utils";
import { nftToStandardMetadata, loadImage, compositeNFTImage, type GeneratedNFT, type NFTMetadata } from "@/lib/assetBundler";
import { type RarityTier, type RarityReport, RARITY_TIERS, getRarityTier, RarityBadge } from "./rarity";
import { useNFTGenerator } from "@/hooks/useNFTGenerator";
import { useNFTExport } from "@/hooks/useNFTExport";

const RESOLUTION_PRESETS = [
  { label: "512 Ã— 512 (Preview)", value: 512 },
  { label: "1024 Ã— 1024 (Standard)", value: 1024 },
  { label: "2048 Ã— 2048 (High Quality)", value: 2048 },
];

interface GenerationPreviewProps {
  layers: Layer[];
  rules: TraitRule[];
  totalSupply: string;
  collectionName?: string;
  collectionDescription?: string;
}

interface GeneratedNFTWithImage extends GeneratedNFT {
  imageDataUrl?: string;
}



export function GenerationPreview({
  layers,
  rules,
  totalSupply,
  collectionName = "My Collection",
  collectionDescription = "",
}: GenerationPreviewProps) {
  const { isAdmin } = useAuth();
  const [previewCount, setPreviewCount] = useState("5");
  const [exportCount, setExportCount] = useState(totalSupply || "100");
  const [outputResolution, setOutputResolution] = useState<number>(512);
  const [rarityReport, setRarityReport] = useState<RarityReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // NFT generation engine (extracted hook)
  const { generatedPreviews, duplicatesAvoided, generatePreviews: generatePreviewsRaw, generateNFTBatch } = useNFTGenerator(layers, rules);

  const generatePreviews = () => {
    const count = parseInt(previewCount) || 5;
    generatePreviewsRaw(count);
  };

  // NFT export / download logic (extracted hook)
  const {
    isExporting,
    exportProgress,
    exportStatus,
    isDownloadingAssets,
    downloadProgress,
    downloadStatus,
    exportImagesWithMetadata: exportImagesWithMetadataRaw,
    downloadIndividualImages: downloadIndividualImagesRaw,
    exportSingleMetadata,
    exportAllMetadata: exportAllMetadataRaw,
    exportIndividualFiles: exportIndividualFilesRaw,
    exportAsZip: exportAsZipRaw,
    downloadGeneratedAssets: downloadGeneratedAssetsRaw,
    copyToClipboard,
  } = useNFTExport(
    { collectionName, collectionDescription, outputResolution, layers },
    generateNFTBatch,
  );

  // Wrappers that pass through the current exportCount/totalSupply
  const exportImagesWithMetadata = () => exportImagesWithMetadataRaw(exportCount);
  const downloadIndividualImages = () => downloadIndividualImagesRaw(exportCount);
  const exportAllMetadata = () => exportAllMetadataRaw(exportCount, totalSupply);
  const exportIndividualFiles = () => exportIndividualFilesRaw(exportCount, totalSupply);
  const exportAsZip = () => exportAsZipRaw(exportCount);
  const downloadGeneratedAssets = () => downloadGeneratedAssetsRaw(exportCount);

  // Calculate rarity statistics
  const rarityStats = useMemo(() => {
    const stats: { layer: string; trait: string; rarity: number }[] = [];
    layers.forEach((layer) => {
      const totalRarity = layer.traits.reduce((sum, t) => sum + t.rarity, 0);
      layer.traits.forEach((trait) => {
        const effectiveRarity = totalRarity > 0 ? (trait.rarity / totalRarity) * 100 : 0;
        const layerMultiplier = layer.isOptional ? layer.optionalChance / 100 : 1;
        stats.push({
          layer: layer.name,
          trait: trait.name,
          rarity: effectiveRarity * layerMultiplier,
        });
      });
    });
    return stats.sort((a, b) => a.rarity - b.rarity);
  }, [layers]);

  const rareTraits = rarityStats.slice(0, 5);

  // Generate rarity report
  const generateRarityReport = useCallback(() => {
    setIsGeneratingReport(true);

    try {
      const reportSize = Math.min(parseInt(totalSupply) || 100, 500);
      const { nfts } = generateNFTBatch(reportSize);

      // Calculate trait distributions per layer
      const layerTraitCounts = new Map<string, Map<string, number>>();

      // Initialize counts
      layers.forEach((layer) => {
        const traitCounts = new Map<string, number>();
        layer.traits.forEach((trait) => traitCounts.set(trait.name, 0));
        layerTraitCounts.set(layer.name, traitCounts);
      });

      // Count occurrences
      nfts.forEach((nft) => {
        nft.traits.forEach((trait) => {
          const layerCounts = layerTraitCounts.get(trait.layerName);
          if (layerCounts) {
            layerCounts.set(trait.traitName, (layerCounts.get(trait.traitName) || 0) + 1);
          }
        });
      });

      // Build layer distributions with tier assignment
      const layerDistributions = layers.map((layer) => {
        const traitCounts = layerTraitCounts.get(layer.name) || new Map();
        const totalRarity = layer.traits.reduce((sum, t) => sum + t.rarity, 0);

        return {
          layerName: layer.name,
          traits: layer.traits.map((trait) => {
            const count = traitCounts.get(trait.name) || 0;
            const expectedPercentage = totalRarity > 0 ? (trait.rarity / totalRarity) * 100 : 0;
            const actualPercentage = (count / reportSize) * 100;
            return {
              traitName: trait.name,
              count,
              percentage: actualPercentage,
              expectedPercentage,
              tier: getRarityTier(actualPercentage),
            };
          }).sort((a, b) => a.percentage - b.percentage),
        };
      });

      // Calculate tier summary for traits
      const traitTierCounts: Record<RarityTier, number> = {
        legendary: 0,
        rare: 0,
        uncommon: 0,
        common: 0,
      };

      layerDistributions.forEach((layer) => {
        layer.traits.forEach((trait) => {
          traitTierCounts[trait.tier]++;
        });
      });

      // Calculate rarity scores for each NFT and assign overall tier
      const nftRarityScores = nfts.map((nft) => {
        const rarityScore = nft.traits.reduce((score, trait) => {
          const layer = layers.find((l) => l.name === trait.layerName);
          if (!layer) return score;

          const traitData = layer.traits.find((t) => t.name === trait.traitName);
          if (!traitData) return score;

          const totalRarity = layer.traits.reduce((sum, t) => sum + t.rarity, 0);
          const traitRarity = totalRarity > 0 ? traitData.rarity / totalRarity : 1;

          // Lower rarity value = rarer = higher score (inverse)
          return score + (1 / traitRarity);
        }, 0);

        return {
          nftId: nft.id,
          rarityScore,
          traits: nft.traits.map((t) => t.traitName),
        };
      });

      // Normalize scores and assign tiers to NFTs
      const maxScore = Math.max(...nftRarityScores.map((n) => n.rarityScore));
      const minScore = Math.min(...nftRarityScores.map((n) => n.rarityScore));
      const scoreRange = maxScore - minScore || 1;

      const nftTierCounts: Record<RarityTier, number> = {
        legendary: 0,
        rare: 0,
        uncommon: 0,
        common: 0,
      };

      const nftsWithTiers = nftRarityScores.map((nft) => {
        // Normalize score to 0-100 (higher score = rarer)
        const normalizedScore = ((nft.rarityScore - minScore) / scoreRange) * 100;
        // Convert to "percentage-like" value (lower = rarer for tier assignment)
        const tierPercentage = 100 - normalizedScore;
        const overallTier = getRarityTier(tierPercentage);
        nftTierCounts[overallTier]++;

        return {
          ...nft,
          overallTier,
        };
      });

      // Get top 10 rarest
      const rarestCombinations = nftsWithTiers
        .sort((a, b) => b.rarityScore - a.rarityScore)
        .slice(0, 10);

      // Build tier summary
      const tierSummary: RarityReport["tierSummary"] = [
        { tier: "legendary" as RarityTier, traitCount: traitTierCounts.legendary, nftCount: nftTierCounts.legendary },
        { tier: "rare" as RarityTier, traitCount: traitTierCounts.rare, nftCount: nftTierCounts.rare },
        { tier: "uncommon" as RarityTier, traitCount: traitTierCounts.uncommon, nftCount: nftTierCounts.uncommon },
        { tier: "common" as RarityTier, traitCount: traitTierCounts.common, nftCount: nftTierCounts.common },
      ];

      setRarityReport({
        totalGenerated: reportSize,
        layerDistributions,
        rarestCombinations,
        tierSummary,
      });

      toast.success(`Generated rarity report for ${reportSize} NFTs`);
    } catch (error) {
      console.error("Failed to generate rarity report:", error);
      toast.error("Failed to generate rarity report");
    } finally {
      setIsGeneratingReport(false);
    }
  }, [layers, totalSupply, generateNFTBatch]);

  // Export rarity report as JSON
  const exportRarityReport = () => {
    if (!rarityReport) return;

    const blob = new Blob([JSON.stringify(rarityReport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${collectionName.toLowerCase().replace(/\s+/g, "-")}-rarity-report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Exported rarity report");
  };

  // Check if any layer has images
  const hasAnyImages = layers.some((l) => l.traits.some((t) => t.imageUrl));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Eye className="w-5 h-5" />
          Generation Preview
        </h3>
        <p className="text-sm text-muted-foreground">
          Preview how your NFTs will be generated with current rules
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{layers.length}</p>
            <p className="text-xs text-muted-foreground">Layers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">
              {layers.reduce((sum, l) => sum + l.traits.length, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total Traits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{rules.length}</p>
            <p className="text-xs text-muted-foreground">Rules</p>
          </CardContent>
        </Card>
        {duplicatesAvoided > 0 && (
          <Card className="col-span-3 border-primary/50 bg-primary/5">
            <CardContent className="p-3 text-center">
              <p className="text-sm text-primary font-medium">
                âœ“ {duplicatesAvoided} duplicate combinations avoided
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Potential Combinations */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Combination Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Supply</span>
            <span className="font-medium">{totalSupply} NFTs</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Unique Combinations</span>
            <span className="font-medium">
              {layers.reduce(
                (acc, l) => acc * Math.max(l.traits.length, 1),
                1
              ).toLocaleString()}+
            </span>
          </div>
          {rareTraits.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                Rarest Traits:
              </p>
              <div className="flex flex-wrap gap-1">
                {rareTraits.map((trait, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {trait.trait} ({trait.rarity.toFixed(1)}%)
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Preview Section */}
      <Tabs defaultValue={hasAnyImages ? "visual" : "text"} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="text" className="gap-2">
            <Shuffle className="w-4 h-4" />
            Text
          </TabsTrigger>
          <TabsTrigger value="visual" className="gap-2">
            <ImageIcon className="w-4 h-4" />
            Visual
          </TabsTrigger>
          <TabsTrigger value="rarity" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Rarity
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-4 space-y-4">
          {/* Generate Previews */}
          <div className="flex items-center gap-3">
            <Input
              type="number"
              value={previewCount}
              onChange={(e) => setPreviewCount(e.target.value)}
              min="1"
              max="20"
              className="w-20"
            />
            <Button onClick={generatePreviews} className="flex-1">
              <Shuffle className="w-4 h-4 mr-2" />
              Generate {previewCount} Previews
            </Button>
          </div>

          {/* Preview Results */}
          {generatedPreviews.length > 0 && (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {generatedPreviews.map((nft) => (
                  <Card key={nft.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg flex items-center justify-center text-lg font-bold">
                          #{nft.id}
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap gap-1">
                            {nft.traits.map((trait, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-xs"
                              >
                                {trait.layerName}: {trait.traitName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          {generatedPreviews.length === 0 && layers.length > 0 && (
            <div className="text-center py-6 border border-dashed rounded-lg">
              <Info className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click generate to preview NFT combinations
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="visual" className="mt-4">
          <NFTImageCompositor
            layers={layers}
            rules={rules}
          />
        </TabsContent>

        <TabsContent value="rarity" className="mt-4 space-y-4">
          {/* Generate Report Button */}
          <Button
            onClick={generateRarityReport}
            disabled={isGeneratingReport || layers.length === 0}
            className="w-full"
          >
            {isGeneratingReport ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Collection...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4 mr-2" />
                Generate Rarity Report ({Math.min(parseInt(totalSupply) || 100, 500)} NFTs)
              </>
            )}
          </Button>

          {rarityReport && (
            <div className="space-y-4">
              {/* Report Summary */}
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Report Summary</CardTitle>
                    <Button size="sm" variant="outline" onClick={exportRarityReport}>
                      <Download className="w-3 h-3 mr-1" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Analyzed <span className="font-semibold text-foreground">{rarityReport.totalGenerated}</span> NFTs across{" "}
                    <span className="font-semibold text-foreground">{rarityReport.layerDistributions.length}</span> layers
                  </p>
                </CardContent>
              </Card>

              {/* Tier Summary */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Rarity Tier Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {rarityReport.tierSummary.map((summary) => {
                      const config = RARITY_TIERS[summary.tier];
                      const Icon = config.icon;
                      const nftPercentage = (summary.nftCount / rarityReport.totalGenerated) * 100;

                      return (
                        <div
                          key={summary.tier}
                          className={`p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`w-4 h-4 ${config.color}`} />
                            <span className={`font-medium text-sm ${config.color}`}>{config.name}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Traits</span>
                              <span className="font-medium">{summary.traitCount}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">NFTs</span>
                              <span className="font-medium">{summary.nftCount} ({nftPercentage.toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    Legendary: â‰¤5% | Rare: â‰¤15% | Uncommon: â‰¤35% | Common: &gt;35%
                  </p>
                </CardContent>
              </Card>

              {/* Trait Distributions */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Trait Distributions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-4">
                      {rarityReport.layerDistributions.map((layer) => (
                        <div key={layer.layerName} className="space-y-2">
                          <p className="text-sm font-medium">{layer.layerName}</p>
                          <div className="space-y-2">
                            {layer.traits.map((trait) => {
                              const tierConfig = RARITY_TIERS[trait.tier];

                              return (
                                <div key={trait.traitName} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <RarityBadge tier={trait.tier} showLabel={false} size="sm" />
                                      <span className="text-muted-foreground truncate">{trait.traitName}</span>
                                    </div>
                                    <span className="font-mono shrink-0">
                                      {trait.count} ({trait.percentage.toFixed(1)}%)
                                      {Math.abs(trait.percentage - trait.expectedPercentage) > 5 && (
                                        <span className={trait.percentage < trait.expectedPercentage ? "text-orange-500 ml-1" : "text-green-500 ml-1"}>
                                          {trait.percentage < trait.expectedPercentage ? "â†“" : "â†‘"}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
                                    <div
                                      className={`absolute inset-y-0 left-0 rounded-full ${trait.tier === "legendary" ? "bg-amber-500" :
                                        trait.tier === "rare" ? "bg-purple-500" :
                                          trait.tier === "uncommon" ? "bg-blue-500" :
                                            "bg-muted-foreground"
                                        }`}
                                      style={{ width: `${Math.min(trait.percentage, 100)}%` }}
                                    />
                                    <div
                                      className="absolute inset-y-0 w-0.5 bg-foreground/50"
                                      style={{ left: `${Math.min(trait.expectedPercentage, 100)}%` }}
                                      title={`Expected: ${trait.expectedPercentage.toFixed(1)}%`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Rarest NFTs */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Top 10 Rarest NFTs</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[180px]">
                    <div className="space-y-2">
                      {rarityReport.rarestCombinations.map((nft, index) => {
                        const tierConfig = RARITY_TIERS[nft.overallTier];

                        return (
                          <div
                            key={nft.nftId}
                            className={`flex items-center gap-3 p-2 rounded-lg border ${tierConfig.bgColor} ${tierConfig.borderColor}`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${tierConfig.bgColor} ${tierConfig.color} border ${tierConfig.borderColor}`}>
                              #{index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">NFT #{nft.nftId}</p>
                                <RarityBadge tier={nft.overallTier} size="sm" />
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {nft.traits.join(", ")}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {nft.rarityScore.toFixed(1)}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}

          {!rarityReport && layers.length > 0 && (
            <div className="text-center py-8 border border-dashed rounded-lg">
              <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Generate a rarity report to see trait distribution statistics
              </p>
            </div>
          )}

          {layers.length === 0 && (
            <div className="text-center py-8 border border-dashed rounded-lg">
              <Info className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Add layers and traits first
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="export" className="mt-4 space-y-4">
          {/* Export Progress */}
          {isExporting && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm font-medium">{exportStatus}</span>
                </div>
                <Progress value={exportProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {Math.round(exportProgress)}% complete
                </p>
              </CardContent>
            </Card>
          )}

          {/* Export Settings */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Export Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Number of NFTs to Generate</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={exportCount}
                    onChange={(e) => setExportCount(e.target.value)}
                    min="1"
                    max="10000"
                    className="w-32"
                    disabled={isExporting}
                  />
                  <span className="text-sm text-muted-foreground">
                    / {totalSupply} total supply
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Output Resolution</Label>
                <Select
                  value={String(outputResolution)}
                  onValueChange={(v) => setOutputResolution(Number(v))}
                  disabled={isExporting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTION_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {outputResolution >= 2048 && (
                  <p className="text-xs text-amber-500">
                    âš ï¸ High resolution may take longer. Ensure your browser has enough memory.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ZIP Export - Primary Option */}
          <Card className="border-primary/50">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Archive className="w-4 h-4 text-primary" />
                Download as ZIP
                <Badge variant="secondary" className="text-xs">Recommended</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Download your collection as a ZIP file with organized folders for images and metadata, ready for IPFS/Arweave deployment.
              </p>

              <Button
                onClick={exportAsZip}
                disabled={isExporting || !hasAnyImages}
                className="w-full gap-2"
                size="lg"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                Download Collection ZIP
              </Button>

              {!hasAnyImages && (
                <p className="text-xs text-yellow-600 dark:text-yellow-500">
                  âš ï¸ Add images to your traits to enable ZIP export
                </p>
              )}

              <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono">
                <p className="text-muted-foreground mb-2">ZIP structure:</p>
                <div className="space-y-0.5 text-foreground">
                  <p>ðŸ“ {collectionName.toLowerCase().replace(/\s+/g, "-")}-collection.zip</p>
                  <p className="pl-4">ðŸ“ images/</p>
                  <p className="pl-8">ðŸ–¼ï¸ 1.png, 2.png, ...</p>
                  <p className="pl-4">ðŸ“ metadata/</p>
                  <p className="pl-8">ðŸ“„ 1.json, 2.json, ...</p>
                  <p className="pl-4">ðŸ“„ _collection.json</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Download Image + Data */}
          <Card className="border-emerald-500/50 bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-500" />
                Download Image + Data
                <Badge className="text-xs bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40">ZIP</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Render <strong>{exportCount}</strong> NFTs at <strong>{outputResolution}Ã—{outputResolution}px</strong> and download a ZIP with images + metadata â€” ready to upload to any launchpad.
              </p>

              {isDownloadingAssets && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span className="text-sm">{downloadStatus}</span>
                  </div>
                  <Progress value={downloadProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground">{Math.round(downloadProgress)}% complete</p>
                </div>
              )}

              <Button
                onClick={downloadGeneratedAssets}
                disabled={isDownloadingAssets || isExporting || !hasAnyImages}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
                size="lg"
              >
                {isDownloadingAssets ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isDownloadingAssets ? downloadStatus : `Download ZIP â€” Images + Metadata`}
              </Button>

              {!hasAnyImages && (
                <p className="text-xs text-yellow-600 dark:text-yellow-500">
                  âš ï¸ Add images to your traits to enable download
                </p>
              )}

              <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono">
                <p className="text-muted-foreground mb-2">ZIP structure:</p>
                <div className="space-y-0.5 text-foreground">
                  <p>ðŸ“ {(collectionName || "collection").toLowerCase().replace(/\s+/g, "-")}-{exportCount}nfts.zip</p>
                  <p className="pl-4">ðŸ“ images/</p>
                  <p className="pl-8">ðŸ–¼ï¸ 1.png â€¦ {exportCount}.png ({outputResolution}px)</p>
                  <p className="pl-4">ðŸ“ metadata/</p>
                  <p className="pl-8">ðŸ“„ 1.json â€¦ {exportCount}.json</p>
                  <p className="pl-4">ðŸ“„ _collection.json</p>
                  <p className="pl-4">ðŸ“„ README.txt</p>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">🚀 Launch anywhere</p>
                <p className="text-xs text-muted-foreground">
                  Upload <code className="bg-muted px-1 rounded">images/</code> to any IPFS service, update the CID in metadata files, then use that metadata CID on Magic Eden, Tensor, OpenSea, or any launchpad.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Image Export */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Images className="w-4 h-4" />
                Other Export Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={exportImagesWithMetadata}
                  disabled={isExporting || !hasAnyImages}
                  variant="outline"
                  className="gap-2"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FolderArchive className="w-4 h-4" />
                  )}
                  Full Export (JSON)
                </Button>
                <Button
                  onClick={downloadIndividualImages}
                  variant="outline"
                  disabled={isExporting || !hasAnyImages}
                  className="gap-2"
                >
                  <Images className="w-4 h-4" />
                  Download Images Only
                </Button>
              </div>

              <div className="pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-1">
                  <strong>Full Export:</strong> JSON file with all metadata + embedded base64 images (up to 100 NFTs)
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Download Images:</strong> Individual PNG files downloaded to your device (up to 20)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Metadata Only Export */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileJson className="w-4 h-4" />
                Export Metadata Only
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export ERC-721 compatible metadata JSON without images. Use when you have images hosted elsewhere.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button onClick={exportAllMetadata} variant="outline" disabled={isExporting} className="gap-2">
                  <Package className="w-4 h-4" />
                  Collection Bundle
                </Button>
                <Button onClick={exportIndividualFiles} variant="outline" disabled={isExporting} className="gap-2">
                  <FileJson className="w-4 h-4" />
                  Individual Files
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sample Metadata Preview */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Sample Metadata Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {layers.length > 0 && layers.some((l) => l.traits.length > 0) ? (
                <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-48">
                  {JSON.stringify(
                    nftToStandardMetadata(generateNFTBatch(1).nfts[0] || { id: 1, traits: [] }, collectionName, collectionDescription),
                    null,
                    2
                  )}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Add layers and traits to preview metadata format
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
