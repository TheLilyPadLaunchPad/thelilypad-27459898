/**
 * ListOnchainNFTModal
 *
 * Lets a holder list an on-chain (DAS-discovered) NFT on The Lily Pad marketplace
 * via a database-tracked listing — no escrow program required. Settlement happens
 * off-chain when a buyer accepts; the seller keeps custody until then.
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
import { Tag, CalendarIcon, Loader2, Info, AlertCircle, Globe } from "lucide-react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWallet } from "@/providers/WalletProvider";

export interface OnchainNFTLite {
  assetAddress: string;
  name: string | null;
  imageUrl: string | null;
  collectionName: string | null;
  collectionAddress: string | null;
}

interface Props {
  nft: OnchainNFTLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ListOnchainNFTModal({ nft, open, onOpenChange, onSuccess }: Props) {
  const { address, chainType } = useWallet();
  const currency = chainType === "monad" ? "MON" : "SOL";
  const step = chainType === "monad" ? "0.001" : "0.001";

  const [price, setPrice] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(addDays(new Date(), 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPrice(""); setExpiresAt(addDays(new Date(), 7));
    setBusy(false); setError(null);
  };

  const handleList = async () => {
    if (!nft || !address) return;
    if (!price || parseFloat(price) <= 0) { setError("Enter a valid price"); return; }
    setBusy(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in");

      const { error: insErr } = await supabase
        .from("onchain_nft_listings")
        .insert({
          seller_id: user.id,
          seller_address: address,
          asset_address: nft.assetAddress,
          chain: chainType === "monad" ? "monad" : "solana",
          name: nft.name,
          image_url: nft.imageUrl,
          collection_name: nft.collectionName,
          collection_address: nft.collectionAddress,
          price: parseFloat(price),
          currency,
          expires_at: expiresAt?.toISOString() ?? null,
          status: "active",
        });
      if (insErr) {
        if (insErr.code === "23505") {
          throw new Error("This NFT already has an active listing.");
        }
        throw insErr;
      }
      toast.success(`Listed for ${price} ${currency}`);
      onSuccess?.();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      setError(e?.message ?? "Failed to list");
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
            <Tag className="h-5 w-5" /> List On-Chain NFT
          </DialogTitle>
          <DialogDescription>
            List your wallet NFT on The Lily Pad. You keep the asset until a buyer
            purchases — no upfront transfer required.
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
                <Tag className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium truncate">{nft.name ?? "Unnamed NFT"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {nft.collectionName ?? "Unknown collection"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price ({currency})</Label>
            <div className="relative">
              <Input id="price" type="number" step={step} min="0" placeholder="0.00"
                value={price} onChange={(e) => setPrice(e.target.value)}
                disabled={busy} className="pr-16" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {currency}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Expiration (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" disabled={busy}
                  className={cn("w-full justify-start text-left font-normal",
                    !expiresAt && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expiresAt ? format(expiresAt, "PPP") : "No expiration"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={expiresAt} onSelect={setExpiresAt}
                  disabled={(d) => d < new Date()} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              A 2.5% marketplace fee will be deducted from your sale. You stay in
              custody of the NFT until a buyer completes purchase.
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
            <Button className="flex-1" onClick={handleList}
              disabled={busy || !price || parseFloat(price) <= 0}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Listing…</>
                    : <><Tag className="mr-2 h-4 w-4" /> List for {price || "0"} {currency}</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ListOnchainNFTModal;
