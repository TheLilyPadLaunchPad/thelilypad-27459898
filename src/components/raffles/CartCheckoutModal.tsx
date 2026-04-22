/**
 * Cart Checkout Modal
 * ────────────────────
 * Shows the creator an aggregated cost preview AFTER assets have been uploaded,
 * and before any on-chain transaction is signed. This replaces the old pattern
 * of prompting for storage payment up-front and then signing each subsequent
 * collection/tree/mint tx individually.
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
import { Loader2, ShoppingCart, Check, Zap, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
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
        <Dialog open={open} onOpenChange={(v) => !isProcessing && onOpenChange(v)} >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-primary" />
                        Review & Deploy
                    </DialogTitle>
                    <DialogDescription>
                        Your assets are uploaded. Confirm to deploy the collection and mint in a
                        single checkout — no extra signing prompts for storage.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Summary badges */}
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{itemCount} {itemCount === 1 ? "NFT" : "NFTs"}</Badge>
                        <Badge variant="secondary">
                            {isCompressed ? "Compressed (cNFT)" : "Standard Core NFT"}
                        </Badge>
                        {estimate && (
                            <Badge variant="outline" className="gap-1">
                                <Zap className="w-3 h-3" />
                                {estimate.transactionCount} {estimate.transactionCount === 1 ? "signature" : "signatures"}
                            </Badge>
                        )}
                    </div>

                    {/* Cost breakdown */}
                    {estimate && (
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Arweave storage</span>
                                <span className="font-mono">{fmtSol(estimate.storageCost)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Collection rent</span>
                                <span className="font-mono">{fmtSol(estimate.collectionCost)}</span>
                            </div>
                            {estimate.treeCost !== undefined && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Merkle tree rent</span>
                                    <span className="font-mono">{fmtSol(estimate.treeCost)}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Mint network fees</span>
                                <span className="font-mono">{fmtSol(estimate.mintCost)}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between font-semibold">
                                <span>Total</span>
                                <span className="font-mono text-primary">{fmtSol(estimate.total)}</span>
                            </div>
                        </div>
                    )}

                    {/* Progress (while processing) */}
                    {isProcessing && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                <span>{progressLabel ?? "Processing…"}</span>
                            </div>
                            <Progress value={progressPct} />
                            <p className="text-xs text-muted-foreground text-right">
                                {progressCompleted} / {progressTotal}
                            </p>
                        </div>
                    )}

                    {/* Result status banner */}
                    {isDone && (
                        <div className={`rounded-lg border p-3 flex items-start gap-3 text-sm ${
                            checkoutStatus === 'success'
                                ? 'bg-green-500/10 border-green-500/30 text-green-600'
                                : checkoutStatus === 'partial'
                                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600'
                                : 'bg-destructive/10 border-destructive/30 text-destructive'
                        }`}>
                            {checkoutStatus === 'success' && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
                            {checkoutStatus === 'partial' && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                            {checkoutStatus === 'failed'  && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                            <div>
                                {checkoutStatus === 'success' && (
                                    <p className="font-medium">All {mintedCount ?? itemCount} NFTs minted successfully!</p>
                                )}
                                {checkoutStatus === 'partial' && (
                                    <>
                                        <p className="font-medium">
                                            {mintedCount}/{itemCount} NFTs minted &mdash; {failedCount} failed.
                                        </p>
                                        <p className="text-xs mt-0.5">Your collection is live. Use &ldquo;Retry Failed Items&rdquo; to mint the rest.</p>
                                    </>
                                )}
                                {checkoutStatus === 'failed' && (
                                    <>
                                        <p className="font-medium">Mint failed. Your collection was created.</p>
                                        <p className="text-xs mt-0.5">Click &ldquo;Retry&rdquo; to attempt minting again.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isProcessing}
                    >
                        {isDone ? 'Close' : 'Cancel'}
                    </Button>
                    {(checkoutStatus === 'partial' || checkoutStatus === 'failed') && onRetry && (
                        <Button variant="secondary" onClick={onRetry} disabled={isProcessing}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retry {failedCount > 0 ? `${failedCount} Failed` : 'Items'}
                        </Button>
                    )}
                    {!isDone && (
                        <Button onClick={onConfirm} disabled={isProcessing || !estimate}>
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Deploying…
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Confirm & Deploy
                                </>
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default CartCheckoutModal;
