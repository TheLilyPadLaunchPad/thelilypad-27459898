/**
 * Asset Generator for Advanced Mode
 * 
 * Generates unique NFT combinations based on layers and rarity weights.
 * Uses weighted random selection and duplicate checking.
 */

import { Layer, LayerTrait } from "@/components/launchpad/LayerManager";
import { TraitRule } from "@/components/launchpad/TraitRulesManager";

export interface GeneratedAsset {
    id: string;
    name: string;
    traits: { layer: string; trait: string; file: File }[];
    preview?: string; // Composite image data URL
    isOneOfOne?: boolean; // Flag to indicate if this is a custom 1/1
    customFile?: File; // Override file for 1/1s
    metadata: {
        name: string;
        description: string;
        attributes: { trait_type: string; value: string }[];
    };
}

export interface GeneratorConfig {
    collectionName: string;
    collectionSymbol: string;
    description: string;
    totalSupply: number;
    allowDuplicates: boolean;
    rules?: TraitRule[];
}

/**
 * Select a trait from a layer based on rarity weights
 */
function selectTraitByRarity(traits: LayerTrait[]): LayerTrait {
    const totalWeight = traits.reduce((sum, t) => sum + t.rarity, 0);
    let random = Math.random() * totalWeight;

    for (const trait of traits) {
        random -= trait.rarity;
        if (random <= 0) {
            return trait;
        }
    }

    // Fallback to last trait
    return traits[traits.length - 1];
}

/**
 * Generate a unique combination hash for duplicate checking
 */
function getCombinationHash(selectedTraits: { layerId: string; traitId: string }[]): string {
    return selectedTraits.map((t) => `${t.layerId}:${t.traitId}`).sort().join("|");
}

/**
 * Generate a single asset combination respecting rules.
 *
 * Rules are applied in two phases so that order of layers never matters:
 *  1. Forward pass — weighted pick per layer, honouring rules whose source
 *     was already selected (forces / incompatible).
 *  2. Repair pass — iteratively fixes rules whose source was selected *after*
 *     their target (forces, requires) and re-picks traits that violate an
 *     incompatible rule in either direction.
 */
function generateSingleCombination(
    layers: Layer[],
    existingHashes: Set<string>,
    rules: TraitRule[] = [],
    maxAttempts: number = 200
): { traits: { layerId: string; traitId: string; trait: LayerTrait }[]; hash: string } | null {
    const visibleLayers = layers.filter((l) => l.visible).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const layerById = new Map(visibleLayers.map((l) => [l.id, l]));

    /** Rules are only meaningful when both sides still exist. */
    const validRules = rules.filter((r) => {
        const src = layerById.get(r.sourceLayerId);
        const tgt = layerById.get(r.targetLayerId);
        return (
            !!src && !!tgt &&
            src.traits.some((t) => t.id === r.sourceTraitId) &&
            tgt.traits.some((t) => t.id === r.targetTraitId)
        );
    });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const selectedMap = new Map<string, string>();

        // ---- Phase 1: forward weighted selection ----
        for (const layer of visibleLayers) {
            if (layer.isOptional && Math.random() * 100 > (layer.optionalChance ?? 100)) continue;
            if (layer.traits.length === 0) continue;

            const active = validRules.filter(
                (r) => selectedMap.get(r.sourceLayerId) === r.sourceTraitId
            );

            const forced = active.find(
                (r) => (r.type === "forces" || r.type === "requires") && r.targetLayerId === layer.id
            );
            if (forced) {
                selectedMap.set(layer.id, forced.targetTraitId);
                continue;
            }

            const banned = new Set(
                active
                    .filter((r) => r.type === "incompatible" && r.targetLayerId === layer.id)
                    .map((r) => r.targetTraitId)
            );
            const available = layer.traits.filter((t) => !banned.has(t.id));
            const pick = selectTraitByRarity(available.length > 0 ? available : layer.traits);
            if (pick) selectedMap.set(layer.id, pick.id);
        }

        // ---- Phase 2: repair pass (order-independent rule enforcement) ----
        let satisfied = false;
        for (let pass = 0; pass < 8 && !satisfied; pass++) {
            let changed = false;

            for (const rule of validRules) {
                const sourceActive = selectedMap.get(rule.sourceLayerId) === rule.sourceTraitId;
                if (!sourceActive) continue;

                const targetLayer = layerById.get(rule.targetLayerId)!;
                const currentTarget = selectedMap.get(rule.targetLayerId);

                if (rule.type === "forces" || rule.type === "requires") {
                    if (currentTarget !== rule.targetTraitId) {
                        selectedMap.set(rule.targetLayerId, rule.targetTraitId);
                        changed = true;
                    }
                } else if (rule.type === "incompatible" && currentTarget === rule.targetTraitId) {
                    // Drop the offending trait: prefer an allowed alternative,
                    // otherwise omit the layer entirely rather than break the rule.
                    const banned = new Set(
                        validRules
                            .filter(
                                (r) =>
                                    r.type === "incompatible" &&
                                    r.targetLayerId === targetLayer.id &&
                                    selectedMap.get(r.sourceLayerId) === r.sourceTraitId
                            )
                            .map((r) => r.targetTraitId)
                    );
                    const alternatives = targetLayer.traits.filter((t) => !banned.has(t.id));
                    if (alternatives.length > 0) {
                        selectedMap.set(targetLayer.id, selectTraitByRarity(alternatives).id);
                    } else {
                        selectedMap.delete(targetLayer.id);
                    }
                    changed = true;
                }
            }

            if (!changed) satisfied = true;
        }

        // Final validation — never emit a combination that breaks a rule.
        const violates = validRules.some((rule) => {
            if (selectedMap.get(rule.sourceLayerId) !== rule.sourceTraitId) return false;
            const target = selectedMap.get(rule.targetLayerId);
            if (rule.type === "incompatible") return target === rule.targetTraitId;
            return target !== rule.targetTraitId;
        });
        if (!satisfied || violates) continue;

        const selectedTraits = visibleLayers
            .filter((l) => selectedMap.has(l.id))
            .map((l) => {
                const traitId = selectedMap.get(l.id)!;
                return { layerId: l.id, traitId, trait: l.traits.find((t) => t.id === traitId)! };
            })
            .filter((s) => !!s.trait);

        if (selectedTraits.length === 0) continue;

        const hash = getCombinationHash(selectedTraits);
        if (!existingHashes.has(hash)) {
            return { traits: selectedTraits, hash };
        }
    }

    return null; // Could not generate unique valid combination
}


