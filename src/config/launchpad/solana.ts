import {
    Tags,
    FolderOpen,
    Rocket,
    Shield,
    Clock,
    Wallet
} from "lucide-react";
import { ChainLaunchpadConfig } from "./types";

/**
 * Unified 3-step flow for ALL collection types on Solana.
 * The collection type (generative / 1-of-1 / music) is selected
 * inline during Step 1 and drives which uploader renders in Step 2.
 */
const UNIFIED_STEPS = [
    { id: 0, title: "Collection Info", icon: Tags, description: "Name, type & branding" },
    { id: 1, title: "Upload Assets",   icon: FolderOpen, description: "Images, layers or audio" },
    { id: 2, title: "Review & Launch",  icon: Rocket, description: "Preview & deploy" },
];

export const SOLANA_LAUNCHPAD_CONFIG: ChainLaunchpadConfig = {
    chain: 'solana',
    name: 'Solana',
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
        ipfsDefault: false, // Solana defaults to Irys/Arweave
        reveal: {
            supported: true,
            supportsScheduledReveal: true,
            supportsInstantReveal: true,
        },
        multiCommunityWL: true, // Can WL multiple NFT/token holder communities
        persistentWL: false, // Candy Guard phases are strict time-bound
    },
    defaultWLPhases: [
        {
            id: "og",
            name: "OG Allowlist",
            communitySources: [],
            startTime: null,
            endTime: null,
            keepOpenAfterEnd: false,
            maxPerWallet: 2,
            price: "0",
        },
        {
            id: "wl",
            name: "Whitelist",
            communitySources: [],
            startTime: null,
            endTime: null,
            keepOpenAfterEnd: false,
            maxPerWallet: 3,
            price: "0",
        },
    ],
    defaultTeamRoles: ["Artist", "Developer", "Community Manager", "Founder"],
    treasury: {
        treasuryAddress: "",
        splits: [
            { label: "Creator", address: "", bps: 8500 },
            { label: "Platform", address: "BQefQgbpAqPjoGKLTmAA2haZh9pEURYNefPFwsTotgem", bps: 1500 },
        ],
    },
    tools: [
        { name: "Candy Machine V3", description: "Set up phases, mint guards, and launch dates.", icon: Shield, component: "CandyMachineManager" },
        { name: "Metaplex Core", description: "Minimalistic and fast NFT standard for the next generation.", icon: Rocket, component: "MetaplexCoreSetup" },
        { name: "Freeze Authority", description: "Manage the ability to freeze minted NFTs until launch.", icon: Clock, component: "FreezeGuard" },
        { name: "Treasury Split", description: "Automatically share revenue with multiple creators.", icon: Wallet, component: "RevenueShare" },
    ],
    validation: {
        maxRoyalty: 100,
        symbolMaxLength: 10,
        requireCoverImage: true,
    }
};
