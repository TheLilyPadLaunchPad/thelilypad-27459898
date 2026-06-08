/**
 * Metaplex Core Collection plugin registry.
 *
 * This file is the single source of truth used by both the UI
 * (CollectionPluginsPanel) and the deploy-metaplex-launchpad edge function
 * (via the plain JSON payload we ship to it).
 *
 * Each entry maps to a Metaplex Core plugin type. The `build` function
 * is called server-side inside the edge function to turn the user's
 * configuration object into the exact plugin payload mpl-core expects.
 *
 * Reference: https://developers.metaplex.com/core/plugins
 */

export type CorePluginId =
    | 'Royalties'
    | 'Attributes'
    | 'VerifiedCreators'
    | 'PermanentFreezeDelegate'
    | 'PermanentTransferDelegate'
    | 'PermanentBurnDelegate'
    | 'ImmutableMetadata'
    | 'AddBlocker'
    | 'UpdateDelegate'
    | 'Autograph';

export type CorePluginCategory =
    | 'royalty'
    | 'metadata'
    | 'permanent'
    | 'lock'
    | 'delegate';

export interface CorePluginDef {
    id: CorePluginId;
    label: string;
    description: string;
    category: CorePluginCategory;
    /** Default config when toggled on. */
    defaultConfig?: Record<string, any>;
    /** Whether the plugin is on by default. */
    enabledByDefault?: boolean;
}

export const CORE_PLUGINS: CorePluginDef[] = [
    {
        id: 'Royalties',
        label: 'Royalties',
        description: 'Enforce creator royalties on secondary sales.',
        category: 'royalty',
        defaultConfig: { basisPoints: 500, ruleSet: 'None' },
        enabledByDefault: true,
    },
    {
        id: 'Attributes',
        label: 'On-chain Attributes',
        description: 'Store trait key/values on-chain so programs can read them.',
        category: 'metadata',
        defaultConfig: { attributeList: [] },
    },
    {
        id: 'VerifiedCreators',
        label: 'Verified Creators',
        description: 'Cryptographically verified creator addresses for marketplaces.',
        category: 'metadata',
        defaultConfig: { signatures: [] },
    },
    {
        id: 'PermanentFreezeDelegate',
        label: 'Permanent Freeze',
        description: 'Allow the creator to freeze any NFT in the collection (soulbound mode).',
        category: 'permanent',
        defaultConfig: { frozen: false },
    },
    {
        id: 'PermanentTransferDelegate',
        label: 'Permanent Transfer',
        description: 'Allow the creator to transfer any NFT in the collection (e.g. recovery, game escrow).',
        category: 'permanent',
    },
    {
        id: 'PermanentBurnDelegate',
        label: 'Permanent Burn',
        description: 'Allow the creator to burn any NFT in the collection (e.g. event redemption).',
        category: 'permanent',
    },
    {
        id: 'ImmutableMetadata',
        label: 'Immutable Metadata',
        description: 'Permanently lock name and URI — no future updates possible.',
        category: 'lock',
    },
    {
        id: 'AddBlocker',
        label: 'Add Blocker',
        description: 'Prevent any new plugins from being added in the future.',
        category: 'lock',
    },
    {
        id: 'UpdateDelegate',
        label: 'Update Delegate',
        description: 'Authorise a separate wallet to update collection metadata.',
        category: 'delegate',
        defaultConfig: { additionalDelegates: [] },
    },
    {
        id: 'Autograph',
        label: 'Autograph',
        description: 'Allow holders to permanently sign / inscribe the NFT.',
        category: 'delegate',
        defaultConfig: { signatures: [] },
    },
];

export interface CollectionPluginsConfig {
    /** Map of plugin id → enabled + config. */
    plugins: Partial<Record<CorePluginId, { enabled: boolean; config?: Record<string, any> }>>;
}

export function defaultCollectionPluginsConfig(): CollectionPluginsConfig {
    const out: CollectionPluginsConfig = { plugins: {} };
    for (const p of CORE_PLUGINS) {
        out.plugins[p.id] = { enabled: !!p.enabledByDefault, config: p.defaultConfig };
    }
    return out;
}
