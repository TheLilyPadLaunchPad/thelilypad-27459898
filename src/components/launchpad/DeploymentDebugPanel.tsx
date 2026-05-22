import React, { useEffect, useState } from 'react';
import { Bug, X, Trash2, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { deployDebug, DeployEvent } from '@/lib/deployDebug';
import { toast } from 'sonner';

const KIND_STYLES: Record<DeployEvent['kind'], string> = {
    step: 'bg-primary/15 text-primary border-primary/30',
    tx: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    upload: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    uri: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    error: 'bg-destructive/15 text-destructive border-destructive/30',
    info: 'bg-muted text-muted-foreground border-border',
};

function fmtTs(ts: number) {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false }) + '.' +
        String(d.getMilliseconds()).padStart(3, '0');
}

function explorerForSig(sig: string): string | null {
    if (!sig) return null;
    // EVM tx hash (0x + 64 hex)
    if (/^0x[0-9a-fA-F]{64}$/.test(sig)) {
        return `https://testnet.monadexplorer.com/tx/${sig}`;
    }
    // Solana base58 sig (~87-88 chars)
    if (/^[1-9A-HJ-NP-Za-km-z]{60,120}$/.test(sig)) {
        return `https://solscan.io/tx/${sig}`;
    }
    return null;
}

export function DeploymentDebugPanel() {
    const [enabled, setEnabled] = useState(deployDebug.isEnabled());
    const [open, setOpen] = useState(false);
    const [events, setEvents] = useState<DeployEvent[]>([]);

    useEffect(() => {
        const unsub = deployDebug.subscribe(setEvents);
        return unsub;
    }, []);

    const handleToggleEnabled = () => {
        const next = !enabled;
        deployDebug.setEnabled(next);
        setEnabled(next);
        if (next) {
            setOpen(true);
            toast.success('Deployment debug mode enabled');
        } else {
            toast('Deployment debug mode disabled');
        }
    };

    const copyAll = async () => {
        const text = events.map(e =>
            `[${fmtTs(e.ts)}] ${e.kind.toUpperCase()} ${e.scope}: ${e.message}` +
            (e.data ? `\n  ${JSON.stringify(e.data)}` : '')
        ).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Debug log copied');
        } catch {
            toast.error('Copy failed');
        }
    };

    // Hidden trigger: Ctrl+Shift+D toggles the panel visibility (only when enabled)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                if (!enabled) {
                    deployDebug.setEnabled(true);
                    setEnabled(true);
                }
                setOpen(o => !o);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled]);

    if (!enabled && !open) {
        // Tiny floating bug icon so creators can flip it on without typing
        return (
            <button
                aria-label="Enable deployment debug mode"
                onClick={handleToggleEnabled}
                className="fixed bottom-4 right-4 z-[60] h-9 w-9 rounded-full bg-background/80 backdrop-blur border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                title="Enable deployment debug (Ctrl+Shift+D)"
            >
                <Bug className="h-4 w-4" />
            </button>
        );
    }

    if (!open) {
        return (
            <button
                aria-label="Open deployment debug panel"
                onClick={() => setOpen(true)}
                className="fixed bottom-4 right-4 z-[60] h-10 px-3 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-2 text-xs font-medium"
            >
                <Bug className="h-4 w-4" />
                Debug ({events.length})
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 z-[60] w-[min(560px,calc(100vw-2rem))] h-[min(520px,calc(100vh-2rem))] rounded-xl border border-border bg-background/95 backdrop-blur shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <Bug className="h-4 w-4 text-primary" />
                    Deployment Debug
                    <Badge variant="outline" className="text-[10px] h-5">{events.length}</Badge>
                </div>
                <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copyAll} disabled={!events.length}>
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => deployDebug.clear()}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleToggleEnabled}>
                        {enabled ? 'Off' : 'On'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOpen(false)}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                {events.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                        No events yet. Start a deploy / upload / mint to see live signatures,
                        Candy Machine steps, Irys uploads, and resolved URIs.
                    </div>
                ) : (
                    <ul className="divide-y divide-border text-xs font-mono">
                        {events.slice().reverse().map(ev => {
                            const sig = (ev.data?.signature as string) || '';
                            const uri = (ev.data?.uri as string) || (ev.kind === 'uri' ? ev.message : '');
                            const explorer = sig ? explorerForSig(sig) : null;
                            return (
                                <li key={ev.id} className="p-2 hover:bg-muted/30">
                                    <div className="flex items-start gap-2">
                                        <span className="text-muted-foreground shrink-0">{fmtTs(ev.ts)}</span>
                                        <Badge variant="outline" className={`shrink-0 text-[10px] h-5 ${KIND_STYLES[ev.kind]}`}>
                                            {ev.kind}
                                        </Badge>
                                        <span className="text-muted-foreground shrink-0">{ev.scope}</span>
                                    </div>
                                    <div className="mt-1 ml-1 break-all">
                                        {ev.message}
                                    </div>
                                    {(explorer || uri) && (
                                        <div className="mt-1 ml-1 flex flex-wrap gap-2">
                                            {explorer && (
                                                <a href={explorer} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-primary hover:underline">
                                                    <ExternalLink className="h-3 w-3" /> explorer
                                                </a>
                                            )}
                                            {uri && /^https?:\/\//.test(uri) && (
                                                <a href={uri} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline">
                                                    <ExternalLink className="h-3 w-3" /> open uri
                                                </a>
                                            )}
                                        </div>
                                    )}
                                    {ev.data && Object.keys(ev.data).length > 0 && (
                                        <pre className="mt-1 ml-1 text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                                            {JSON.stringify(ev.data, null, 2)}
                                        </pre>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </ScrollArea>

            <div className="px-3 py-1.5 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
                Toggle with Ctrl+Shift+D · stored in localStorage · off in normal use
            </div>
        </div>
    );
}

export default DeploymentDebugPanel;
