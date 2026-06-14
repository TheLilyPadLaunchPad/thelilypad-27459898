import React, { useState } from "react";
import { useWallet } from "@/providers/WalletProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Heart, Loader2, Wallet, Coins, CheckCircle2, QrCode } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SolanaPayQR } from "@/components/payments/SolanaPayQR";
import { motion, AnimatePresence } from "framer-motion";
import { getErrorMessage } from "@/lib/errorUtils";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSolanaRpcUrl } from "@/config/solana";
import { createProtocolMemoInstruction } from "@/lib/solanaProtocol";

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamerAddress: string;
  streamerName: string;
  streamerId: string;
  streamId?: string;
}

const presetAmounts = [0.1, 0.5, 1, 5, 10];

type TipState = "idle" | "confirming" | "pending" | "success" | "error";

export const TipModal: React.FC<TipModalProps> = ({
  isOpen,
  onClose,
  streamerAddress,
  streamerName,
  streamerId,
  streamId,
}) => {
  const { isConnected, address, balance, connect, network, getSolanaProvider } = useWallet();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [tipState, setTipState] = useState<TipState>("idle");
  const [sentAmount, setSentAmount] = useState("");

  const handlePresetClick = (preset: number) => {
    setAmount(preset.toString());
  };

  const resetState = () => {
    setTipState("idle");
    setAmount("");
    setMessage("");
    setSentAmount("");
  };

  const handleClose = () => {
    if (tipState !== "pending") {
      resetState();
      onClose();
    }
  };

  const sendSolTransaction = async (toAddress: string, solAmount: number): Promise<string | null> => {
    const provider = getSolanaProvider();
    if (!provider || !provider.publicKey) {
      throw new Error("Solana wallet not connected");
    }

    const connection = new Connection(getSolanaRpcUrl(network), 'confirmed');

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
      })
    );

    // Add protocol memo for on-chain identification
    transaction.add(createProtocolMemoInstruction('tip:creator'));

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = provider.publicKey;

    const signed = await provider.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    return signature;
  };

  const handleSendTip = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid tip amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected || !address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to send a tip",
        variant: "destructive",
      });
      return;
    }

    if (balance && parseFloat(amount) > parseFloat(balance)) {
      toast({
        title: "Insufficient balance",
        description: "You don't have enough SOL to send this tip",
        variant: "destructive",
      });
      return;
    }

    // Optimistic: Show confirming state immediately
    setTipState("confirming");
    setSentAmount(amount);

    try {
      // Move to pending once wallet interaction starts
      setTipState("pending");

      const txHash = await sendSolTransaction(streamerAddress, parseFloat(amount));

      if (txHash) {
        // Show success immediately (optimistic)
        setTipState("success");

        // Record in database in background
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          supabase.from("earnings").insert({
            user_id: streamerId,
            stream_id: streamId || null,
            amount: parseFloat(amount),
            currency: "SOL",
            type: "donation",
            from_user_id: session.user.id,
            from_username: address.slice(0, 6) + "..." + address.slice(-4),
            message: message || null,
          }).then((result) => {
            if (result.error) {
              console.error("Failed to record tip:", result.error);
            }
          });
        }

        const explorerUrl = network === 'mainnet'
          ? `https://explorer.solana.com/tx/${txHash}`
          : `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;

        toast({
          title: "Tip sent! 🎉",
          description: (
            <div className="space-y-1">
              <p>Successfully sent {amount} SOL to {streamerName}</p>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                View transaction →
              </a>
            </div>
          ),
        });

        // Auto-close after success animation
        setTimeout(() => {
          resetState();
          onClose();
        }, 2000);
      }
    } catch (error: unknown) {
      console.error("Error sending tip:", error);
      setTipState("error");
      toast({
        title: "Transaction failed",
        description: getErrorMessage(error) || "Failed to send tip. Please try again.",
        variant: "destructive",
      });

      // Reset to idle after error
      setTimeout(() => {
        setTipState("idle");
      }, 1500);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {tipState === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="py-12 text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.1 }}
              >
                <CheckCircle2 className="w-16 h-16 mx-auto text-green-500" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h3 className="text-xl font-semibold">Tip Sent!</h3>
                <p className="text-muted-foreground mt-1">
                  {sentAmount} SOL sent to {streamerName}
                </p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  Send a Tip
                </DialogTitle>
                <DialogDescription>
                  Support {streamerName} with a crypto donation
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="wallet" className="pt-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="wallet">
                    <Wallet className="w-3.5 h-3.5 mr-1.5" /> In-wallet
                  </TabsTrigger>
                  <TabsTrigger value="qr">
                    <QrCode className="w-3.5 h-3.5 mr-1.5" /> Scan QR
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="wallet" className="space-y-4 pt-3">
                  {!isConnected ? (
                    <div className="text-center py-6 space-y-4">
                      <Wallet className="w-12 h-12 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground">Connect your wallet to send a tip</p>
                      <Button onClick={() => connect()} className="w-full">
                        Connect Wallet
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Balance display */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="text-sm text-muted-foreground">Your Balance</span>
                        <span className="font-medium">
                          {balance ? parseFloat(balance).toFixed(4) : "0"} SOL
                        </span>
                      </div>

                      {/* Preset amounts */}
                      <div className="space-y-2">
                        <Label>Quick Amounts</Label>
                        <div className="grid grid-cols-5 gap-2">
                          {presetAmounts.map((preset) => (
                            <Button
                              key={preset}
                              variant={amount === preset.toString() ? "default" : "outline"}
                              size="sm"
                              onClick={() => handlePresetClick(preset)}
                              className="text-xs"
                              disabled={tipState !== "idle"}
                            >
                              {preset}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="amount">Amount (SOL)</Label>
                        <div className="relative">
                          <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="amount"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="pl-10"
                            disabled={tipState !== "idle"}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="message">Message (optional)</Label>
                        <Textarea
                          id="message"
                          placeholder="Say something nice..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          maxLength={200}
                          rows={3}
                          disabled={tipState !== "idle"}
                        />
                        <p className="text-xs text-muted-foreground text-right">
                          {message.length}/200
                        </p>
                      </div>

                      <Button
                        onClick={handleSendTip}
                        disabled={tipState !== "idle" || !amount || parseFloat(amount) <= 0}
                        className="w-full relative overflow-hidden"
                      >
                        <AnimatePresence mode="wait">
                          {tipState === "idle" && (
                            <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center">
                              <Heart className="w-4 h-4 mr-2" />
                              Send {amount || "0"} SOL
                            </motion.span>
                          )}
                          {tipState === "confirming" && (
                            <motion.span key="confirming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center">
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Confirm in wallet...
                            </motion.span>
                          )}
                          {tipState === "pending" && (
                            <motion.span key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center">
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sending...
                            </motion.span>
                          )}
                          {tipState === "error" && (
                            <motion.span key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-destructive-foreground">
                              Failed - Try again
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Button>

                      <p className="text-xs text-center text-muted-foreground">
                        Powered by Solana. Transaction fees apply.
                      </p>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="qr" className="space-y-4 pt-3">
                  <div className="space-y-2">
                    <Label>Quick Amounts</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {presetAmounts.map((preset) => (
                        <Button
                          key={preset}
                          variant={amount === preset.toString() ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePresetClick(preset)}
                          className="text-xs"
                        >
                          {preset}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qr-amount">Amount (SOL)</Label>
                    <div className="relative">
                      <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="qr-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {amount && parseFloat(amount) > 0 ? (
                    <SolanaPayQR
                      recipient={streamerAddress}
                      amountSol={parseFloat(amount)}
                      action="tip:creator"
                      label="The Lily Pad"
                      message={`Tip ${streamerName}`}
                      context={{ streamer_id: streamerId, ...(streamId ? { stream_id: streamId } : {}) }}
                      onConfirmed={() => {
                        setSentAmount(amount);
                        setTipState("success");
                        setTimeout(() => {
                          resetState();
                          onClose();
                        }, 2000);
                      }}
                    />
                  ) : (
                    <p className="text-xs text-center text-muted-foreground py-8">
                      Enter an amount to generate a QR code
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};