/**
 * Composite multiple images into one (using canvas)
 */
async function compositeImages(
    traits: { layer: string; trait: LayerTrait }[]
): Promise<string> {
    // Create canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Default size (will be set by first image)
    let width = 512;
    let height = 512;

    // Load all images
    const images = await Promise.all(
        traits.map(
            (t) =>
                new Promise<HTMLImageElement>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.src = t.trait.preview;
                })
        )
    );

    // Set canvas size to first image size, but cap at 512 for thumbnails
    if (images.length > 0) {
        const originalWidth = images[0].width || 512;
        const originalHeight = images[0].height || 512;

        // Scale down to max 512px to prevent memory crashes during large collection generation
        const scale = Math.min(1, 512 / Math.max(originalWidth, originalHeight));
        width = Math.round(originalWidth * scale);
        height = Math.round(originalHeight * scale);
    }

    canvas.width = width;
    canvas.height = height;

    // Draw each layer in order
    for (const img of images) {
        ctx.drawImage(img, 0, 0, width, height);
    }

    // Use WebP for previews to save RAM/Disk space (PNG is too heavy for 1000s of data URLs)
    return canvas.toDataURL("image/webp", 0.8);
}

/**
 * Main generator function
 */
export async function generateAssets(
    layers: Layer[],
    config: GeneratorConfig,
    onProgress?: (current: number, total: number) => void
): Promise<GeneratedAsset[]> {
    const assets: GeneratedAsset[] = [];
    const existingHashes = new Set<string>();

    const visibleLayers = layers.filter((l) => l.visible && l.traits.length > 0);

    // Calculate max possible combinations
    const maxCombinations = visibleLayers.reduce(
        (acc, layer) => acc * layer.traits.length,
        1
    );

    // Cap supply at max combinations (only an estimate now with optional layers)
    const targetSupply = config.allowDuplicates ? config.totalSupply : Math.min(config.totalSupply, maxCombinations * 2 || config.totalSupply);

    for (let i = 0; i < targetSupply; i++) {
        onProgress?.(i + 1, targetSupply);

        const combination = generateSingleCombination(
            layers,
            config.allowDuplicates ? new Set() : existingHashes,
            config.rules || [],
            1000
        );

        if (!combination) {
            console.warn(`Could not generate unique valid combination at index ${i}`);
            break;
        }

        existingHashes.add(combination.hash);

        // Map to layer names for metadata
        const traitsWithNames = combination.traits.map((t) => {
            const layer = layers.find((l) => l.id === t.layerId)!;
            return {
                layer: layer.name,
                trait: t.trait,
            };
        });

        // Yield to event loop every 10 items so UI doesn't freeze
        if (i % 10 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }

        // Generate composite preview
        const preview = await compositeImages(traitsWithNames);

        const asset: GeneratedAsset = {
            id: crypto.randomUUID(),
            name: `${config.collectionName} #${i + 1}`,
            traits: traitsWithNames.map((t) => ({
                layer: t.layer,
                trait: t.trait.name,
                file: t.trait.file,
            })),
            preview,
            metadata: {
                name: `${config.collectionName} #${i + 1}`,
                description: config.description,
                attributes: traitsWithNames.map((t) => ({
                    trait_type: t.layer,
                    value: t.trait.name,
                })),
            },
        };

        assets.push(asset);
    }

    return assets;
}

/**
 * Export generated assets as a downloadable zip
 * (Requires jszip library - placeholder for now)
 */
export async function exportAssetsAsZip(
    assets: GeneratedAsset[],
    onProgress?: (current: number, total: number) => void
): Promise<Blob> {
    // This would use JSZip to create a downloadable archive
    // For now, returning a placeholder
    throw new Error("JSZip not implemented - use uploadFiles directly instead");
}

/**
 * Estimate rarity distribution for generated collection
 */
export function estimateRarityDistribution(
    layers: Layer[],
    sampleSize: number = 10000
): Map<string, Map<string, number>> {
    const distribution = new Map<string, Map<string, number>>();

    // Initialize
    for (const layer of layers) {
        if (!layer.visible) continue;
        const traitCounts = new Map<string, number>();
        for (const trait of layer.traits) {
            traitCounts.set(trait.name, 0);
        }
        distribution.set(layer.name, traitCounts);
    }

    // Simulate
    for (let i = 0; i < sampleSize; i++) {
        for (const layer of layers) {
            if (!layer.visible) continue;
            const trait = selectTraitByRarity(layer.traits);
            const traitCounts = distribution.get(layer.name)!;
            traitCounts.set(trait.name, (traitCounts.get(trait.name) || 0) + 1);
        }
    }

    // Convert to percentages
    for (const [, traitCounts] of distribution) {
        for (const [traitName, count] of traitCounts) {
            traitCounts.set(traitName, (count / sampleSize) * 100);
        }
    }

    return distribution;
}
