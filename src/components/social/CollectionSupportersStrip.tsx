import { useState } from "react";
import { useCollectionSupporters } from "@/hooks/useCollectionSupporters";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollectionSupportersStripProps {
  collectionId: string | null | undefined;
  className?: string;
}

const short = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "Anon");

export function CollectionSupportersStrip({ collectionId, className }: CollectionSupportersStripProps) {
  const { supporters, loading } = useCollectionSupporters(collectionId, 50);
  const [open, setOpen] = useState(false);

  if (!collectionId) return null;

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Skeleton className="h-7 w-32" />
      </div>
    );
  }

  if (supporters.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Users className="h-3.5 w-3.5" />
        No supporters yet
      </div>
    );
  }

  const preview = supporters.slice(0, 5);
  const more = Math.max(0, supporters.length - preview.length);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 text-xs hover:opacity-80 transition-opacity group",
            className
          )}
        >
          <div className="flex -space-x-2">
            {preview.map((s, i) => {
              const name = s.display_name || short(s.wallet_address);
              return (
                <Avatar key={(s.supporter_user_id || s.wallet_address || "x") + i} className="h-6 w-6 border-2 border-background">
                  <AvatarImage src={s.avatar_url || undefined} alt={name} />
                  <AvatarFallback className="text-[9px] bg-primary/15 text-primary">
                    {name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              );
            })}
          </div>
          <span className="text-muted-foreground group-hover:text-foreground">
            Supported by{" "}
            <span className="text-foreground font-medium">
              {preview[0].display_name || short(preview[0].wallet_address)}
            </span>
            {more > 0 && <> + {more} others</>}
          </span>
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Supporters
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {supporters.map((s, i) => {
            const name = s.display_name || short(s.wallet_address);
            const linkTo = s.display_name
              ? `/u/${encodeURIComponent(s.display_name)}`
              : s.wallet_address
              ? `/u/${s.wallet_address}`
              : "#";
            return (
              <Link
                key={(s.supporter_user_id || s.wallet_address || "x") + i}
                to={linkTo}
                className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/50"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={s.avatar_url || undefined} alt={name} />
                  <AvatarFallback className="bg-primary/15 text-primary text-xs">
                    {name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.nfts_owned > 0 && <>{s.nfts_owned} NFT{s.nfts_owned === 1 ? "" : "s"}</>}
                    {s.total_spend_sol > 0 && (
                      <> · {s.total_spend_sol.toFixed(2)} SOL spent</>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
