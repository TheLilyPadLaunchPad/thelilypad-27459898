import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Wand2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSolanaLaunch } from '@/hooks/useSolanaLaunch';
import { deployDebug, type DeployEvent } from '@/lib/deployDebug';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RevealCandyMachinePanelProps {
  /** On-chain Candy Machine address */
  candyMachineAddress: string;
  /** On-chain Core Collection address (for Helius DAS lookup) */
  collectionAddress: string;
  /** 43-char Arweave TX id logged by the deploy step — pre-fills the input */
  manifestRoot?: string;
  /** Hint for cost estimation; updates when assets are fetched */
  mintedCount?: number;
  /** Called after both reveal steps complete */
  onRevealComplete?: () => void;
}

interface AssetEntry {
  address: string;
  tokenId: number;
}

type StepStatus = 'idle' | 'pending' | 'success' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MANIFEST_ROOT_RE = /^[A-Za-z0-9_-]{43}$/;

function sigToSolscan(sig: string): string {
  // base64 → hex for Solscan; if it's already hex/base58 just use it.
  try {
    const bytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    return `https://solscan.io/tx/${Buffer.from(bytes).toString('hex')}`;
  } catch {
    return `https://solscan.io/tx/${sig}`;
  }
}

const KIND_DOT: Record<DeployEvent['kind'], string> = {
  step:   'bg-primary',
  tx:     'bg-blue-400',
  upload: 'bg-amber-400',
  uri:    'bg-emerald-400',
  error:  'bg-destructive',
  info:   'bg-muted-foreground',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RevealCandyMachinePanel({
  candyMachineAddress,
  collectionAddress,
  manifestRoot: manifestRootProp,
  mintedCount = 0,
  onRevealComplete,
}: RevealCandyMachinePanelProps) {
  const { revealCandyMachine, batchRevealAssets, isLoading } = useSolanaLaunch();

  // ── State ──────────────────────────────────────────────────────────────────
  const [manifestRoot, setManifestRoot]         = useState(manifestRootProp ?? '');
  const [assets, setAssets]                     = useState<AssetEntry[]>([]);
  const [assetJson, setAssetJson]               = useState('');
  const [showManualInput, setShowManualInput]   = useState(false);

  // Step statuses
  const [step1Status, setStep1Status] = useState<StepStatus>('idle');
  const [step2Status, setStep2Status] = useState<StepStatus>('idle');
  const [step1Sig, setStep1Sig]       = useState('');
  const [step2Progress, setStep2Progress] = useState(0);   // 0-100
  const [step2Done, setStep2Done]     = useState(0);

  // Confirm dialogs
  const [showStep1Confirm, setShowStep1Confirm] = useState(false);
  const [showStep2Confirm, setShowStep2Confirm] = useState(false);

  // Debug events feed
  const [debugEvents, setDebugEvents]   = useState<DeployEvent[]>([]);
  const [showDebug, setShowDebug]       = useState(false);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Propagate manifestRoot prop changes (e.g. parent loads it from DB late)
  useEffect(() => {
    if (manifestRootProp) setManifestRoot(manifestRootProp);
  }, [manifestRootProp]);

  // Subscribe to debug events for the inline log
  useEffect(() => {
    const unsub = deployDebug.subscribe(setDebugEvents);
    return unsub;
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────

  const rootValid = MANIFEST_ROOT_RE.test(manifestRoot.trim());

  // ── Asset helpers ──────────────────────────────────────────────────────────

  /** Parse the manual JSON textarea into AssetEntry[] */
  const parseManualAssets = useCallback((): AssetEntry[] | null => {
    try {
      const raw = JSON.parse(assetJson);
      if (!Array.isArray(raw)) throw new Error('Expected an array');
      // Accept both { address, tokenId } and bare strings
      return raw.map((item: any, i: number) => ({
        address: typeof item === 'string' ? item : item.address,
        tokenId: typeof item === 'string' ? i : (item.tokenId ?? item.token_id ?? i),
      }));
    } catch {
      return null;
    }
  }, [assetJson]);

  const loadManualAssets = useCallback(() => {
    const parsed = parseManualAssets();
    if (!parsed) {
      toast.error('Invalid JSON — expected [{address, tokenId}, …] or ["pubkey",…]');
      return;
    }
    setAssets(parsed);
    toast.success(`${parsed.length} asset addresses loaded`);
    setShowManualInput(false);
  }, [parseManualAssets]);

  // ── Step 1: CM reveal ──────────────────────────────────────────────────────

  const executeStep1 = async () => {
    if (!rootValid) return;
    setShowStep1Confirm(false);
    setStep1Status('pending');
    try {
      const sig = await revealCandyMachine(
        candyMachineAddress,
        manifestRoot.trim(),
        mintedCount,   // itemCount forwarded; panel consumer should supply total supply
      );
      setStep1Sig(sig);
      setStep1Status('success');
    } catch {
      setStep1Status('error');
    }
  };

  // ── Step 2: per-asset reveal ───────────────────────────────────────────────

  const executeStep2 = async () => {
    if (assets.length === 0) return;
    setShowStep2Confirm(false);
    setStep2Status('pending');
    setStep2Progress(0);
    setStep2Done(0);

    // Build the asset list expected by batchRevealAssets
    const revealList = assets.map(a => ({
      address: a.address,
      uri: `https://arweave.net/${manifestRoot.trim()}/${a.tokenId}.json`,
    }));

    // Patch batchRevealAssets to track progress via toast events.
    // We call it in chunks of 5 ourselves so we can update progress.
    const BATCH = 5;
    let done = 0;
    const total = revealList.length;

    try {
      for (let i = 0; i < total; i += BATCH) {
        const chunk = revealList.slice(i, i + BATCH);
        await batchRevealAssets(chunk);
        done += chunk.length;
        setStep2Done(done);
        setStep2Progress(Math.round((done / total) * 100));
      }
      setStep2Status('success');
      onRevealComplete?.();
    } catch {
      setStep2Status('error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const step1Done   = step1Status === 'success';
  const step1Error  = step1Status === 'error';
  const step2Done_  = step2Status === 'success';
  const step2Error  = step2Status === 'error';
  const bothDone    = step1Done && step2Done_;

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-b from-card to-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="w-4 h-4 text-primary" />
                Hidden-Settings Reveal
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Flip the Candy Machine from placeholder → real metadata in two on-chain steps.
              </CardDescription>
            </div>
            {bothDone && (
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Fully Revealed
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">

          {/* ── Manifest Root ──────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="reveal-manifest-root" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Arweave Manifest Root
            </Label>
            <div className="relative">
              <Input
                id="reveal-manifest-root"
                value={manifestRoot}
                onChange={e => setManifestRoot(e.target.value.trim())}
                placeholder="43-char Arweave TX id (from Deploy → Debug panel)"
                className={`font-mono text-xs pr-9 ${rootValid ? 'border-emerald-500/50' : manifestRoot ? 'border-destructive/50' : ''}`}
                disabled={step1Done}
              />
              {rootValid && (
                <CheckCircle2 className="absolute right-2.5 top-2.5 w-4 h-4 text-emerald-500 pointer-events-none" />
              )}
            </div>
            {manifestRoot && !rootValid && (
              <p className="text-[11px] text-destructive">
                Must be exactly 43 base64url characters (the TX id from your deployment output).
              </p>
            )}
            {rootValid && (
              <p className="text-[11px] text-muted-foreground font-mono">
                → <span className="text-emerald-400">https://arweave.net/{manifestRoot}/N.json</span>
              </p>
            )}
          </div>

          {/* ── Step 1 ─────────────────────────────────────────────────── */}
          <StepRow
            index={1}
            title="Update Candy Machine"
            description="One transaction. Clears hiddenSettings and installs real configLineSettings. Future mints get real metadata instantly."
            status={step1Status}
            disabled={!rootValid || isLoading}
            onExecute={() => setShowStep1Confirm(true)}
            actionLabel="Update Candy Machine"
            sig={step1Sig}
          />

          {/* ── Step 2 ─────────────────────────────────────────────────── */}
          <StepRow
            index={2}
            title="Reveal Minted Assets"
            description={`Updates the URI on every already-minted Core asset account. ~${Math.ceil(assets.length / 5) || Math.ceil(mintedCount / 5)} transactions (5 assets/tx).`}
            status={step2Status}
            disabled={!rootValid || isLoading || assets.length === 0}
            onExecute={() => setShowStep2Confirm(true)}
            actionLabel={`Reveal ${assets.length} Asset${assets.length !== 1 ? 's' : ''}`}
          >
            {/* Asset loading controls */}
            {step2Status === 'idle' && (
              <div className="mt-3 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowManualInput(v => !v)}
                >
                  {showManualInput ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                  {assets.length > 0 ? `${assets.length} assets loaded — change` : 'Paste asset addresses (JSON)'}
                </Button>

                <AnimatePresence>
                  {showManualInput && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <Textarea
                        id="reveal-asset-json"
                        placeholder={`[
  { "address": "AssetPubkey1", "tokenId": 0 },
  { "address": "AssetPubkey2", "tokenId": 1 }
]`}
                        value={assetJson}
                        onChange={e => setAssetJson(e.target.value)}
                        rows={6}
                        className="font-mono text-[11px]"
                      />
                      <Button size="sm" onClick={loadManualAssets} className="text-xs h-7">
                        Load Assets
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {assets.length > 0 && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Estimated ~{Math.ceil(assets.length / 5)} wallet signatures required.
                  </p>
                )}
              </div>
            )}

            {/* Progress bar while revealing */}
            {step2Status === 'pending' && (
              <div className="mt-3 space-y-1.5">
                <Progress value={step2Progress} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  {step2Done} / {assets.length} assets updated…
                </p>
              </div>
            )}
          </StepRow>

          {/* ── Debug Events ───────────────────────────────────────────── */}
          {debugEvents.length > 0 && (
            <div className="space-y-1">
              <button
                onClick={() => setShowDebug(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Debug Events ({debugEvents.length})
              </button>
              <AnimatePresence>
                {showDebug && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <ScrollArea className="h-36 rounded-lg border border-border bg-muted/30 p-2">
                      <ul className="space-y-1 text-[10px] font-mono">
                        {debugEvents.filter(e =>
                          e.scope.startsWith('solana.reveal') || e.scope.startsWith('solana.cm')
                        ).slice().reverse().map(ev => (
                          <li key={ev.id} className="flex items-start gap-1.5">
                            <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${KIND_DOT[ev.kind]}`} />
                            <span className="text-muted-foreground shrink-0">
                              {new Date(ev.ts).toLocaleTimeString(undefined, { hour12: false })}
                            </span>
                            <span className="break-all">{ev.message}</span>
                            {ev.data?.signature && (
                              <a
                                href={sigToSolscan(ev.data.signature as string)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-primary hover:underline"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

        </CardContent>
      </Card>

      {/* ── Confirm: Step 1 ───────────────────────────────────────────── */}
      <AlertDialog open={showStep1Confirm} onOpenChange={setShowStep1Confirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm: Reveal Candy Machine
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <p>This will call <strong>updateCandyMachine</strong> on-chain to:</p>
              <ul className="list-disc list-inside space-y-1 text-xs ml-2">
                <li>Permanently clear <code>hiddenSettings</code></li>
                <li>Set <code>configLineSettings.prefixUri</code> to:
                  <br/>
                  <code className="text-emerald-400 break-all">
                    https://arweave.net/{manifestRoot}/
                  </code>
                </li>
              </ul>
              <p className="text-destructive text-xs mt-2">
                ⚠ This action is <strong>irreversible</strong>. The placeholder URI will be gone from the CM account permanently.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeStep1} className="bg-primary">
              <Unlock className="w-4 h-4 mr-2" />
              Reveal Candy Machine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm: Step 2 ───────────────────────────────────────────── */}
      <AlertDialog open={showStep2Confirm} onOpenChange={setShowStep2Confirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm: Reveal {assets.length} Assets
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <p>
                This will update the on-chain URI of <strong>{assets.length} minted Core assets</strong> across approximately{' '}
                <strong>~{Math.ceil(assets.length / 5)} wallet signatures</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                Each asset's URI will be set to <code>https://arweave.net/{manifestRoot}/N.json</code>.
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeStep2} className="bg-primary">
              <Sparkles className="w-4 h-4 mr-2" />
              Reveal {assets.length} Assets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StepRow sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface StepRowProps {
  index: number;
  title: string;
  description: string;
  status: StepStatus;
  disabled: boolean;
  onExecute: () => void;
  actionLabel: string;
  sig?: string;
  children?: React.ReactNode;
}

function StepRow({ index, title, description, status, disabled, onExecute, actionLabel, sig, children }: StepRowProps) {
  const done  = status === 'success';
  const error = status === 'error';
  const busy  = status === 'pending';

  const borderColor = done
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : error
    ? 'border-destructive/40 bg-destructive/5'
    : 'border-border bg-muted/20';

  return (
    <motion.div
      layout
      className={`rounded-lg border p-4 space-y-2 transition-colors duration-300 ${borderColor}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Step number / status icon */}
          <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
            done  ? 'bg-emerald-500 text-white' :
            error ? 'bg-destructive text-white' :
            busy  ? 'bg-primary/20 text-primary' :
            'bg-muted text-muted-foreground'
          }`}>
            {done ? <CheckCircle2 className="w-3.5 h-3.5" /> :
             error ? <AlertTriangle className="w-3.5 h-3.5" /> :
             busy  ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
             index}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>

        {/* Action button */}
        {!done && (
          <Button
            size="sm"
            className="shrink-0 text-xs h-8"
            onClick={onExecute}
            disabled={disabled || busy}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
            {actionLabel}
          </Button>
        )}
      </div>

      {/* Success: show tx link */}
      {done && sig && (
        <div className="flex items-center gap-2 ml-9">
          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
          <a
            href={sigToSolscan(sig)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-emerald-400 hover:underline font-mono flex items-center gap-1"
          >
            View on Solscan <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(sig); toast.success('Signature copied'); }}
            className="text-muted-foreground hover:text-foreground"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <p className="ml-9 text-[11px] text-destructive">
          Transaction failed — check the Debug panel for details.
        </p>
      )}

      {/* Slot for extra controls (asset input, progress bar) */}
      {children && <div className="ml-9">{children}</div>}
    </motion.div>
  );
}
