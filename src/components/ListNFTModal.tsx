/**
 * ListNFTModal — Chain-aware NFT listing modal
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag, CalendarIcon, Loader2, CheckCircle, AlertCircle, Info } from "lucide-react";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useWallet } from "@/providers/WalletProvider";
// ── Types ─────────────────────────────────────────────────────────────────────
// ... existing types ...

interface MintedNFT {
  id: string;
  token_id: number;
  nft_token_id?: string | null;
  name: string | null;
  image_url: string | null;
  collection_id: string | null;
  owner_address: string;
  owner_id: string;
  collection?: {
    /** Solana: CandyMachine / Core Asset address. Monad: ERC-721 contract address. */
    contract_address: string | null;
    /** The chain the collection was deployed on */
    chain?: string | null;
  };
}

interface ListNFTModalProps {
  nft: MintedNFT | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ── Currency helpers ──────────────────────────────────────────────────────────

type ChainCurrency = { symbol: string; decimals: number; step: string };

function getCurrencyForChain(chain: string | null | undefined): ChainCurrency {
  switch (chain) {
    case 'monad':
      return { symbol: 'MON', decimals: 18, step: '0.001' };
    case 'solana':
    default:
      return { symbol: 'SOL', decimals: 9, step: '0.001' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ListNFTModal({ nft, open, onOpenChange, onSuccess }: ListNFTModalProps) {
  const [price, setPrice] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(addDays(new Date(), 7));
  const [isListing, setIsListing] = useState(false);
  const [listingStatus, setListingStatus] = useState<'idle' | 'approving' | 'listing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Authoritative chain source: wallet chainType (not URL param or collection.chain)
  const { chainType } = useWallet();
  // Derive the chain: wallet chainType could be wrong if exploring other chain's NFTs.
  // Use collection chain, then fallback.
  const derivedChain = nft?.collection?.chain;
  const resolvedChain = derivedChain || chainType || 'solana';
  const currency = getCurrencyForChain(resolvedChain);

  // ── Validation ──────────────────────────────────────────────────────────────

  const getNFTIdentifier = (): { type: 'solana' | 'unknown'; value: string | null } => {
    if (!nft) return { type: 'unknown', value: null };

    // For Solana/Monad: need contract_address for on-chain operations
    const addr = nft.collection?.contract_address;
    return addr
      ? { type: 'solana', value: addr }
      : { type: 'unknown', value: null };
  };

  // ── Submit handler ──────────────────────────────────────────────────────────

  const handleList = async () => {
    if (!nft || !price || parseFloat(price) <= 0) {
      setError("Please enter a valid price");
      return;
    }

    const { type: idType, value: nftIdentifier } = getNFTIdentifier();

    // For Solana/Monad we strictly need a contract_address for approval + escrow.
    if (idType === 'unknown' || (idType === 'solana' && !nftIdentifier)) {
      setError("NFT contract address not found. This NFT may not be deployed on-chain yet.");
      return;
    }

    setIsListing(true);
    setListingStatus('listing');
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be logged in to list an NFT");
      }

      // For Solana/Monad: would trigger wallet approval + escrow
      if (nftIdentifier) {
        setListingStatus('approving');
        // Approval is a no-op for Solana Core (no pre-approval needed)
        // For future EVM/Monad: would call setApprovalForAll here
        console.log(`[ListNFT] ${resolvedChain} approval check for`, nftIdentifier);
        setListingStatus('listing');
      }

      let onChainResult = null;

      // Insert listing record — currency derived from chain, not hardcoded
      const { error: insertError } = await supabase
        .from('nft_listings')
        .insert([{
          nft_id: nft.id,
          seller_id: user.id,
          seller_address: nft.owner_address,
          price: parseFloat(price),
          currency: currency.symbol,
          expires_at: expiresAt?.toISOString() || null,
          tx_hash: onChainResult?.hash || null,
          marketplace_id: onChainResult?.offerIndex || null,
          status: 'active',
        }]);

      if (insertError) throw insertError;

      setListingStatus('success');
      toast({
        title: "NFT Listed!",
        description: `Your NFT is now listed for ${price} ${currency.symbol}`,
      });

      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
        resetForm();
      }, 1500);

    } catch (err: any) {
      console.error('[ListNFT] Listing error:', err);
      setError(err.message || "Failed to list NFT");
      setListingStatus('error');
    } finally {
      setIsListing(false);
    }
  };

  const resetForm = () => {
    setPrice("");
    setExpiresAt(addDays(new Date(), 7));
    setListingStatus('idle');
    setError(null);
  };

  if (!nft) return null;

  // ── UI ──────────────────────────────────────────────────────────────────────

  const CurrencyIcon = () => {
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            List NFT for Sale
          </DialogTitle>
          <DialogDescription>
            Set a price and optional expiration for your {currency.symbol} listing
          </DialogDescription>
        </DialogHeader>

        {!SECONDARY_MARKETPLACE_ENABLED ? (
          <ComingSoon
            inline
            title="Marketplace Coming Soon"
            description="Secondary-market listings are launching once the on-chain escrow program is deployed. Your NFTs remain safe in your wallet."
          />
        ) : (

        <div className="space-y-4">
          {/* Chain indicator */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs gap-1",
                resolvedChain === 'monad'
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    : "bg-green-500/10 text-green-400 border-green-500/30"
              )}
            >
              {resolvedChain === 'monad' ? 'Monad' : 'Solana'} listing
            </Badge>
          </div>

          {/* NFT Preview */}
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            {nft.image_url ? (
              <img
                src={nft.image_url}
                alt={nft.name || `Token #${nft.token_id}`}
                className="w-16 h-16 rounded-lg object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                <Tag className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-medium">{nft.name || `Token #${nft.token_id}`}</p>
              <Badge variant="outline" className="mt-1">
                #{nft.token_id}
              </Badge>
            </div>
          </div>

          {/* Price Input — chain-aware label and suffix */}
          <div className="space-y-2">
            <Label htmlFor="price">
              Price ({currency.symbol})
            </Label>
            <div className="relative">
              <Input
                id="price"
                type="number"
                step={currency.step}
                min="0"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={isListing}
                className="pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm flex items-center gap-1">
                <CurrencyIcon />
                {currency.symbol}
              </span>
            </div>
          </div>

          {/* Expiration Date */}
          <div className="space-y-2">
            <Label>Expiration (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !expiresAt && "text-muted-foreground"
                  )}
                  disabled={isListing}
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
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Fee Disclaimer */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              A 2.5% marketplace fee will be deducted from your sale.
            </p>
          </div>

          {listingStatus === 'approving' && (
            <div className="flex items-center gap-2 text-blue-400 bg-blue-500/10 p-3 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Approving marketplace access…</span>
            </div>
          )}

          {listingStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg">
              <CheckCircle className="h-5 w-5" />
              <span>NFT listed successfully for {price} {currency.symbol}!</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isListing}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleList}
              disabled={isListing || !price || parseFloat(price) <= 0}
            >
              {isListing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {listingStatus === 'approving' ? 'Approving…' : 'Listing…'}
                </>
              ) : (
                <>
                  <Tag className="mr-2 h-4 w-4" />
                  List for {price || '0'} {currency.symbol}
                </>
              )}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
