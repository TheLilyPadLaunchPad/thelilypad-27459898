import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Gavel, Loader2, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/providers/WalletProvider";
import { toast } from "sonner";
import type { AuctionRow } from "./marketplace/AuctionsGrid";

interface Props {
  auction: AuctionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BidAuctionModal({ auction, open, onOpenChange, onSuccess }: Props) {
  const { address } = useWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minNext = auction
    ? (auction.highest_bid
      ? Number(auction.highest_bid) + Number(auction.min_bid_increment)
      : Number(auction.reserve_price))
    : 0;

  useEffect(() => {
    if (auction) setAmount(minNext.toString());
  }, [auction?.id]);

  if (!auction) return null;

  const isSeller = address && address.toLowerCase() === auction.seller_address.toLowerCase();
  const ended = new Date(auction.ends_at).getTime() <= Date.now();

  const handleBid = async () => {
    setError(null);
    if (!address) { setError("Connect your wallet to bid"); return; }
    if (isSeller) { setError("You cannot bid on your own auction"); return; }
    if (ended) { setError("This auction has ended"); return; }
    const n = parseFloat(amount);
    if (isNaN(n) || n < minNext) {
      setError(`Bid must be at least ${minNext} ${auction.currency}`);
      return;
    }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in with your wallet first");

      const { error: insErr } = await supabase
        .from("onchain_nft_auction_bids")
        .insert({
          auction_id: auction.id,
          bidder_id: user.id,
          bidder_address: address,
          amount: n,
        });
      if (insErr) throw insErr;
      // Highest bid is set by the apply_auction_bid trigger.


      toast.success("Bid placed");
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to place bid");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" /> Place a bid
          </DialogTitle>
          <DialogDescription>
            Outbid the current top bid. Winning bidder settles with the seller when the auction ends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
            {auction.image_url && (
              <img src={auction.image_url} alt={auction.name ?? ""}
                className="w-16 h-16 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-medium truncate">{auction.name ?? "Unnamed NFT"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {auction.collection_name ?? "Unknown collection"}
              </p>
              <Badge variant="outline" className="mt-1 gap-1">
                <Clock className="w-3 h-3" /> Ends {new Date(auction.ends_at).toLocaleString()}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 rounded bg-muted/30">
              <p className="text-muted-foreground text-xs">Top bid</p>
              <p className="font-semibold">
                {auction.highest_bid ?? "—"} {auction.currency}
              </p>
            </div>
            <div className="p-2 rounded bg-muted/30">
              <p className="text-muted-foreground text-xs">Min next bid</p>
              <p className="font-semibold">{minNext} {auction.currency}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bid">Your bid ({auction.currency})</Label>
            <Input id="bid" type="number" step="0.001" min={minNext}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              disabled={busy || ended || !!isSeller} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-5 w-5" /><span className="text-sm">{error}</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1"
              onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button className="flex-1" onClick={handleBid}
              disabled={busy || ended || !!isSeller || !address}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bidding…</>
                    : <><Gavel className="mr-2 h-4 w-4" /> Place bid</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BidAuctionModal;
