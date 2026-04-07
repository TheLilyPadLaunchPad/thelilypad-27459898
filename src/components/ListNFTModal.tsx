/**
 * ListNFTModal — Chain-aware NFT listing modal
 *
 * Bug report: XRPL 1/1 listings showed "NFT Contract not found" and price label
 * said "SOL" instead of "XRP".
 *
 * Root causes:
 *  1. `nftAddress` guard was checking `collection.contract_address` — XRPL NFTs
 *     store their NFTokenID in `nft_token_id`, not `contract_address` (which is
 *     the issuer/minter address, not required for listing).
 *  2. `currency` was hardcoded to 'SOL' in the Supabase insert.
 *  3. Price label, input suffix, and button text were all hardcoded to "SOL".
 *  4. `priceLamports` calculation (price × 1e9) is Solana-specific — XRP uses drops
 *     (price × 1_000_000) but for DB listing we just store the float amount.
 *  5. `approval` / `window.ethereum` calls are Solana / EVM patterns that should
 *     be skipped entirely for XRPL.
 *  6. `explorerUrl` in MyNFTs always pointed to solana.com even for XRPL NFTs.
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
  /** XRPL-specific: the 64-char hex NFTokenID stored here after the audit fix */
  nft_token_id?: string | null;
  name: string | null;
  image_url: string | null;
  collection_id: string | null;
  owner_address: string;
  owner_id: string;
  collection?: {
    /** Solana: CandyMachine / Core Asset address. XRPL: issuer account address. */
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
    case 'xrpl':
      return { symbol: 'XRP', decimals: 6, step: '0.0001' };
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
  const xrplMarketplace = useXRPLMarketplace();

  // Derive the chain: wallet chainType could be wrong if exploring other chain's NFTs.
  // Use collection chain, then owner address signature, then fallback.
  const isXRPLOwner = nft?.owner_address?.startsWith('r') || false;
  const derivedChain = nft?.collection?.chain || (isXRPLOwner ? 'xrpl' : null);
  const resolvedChain = derivedChain || chainType || 'solana';
  const currency = getCurrencyForChain(resolvedChain);
  const isXRPL = resolvedChain === 'xrpl';

  // ── Validation ──────────────────────────────────────────────────────────────

  const getNFTIdentifier = (): { type: 'xrpl' | 'solana' | 'unknown'; value: string | null } => {
    if (!nft) return { type: 'unknown', value: null };

    if (isXRPL) {
      // For XRPL: use nft_token_id (64-char hex NFTokenID) if available,
      // fallback to attributes.xrpl_nft_id, then contract_address.
      const nftAny = nft as any;
      const parsedAttrs = typeof nftAny.attributes === 'string' ? JSON.parse(nftAny.attributes) : (nftAny.attributes as any);
      const attrTokenId = parsedAttrs?.xrpl_nft_id;
      const xrplId = nftAny.nft_token_id || attrTokenId || nft.collection?.contract_address || nft.id;
      return { type: 'xrpl', value: xrplId };
    }

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
    // For XRPL we use DB-only listing (no contract approval needed — XLS-20
    // transfers happen at settlement time via NFTokenCreateOffer).
    if (idType === 'unknown' || (idType === 'solana' && !nftIdentifier)) {
      if (isXRPL) {
        // XRPL doesn't need a contract_address to create a DB listing
        // We just need the XRPL NFT's token ID, which falls back to nft.id
      } else {
        setError("NFT contract address not found. This NFT may not be deployed on-chain yet.");
        return;
      }
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
      // For XRPL: skip entirely — NFTokenCreateOffer is done at purchase time
      if (!isXRPL && nftIdentifier) {
        setListingStatus('approving');
        // Approval is a no-op for Solana Core (no pre-approval needed)
        // For future EVM/Monad: would call setApprovalForAll here
        console.log(`[ListNFT] ${resolvedChain} approval check for`, nftIdentifier);
        setListingStatus('listing');
      }

      let onChainResult = null;
      if (isXRPL) {
        const nfTokenId = (nft as any).nft_token_id || nft.collection?.contract_address || (nft as any).attributes?.xrpl_nft_id;
        if (!nfTokenId) {
          throw new Error("Could not find NFTokenID for this XRPL NFT");
        }
        
        onChainResult = await xrplMarketplace.listNFT(
          nft.id,
          nfTokenId,
          parseFloat(price),
          expiresAt
        );
        
        if (!onChainResult.success) {
          throw new Error(onChainResult.error || "Failed to create on-chain offer");
        }
      }

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
          marketplace_id: onChainResult?.offerIndex || null, // Store the NFTokenOfferIndex
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
    if (isXRPL) return <XRPIcon className="w-3.5 h-3.5 text-muted-foreground" />;
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

        <div className="space-y-4">
          {/* Chain indicator */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs gap-1",
                isXRPL
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                  : resolvedChain === 'monad'
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    : "bg-green-500/10 text-green-400 border-green-500/30"
              )}
            >
              {isXRPL && <XRPIcon className="w-3 h-3" />}
              {resolvedChain === 'xrpl' ? 'XRP Ledger' : resolvedChain === 'monad' ? 'Monad' : 'Solana'} listing
            </Badge>
            {isXRPL && (
              <span className="text-[10px] text-muted-foreground">
                DB listing · settled on purchase via NFTokenCreateOffer
              </span>
            )}
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
              {isXRPL && ((nft as any).nft_token_id || ((nft as any).attributes?.xrpl_nft_id)) && (
                <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate max-w-[180px]">
                  {((nft as any).nft_token_id || ((nft as any).attributes?.xrpl_nft_id)).slice(0, 16)}…
                </p>
              )}
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
              {isXRPL && " XRPL listings are off-chain records. On-chain transfer happens via NFTokenCreateOffer at purchase."}
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
                  {/* FIX: was hardcoded "SOL" */}
                  List for {price || '0'} {currency.symbol}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
