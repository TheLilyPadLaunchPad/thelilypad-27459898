import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Loader2, Clock, CheckCircle2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSolanaLaunch } from "@/hooks/useSolanaLaunch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CloseAndReclaimCardProps {
    collectionId: string;
    chain: string;
    candyMachineAddress?: string | null;
    candyGuardAddress?: string | null;
    minted: number;
    totalSupply: number;
    mintEndDate?: string | null;
    closedAt?: string | null;
    isCreator: boolean;
    onClosed?: () => void;
}

export const CloseAndReclaimCard: React.FC<CloseAndReclaimCardProps> = ({
    collectionId,
    chain,
    candyMachineAddress,
    candyGuardAddress,
    minted,
    totalSupply,
    mintEndDate,
    closedAt,
    isCreator,
    onClosed,
}) => {
    const { deleteCandyMachine, isLoading } = useSolanaLaunch();

    if (!isCreator) return null;
    if (chain !== "solana") return null;
    if (!candyMachineAddress) return null;

    const isSoldOut = totalSupply > 0 && minted >= totalSupply;
    const endPassed = !!mintEndDate && new Date(mintEndDate).getTime() <= Date.now();
    const isEligible = isSoldOut || endPassed;
    const alreadyClosed = !!closedAt;

    const handleClose = async () => {
        const ok = await deleteCandyMachine(
            candyMachineAddress,
            candyGuardAddress || undefined,
        );
        if (!ok) return;

        const { error } = await supabase
            .from("collections")
            .update({
                status: "closed",
                closed_at: new Date().toISOString(),
            })
            .eq("id", collectionId);

        if (error) {
            toast.error("Closed on-chain but failed to update record: " + error.message);
        } else {
            toast.success("Candy Machine closed — rent returned to your wallet");
            onClosed?.();
        }
    };

    return (
        <Card className="border-primary/20">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Lock className="w-4 h-4 text-primary" />
                    Close & Reclaim Rent
                </CardTitle>
                <CardDescription>
                    Closes the Candy Machine and returns the Solana rent deposit to your wallet.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Mint progress</span>
                    <span className="font-medium">{minted} / {totalSupply}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Mint end date</span>
                    <span className="font-medium">
                        {mintEndDate ? new Date(mintEndDate).toLocaleString() : "Not set"}
                    </span>
                </div>

                {alreadyClosed ? (
                    <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Closed {new Date(closedAt!).toLocaleDateString()}
                    </Badge>
                ) : !isEligible ? (
                    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 mt-0.5" />
                        <span>
                            You can close & reclaim after the collection sells out or the mint end date passes.
                        </span>
                    </div>
                ) : (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button className="w-full" disabled={isLoading}>
                                {isLoading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing…</>
                                ) : (
                                    "Close Candy Machine & Reclaim"
                                )}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Close this Candy Machine?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently delete the on-chain Candy Machine and Candy Guard,
                                    returning the rent SOL to your wallet. No further mints will be possible.
                                    This action is irreversible.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleClose}>
                                    Yes, close & reclaim
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </CardContent>
        </Card>
    );
};

export default CloseAndReclaimCard;
