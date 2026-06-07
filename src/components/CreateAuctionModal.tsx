/**
 * CreateAuctionModal
 *
 * English-style auction creation for on-chain NFTs (database-tracked).
 * Seller sets reserve, min bid increment, and end time. Bids are placed off
 * the asset itself; settlement happens once the auction ends.
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Gavel, CalendarIcon, Loader2, Info, AlertCircle, Globe } from "lucide-react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWallet } from "@/providers/WalletProvider";
import type { OnchainNFTLite } from "./ListOnchainNFTModal";

interface Props {
  nft: OnchainNFTLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateAuctionModal({ nft, open, onOpenChange, onSuccess }: Props) {
  const { address, chainType } = useWallet();
  const currency = chainType === "monad" ? "MON" : "SOL";

  const [reserve, setReserve] = useState("");
  const [minIncrement, setMinIncrement] = useState("0.05");
  const [endsAt, setEndsAt] = useState<Date | undefined>(addDays(new Date(), 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReserve(""); setMinIncrement("0.05");
    setEndsAt(addDays(new Date(), 3));
    setBusy(false); setError(null);
  };

  const handleCreate = async () => {
    if (!nft || !address) return;
    const reserveNum = parseFloat(reserve);
    const incNum = parseFloat(minIncrement);
    if (isNaN(reserveNum) || reserveNum < 0) { setError("Reserve must be ≥ 0"); return; }
    if (isNaN(incNum) || incNum <= 0) { setError("Min increment must be > 0"); return; }
    if (!endsAt || endsAt <= new Date()) { setError("End time must be in the future"); return; }

    setBusy(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in");

      const { error: insErr } = await supabase
        .from("onchain_nft_auctions")
        .insert({
          seller_id: user.id,
          seller_address: address,
          asset_address: nft.assetAddress,
          chain: chainType === "monad" ? "monad" : "solana",
          name: nft.name,
          image_url: nft.imageUrl,
          collection_name: nft.collectionName,
          collection_address: nft.collectionAddress,
          reserve_price: reserveNum,
          min_bid_increment: incNum,
          currency,
          ends_at: endsAt.toISOString(),
          status: "active",
        });
      if (insErr) {
        if (insErr.code === "23505") throw new Error("This NFT already has an active auction.");
        throw insErr;
      }
      toast.success("Auction started");
      onSuccess?.();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create auction");
    } finally {
      setBusy(false);
    }
  };

  if (!nft) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" /> Start English Auction
          </DialogTitle>
          <DialogDescription>
            Bidders raise the price until your end time. The highest bid at or
            above your reserve wins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-400 border-blue-500/30">
              <Globe className="w-3 h-3" /> On-chain · {currency}
            </Badge>
          </div>

          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            {nft.imageUrl ? (
              <img src={nft.imageUrl} alt={nft.name ?? "NFT"}
                   className="w-16 h-16 rounded-lg object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                <Gavel className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium truncate">{nft.name ?? "Unnamed NFT"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {nft.collectionName ?? "Unknown collection"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="reserve">Reserve ({currency})</Label>
              <Input id="reserve" type="number" step="0.001" min="0" placeholder="0.00"
                value={reserve} onChange={(e) => setReserve(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inc">Min increment</Label>
              <Input id="inc" type="number" step="0.001" min="0.001"
                value={minIncrement} onChange={(e) => setMinIncrement(e.target.value)} disabled={busy} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ends at</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" disabled={busy}
                  className={cn("w-full justify-start text-left font-normal",
                    !endsAt && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endsAt ? format(endsAt, "PPP p") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endsAt} onSelect={setEndsAt}
                  disabled={(d) => d < new Date()} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              A 2.5% marketplace fee applies on settlement. You stay in custody
              of the NFT until the auction settles with the winning bidder.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-5 w-5" /><span className="text-sm">{error}</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1"
              onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button className="flex-1" onClick={handleCreate}
              disabled={busy || !reserve}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
                    : <><Gavel className="mr-2 h-4 w-4" /> Start auction</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreateAuctionModal;
