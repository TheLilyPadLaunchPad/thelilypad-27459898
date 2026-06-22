import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Tag, Clock, MessageSquare, Info, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";
import { motion, AnimatePresence } from "framer-motion";
import { SECONDARY_MARKETPLACE_ENABLED } from "@/config/featureFlags";
import { ComingSoon } from "@/components/ComingSoon";

interface MakeOfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nft: {
    id: string;
    name: string | null;
    image_url: string | null;
    owner_id: string;
    owner_address: string;
    token_id: number;
    chain?: string;
  };
  currency?: string;
  listingPrice?: number | null;
  onOfferMade?: () => void;
}

type OfferState = "idle" | "submitting" | "success" | "error";

export const MakeOfferModal: React.FC<MakeOfferModalProps> = ({
  open,
  onOpenChange,
  nft,
  currency,
  listingPrice,
  onOfferMade,
}) => {
  const { address, isConnected } = useWallet();
  const [offerPrice, setOfferPrice] = useState("");
  const [message, setMessage] = useState("");
  
  const chainId = nft.chain || 'solana';
  const currencySymbol = currency || (chainId === 'monad' ? 'MON' : 'SOL');
  
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(addDays(new Date(), 7));
  const [offerState, setOfferState] = useState<OfferState>("idle");
  const [submittedPrice, setSubmittedPrice] = useState("");

  const resetState = () => {
    setOfferState("idle");
    setOfferPrice("");
    setMessage("");
    setSubmittedPrice("");
    setExpiresAt(addDays(new Date(), 7));
  };

  const handleClose = () => {
    if (offerState !== "submitting") {
      resetState();
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      toast.error("Please connect your wallet");
      return;
    }

    const price = parseFloat(offerPrice);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid offer amount");
      return;
    }

    if (listingPrice && price >= listingPrice) {
      toast.error("Offer must be below the listing price", {
        description: `Current listing price is ${listingPrice} ${currencySymbol}`,
      });
      return;
    }

    // Optimistic: show submitting immediately
    setOfferState("submitting");
    setSubmittedPrice(offerPrice);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to make an offer");
        setOfferState("idle");
        return;
      }

      if (user.id === nft.owner_id) {
        toast.error("You cannot make an offer on your own NFT");
        setOfferState("idle");
        return;
      }

      const { error } = await supabase.from("nft_offers").insert({
        nft_id: nft.id,
        offerer_id: user.id,
        offerer_address: address,
        owner_id: nft.owner_id,
        owner_address: nft.owner_address,
        offer_price: price,
        currency: currencySymbol,
        chain: chainId,
        message: message.trim() || null,
        expires_at: expiresAt?.toISOString() || null,
      });

      if (error) throw error;

      // Show success state
      setOfferState("success");

      toast.success("Offer submitted!", {
        description: `Your offer of ${price} ${currencySymbol} has been sent`,
      });

      onOfferMade?.();

      // Auto-close after success
      setTimeout(() => {
        resetState();
        onOpenChange(false);
      }, 2000);
    } catch (error: any) {
      console.error("Error making offer:", error);
      setOfferState("error");
      toast.error("Failed to submit offer", {
        description: error.message,
      });

      // Reset after error
      setTimeout(() => {
        setOfferState("idle");
      }, 1500);
    }
  };

  if (!SECONDARY_MARKETPLACE_ENABLED) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="sm:max-w-[425px]">
          <ComingSoon
            inline
            title="Offers Coming Soon"
            description="Making offers requires the on-chain escrow program, which is launching shortly."
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <AnimatePresence mode="wait">
          {offerState === "success" ? (
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
                <h3 className="text-xl font-semibold">Offer Sent!</h3>
                <p className="text-muted-foreground mt-1">
                  {submittedPrice} {currencySymbol} offer for {nft.name || `Token #${nft.token_id}`}
                </p>
              </motion.div>
            </motion.div>
          ) : offerState === "error" ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="py-12 text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring" }}
              >
                <XCircle className="w-16 h-16 mx-auto text-destructive" />
              </motion.div>
              <div>
                <h3 className="text-xl font-semibold">Failed to Submit</h3>
                <p className="text-muted-foreground mt-1">Please try again</p>
              </div>
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
                  <Tag className="w-5 h-5 text-primary" />
                  Make an Offer
                </DialogTitle>
                <DialogDescription>
                  Submit an offer for {nft.name || `Token #${nft.token_id}`}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* NFT Preview */}
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  {nft.image_url ? (
                    <img
                      src={nft.image_url}
                      alt={nft.name || "NFT"}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <Tag className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{nft.name || `Token #${nft.token_id}`}</p>
                    {listingPrice && (
                      <p className="text-sm text-muted-foreground">
                        Listed for {listingPrice} {currencySymbol}
                      </p>
                    )}
                  </div>
                </div>

                {/* Offer Amount */}
                <div className="space-y-2">
                  <Label htmlFor="offerPrice">Your Offer</Label>
                  <div className="relative">
                    <Input
                      id="offerPrice"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.00"
                      value={offerPrice}
                      onChange={(e) => setOfferPrice(e.target.value)}
                      className="pr-16"
                      required
                      disabled={offerState === "submitting"}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {currencySymbol}
                    </span>
                  </div>
                  {listingPrice && (
                    <p className="text-xs text-muted-foreground">
                      Must be less than {listingPrice} {currencySymbol}
                    </p>
                  )}
                </div>

                {/* Expiration Date */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Offer Expires
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !expiresAt && "text-muted-foreground"
                        )}
                        disabled={offerState === "submitting"}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {expiresAt ? format(expiresAt, "PPP") : "No expiration"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={expiresAt}
                        onSelect={setExpiresAt}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <div className="flex gap-2">
                    {[1, 3, 7, 14].map((days) => (
                      <Button
                        key={days}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setExpiresAt(addDays(new Date(), days))}
                        className="flex-1 text-xs"
                        disabled={offerState === "submitting"}
                      >
                        {days}d
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Optional Message */}
                <div className="space-y-2">
                  <Label htmlFor="message" className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Message (optional)
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Add a message to the seller..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                    maxLength={500}
                    disabled={offerState === "submitting"}
                  />
                </div>

                {/* Fee Disclaimer */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    If accepted, gas fees apply to complete the transfer.{' '}
                    <Link to="/fees" className="text-primary hover:underline">
                      View pricing
                    </Link>
                  </p>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={offerState === "submitting"}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={offerState === "submitting" || !isConnected}
                    className="min-w-[120px]"
                  >
                    <AnimatePresence mode="wait">
                      {offerState === "submitting" ? (
                        <motion.span
                          key="submitting"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center"
                        >
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Submitting...
                        </motion.span>
                      ) : (
                        <motion.span
                          key="idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Submit Offer
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Button>
                </DialogFooter>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default MakeOfferModal;
