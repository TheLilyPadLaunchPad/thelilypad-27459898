import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, ImageIcon, Loader2, RefreshCw, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { NFT } from '@/hooks/useWalletNFTs';
import { CHAINS, getDbChainValues, type SupportedChain } from '@/config/chains';
import { supabase } from '@/integrations/supabase/client';
import { collectibleExplorer, collectibleKey, collectiblePack } from '@/lib/walletGallery';
import { activeCollectibleListing, collectibleListingUrl, collectibleMetadata, safeCollectibleUrl } from '@/lib/collectibleDetails';
import { toast } from 'sonner';

async function findListing(nft: NFT, chain: SupportedChain) {
  // Match exact asset identity. Collection addresses and NFT names are not Solana asset IDs.
  const columns = 'id,asset_id,collection:collections!inner(contract_address,chain)';
  let ids: string[] = [];
  if (chain === 'solana') {
    const result = await supabase.from('minted_nfts').select(columns).eq('asset_id', nft.contractAddress).in('collection.chain', getDbChainValues(chain));
    if (result.error) throw result.error;
    ids = (result.data || []).map(row => row.id);
  } else if (/^\d+$/.test(nft.tokenId) && Number.isSafeInteger(Number(nft.tokenId))) {
    const result = await supabase.from('minted_nfts').select(columns).eq('token_id', Number(nft.tokenId)).eq('collection.contract_address', nft.contractAddress).in('collection.chain', getDbChainValues(chain));
    if (result.error) throw result.error;
    ids = (result.data || []).map(row => row.id);
  }
  if (!ids.length) return null;
  const { data, error } = await supabase.from('nft_listings').select('id,price,currency,status,expires_at').in('nft_id', [...new Set(ids)]).eq('status', 'active').order('created_at', { ascending: false });
  if (error) throw error;
  return data?.find(listing => activeCollectibleListing(listing)) || null;
}

export function CollectibleDetailView({ nft, chain, onClose }: { nft: NFT; chain: SupportedChain; onClose: () => void }) {
  const [failedImage, setFailedImage] = useState(false);
  const artwork = safeCollectibleUrl(nft.image);
  const metadataUri = safeCollectibleUrl(nft.metadataUri);
  const explorer = collectibleExplorer(nft, chain);
  const listing = useQuery({ queryKey: ['collectible-listing', chain, collectibleKey(nft)], queryFn: () => findListing(nft, chain), retry: 1, staleTime: 0 });
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success('Copied'); } catch { toast.error('Could not copy'); } };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle className="text-xl break-words pr-6">{nft.name}</DialogTitle><DialogDescription className="break-all">{collectiblePack(nft) || nft.collection}</DialogDescription></DialogHeader>
      <div className="grid md:grid-cols-2 gap-6 min-w-0">
        <div className="min-w-0 space-y-3"><div className="aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-lg">{artwork && !failedImage ? <img src={artwork} alt={nft.name} decoding="async" className="w-full h-full object-contain" onError={() => setFailedImage(true)} /> : <ImageIcon aria-label="Artwork unavailable" className="h-16 w-16 text-muted-foreground" />}</div>{artwork && <Button variant="outline" asChild className="w-full"><a href={artwork} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open full artwork</a></Button>}</div>
        <div className="space-y-5 min-w-0">
          <Badge variant="secondary">{nft.isCompressed ? 'Compressed NFT' : nft.standard || 'NFT'} · {CHAINS[chain].name}</Badge>
          <section><h3 className="font-semibold mb-2">Description</h3><p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{nft.description || 'No description provided.'}</p></section>
          <section className="border-t border-border pt-4"><h3 className="font-semibold mb-2">Ownership</h3><p className="text-xs text-muted-foreground mb-2">Latest wallet lookup</p>{nft.ownerAddress ? <div className="flex items-start gap-2"><code className="text-xs break-all flex-1">{nft.ownerAddress}</code><Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" aria-label="Copy owner address" onClick={() => void copy(nft.ownerAddress || '')}><Copy className="h-4 w-4" /></Button></div> : <p className="text-sm text-muted-foreground">Owner information unavailable.</p>}</section>
          <section className="border-t border-border pt-4"><h3 className="font-semibold mb-2">NFT details</h3><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">{chain === 'solana' ? 'Asset address' : 'Contract address'}</dt><dd className="text-xs break-all mt-1">{nft.contractAddress}</dd></div><div><dt className="text-muted-foreground">Token ID</dt><dd className="text-xs break-all mt-1">{nft.tokenId}</dd></div><div><dt className="text-muted-foreground">Collection</dt><dd className="break-all">{nft.collection || 'Unknown'}</dd></div></dl>{explorer && <Button variant="outline" asChild className="mt-3"><a href={explorer} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />View on explorer</a></Button>}</section>
          <section className="border-t border-border pt-4"><h3 className="font-semibold mb-2">Marketplace listing</h3>{listing.isLoading ? <p role="status" className="flex gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking listing…</p> : listing.isError ? <div><p className="text-sm text-muted-foreground">Couldn’t check marketplace availability.</p><Button variant="outline" size="sm" onClick={() => void listing.refetch()} className="mt-2"><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div> : listing.data ? <><p className="font-semibold mb-3">{listing.data.price} {listing.data.currency}</p><Button asChild><Link to={collectibleListingUrl(listing.data.id)}><ShoppingBag className="mr-2 h-4 w-4" />View marketplace listing</Link></Button></> : <p className="text-sm text-muted-foreground">No active listing on Lily Marketplace.</p>}</section>
        </div>
      </div>
      <section className="border-t border-border pt-4"><h3 className="font-semibold mb-3">Traits</h3>{nft.attributes.length ? <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">{nft.attributes.map((attr, i) => <div key={`${attr.trait_type}:${i}`} className="min-w-0 border-b border-border pb-2"><dt className="text-xs text-muted-foreground break-words">{attr.trait_type}</dt><dd className="text-sm font-medium break-words">{attr.value}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">No traits provided.</p>}</section>
      <section className="border-t border-border pt-4"><div className="flex flex-wrap gap-3 items-center justify-between mb-3"><h3 className="font-semibold">Metadata</h3>{metadataUri && <Button variant="outline" size="sm" asChild><a href={metadataUri} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Original metadata</a></Button>}</div><pre className="bg-muted text-muted-foreground text-xs p-4 rounded-lg whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{JSON.stringify(collectibleMetadata(nft), null, 2)}</pre></section>
    </DialogContent>
  </Dialog>;
}