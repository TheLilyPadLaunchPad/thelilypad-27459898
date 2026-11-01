import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, ImageIcon, Layers, Loader2, RefreshCw, Search, Wallet } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CollectibleDetailView } from '@/components/wallet/CollectibleDetailView';
import { ConnectWallet } from '@/components/wallet/ConnectWallet';
import { ChainIcon } from '@/components/launchpad/ChainSelector';
import { useWallet } from '@/providers/WalletProvider';
import { useWalletNFTs, type NFT } from '@/hooks/useWalletNFTs';
import { useSEO } from '@/hooks/useSEO';
import { CHAINS, type SupportedChain } from '@/config/chains';
import { collectibleKey, collectiblePack, galleryNetwork, visibleCollectibles } from '@/lib/walletGallery';

function Artwork({ nft, large = false }: { nft: NFT; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="aspect-square w-full bg-muted flex items-center justify-center overflow-hidden">
    {nft.image && !failed ? <img src={nft.image} alt={nft.name} loading={large ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-contain" onError={() => setFailed(true)} /> : <ImageIcon className="h-12 w-12 text-muted-foreground" aria-label="Artwork unavailable" />}
  </div>;
}

function Inventory({ address, chain }: { address: string; chain: SupportedChain }) {
  const network = galleryNetwork(chain);
  const { nfts, isLoading, error, hasMore, loadMore, refresh } = useWalletNFTs(network ? address : null, network || 'solana-mainnet');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [collection, setCollection] = useState('all');
  const [sort, setSort] = useState('name-asc');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<NFT | null>(null);
  const filtered = useMemo(() => visibleCollectibles(nfts, search, kind, collection, sort), [nfts, search, kind, collection, sort]);
  const collections = useMemo(() => [...new Set(nfts.map(n => n.collection))].sort(), [nfts]);
  const pages = Math.max(1, Math.ceil(filtered.length / 48));
  const currentPage = Math.min(page, pages - 1);

  if (!network) return <div className="py-16 text-center space-y-4">
    <Layers className="h-10 w-10 mx-auto text-muted-foreground" />
    <h2 className="text-xl font-semibold">{CHAINS[chain].name} gallery isn’t available yet</h2>
    <p className="text-muted-foreground text-sm">Wallet collectibles are available on Solana and Robinhood Chain.</p>
    <Button variant="outline" asChild><a href={`${CHAINS[chain].networks.mainnet.explorer}/address/${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />View wallet on explorer</a></Button>
  </div>;

  return <>
    <div className="flex items-center justify-between gap-3 border-b border-border py-5">
      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{new Set(nfts.map(collectibleKey)).size} loaded</span><Badge variant="secondary">{nfts.filter(n => n.isCompressed).length} cNFTs</Badge></div>
      <Button variant="outline" size="icon" aria-label="Refresh collectibles" title="Refresh collectibles" disabled={isLoading} onClick={() => { setPage(0); void refresh(); }}><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_180px_220px_180px] gap-3 py-5">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search collectibles" placeholder="Search collectibles or packs" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9" /></div>
      <Select value={kind} onValueChange={v => { setKind(v); setPage(0); }}><SelectTrigger aria-label="Collectible type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All collectibles</SelectItem><SelectItem value="compressed">Compressed NFTs</SelectItem></SelectContent></Select>
      <Select value={collection} onValueChange={v => { setCollection(v); setPage(0); }}><SelectTrigger aria-label="Collection filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All collections</SelectItem>{collections.filter(Boolean).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      <Select value={sort} onValueChange={v => { setSort(v); setPage(0); }}><SelectTrigger aria-label="Sort collectibles"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name-asc">Name: A–Z</SelectItem><SelectItem value="name-desc">Name: Z–A</SelectItem></SelectContent></Select>
    </div>
    {error && <div role="alert" className="mb-5 border border-destructive/40 rounded-lg p-4 text-sm"><p>Couldn’t load wallet collectibles. Please try again.</p><Button variant="outline" size="sm" className="mt-3" disabled={isLoading} onClick={() => void (nfts.length ? loadMore() : refresh())}>Retry</Button></div>}
    {isLoading && nfts.length === 0 ? <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-lg" />)}</div> : filtered.length > 0 ? <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
      {filtered.slice(currentPage * 48, (currentPage + 1) * 48).map(nft => <Button key={collectibleKey(nft)} variant="ghost" onClick={() => setSelected(nft)} aria-label={`View ${nft.name}`} className="h-auto w-full min-w-0 flex-col items-stretch p-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground hover:bg-accent whitespace-normal text-left">
        <Artwork nft={nft} />
        <div className="p-3 space-y-2 min-w-0"><div className="text-xs text-muted-foreground truncate" title={collectiblePack(nft) || nft.collection}>{collectiblePack(nft) || nft.collection}</div><h2 className="font-semibold text-sm break-words line-clamp-2">{nft.name}</h2><Badge variant="secondary" className="text-xs">{nft.isCompressed ? 'cNFT' : nft.standard || 'NFT'}</Badge></div>
      </Button>)}
    </div> : !error && <div className="py-16 text-center"><ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><h2 className="text-xl font-semibold">{nfts.length ? 'No matching collectibles' : 'No collectibles found'}</h2><p className="mt-2 text-sm text-muted-foreground">{nfts.length ? 'Try another search or collection.' : 'No NFTs were found for this wallet on this chain.'}</p>{nfts.length > 0 && <Button variant="outline" className="mt-4" onClick={() => { setSearch(''); setKind('all'); setCollection('all'); }}>Clear filters</Button>}</div>}
    <div className="flex flex-wrap justify-center items-center gap-4 py-8">
      {pages > 1 && <><Button variant="outline" size="icon" aria-label="Previous gallery page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm">{currentPage + 1} / {pages}</span><Button variant="outline" size="icon" aria-label="Next gallery page" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></>}
      {hasMore && <Button variant="outline" disabled={isLoading} onClick={() => void loadMore()}>{isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Load more collectibles</Button>}
    </div>
    {selected && <CollectibleDetailView key={collectibleKey(selected)} nft={selected} chain={chain} onClose={() => setSelected(null)} />}
  </>;
}

export default function WalletGallery() {
  const { address, isConnected, chainType } = useWallet();
  useSEO({ title: 'Wallet Gallery | The Lily Pad', description: 'Browse the NFTs and compressed collectibles owned by your connected wallet on The Lily Pad.' });
  return <div className="min-h-screen bg-background"><Navbar /><main className="container mx-auto max-w-6xl px-4 pt-24 pb-24">
    <Button variant="ghost" asChild className="mb-5 -ml-3"><Link to="/wallet"><ArrowLeft className="mr-2 h-4 w-4" />Wallet</Link></Button>
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 pb-4"><div><p className="text-sm text-primary font-medium mb-2">My collection</p><h1 className="text-3xl font-bold">Wallet Gallery</h1></div>{isConnected && address && <div className="flex items-center gap-2 min-w-0"><ChainIcon chain={chainType} className="h-5 w-5" /><span className="text-sm">{CHAINS[chainType].name}</span><code className="text-xs text-muted-foreground">{address.slice(0, 6)}…{address.slice(-4)}</code></div>}</header>
    {isConnected && address ? <Inventory key={`${chainType}:${address}`} address={address} chain={chainType} /> : <div className="text-center py-20 border-t border-border"><Wallet className="h-12 w-12 text-primary mx-auto mb-4" /><h2 className="text-xl font-semibold mb-5">Connect your wallet</h2><ConnectWallet variant="default" size="lg" /></div>}
  </main></div>;
}
