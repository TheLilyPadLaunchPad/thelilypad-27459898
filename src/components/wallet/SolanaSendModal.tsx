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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSolanaTransactions } from "@/hooks/useSolanaTransactions";
import { useSPLTokens, SPLToken } from "@/hooks/useSPLTokens";
import { useWallet } from "@/providers/WalletProvider";
import { toast } from "sonner";
import { Send, AlertCircle, ExternalLink, Coins } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SolanaSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedToken?: SPLToken | null;
}

export const SolanaSendModal: React.FC<SolanaSendModalProps> = ({
  open,
  onOpenChange,
  preselectedToken,
}) => {
  const { address, balance, network } = useWallet();
  const { sendSOL, sendSPLToken, isValidSolanaAddress, isSupported } = useSolanaTransactions();
  const { tokens } = useSPLTokens();
  
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<"SOL" | string>("SOL");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && preselectedToken) {
      setSelectedToken(preselectedToken.mint);
    } else if (open) {
      setSelectedToken("SOL");
    }
  }, [open, preselectedToken]);

  useEffect(() => {
    if (!open) {
      setRecipient("");
      setAmount("");
      setError(null);
    }
  }, [open]);

  const getSelectedTokenInfo = () => {
    if (selectedToken === "SOL") {
      return { symbol: "SOL", balance: balance || "0", decimals: 9 };
    }
    const token = tokens.find(t => t.mint === selectedToken);
    return token ? { symbol: token.symbol || "Token", balance: token.uiAmount, decimals: token.decimals } : null;
  };

  const tokenInfo = getSelectedTokenInfo();

  const validateAndSend = () => {
    setError(null);
    if (!recipient.trim() || !isValidSolanaAddress(recipient)) {
      setError("Invalid Solana address");
      return;
    }
    if (recipient === address) {
      setError("Cannot send to yourself");
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (tokenInfo && amountNum > parseFloat(tokenInfo.balance)) {
      setError("Insufficient balance");
      return;
    }

    if (selectedToken === "SOL") {
      sendSOL({ to: recipient, amount: amountNum });
    } else {
      const token = tokens.find(t => t.mint === selectedToken);
      if (token) {
        sendSPLToken({ to: recipient, amount: amountNum, mint: selectedToken, decimals: token.decimals });
      }
    }
    
    toast.info("Opening wallet...", { description: "Complete the transfer in your wallet" });
    onOpenChange(false);
  };

  if (!isSupported) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Tokens</DialogTitle></DialogHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Connect a Solana wallet to send tokens.</AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5" />Send Tokens</DialogTitle>
          <DialogDescription>Send SOL or SPL tokens</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Token</Label>
            <Select value={selectedToken} onValueChange={setSelectedToken}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SOL"><span className="flex items-center gap-2">◎ SOL ({parseFloat(balance || "0").toFixed(4)})</span></SelectItem>
                {tokens.map((token) => (
                  <SelectItem key={token.mint} value={token.mint}>
                    <span className="flex items-center gap-2"><Coins className="w-4 h-4" />{token.symbol || token.mint.slice(0,6)} ({token.uiAmount})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Recipient Address</Label>
            <Input placeholder="Solana address..." value={recipient} onChange={(e) => setRecipient(e.target.value)} className="font-mono text-sm" />
          </div>

          <div className="space-y-2">
            <Label>Amount</Label>
            <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="any" />
          </div>

          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          
          <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>This will open your wallet to complete the transfer.</AlertDescription></Alert>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={validateAndSend}><ExternalLink className="w-4 h-4 mr-2" />Send via Wallet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
