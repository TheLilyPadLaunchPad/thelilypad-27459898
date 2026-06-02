import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Coins, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useQueryClient } from "@tanstack/react-query";

interface BuyTokensModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BuyTokensModal: React.FC<BuyTokensModalProps> = ({ open, onOpenChange }) => {
  const { profile } = useUserProfile();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("100");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBuyTokens = async () => {
    if (!profile) return;
    
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);
    try {
      // In Mock Mode, we simulate purchasing tokens for USDC 1:1
      // We directly update the user's balance and record the transaction

      // 1. Record the transaction
      const { error: txError } = await supabase.from("token_transactions").insert({
        user_id: profile.id,
        amount: numAmount,
        transaction_type: "deposit",
        reference_id: `mock_deposit_${Date.now()}`,
      });

      if (txError) throw txError;

      // 2. Update balance
      const currentBalance = Number(profile.native_token_balance || 0);
      const newBalance = currentBalance + numAmount;
      
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({ native_token_balance: newBalance })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      // Refresh profile data
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      toast.success(`Successfully added ${numAmount} LPT to your balance!`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error buying tokens:", err);
      toast.error(err.message || "Failed to buy tokens");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Get Native Tokens (LPT)
          </DialogTitle>
          <DialogDescription>
            Purchase LilyPad Tokens to support creators and buy art.
            <br />
            <strong>Rate: 1 USDC = 1 LPT</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">
              Amount
            </Label>
            <div className="col-span-3 relative">
              <Input
                id="amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8"
              />
              <Coins className="w-4 h-4 absolute left-2.5 top-3 text-muted-foreground" />
            </div>
          </div>
          
          <div className="rounded-lg bg-muted p-3 text-sm flex justify-between items-center">
            <span className="text-muted-foreground">Total Cost:</span>
            <span className="font-bold flex items-center gap-1">
              <Wallet className="w-4 h-4" />
              {amount || 0} USDC
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleBuyTokens} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            Pay {amount || 0} USDC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
