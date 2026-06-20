import { useMemo, useState } from "react";
import { NFT } from "@/hooks/useWalletNFTs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Folder,
  FolderOpen,
  Image as ImageIcon,
  MoreVertical,
  UserCircle2,
  ExternalLink,
  Tag,
  Send,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  nfts: NFT[];
  /** SOL / MON / ETH — for stats display */
  currency: string;
  /** Network selector key — only used to build explorer URLs */
  network: string;
  onSetAsPfp?: (nft: NFT) => Promise<void> | void;
  onListForSale?: (nft: NFT) => void;
  onTransfer?: (nft: NFT) => void;
  onView?: (nft: NFT) => void;
}

interface FolderGroup {
  key: string;
  name: string;
  cover: string;
  items: NFT[];
}

function explorerUrl(network: string, contract: string): string {
  if (network.startsWith("solana")) return `https://solscan.io/token/${contract}`;
  if (network.startsWith("monad"))
    return `https://testnet.monadexplorer.com/token/${contract}`;
  if (network.startsWith("polygon"))
    return `https://polygonscan.com/token/${contract}`;
  return `https://etherscan.io/token/${contract}`;
}

export function HoldingsFolderGrid({
  nfts,
  currency,
  network,
  onSetAsPfp,
  onListForSale,
  onTransfer,
  onView,
}: Props) {
  const [search, setSearch] = useState("");
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const folders: FolderGroup[] = useMemo(() => {
    const map = new Map<string, FolderGroup>();
    for (const nft of nfts) {
      const key = nft.collection || "Uncategorized";
      const existing = map.get(key);
      if (existing) existing.items.push(nft);
      else
        map.set(key, {
          key,
          name: key,
          cover: nft.image,
          items: [nft],
        });
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [nfts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders
      .map((f) => ({
        ...f,
        items: f.items.filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            f.name.toLowerCase().includes(q),
        ),
      }))
      .filter((f) => f.items.length > 0);
  }, [folders, search]);

  const stats = useMemo(
    () => ({
      total: nfts.length,
      collections: folders.length,
    }),
    [nfts.length, folders.length],
  );

  if (nfts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No NFTs in this wallet yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-xs">
            {stats.total} items
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {stats.collections} collections
          </Badge>
          <Badge variant="outline" className="text-xs">
            {currency}
          </Badge>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search items or collections"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      {/* Folder grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((folder) => {
          const isOpen = openFolder === folder.key;
          const peeks = folder.items.slice(0, 3);
          return (
            <button
              key={folder.key}
              type="button"
              onClick={() => setOpenFolder(isOpen ? null : folder.key)}
              className={`text-left rounded-lg border bg-card hover:border-primary/50 transition-all p-3 group ${
                isOpen ? "border-primary ring-1 ring-primary/30" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex -space-x-2">
                  {peeks.map((p, i) => (
                    <div
                      key={p.tokenId + i}
                      className="w-10 h-10 rounded border-2 border-card overflow-hidden bg-muted"
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {isOpen ? (
                  <FolderOpen className="w-4 h-4 text-primary ml-auto" />
                ) : (
                  <Folder className="w-4 h-4 text-muted-foreground ml-auto" />
                )}
              </div>
              <div className="mt-2">
                <div className="font-semibold text-sm truncate">
                  {folder.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {folder.items.length}{" "}
                  {folder.items.length === 1 ? "item" : "items"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded folder contents */}
      {openFolder && (
        <Card className="p-3 sm:p-4 border-primary/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">{openFolder}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpenFolder(null)}
            >
              Close
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered
              .find((f) => f.key === openFolder)
              ?.items.map((nft) => (
                <NFTTile
                  key={`${nft.contractAddress}-${nft.tokenId}`}
                  nft={nft}
                  network={network}
                  onSetAsPfp={onSetAsPfp}
                  onListForSale={onListForSale}
                  onTransfer={onTransfer}
                  onView={onView}
                />
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}

interface TileProps {
  nft: NFT;
  network: string;
  onSetAsPfp?: (nft: NFT) => Promise<void> | void;
  onListForSale?: (nft: NFT) => void;
  onTransfer?: (nft: NFT) => void;
  onView?: (nft: NFT) => void;
}

function NFTTile({
  nft,
  network,
  onSetAsPfp,
  onListForSale,
  onTransfer,
  onView,
}: TileProps) {
  const [pending, setPending] = useState(false);

  const handlePfp = async () => {
    if (!onSetAsPfp) return;
    try {
      setPending(true);
      await onSetAsPfp(nft);
      toast.success("Profile picture updated");
    } catch (e) {
      toast.error("Failed to update profile picture");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-md overflow-hidden bg-muted/40 hover:bg-muted/70 transition-colors group relative">
      <button
        type="button"
        onClick={() => onView?.(nft)}
        className="block w-full text-left"
      >
        <div className="aspect-square overflow-hidden bg-muted">
          {nft.image ? (
            <img
              src={nft.image}
              alt={nft.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <div className="p-2">
          <div className="text-xs font-medium truncate">{nft.name}</div>
        </div>
      </button>

      <div className="absolute top-1.5 right-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="h-7 w-7 backdrop-blur bg-background/80"
              onClick={(e) => e.stopPropagation()}
              disabled={pending}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handlePfp} disabled={!onSetAsPfp || !nft.image}>
              <UserCircle2 className="w-4 h-4 mr-2" />
              Set as profile picture
            </DropdownMenuItem>
            {onListForSale && (
              <DropdownMenuItem onClick={() => onListForSale(nft)}>
                <Tag className="w-4 h-4 mr-2" />
                List for sale
              </DropdownMenuItem>
            )}
            {onTransfer && (
              <DropdownMenuItem onClick={() => onTransfer(nft)}>
                <Send className="w-4 h-4 mr-2" />
                Transfer
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                href={explorerUrl(network, nft.contractAddress)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View on explorer
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
