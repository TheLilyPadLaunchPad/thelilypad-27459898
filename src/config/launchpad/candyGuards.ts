/**
 * Metaplex Core Candy Guard registry.
 *
 * Single source of truth for guard metadata used by the UI.
 * The edge function (`deploy-metaplex-launchpad`) understands the same
 * JSON shape: { [guardId]: { enabled: boolean, ...fields } }.
 *
 * Reference: https://developers.metaplex.com/core-candy-machine/guards
 */

export type GuardCategory = 'payment' | 'time' | 'limit' | 'gating' | 'advanced';

export type GuardId =
    | 'botTax'
    | 'solPayment'
    | 'tokenPayment'
    | 'token2022Payment'
    | 'startDate'
    | 'endDate'
    | 'mintLimit'
    | 'redeemedAmount'
    | 'addressGate'
    | 'allowList'
    | 'nftGate'
    | 'nftBurn'
    | 'nftPayment'
    | 'tokenGate'
    | 'tokenBurn'
    | 'programGate'
    | 'gatekeeper'
    | 'thirdPartySigner'
    | 'freezeSolPayment'
    | 'freezeTokenPayment'
    | 'edition'
    | 'assetGate'
    | 'assetBurn'
    | 'assetPayment';

export type GuardFieldType =
    | 'number'
    | 'lamports'
    | 'address'
    | 'date'
    | 'text'
    | 'csv'
    | 'bool';

export interface GuardField {
    key: string;
    label: string;
    type: GuardFieldType;
    required?: boolean;
    placeholder?: string;
    help?: string;
}

export interface GuardDef {
    id: GuardId;
    label: string;
    description: string;
    category: GuardCategory;
    fields: GuardField[];
}

