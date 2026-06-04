import {
    Rocket,
    Tags,
    FolderOpen,
} from "lucide-react";
import { SupportedChain } from "../chains";
import { SOLANA_LAUNCHPAD_CONFIG } from "./solana";
import { ChainLaunchpadConfig } from "./types";

export * from "./types";
export * from "./solana";

/**
 * Unified 3-step flow shared across all chains.
 */
const UNIFIED_STEPS = [
    { id: 0, title: "Collection Info", icon: Tags, description: "Name, type & branding" },
    { id: 1, title: "Upload Assets",   icon: FolderOpen, description: "Images, layers or audio" },
    { id: 2, title: "Review & Launch",  icon: Rocket, description: "Preview & deploy" },
];

// Monad Config
export const MONAD_LAUNCHPAD_CONFIG: ChainLaunchpadConfig = {
    chain: 'monad',
    name: 'Monad',
    modes: {
        basic: UNIFIED_STEPS,
        advanced: UNIFIED_STEPS,
        "1of1": UNIFIED_STEPS,
        music: UNIFIED_STEPS,
    },
    features: {
        allowlist: true,
        phases: true,
        revenueSharing: true,
        customMetadata: true,
        ipfsDefault: true,
        reveal: {
            supported: true,
            supportsScheduledReveal: true,
            supportsInstantReveal: true,
        },
        multiCommunityWL: true,
        persistentWL: true,
    },
    defaultWLPhases: [
        {
            id: "holders",
            name: "Community Holders",
            communitySources: [],
            startTime: null,
            endTime: null,
            keepOpenAfterEnd: true,
            maxPerWallet: 3,
            price: "0",
        },
    ],
    defaultTeamRoles: ["Artist", "Smart Contract Dev", "Community Manager", "Founder"],
    treasury: {
        treasuryAddress: "",
        splits: [
            { label: "Creator", address: "", bps: 8500 },
            { label: "Platform", address: "", bps: 1500 },
        ],
    },
    tools: [],
    validation: {
        maxRoyalty: 100,
        symbolMaxLength: 10,
        requireCoverImage: true,
    }
};

export const CHAIN_LAUNCHPAD_CONFIGS: Record<string, ChainLaunchpadConfig> = {
    solana: SOLANA_LAUNCHPAD_CONFIG,
    monad: MONAD_LAUNCHPAD_CONFIG,
};

export function getLaunchpadConfig(chain: SupportedChain): ChainLaunchpadConfig {
    return CHAIN_LAUNCHPAD_CONFIGS[chain] || SOLANA_LAUNCHPAD_CONFIG;
}
