/**
 * Deployment Debug Bus
 *
 * Lightweight in-memory event log for NFT launchpad operations.
 * Lets the floating <DeploymentDebugPanel /> show, in real time:
 *  - Candy Machine step name
 *  - Tx signatures / hashes (with explorer links)
 *  - Irys / Arweave upload status
 *  - Resolved IPFS/metadata URLs
 *
 * Enable: localStorage.lilypad_deploy_debug = "1"  (or toggle from the panel).
 * Disabled by default in production — emits are no-ops when off so there is
 * zero overhead for normal users.
 */

export type DeployEventKind =
    | 'step'        // generic milestone (Candy Machine step, etc.)
    | 'tx'          // on-chain transaction
    | 'upload'      // Irys / Arweave upload status
    | 'uri'         // resolved metadata / image URI
    | 'error'
    | 'info';

export interface DeployEvent {
    id: string;
    ts: number;
    kind: DeployEventKind;
    scope: string;           // e.g. "solana.candyMachine", "monad.deploy", "irys.upload"
    message: string;
    data?: Record<string, unknown>;
}

const STORAGE_KEY = 'lilypad_deploy_debug';
const MAX_EVENTS = 500;

type Listener = (events: DeployEvent[]) => void;

class DeployDebugBus {
    private events: DeployEvent[] = [];
    private listeners = new Set<Listener>();

    isEnabled(): boolean {
        if (typeof window === 'undefined') return false;
        try {
            return window.localStorage?.getItem(STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    }

    setEnabled(enabled: boolean) {
        if (typeof window === 'undefined') return;
        try {
            if (enabled) window.localStorage.setItem(STORAGE_KEY, '1');
            else window.localStorage.removeItem(STORAGE_KEY);
        } catch { /* ignore */ }
        this.notify();
    }

    emit(ev: Omit<DeployEvent, 'id' | 'ts'>) {
        if (!this.isEnabled()) return;
        const full: DeployEvent = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ts: Date.now(),
            ...ev,
        };
        this.events.push(full);
        if (this.events.length > MAX_EVENTS) {
            this.events.splice(0, this.events.length - MAX_EVENTS);
        }
        // Also mirror to console for power users
        // eslint-disable-next-line no-console
        console.log(`[deploy:${full.scope}] ${full.message}`, full.data ?? '');
        this.notify();
    }

    clear() {
        this.events = [];
        this.notify();
    }

    getAll(): DeployEvent[] {
        return this.events.slice();
    }

    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        fn(this.events.slice());
        return () => { this.listeners.delete(fn); };
    }

    private notify() {
        const snap = this.events.slice();
        this.listeners.forEach((fn) => {
            try { fn(snap); } catch { /* ignore */ }
        });
    }
}

export const deployDebug = new DeployDebugBus();

/** Convenience helpers — keep emit sites tiny. */
export const debugStep = (scope: string, message: string, data?: Record<string, unknown>) =>
    deployDebug.emit({ kind: 'step', scope, message, data });

export const debugTx = (
    scope: string,
    signature: string,
    data?: Record<string, unknown>,
) => deployDebug.emit({ kind: 'tx', scope, message: `tx ${signature.slice(0, 12)}…`, data: { signature, ...data } });

export const debugUpload = (scope: string, message: string, data?: Record<string, unknown>) =>
    deployDebug.emit({ kind: 'upload', scope, message, data });

export const debugUri = (scope: string, uri: string, data?: Record<string, unknown>) =>
    deployDebug.emit({ kind: 'uri', scope, message: uri, data: { uri, ...data } });

export const debugError = (scope: string, message: string, data?: Record<string, unknown>) =>
    deployDebug.emit({ kind: 'error', scope, message, data });

export const debugInfo = (scope: string, message: string, data?: Record<string, unknown>) =>
    deployDebug.emit({ kind: 'info', scope, message, data });
