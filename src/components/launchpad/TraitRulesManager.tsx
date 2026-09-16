import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Ban,
  Link2,
  ArrowRight,
  AlertTriangle,
  Zap,
  AlertCircle,
  Wand2,
  Layers3,
} from "lucide-react";
import { Layer, Trait } from "./LayerManager";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export type RuleType = "incompatible" | "requires" | "forces";

/** Sentinel trait id meaning "any trait in this layer" (layer-wide / category rule). */
export const ANY_TRAIT = "*";

export interface TraitRule {
  id: string;
  type: RuleType;
  sourceLayerId: string;
  /** Trait id, or ANY_TRAIT for a layer-wide rule */
  sourceTraitId: string;
  targetLayerId: string;
  /** Trait id, or ANY_TRAIT for a layer-wide rule */
  targetTraitId: string;
}

export interface RuleConflict {
  type: "force-incompatible" | "require-incompatible" | "circular-force" | "circular-require" | "self-reference";
  message: string;
  ruleIds: string[];
}

interface TraitRulesManagerProps {
  layers: Layer[];
  rules: TraitRule[];
  onRulesChange: (rules: TraitRule[]) => void;
}

const ruleTypeInfo: Record<
  RuleType,
  { label: string; icon: React.ElementType; color: string; description: string }
> = {
  incompatible: {
    label: "Incompatible With",
    icon: Ban,
    color: "text-red-500",
    description: "These traits cannot appear together",
  },
  requires: {
    label: "Requires",
    icon: Link2,
    color: "text-blue-500",
    description: "Source trait requires target trait to be present",
  },
  forces: {
    label: "Forces",
    icon: Zap,
    color: "text-yellow-500",
    description: "Source trait always forces target trait to appear",
  },
};

