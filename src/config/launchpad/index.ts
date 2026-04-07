import {
    Rocket,
    Settings,
    Image,
    Layers,
    Folder,
    FileText,
    Music,
    ListMusic,
    Type
} from "lucide-react";
import { SupportedChain } from "../chains";
import { SOLANA_LAUNCHPAD_CONFIG } from "./solana";
import { ChainLaunchpadConfig, LaunchpadStep } from "./types";

export * from "./types";
export * from "./solana";
export * from "./xrpl";

// Generic Music Flow (EVM/Solana/XRPL compatible)
const musicSteps: LaunchpadStep[] = [
    {
        id: 0,
        title: "Essentials",
        description: "Album info & branding",
        icon: Type
    },
    {
        id: 1,
        title: "Audio Tracks",
        description: "Upload MP3/WAV files",
        icon: Music
    },
    {
        id: 2,
        title: "Track Metadata",
        description: "BPM, Genre & Details",
        icon: ListMusic
    },
    {
        id: 3,
        title: "Mint Config",
        description: "Pricing & Royalties",
        icon: Settings
    },
    {
        id: 4,
        title: "Launch",
        description: "Deploy to Chain",
        icon: Rocket
    }
];

// Monad Placeholder Config
export const MONAD_LAUNCHPAD_CONFIG: ChainLaunchpadConfig = {
    chain: 'monad',
    name: 'Monad',
    modes: {
        basic: [
            { id: 0, title: "Mode", icon: (SOLANA_LAUNCHPAD_CONFIG.modes.basic as any)[0].icon, description: "Choose Mode" },
            { id: 1, title: "Essentials", icon: (SOLANA_LAUNCHPAD_CONFIG.modes.basic as any)[1].icon, description: "Name, Symbol & Story" },
            { id: 2, title: "Artworks", icon: (SOLANA_LAUNCHPAD_CONFIG.modes.basic as any)[2].icon, description: "Upload Pieces" },
            { id: 3, title: "Contracts", icon: (SOLANA_LAUNCHPAD_CONFIG.modes.basic as any)[3].icon, description: "Pricing & Royalties" },
            { id: 4, title: "Launch", icon: (SOLANA_LAUNCHPAD_CONFIG.modes.basic as any)[4].icon, description: "Deploy" },
        ]
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
        multiCommunityWL: true, // EVM-style WL supports multiple community snapshots
        persistentWL: true, // Monad WL can remain open after phase window
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
    solana: {
        ...SOLANA_LAUNCHPAD_CONFIG,
        modes: {
            ...SOLANA_LAUNCHPAD_CONFIG.modes,
            music: musicSteps
        }
    },
    xrpl: {
        ...XRPL_LAUNCHPAD_CONFIG,
        modes: {
            ...XRPL_LAUNCHPAD_CONFIG.modes,
            music: musicSteps
        }
    },
    monad: {
        ...MONAD_LAUNCHPAD_CONFIG,
        modes: {
            ...MONAD_LAUNCHPAD_CONFIG.modes,
            music: musicSteps
        }
    }
};

export function getLaunchpadConfig(chain: SupportedChain): ChainLaunchpadConfig {
    return CHAIN_LAUNCHPAD_CONFIGS[chain] || SOLANA_LAUNCHPAD_CONFIG;
}
