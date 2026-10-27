import { useState } from "react";
import { ChevronLeft, ChevronRight, Crown, Pencil } from "lucide-react";
import type { GeneratedAsset } from "@/lib/assetGenerator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Unmount off-page images so scrolling cannot accumulate decoded NFT images.
const PAGE_SIZE = 48;

export function GeneratedAssetGrid({ assets, onEdit }: {
  assets: GeneratedAsset[];
  onEdit: (asset: GeneratedAsset) => void;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const activePage = Math.min(page, pages - 1);
  const start = activePage * PAGE_SIZE;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3 max-h-[480px] overflow-y-auto pr-1" key={activePage}>
        {assets.slice(start, start + PAGE_SIZE).map(asset => (
          <Button key={asset.id} variant="ghost" onClick={() => onEdit(asset)}
            title={`Edit ${asset.metadata.name}`} aria-label={`Edit ${asset.metadata.name}`}
            className="group relative aspect-square h-auto p-0 rounded-lg overflow-hidden border border-border bg-muted/30 hover:border-primary">
            {asset.preview ? <img src={asset.preview} alt={asset.metadata.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              : <span className="text-[10px] text-muted-foreground">Add artwork</span>}
            {asset.isOneOfOne && <Badge className="absolute top-1 left-1 gap-1 text-[9px] px-1.5 py-0"><Crown className="w-2.5 h-2.5" />1/1</Badge>}
            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-background/60"><Pencil className="w-4 h-4" /></span>
          </Button>
        ))}
      </div>
      {pages > 1 && <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{start + 1}–{Math.min(start + PAGE_SIZE, assets.length)} of {assets.length}</span>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Previous NFTs" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm">{activePage + 1} / {pages}</span>
          <Button size="icon" variant="outline" aria-label="Next NFTs" disabled={activePage === pages - 1} onClick={() => setPage(activePage + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>}
    </div>
  );
}