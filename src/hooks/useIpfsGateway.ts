import { useState, useEffect } from 'react';
import { IPFS_GATEWAY, ipfsToHttp } from '@/lib/ipfs';

const LOCAL_GATEWAY = 'http://127.0.0.1:8080';
const PROBE_CID = 'bafkreic7m6mscf6t6ypsx2pdr36p53rkmphvxuxy7ulx6lqpxqpcsh577i';

// Opt-in only: a dev can enable local-gateway detection by setting
// `localStorage.lilypad_ipfs_probe_local = "1"`. Default is OFF because:
//   • In hosted preview/prod there is no local node, so the probe always
//     fails (visible aborted request, 1s startup penalty).
//   • The previous fallback target (nftstorage.link) has been deprecated.
const PROBE_LOCAL = typeof window !== 'undefined' &&
    window.localStorage?.getItem('lilypad_ipfs_probe_local') === '1';

/**
 * Hook to manage the preferred IPFS gateway.
 *
 * Default: the shared `IPFS_GATEWAY` from `src/lib/ipfs.ts` (currently
 * https://ipfs.io). This keeps every code path — `ipfsToHttp`, NFT image
 * resolvers, metadata fetchers — pointed at the same working gateway.
 *
 * Opt-in: if the dev sets `localStorage.lilypad_ipfs_probe_local = "1"`
 * we probe a local IPFS node (IPFS Desktop / Companion) and switch to it
 * when present.
 */
export function useIpfsGateway() {
    const [gateway, setGateway] = useState<string>(IPFS_GATEWAY);
    const [isLocal, setIsLocal] = useState<boolean>(false);

    useEffect(() => {
        if (!PROBE_LOCAL) return;

        let cancelled = false;
        const detectLocalGateway = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                await fetch(`${LOCAL_GATEWAY}/ipfs/${PROBE_CID}`, {
                    signal: controller.signal,
                    mode: 'no-cors',
                });
                clearTimeout(timeoutId);
                if (cancelled) return;
                setGateway(LOCAL_GATEWAY);
                setIsLocal(true);
                console.log('[IPFS] Local gateway detected.');
            } catch {
                // No local node — stay on the shared default.
            }
        };
        detectLocalGateway();
        return () => { cancelled = true; };
    }, []);

    const resolveToGateway = (uri: string) => ipfsToHttp(uri, gateway);

    return { gateway, isLocal, resolveToGateway };
}
