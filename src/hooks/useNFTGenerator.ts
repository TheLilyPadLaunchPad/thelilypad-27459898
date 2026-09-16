import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { GeneratedNFT } from "@/lib/assetBundler";
import type { Layer } from "@/components/launchpad/LayerManager";
import { ANY_TRAIT, type TraitRule } from "@/components/launchpad/TraitRulesManager";

/**
 * useNFTGenerator — Generative art engine
 *
 * Encapsulates the trait-selection algorithm (weighted random + rules),
 * duplicate detection via trait-hash, and batch generation.
 */
export function useNFTGenerator(layers: Layer[], rules: TraitRule[]) {
    const [generatedPreviews, setGeneratedPreviews] = useState<GeneratedNFT[]>([]);
    const [duplicatesAvoided, setDuplicatesAvoided] = useState(0);

    /** Select a single trait for a layer, respecting rules + rarity weights. */
    const selectTraitForLayer = useCallback(
        (
            layer: Layer,
            selectedTraits: Map<string, string>,
            allLayers: Layer[]
        ): string | null => {
            // Check if layer is optional and randomly skip
            if (layer.isOptional && Math.random() * 100 > layer.optionalChance) {
                return null;
            }

            if (layer.traits.length === 0) return null;

            // Get applicable rules for already selected traits ("*" = any trait in the layer)
            const applicableRules = rules.filter((rule) => {
                const sourceSelected = selectedTraits.get(rule.sourceLayerId);
                if (!sourceSelected) return false;
                return rule.sourceTraitId === ANY_TRAIT || sourceSelected === rule.sourceTraitId;
            });

            // Layer-wide incompatibility: skip this layer entirely
            const layerBanned = applicableRules.some(
                (r) =>
                    r.type === "incompatible" &&
                    r.targetLayerId === layer.id &&
                    r.targetTraitId === ANY_TRAIT
            );
            if (layerBanned) return null;

            // Find forced traits for this layer
            const forcedTraits = applicableRules
                .filter(
                    (r) =>
                        r.type === "forces" &&
                        r.targetLayerId === layer.id &&
                        r.targetTraitId !== ANY_TRAIT
                )
                .map((r) => r.targetTraitId);

            if (forcedTraits.length > 0) {
                return forcedTraits[0];
            }

            // Filter out incompatible traits
            const incompatibleTraits = applicableRules
                .filter((r) => r.type === "incompatible" && r.targetLayerId === layer.id)
                .map((r) => r.targetTraitId);

            const availableTraits = layer.traits.filter(
                (t) => !incompatibleTraits.includes(t.id)
            );

            if (availableTraits.length === 0) {
                // If all traits are incompatible, just pick from original
                const totalRarity = layer.traits.reduce((sum, t) => sum + t.rarity, 0);
                let random = Math.random() * totalRarity;
                for (const trait of layer.traits) {
                    random -= trait.rarity;
                    if (random <= 0) return trait.id;
                }
                return layer.traits[0].id;
            }

            // Weighted random selection from available traits
            const totalRarity = availableTraits.reduce((sum, t) => sum + t.rarity, 0);
            let random = Math.random() * totalRarity;
            for (const trait of availableTraits) {
                random -= trait.rarity;
                if (random <= 0) return trait.id;
            }

            return availableTraits[0].id;
        },
        [rules]
    );

    /** Generate a unique trait combination hash for duplicate detection. */
    const getTraitHash = (traits: GeneratedNFT["traits"]): string => {
        return traits
            .map((t) => `${t.layerId}:${t.traitId}`)
            .sort()
            .join("|");
    };

    /** Generate a single NFT. */
    const generateSingleNFT = useCallback(
        (id: number, sortedLayers: Layer[]): GeneratedNFT => {
            const selectedTraits = new Map<string, string>();
            const nftTraits: GeneratedNFT["traits"] = [];

            for (const layer of sortedLayers) {
                const selectedTraitId = selectTraitForLayer(layer, selectedTraits, layers);
                if (selectedTraitId) {
                    selectedTraits.set(layer.id, selectedTraitId);
                    const trait = layer.traits.find((t) => t.id === selectedTraitId);
                    if (trait) {
                        nftTraits.push({
                            layerId: layer.id,
                            layerName: layer.name,
                            traitId: trait.id,
                            traitName: trait.name,
                            imageUrl: trait.imageUrl,
                            blendMode: layer.blendMode,
                            opacity: layer.opacity,
                        });
                    }
                }
            }

            return { id, traits: nftTraits };
        },
        [layers, selectTraitForLayer]
    );

    /** Generate a batch of NFTs with optional uniqueness enforcement. */
    const generateNFTBatch = useCallback(
        (
            count: number,
            ensureUnique: boolean = true
        ): { nfts: GeneratedNFT[]; duplicatesAvoided: number } => {
            const sortedLayers = [...layers].sort((a, b) => a.order - b.order);
            const previews: GeneratedNFT[] = [];
            const seenHashes = new Set<string>();
            let dupsAvoided = 0;
            const maxAttempts = count * 10;
            let attempts = 0;

            while (previews.length < count && attempts < maxAttempts) {
                attempts++;
                const nft = generateSingleNFT(previews.length + 1, sortedLayers);
                const hash = getTraitHash(nft.traits);

                if (!ensureUnique || !seenHashes.has(hash)) {
                    seenHashes.add(hash);
                    previews.push({ ...nft, id: previews.length + 1 });
                } else {
                    dupsAvoided++;
                }
            }

            if (previews.length < count) {
                toast.warning(
                    `Only ${previews.length} unique combinations possible. Add more traits for ${count} unique NFTs.`
                );
            }

            return { nfts: previews, duplicatesAvoided: dupsAvoided };
        },
        [layers, generateSingleNFT]
    );

    /** Generate preview NFTs and update state. */
    const generatePreviews = useCallback(
        (count: number) => {
            const { nfts, duplicatesAvoided: avoided } = generateNFTBatch(count);
            setGeneratedPreviews(nfts);
            setDuplicatesAvoided(avoided);
            if (avoided > 0) {
                toast.info(`Avoided ${avoided} duplicate combinations`);
            }
        },
        [generateNFTBatch]
    );

    return {
        generatedPreviews,
        duplicatesAvoided,
        generatePreviews,
        generateNFTBatch,
    };
}