export const CANDY_GUARDS: GuardDef[] = [
    {
        id: 'botTax',
        label: 'Bot Tax',
        description: 'Charge a small SOL penalty on failed mints to deter bots.',
        category: 'advanced',
        fields: [
            { key: 'lamports', label: 'Penalty (SOL)', type: 'number', required: true },
            { key: 'lastInstruction', label: 'Only last instruction', type: 'bool' },
        ],
    },
    {
        id: 'solPayment',
        label: 'SOL Payment',
        description: 'Charge SOL for each mint.',
        category: 'payment',
        fields: [
            { key: 'amount', label: 'Price (SOL)', type: 'number', required: true },
            { key: 'destination', label: 'Destination wallet', type: 'address', required: true },
        ],
    },
    {
        id: 'tokenPayment',
        label: 'SPL Token Payment',
        description: 'Charge an SPL token (e.g. USDC) for each mint.',
        category: 'payment',
        fields: [
            { key: 'mint', label: 'Token mint', type: 'address', required: true },
            { key: 'amount', label: 'Amount (whole tokens)', type: 'number', required: true },
            { key: 'destinationAta', label: 'Destination ATA', type: 'address', required: true },
        ],
    },
    {
        id: 'token2022Payment',
        label: 'Token-2022 Payment',
        description: 'Charge a Token-2022 (e.g. transfer-fee) token for each mint.',
        category: 'payment',
        fields: [
            { key: 'mint', label: 'Token mint', type: 'address', required: true },
            { key: 'amount', label: 'Amount (whole tokens)', type: 'number', required: true },
            { key: 'destinationAta', label: 'Destination ATA', type: 'address', required: true },
        ],
    },
    {
        id: 'freezeSolPayment',
        label: 'Freeze SOL Payment',
        description: 'Charge SOL and freeze the NFT until thawed (escrow).',
        category: 'payment',
        fields: [
            { key: 'amount', label: 'Price (SOL)', type: 'number', required: true },
            { key: 'destination', label: 'Destination wallet', type: 'address', required: true },
        ],
    },
    {
        id: 'freezeTokenPayment',
        label: 'Freeze Token Payment',
        description: 'Charge SPL tokens and freeze the NFT until thawed.',
        category: 'payment',
        fields: [
            { key: 'mint', label: 'Token mint', type: 'address', required: true },
            { key: 'amount', label: 'Amount', type: 'number', required: true },
            { key: 'destinationAta', label: 'Destination ATA', type: 'address', required: true },
        ],
    },
    {
        id: 'startDate',
        label: 'Start Date',
        description: 'Mint is not allowed before this date.',
        category: 'time',
        fields: [{ key: 'date', label: 'Start', type: 'date', required: true }],
    },
    {
        id: 'endDate',
        label: 'End Date',
        description: 'Mint is not allowed after this date.',
        category: 'time',
        fields: [{ key: 'date', label: 'End', type: 'date', required: true }],
    },
    {
        id: 'mintLimit',
        label: 'Mint Limit',
        description: 'Cap mints per wallet (per limit id).',
        category: 'limit',
        fields: [
            { key: 'id', label: 'Limit id (1-255)', type: 'number', required: true },
            { key: 'limit', label: 'Max per wallet', type: 'number', required: true },
        ],
    },
    {
        id: 'redeemedAmount',
        label: 'Redeemed Amount',
        description: 'Stop minting after N total NFTs have been minted from this guard.',
        category: 'limit',
        fields: [{ key: 'maximum', label: 'Maximum total mints', type: 'number', required: true }],
    },
    {
        id: 'addressGate',
        label: 'Address Gate',
        description: 'Only a single specified wallet can mint.',
        category: 'gating',
        fields: [{ key: 'address', label: 'Allowed address', type: 'address', required: true }],
    },
    {
        id: 'allowList',
        label: 'Allowlist (Merkle)',
        description: 'Only addresses present in a Merkle tree can mint.',
        category: 'gating',
        fields: [{ key: 'merkleRoot', label: 'Merkle root (hex, 32 bytes)', type: 'text', required: true }],
    },
    {
        id: 'nftGate',
        label: 'NFT Gate',
        description: 'Minter must hold an NFT from a given collection.',
        category: 'gating',
        fields: [{ key: 'requiredCollection', label: 'Required collection', type: 'address', required: true }],
    },
    {
        id: 'nftBurn',
        label: 'NFT Burn',
        description: 'Minter must burn an NFT from a given collection to mint.',
        category: 'gating',
        fields: [{ key: 'requiredCollection', label: 'Required collection', type: 'address', required: true }],
    },
    {
        id: 'nftPayment',
        label: 'NFT Payment',
        description: 'Minter pays with an NFT from a given collection (transfers it).',
        category: 'gating',
        fields: [
            { key: 'requiredCollection', label: 'Required collection', type: 'address', required: true },
            { key: 'destination', label: 'Recipient wallet', type: 'address', required: true },
        ],
    },
    {
        id: 'tokenGate',
        label: 'Token Gate',
        description: 'Minter must hold a minimum balance of a token.',
        category: 'gating',
        fields: [
            { key: 'mint', label: 'Token mint', type: 'address', required: true },
            { key: 'amount', label: 'Minimum amount', type: 'number', required: true },
        ],
    },
    {
        id: 'tokenBurn',
        label: 'Token Burn',
        description: 'Minter must burn tokens to mint.',
        category: 'gating',
        fields: [
            { key: 'mint', label: 'Token mint', type: 'address', required: true },
            { key: 'amount', label: 'Amount to burn', type: 'number', required: true },
        ],
    },
    {
        id: 'programGate',
        label: 'Program Gate',
        description: 'Restrict which programs may appear in the mint transaction.',
        category: 'advanced',
        fields: [{ key: 'additional', label: 'Allowed program ids (CSV)', type: 'csv' }],
    },
    {
        id: 'gatekeeper',
        label: 'Gatekeeper (Captcha)',
        description: 'Require a Civic/Gatekeeper pass (anti-bot captcha).',
        category: 'advanced',
        fields: [
            { key: 'gatekeeperNetwork', label: 'Gatekeeper network', type: 'address', required: true },
            { key: 'expireOnUse', label: 'Expire on use', type: 'bool' },
        ],
    },
    {
        id: 'thirdPartySigner',
        label: 'Third-Party Signer',
        description: 'Require an extra signature from a backend signer.',
        category: 'advanced',
        fields: [{ key: 'signerKey', label: 'Signer public key', type: 'address', required: true }],
    },
    {
        id: 'edition',
        label: 'Edition',
        description: 'Mark mints with an edition start offset (Print).',
        category: 'advanced',
        fields: [{ key: 'editionStartOffset', label: 'Edition start offset', type: 'number', required: true }],
    },
    {
        id: 'assetGate',
        label: 'Asset Gate (Core)',
        description: 'Minter must hold a specific Core asset.',
        category: 'gating',
        fields: [{ key: 'requiredCollection', label: 'Required Core collection', type: 'address', required: true }],
    },
    {
        id: 'assetBurn',
        label: 'Asset Burn (Core)',
        description: 'Minter must burn a Core asset to mint.',
        category: 'gating',
        fields: [{ key: 'requiredCollection', label: 'Required Core collection', type: 'address', required: true }],
    },
    {
        id: 'assetPayment',
        label: 'Asset Payment (Core)',
        description: 'Minter pays with a Core asset (transfers it).',
        category: 'gating',
        fields: [
            { key: 'requiredCollection', label: 'Required Core collection', type: 'address', required: true },
            { key: 'destination', label: 'Recipient', type: 'address', required: true },
        ],
    },
];

export const GUARDS_BY_CATEGORY: Record<GuardCategory, GuardDef[]> = CANDY_GUARDS.reduce(
    (acc, g) => {
        (acc[g.category] ||= []).push(g);
        return acc;
    },
    {} as Record<GuardCategory, GuardDef[]>,
);

/** Raw, JSON-serialisable guard set shipped to the edge function. */
export type GuardSetConfig = Partial<Record<GuardId, { enabled: boolean; [k: string]: any }>>;

/** A named guard group (Candy Machine "groups" feature). */
export interface GuardGroupConfig {
    /** ≤ 32 chars; passed as the group label on-chain. */
    label: string;
    guards: GuardSetConfig;
}

export interface LaunchGuardConfig {
    /** Always-applied defaults (mirrors Candy Machine `guards` field). */
    defaultGuards: GuardSetConfig;
    /** Optional per-phase overrides (mirrors Candy Machine `groups` field). */
    groups?: GuardGroupConfig[];
}

/** Sensible defaults: bot tax + (optional) sol payment, no groups. */
export function defaultLaunchGuardConfig(): LaunchGuardConfig {
    return {
        defaultGuards: {
            botTax: { enabled: true, lamports: 0.01, lastInstruction: true },
        },
    };
}
