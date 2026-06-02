import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Coins, ArrowRight, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BuybackAllocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  creatorId: string;
}

export const BuybackAllocationModal: React.FC<BuybackAllocationModalProps> = ({
  open,
  onOpenChange,
  collectionId,
  creatorId,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasAllocated, setHasAllocated] = useState(false);
  const [totalFunds, setTotalFunds] = useState(0);
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      // Calculate total funds earned from this collection
      const checkStatus = async () => {
        try {
          const { data: existing } = await supabase
            .from("buyback_program_collections")
            .select("id")
            .eq("collection_id", collectionId)
            .single();

          if (existing) {
            setHasAllocated(true);
            return;
          }

          // Sum token_transactions for this collection
          const { data: txs } = await supabase
            .from("token_transactions")
            .select("amount")
            .eq("user_id", creatorId)
            .eq("reference_id", collectionId)
            .eq("transaction_type", "sale");

          const total = txs?.reduce((acc, tx) => acc + Number(tx.amount), 0) || 0;
          setTotalFunds(total);
        } catch (error) {
          console.error("Error checking buyback status:", error);
        }
      };

      checkStatus();
    }
  }, [open, collectionId, creatorId]);

  const handleAllocate = async () => {
    if (selectedPercentage === null) return;

    setIsProcessing(true);
    try {
      const allocationAmount = Math.floor(totalFunds * (selectedPercentage / 100));

      // 1. Deduct from creator
      const { data: creatorData, error: profileErr } = await supabase
        .from("user_profiles")
        .select("native_token_balance")
        .eq("id", creatorId)
        .single();

      if (profileErr) throw profileErr;
      if (!creatorData) throw new Error("Creator profile not found");

      const currentBalance = Number(creatorData.native_token_balance || 0);
      if (currentBalance < allocationAmount) {
        throw new Error("Insufficient LPT balance for allocation");
      }

      await supabase
        .from("user_profiles")
        .update({ native_token_balance: currentBalance - allocationAmount })
        .eq("id", creatorId);

      // 2. Add transaction
      await supabase.from("token_transactions").insert({
        user_id: creatorId,
        amount: -allocationAmount,
        transaction_type: "buyback_allocation",
        reference_id: collectionId,
      });

      // 3. Add to buyback program
      await supabase.from("buyback_program_collections").insert({
        collection_id: collectionId,
        added_by: creatorId,
        is_active: true,
        notified_creator: true,
        reason: `Creator allocated ${selectedPercentage}% of mint funds`,
        locked_buyback_tokens: allocationAmount,
      });

      setHasAllocated(true);
      toast.success(`Successfully allocated ${allocationAmount} LPT to the Buyback Program!`);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Allocation error:", error);
      toast.error(error.message || "Failed to allocate funds");
    } finally {
      setIsProcessing(false);
    }
  };

  if (hasAllocated) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            Support Your Collectors
          </DialogTitle>
          <DialogDescription>
            Congratulations! Your collection has minted out. You earned a total of <strong>{totalFunds} LPT</strong>.
            <br /><br />
            Would you like to allocate a portion of these funds to the <strong>Buyback Program</strong>? This program uses your LPT to reward your loyal collectors and sustain your art economy.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4">
          {[25, 50, 75, 100].map((percent) => (
            <Button
              key={percent}
              variant={selectedPercentage === percent ? "default" : "outline"}
              className={`flex flex-col h-auto py-3 gap-1 ${
                selectedPercentage === percent ? "border-primary" : ""
              }`}
              onClick={() => setSelectedPercentage(percent)}
            >
              <span className="text-lg font-bold">{percent}%</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {Math.floor(totalFunds * (percent / 100))} LPT
              </span>
            </Button>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Skip for now
          </Button>
          <Button
            onClick={handleAllocate}
            disabled={selectedPercentage === null || isProcessing || totalFunds <= 0}
            className="gap-2"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            Allocate Funds <ArrowRight className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
