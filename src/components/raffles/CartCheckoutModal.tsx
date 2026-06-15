/**
 * Cart Checkout Modal
 * ────────────────────
 * Clean, web2-style checkout surface with the web3 details (signatures,
 * SOL cost, on-chain confirmation) tucked in as supporting badges.
 */

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Loader2,
    Check,
    AlertTriangle,
    RefreshCw,
    CheckCircle2,
    Sparkles,
    ShieldCheck,
    Package,
} from "lucide-react";
import type { CartCostEstimate } from "@/chains";

export type CheckoutStatus = 'idle' | 'processing' | 'success' | 'partial' | 'failed';

interface CartCheckoutModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    estimate: CartCostEstimate | null;
    itemCount: number;
    isCompressed: boolean;
    onConfirm: () => void;
    isProcessing: boolean;
    progressLabel?: string;
    progressCompleted?: number;
    progressTotal?: number;
    checkoutStatus?: CheckoutStatus;
    mintedCount?: number;
    failedCount?: number;
    onRetry?: () => void;
}

const fmtSol = (n: number) => `${n.toFixed(5)} SOL`;

export function CartCheckoutModal({
    open,
    onOpenChange,
    estimate,
    itemCount,
    isCompressed,
    onConfirm,
    isProcessing,
    progressLabel,
    progressCompleted = 0,
    progressTotal = 1,
    checkoutStatus = 'idle',
    mintedCount,
    failedCount = 0,
    onRetry,
}: CartCheckoutModalProps) {
    const progressPct = progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0;
    const isDone = checkoutStatus === 'success' || checkoutStatus === 'partial' || checkoutStatus === 'failed';

    return (
        <Dialog open={open} onOpenChange={(v) => !isProcessing && onOpenChange(v)}>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
                {/* Header */}
                <DialogHeader className="px-6 pt-6 pb-4">
                    <DialogTitle className="text-xl font-semibold tracking-tight">
                        Review your order
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                        One confirmation. We handle the on-chain steps.
                    </DialogDescription>
                </DialogHeader>

                <Separator />

                {/* Order summary */}
                <div className="px-6 py-5 space-y-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                            <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">
                                {itemCount} {itemCount === 1 ? "NFT" : "NFTs"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {isCompressed ? "Compressed collection (cNFT)" : "Standard Core NFT"}
                            </p>
                        </div>
                        {estimate && (
                            <Badge variant="outline" className="font-normal text-xs gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                {estimate.transactionCount} {estimate.transactionCount === 1 ? "sig" : "sigs"}
                            </Badge>
                        )}
                    </div>

                    {/* Price breakdown — web2 receipt feel */}
                    {estimate && (
                        <div className="rounded-xl border bg-muted/30 divide-y">
                            <div className="flex items-center justify-between px-4 py-3 text-sm">
                                <span className="text-muted-foreground">Arweave storage</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground line-through">
                                        {fmtSol(estimate.storageCost)}
                                    </span>
                                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 border-0 text-[10px] font-medium uppercase tracking-wide">
                                        Prefunded
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3 text-sm">
                                <span className="text-muted-foreground">Network &amp; deployment</span>
                                <span className="text-emerald-600 font-medium">Covered</span>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <span className="text-sm font-medium">You pay today</span>
                                <span className="text-base font-semibold">Free</span>
                            </div>
                        </div>
                    )}

                    {/* Reassurance line */}
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                        <p>Gasless deployment. You'll only see standard wallet fees when minting.</p>
                    </div>

                    {/* Progress */}
                    {isProcessing && (
                        <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {progressLabel ?? "Processing…"}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                    {progressCompleted}/{progressTotal}
                                </span>
                            </div>
                            <Progress value={progressPct} className="h-1.5" />
                        </div>
                    )}

                    {/* Result */}
                    {isDone && (
                        <div className={`rounded-xl border p-3 flex items-start gap-3 text-sm ${
                            checkoutStatus === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                : checkoutStatus === 'partial'
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'
                                : 'bg-destructive/10 border-destructive/20 text-destructive'
                        }`}>
                            {checkoutStatus === 'success'
                                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                                : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                            <div className="flex-1">
                                {checkoutStatus === 'success' && (
                                    <p className="font-medium">All {mintedCount ?? itemCount} NFTs minted.</p>
                                )}
                                {checkoutStatus === 'partial' && (
                                    <>
                                        <p className="font-medium">{mintedCount}/{itemCount} minted &middot; {failedCount} failed</p>
                                        <p className="text-xs mt-0.5 opacity-80">Your collection is live. Retry to finish the rest.</p>
                                    </>
                                )}
                                {checkoutStatus === 'failed' && (
                                    <>
                                        <p className="font-medium">Mint failed</p>
                                        <p className="text-xs mt-0.5 opacity-80">Your collection was created. Try minting again.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <Separator />

                <DialogFooter className="px-6 py-4 gap-2 sm:gap-2 sm:flex-row-reverse">
                    {!isDone && (
                        <Button onClick={onConfirm} disabled={isProcessing || !estimate} className="w-full sm:w-auto">
                            {isProcessing ? (
                                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Deploying…</>
                            ) : (
                                <><Check className="w-4 h-4 mr-2" />Confirm &amp; deploy</>
                            )}
                        </Button>
                    )}
                    {(checkoutStatus === 'partial' || checkoutStatus === 'failed') && onRetry && (
                        <Button variant="secondary" onClick={onRetry} disabled={isProcessing} className="w-full sm:w-auto">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retry {failedCount > 0 ? `${failedCount} failed` : 'items'}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isProcessing}
                        className="w-full sm:w-auto"
                    >
                        {isDone ? 'Close' : 'Cancel'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default CartCheckoutModal;
