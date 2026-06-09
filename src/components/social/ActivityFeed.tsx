import { useProfileActivity, ActivityFilter, ActivityItem } from "@/hooks/useProfileActivity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Heart, UserPlus, Sparkles, ShoppingBag, Coins } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

interface ActivityFeedProps {
  targetUserId: string | null | undefined;
  className?: string;
  title?: string;
}

const kindIcon = {
  follow: UserPlus,
  tip: Coins,
  mint: Sparkles,
  sale: ShoppingBag,
};

const kindColor = {
  follow: "text-pink-500",
  tip: "text-amber-500",
  mint: "text-primary",
  sale: "text-emerald-500",
};

const short = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "Someone");

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = kindIcon[item.kind];
  const color = kindColor[item.kind];
  const actorName = item.actor_name || short(item.actor_address);
  const actorLink = item.actor_name
    ? `/u/${encodeURIComponent(item.actor_name)}`
    : item.actor_address
    ? `/u/${item.actor_address}`
    : "#";

  let verb = "";
  let target: React.ReactNode = null;
  switch (item.kind) {
    case "follow":
      verb = "followed";
      break;
    case "tip":
      verb = "tipped";
      target = item.amount != null && (
        <span className="font-medium text-amber-500">{Number(item.amount).toFixed(3)} SOL</span>
      );
      break;
    case "mint":
      verb = "minted from";
      target = item.target_id && (
        <Link to={`/collection/${item.target_id}`} className="font-medium hover:underline">
          {item.target_label || "a collection"}
        </Link>
      );
      break;
    case "sale":
      verb = "bought from";
      target = item.target_id && (
        <Link to={`/collection/${item.target_id}`} className="font-medium hover:underline">
          {item.target_label || "a collection"}
        </Link>
      );
      break;
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0">
      <div className="relative">
        <Avatar className="h-9 w-9">
          <AvatarImage src={item.actor_avatar || undefined} alt={actorName} />
          <AvatarFallback className="text-xs bg-primary/15 text-primary">
            {actorName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className={`absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-border ${color}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-snug">
          <Link to={actorLink} className="font-medium hover:underline">
            {actorName}
          </Link>{" "}
          <span className="text-muted-foreground">{verb}</span>{" "}
          {target}
          {item.kind === "sale" && item.amount != null && (
            <span className="text-muted-foreground"> · {Number(item.amount).toFixed(2)} SOL</span>
          )}
        </div>
        {item.message && (
          <div className="text-xs italic text-muted-foreground mt-0.5 truncate">"{item.message}"</div>
        )}
        <div className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(item.created_at)}</div>
      </div>
      {item.target_image && (
        <img
          src={item.target_image}
          alt=""
          className="h-10 w-10 rounded-md object-cover border border-border/50"
          loading="lazy"
        />
      )}
    </div>
  );
}

export function ActivityFeed({ targetUserId, className, title = "Activity" }: ActivityFeedProps) {
  const [filter, setFilter] = (require("react") as typeof import("react")).useState<ActivityFilter>("all");
  const { items, loading, hasMore, loadingMore, loadMore } = useProfileActivity(targetUserId, filter);

  if (!targetUserId) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as ActivityFilter)} className="mb-2">
          <TabsList className="grid grid-cols-5 h-8">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="mints" className="text-xs">Mints</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">Sales</TabsTrigger>
            <TabsTrigger value="tips" className="text-xs">Tips</TabsTrigger>
            <TabsTrigger value="followers" className="text-xs">Follows</TabsTrigger>
          </TabsList>
        </Tabs>

        <div>
          {loading ? (
            <div className="space-y-3 py-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No activity yet.
            </p>
          ) : (
            <>
              {items.map((it) => (
                <ActivityRow key={it.id} item={it} />
              ))}
              {hasMore && (
                <div className="pt-3 flex justify-center">
                  <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
