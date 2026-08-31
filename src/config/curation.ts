import { Sparkles, Wrench, Rocket, Crown, type LucideIcon } from "lucide-react";

/**
 * Curated launch rails. Only The Lily Pad team assigns collections to these.
 * Stored in `featured_collections.feature_type`.
 */
export type CurationCategory =
    | "featured_nft"
    | "utility_nft"
    | "memecoin_nft";

export type FeatureRail = CurationCategory | "monthly";

export interface CurationCategoryMeta {
    id: FeatureRail;
    label: string;
    short: string;
    description: string;
    icon: LucideIcon;
    accent: string;
}

export const CURATION_CATEGORIES: CurationCategoryMeta[] = [
    {
        id: "featured_nft",
        label: "Featured NFT Projects",
        short: "Featured",
        description: "Art-first drops hand-picked by The Lily Pad team.",
        icon: Sparkles,
        accent: "text-primary",
    },
    {
        id: "utility_nft",
        label: "Utility NFT Projects",
        short: "Utility",
        description: "Access passes, memberships, tools and holder perks.",
        icon: Wrench,
        accent: "text-sky-500",
    },
    {
        id: "memecoin_nft",
        label: "Memecoin NFT Projects",
        short: "Memecoin",
        description: "Meme-native, community-driven collections.",
        icon: Rocket,
        accent: "text-amber-500",
    },
];

export const MONTHLY_RAIL: CurationCategoryMeta = {
    id: "monthly",
    label: "Collection of the Month",
    short: "Monthly",
    description: "Our single top pick for this month.",
    icon: Crown,
    accent: "text-amber-500",
};

export const ALL_RAILS: CurationCategoryMeta[] = [MONTHLY_RAIL, ...CURATION_CATEGORIES];

export function getRailMeta(id: string): CurationCategoryMeta | undefined {
    return ALL_RAILS.find((r) => r.id === id);
}

export function isCurationCategory(value: string | null | undefined): value is CurationCategory {
    return !!value && CURATION_CATEGORIES.some((c) => c.id === value);
}
