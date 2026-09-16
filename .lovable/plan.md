# Trait Rules: Visual Preview + Layer-Wide Rules

Two additions to the trait rules step of the NFT generators.

## 1. Trait preview box

While building a rule, show the actual artwork instead of just names:

- A preview panel between the Source and Target pickers showing the selected source trait image and the target trait image side by side, with the rule badge (Incompatible / Requires / Forces) between them.
- Empty slots show a dashed placeholder until a trait is picked.
- For "Incompatible" the pair is tinted red with a slash overlay; "Requires"/"Forces" show an arrow between them.
- Each active rule in the list gets small thumbnails of the two traits next to its text, so rules are recognisable at a glance.

## 2. Layer-wide (category) rules

Today every rule is trait-to-trait. Adding an "Any trait in this layer" option to the target trait picker (and the source trait picker) lets a rule apply to a whole layer category:

- "Hat: Crown is incompatible with **any** Hair trait" — that layer is skipped whenever the source trait is picked.
- "Any Background trait forces Frame: Gold" — the rule fires for every trait in the source layer.
- Rule list renders these as "Crown (Hat) incompatible with Any Hair", and the preview box shows a stacked "layer" tile with the layer name and trait count instead of a single image.

Behaviour in the generator:

- Incompatible + layer target: the target layer is omitted entirely for that NFT (if the layer is required and has no allowed traits, it is left off, same as today's fallback).
- Requires / Forces + layer target: the target layer is guaranteed to be present, picking by rarity weight from its traits rather than being left off.
- Conflict detection is extended so a layer-wide rule that clashes with a trait-level rule on the same layer is flagged.

## Technical notes

- `TraitRule` gains optional trait ids: `sourceTraitId?: string` / `targetTraitId?: string`, with `undefined` (sentinel value `"*"` in the Select) meaning "any trait in the layer". Existing saved rules and drafts stay valid since trait-level rules are unchanged.
- `src/components/launchpad/TraitRulesManager.tsx`: add the preview panel, the "Any trait" options, thumbnails in the rule list, and extend `detectRuleConflicts` for wildcard matching.
- `src/lib/assetGenerator.ts`: `generateSingleCombination` rule matching updated — source match becomes "source layer selected and (wildcard or trait matches)"; forced/required wildcard targets pick by rarity; incompatible wildcard targets remove the layer. The existing repair pass and final validation are updated with the same wildcard-aware predicate so no artwork is emitted that breaks a rule.
- `src/hooks/useNFTGenerator.ts` gets the same wildcard-aware matching so preview generation agrees with the full run.
- Purely additive to the generator pages (XRPL, Robinhood, Solana/Monad) — they pass rules through unchanged.