function detectRuleConflicts(rules: TraitRule[], layers: Layer[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  const getTraitKey = (layerId: string, traitId: string) => `${layerId}:${traitId}`;
  const getTraitName = (layerId: string, traitId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (traitId === ANY_TRAIT) return `Any ${layer?.name || "layer"} trait`;
    const trait = layer?.traits.find(t => t.id === traitId);
    return trait?.name || "Unknown";
  };
  const getLayerName = (layerId: string) => {
    return layers.find(l => l.id === layerId)?.name || "Unknown";
  };

  for (const rule of rules) {
    // Check for self-reference
    if (rule.sourceLayerId === rule.targetLayerId && rule.sourceTraitId === rule.targetTraitId) {
      conflicts.push({
        type: "self-reference",
        message: `Rule references itself: "${getTraitName(rule.sourceLayerId, rule.sourceTraitId)}"`,
        ruleIds: [rule.id],
      });
    }
  }

  // Check for force/require + incompatible conflicts
  for (const rule1 of rules) {
    for (const rule2 of rules) {
      if (rule1.id === rule2.id) continue;

      const sameSourceTarget =
        rule1.sourceLayerId === rule2.sourceLayerId &&
        rule1.sourceTraitId === rule2.sourceTraitId &&
        rule1.targetLayerId === rule2.targetLayerId &&
        rule1.targetTraitId === rule2.targetTraitId;

      // Force + Incompatible on same pair
      if (sameSourceTarget) {
        if (rule1.type === "forces" && rule2.type === "incompatible") {
          const existingConflict = conflicts.find(
            c => c.type === "force-incompatible" &&
              c.ruleIds.includes(rule1.id) && c.ruleIds.includes(rule2.id)
          );
          if (!existingConflict) {
            conflicts.push({
              type: "force-incompatible",
              message: `"${getTraitName(rule1.sourceLayerId, rule1.sourceTraitId)}" both forces AND is incompatible with "${getTraitName(rule1.targetLayerId, rule1.targetTraitId)}"`,
              ruleIds: [rule1.id, rule2.id],
            });
          }
        }

        // Require + Incompatible on same pair
        if (rule1.type === "requires" && rule2.type === "incompatible") {
          const existingConflict = conflicts.find(
            c => c.type === "require-incompatible" &&
              c.ruleIds.includes(rule1.id) && c.ruleIds.includes(rule2.id)
          );
          if (!existingConflict) {
            conflicts.push({
              type: "require-incompatible",
              message: `"${getTraitName(rule1.sourceLayerId, rule1.sourceTraitId)}" both requires AND is incompatible with "${getTraitName(rule1.targetLayerId, rule1.targetTraitId)}"`,
              ruleIds: [rule1.id, rule2.id],
            });
          }
        }
      }

      // Circular force: A forces B, B forces A
      if (rule1.type === "forces" && rule2.type === "forces") {
        const isCircular =
          rule1.sourceLayerId === rule2.targetLayerId &&
          rule1.sourceTraitId === rule2.targetTraitId &&
          rule1.targetLayerId === rule2.sourceLayerId &&
          rule1.targetTraitId === rule2.sourceTraitId;

        if (isCircular) {
          const existingConflict = conflicts.find(
            c => c.type === "circular-force" &&
              c.ruleIds.includes(rule1.id) && c.ruleIds.includes(rule2.id)
          );
          if (!existingConflict) {
            conflicts.push({
              type: "circular-force",
              message: `Circular force: "${getTraitName(rule1.sourceLayerId, rule1.sourceTraitId)}" ↔ "${getTraitName(rule1.targetLayerId, rule1.targetTraitId)}"`,
              ruleIds: [rule1.id, rule2.id],
            });
          }
        }
      }

      // Circular require: A requires B, B requires A
      if (rule1.type === "requires" && rule2.type === "requires") {
        const isCircular =
          rule1.sourceLayerId === rule2.targetLayerId &&
          rule1.sourceTraitId === rule2.targetTraitId &&
          rule1.targetLayerId === rule2.sourceLayerId &&
          rule1.targetTraitId === rule2.sourceTraitId;

        if (isCircular) {
          const existingConflict = conflicts.find(
            c => c.type === "circular-require" &&
              c.ruleIds.includes(rule1.id) && c.ruleIds.includes(rule2.id)
          );
          if (!existingConflict) {
            conflicts.push({
              type: "circular-require",
              message: `Circular requirement: "${getTraitName(rule1.sourceLayerId, rule1.sourceTraitId)}" ↔ "${getTraitName(rule1.targetLayerId, rule1.targetTraitId)}"`,
              ruleIds: [rule1.id, rule2.id],
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function TraitRulesManager({
  layers,
  rules,
  onRulesChange,
}: TraitRulesManagerProps) {
  const [newRule, setNewRule] = useState<Partial<TraitRule>>({
    type: "incompatible",
  });

  // Detect conflicts in current rules
  const conflicts = useMemo(() => detectRuleConflicts(rules, layers), [rules, layers]);

  // Bulk Generator
  const [keyword1, setKeyword1] = useState("Male");
  const [keyword2, setKeyword2] = useState("Female");

  const generateBulkRules = () => {
    if (!keyword1.trim() || !keyword2.trim()) {
      toast.error("Please enter both keywords.");
      return;
    }

    const newRules: TraitRule[] = [];

    // Find matching traits across all visible layers
    const match1 = layers.flatMap(l =>
      l.traits
        .filter(t => t.name.toLowerCase().includes(keyword1.toLowerCase().trim()))
        .map(t => ({ layer: l.id, trait: t.id }))
    );
    const match2 = layers.flatMap(l =>
      l.traits
        .filter(t => t.name.toLowerCase().includes(keyword2.toLowerCase().trim()))
        .map(t => ({ layer: l.id, trait: t.id }))
    );

    let added = 0;
    for (const m1 of match1) {
      for (const m2 of match2) {
        if (m1.layer !== m2.layer) {
          // Provide order strictly to check for duplicates
          const exists = rules.some(r => r.type === "incompatible" &&
            ((r.sourceLayerId === m1.layer && r.sourceTraitId === m1.trait && r.targetLayerId === m2.layer && r.targetTraitId === m2.trait) ||
              (r.sourceLayerId === m2.layer && r.sourceTraitId === m2.trait && r.targetLayerId === m1.layer && r.targetTraitId === m1.trait))
          );
          const selfExists = newRules.some(r => r.type === "incompatible" &&
            ((r.sourceLayerId === m1.layer && r.sourceTraitId === m1.trait && r.targetLayerId === m2.layer && r.targetTraitId === m2.trait) ||
              (r.sourceLayerId === m2.layer && r.sourceTraitId === m2.trait && r.targetLayerId === m1.layer && r.targetTraitId === m1.trait))
          );

          if (!exists && !selfExists) {
            newRules.push({
              id: crypto.randomUUID(),
              type: "incompatible",
              sourceLayerId: m1.layer,
              sourceTraitId: m1.trait,
              targetLayerId: m2.layer,
              targetTraitId: m2.trait
            });
            added++;
          }
        }
      }
    }

    if (added > 0) {
      onRulesChange([...rules, ...newRules]);
      toast.success(`Generated ${added} incompatible rules between "${keyword1}" and "${keyword2}"`);
    } else {
      toast.info("No matching traits found, or rules already exist.");
    }
  };

  const addRule = () => {
    if (
      !newRule.type ||
      !newRule.sourceLayerId ||
      !newRule.sourceTraitId ||
      !newRule.targetLayerId ||
      !newRule.targetTraitId
    ) {
      return;
    }

    const rule: TraitRule = {
      id: crypto.randomUUID(),
      type: newRule.type as RuleType,
      sourceLayerId: newRule.sourceLayerId,
      sourceTraitId: newRule.sourceTraitId,
      targetLayerId: newRule.targetLayerId,
      targetTraitId: newRule.targetTraitId,
    };

    onRulesChange([...rules, rule]);
    setNewRule({ type: "incompatible" });
  };

  const removeRule = (ruleId: string) => {
    onRulesChange(rules.filter((r) => r.id !== ruleId));
  };

  const removeConflictingRules = (ruleIds: string[]) => {
    onRulesChange(rules.filter((r) => !ruleIds.includes(r.id)));
  };

  const getLayerName = (layerId: string) => {
    return layers.find((l) => l.id === layerId)?.name || "Unknown Layer";
  };

  const getTraitName = (layerId: string, traitId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (traitId === ANY_TRAIT) return `Any ${layer?.name || "layer"} trait`;
    return layer?.traits.find((t) => t.id === traitId)?.name || "Unknown Trait";
  };

  const getTraitsForLayer = (layerId: string): Trait[] => {
    return layers.find((l) => l.id === layerId)?.traits || [];
  };

  const getTraitImage = (layerId?: string, traitId?: string) => {
    if (!layerId || !traitId || traitId === ANY_TRAIT) return undefined;
    const trait = layers.find((l) => l.id === layerId)?.traits.find((t) => t.id === traitId);
    return trait?.preview || trait?.imageUrl;
  };

  const isRuleInConflict = (ruleId: string) => {
    return conflicts.some(c => c.ruleIds.includes(ruleId));
  };

  const sourceTraits = newRule.sourceLayerId
    ? getTraitsForLayer(newRule.sourceLayerId)
    : [];
  const targetTraits = newRule.targetLayerId
    ? getTraitsForLayer(newRule.targetLayerId)
    : [];

  /** Big tile used in the rule preview box */
  const PreviewTile = ({
    layerId,
    traitId,
    label,
    danger,
  }: {
    layerId?: string;
    traitId?: string;
    label: string;
    danger?: boolean;
  }) => {
    const layer = layers.find((l) => l.id === layerId);
    const isAny = traitId === ANY_TRAIT;
    const img = getTraitImage(layerId, traitId);

    return (
      <div className="flex-1 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div
          className={`relative aspect-square w-full rounded-lg border overflow-hidden flex items-center justify-center bg-muted/40 ${danger ? "border-destructive/50" : "border-border"
            } ${!traitId ? "border-dashed" : ""}`}
        >
          {img ? (
            <img src={img} alt={getTraitName(layerId!, traitId!)} className="w-full h-full object-contain" />
          ) : isAny && layer ? (
            <div className="text-center px-2">
              <Layers3 className="w-6 h-6 mx-auto mb-1 text-primary" />
              <p className="text-[11px] font-medium leading-tight">Any {layer.name}</p>
              <p className="text-[10px] text-muted-foreground">{layer.traits.length} traits</p>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground px-2 text-center">Select a trait</span>
          )}
          {danger && img && <div className="absolute inset-0 bg-destructive/20" />}
        </div>
        <p className="text-[11px] truncate">
          {traitId && layerId ? getTraitName(layerId, traitId) : "—"}
          {layer && !isAny && (
            <span className="text-muted-foreground"> · {layer.name}</span>
          )}
        </p>
      </div>
    );
  };

  /** Small thumbnail used in the active-rules list */
  const RuleThumb = ({ layerId, traitId }: { layerId: string; traitId: string }) => {
    const img = getTraitImage(layerId, traitId);
    return (
      <div className="w-8 h-8 rounded border border-border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
        {img ? (
          <img src={img} alt="" className="w-full h-full object-contain" />
        ) : (
          <Layers3 className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Advanced Trait Rules
        </h3>
        <p className="text-sm text-muted-foreground">
          Define incompatibilities, requirements, and forced combinations
        </p>
      </div>

      {/* Conflict Warnings */}
      {conflicts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              {conflicts.length} Rule Conflict{conflicts.length > 1 ? "s" : ""} Detected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conflicts.map((conflict, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-background/50 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>{conflict.message}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeConflictingRules(conflict.ruleIds)}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remove
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add New Rule */}
      <Card className="border-dashed">
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Add New Rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rule Type Selection */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ruleTypeInfo) as RuleType[]).map((type) => {
              const info = ruleTypeInfo[type];
              const Icon = info.icon;
              return (
                <button
                  key={type}
                  onClick={() => setNewRule({ ...newRule, type })}
                  className={`p-3 rounded-lg border text-left transition-colors ${newRule.type === type
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                    }`}
                >
                  <Icon className={`w-4 h-4 mb-1 ${info.color}`} />
                  <p className="text-xs font-medium">{info.label}</p>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {newRule.type && ruleTypeInfo[newRule.type as RuleType].description}
          </p>

          {/* Source Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Source Layer</Label>
              <Select
                value={newRule.sourceLayerId}
                onValueChange={(value) =>
                  setNewRule({
                    ...newRule,
                    sourceLayerId: value,
                    sourceTraitId: undefined,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select layer" />
                </SelectTrigger>
                <SelectContent>
                  {layers.map((layer) => (
                    <SelectItem key={layer.id} value={layer.id}>
                      {layer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Source Trait</Label>
              <Select
                value={newRule.sourceTraitId}
                onValueChange={(value) =>
                  setNewRule({ ...newRule, sourceTraitId: value })
                }
                disabled={!newRule.sourceLayerId}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select trait" />
                </SelectTrigger>
                <SelectContent>
                  {sourceTraits.map((trait) => (
                    <SelectItem key={trait.id} value={trait.id}>
                      {trait.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Target Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Target Layer</Label>
              <Select
                value={newRule.targetLayerId}
                onValueChange={(value) =>
                  setNewRule({
                    ...newRule,
                    targetLayerId: value,
                    targetTraitId: undefined,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select layer" />
                </SelectTrigger>
                <SelectContent>
                  {layers.map((layer) => (
                    <SelectItem key={layer.id} value={layer.id}>
                      {layer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Target Trait</Label>
              <Select
                value={newRule.targetTraitId}
                onValueChange={(value) =>
                  setNewRule({ ...newRule, targetTraitId: value })
                }
                disabled={!newRule.targetLayerId}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select trait" />
                </SelectTrigger>
                <SelectContent>
                  {targetTraits.map((trait) => (
                    <SelectItem key={trait.id} value={trait.id}>
                      {trait.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={addRule}
            disabled={
              !newRule.type ||
              !newRule.sourceLayerId ||
              !newRule.sourceTraitId ||
              !newRule.targetLayerId ||
              !newRule.targetTraitId
            }
            className="w-full"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Rule
          </Button>
        </CardContent>
      </Card>

      {/* Magic Wand: Bulk Rule Generator */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary">
            <Wand2 className="w-4 h-4" />
            Smart Trait Grouping
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Automatically make traits incompatible based on keywords (e.g., prevent "Male" traits overlapping with "Female" traits).
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Keyword 1 (e.g. Male)"
              value={keyword1}
              onChange={(e) => setKeyword1(e.target.value)}
              className="h-8 text-xs bg-background"
            />
            <Input
              placeholder="Keyword 2 (e.g. Female)"
              value={keyword2}
              onChange={(e) => setKeyword2(e.target.value)}
              className="h-8 text-xs bg-background"
            />
            <Button onClick={generateBulkRules} size="sm" className="h-8 gap-2 shrink-0">
              <Zap className="w-3.5 h-3.5" /> Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Rules */}
      <div className="space-y-2">
        <Label className="text-sm">Active Rules ({rules.length})</Label>
        <ScrollArea className="h-[200px]">
          {rules.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
              No rules defined yet
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => {
                const info = ruleTypeInfo[rule.type];
                const Icon = info.icon;
                const hasConflict = isRuleInConflict(rule.id);
                return (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${hasConflict
                        ? "bg-destructive/10 border border-destructive/30"
                        : "bg-muted/50"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      {hasConflict ? (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <Icon className={`w-4 h-4 ${info.color}`} />
                      )}
                      <div className="text-sm">
                        <span className="font-medium">
                          {getTraitName(rule.sourceLayerId, rule.sourceTraitId)}
                        </span>
                        <span className="text-muted-foreground mx-2">
                          ({getLayerName(rule.sourceLayerId)})
                        </span>
                        <Badge variant="outline" className="mx-2 text-xs">
                          {info.label.toLowerCase()}
                        </Badge>
                        <span className="font-medium">
                          {getTraitName(rule.targetLayerId, rule.targetTraitId)}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          ({getLayerName(rule.targetLayerId)})
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeRule(rule.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
