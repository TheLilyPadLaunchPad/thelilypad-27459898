import { useState } from "react";
import { useTopSupporters, TopSupporter } from "@/hooks/useTopSupporters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Crown, Gem, Shield, Star, Heart, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

const tierIcon: Record<TopSupporter["tier"], typeof Crown> = {
  platinum: Crown,
  gold: Gem,
  silver: Shield,
  bronze: Star,
  supporter: Heart,
};

const tierClass: Record<TopSupporter["tier"], string> = {
  platinum: "bg-gradient-to-r from-violet-500 to-purple-600 text-white",
  gold: "bg-gradient-to-r from-yellow-500 to-amber-500 text-white",
  silver: "bg-gradient-to-r from-gray-400 to-slate-500 text-white",
  bronze: "bg-gradient-to-r from-amber-700 to-orange-700 text-white",
  supporter: "bg-primary/10 text-primary border-primary/20",
};

const short = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "Anon");

function Row({ supporter, rank }: { supporter: TopSupporter; rank: number }) {
  const Icon = tierIcon[supporter.tier];
  const name = supporter.display_name || short(supporter.wallet_address);
  const linkTo = supporter.display_name
    ? `/u/${encodeURIComponent(supporter.display_name)}`
    : supporter.wallet_address
    ? `/u/${supporter.wallet_address}`
    : "#";

  return (
    <Link
      to={linkTo}
      className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors"
    >
      <div className="w-6 text-xs font-bold text-muted-foreground text-center">{rank}</div>
      <Avatar className="h-9 w-9">
        <AvatarImage src={supporter.avatar_url || undefined} alt={name} />
        <AvatarFallback className="bg-primary/15 text-primary text-xs">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{name}</span>
          <Badge className={`gap-1 text-[10px] border-0 ${tierClass[supporter.tier]}`}>
            <Icon className="h-2.5 w-2.5" />
            {supporter.tier}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {supporter.total_score.toFixed(2)} SOL
          {supporter.nft_spend_sol > 0 && supporter.tips_sol > 0 && (
            <span className="ml-1 opacity-70">
              ({supporter.tips_sol.toFixed(2)} tips · {supporter.nft_spend_sol.toFixed(2)} buys)
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

interface TopSupportersCardProps {
  targetUserId: string | null | undefined;
  className?: string;
  title?: string;
}

export function TopSupportersCard({ targetUserId, className, title = "Top Supporters" }: TopSupportersCardProps) {
  const { supporters, loading } = useTopSupporters(targetUserId, 10);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!targetUserId) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          {title}
          {supporters.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {supporters.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : supporters.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No supporters yet — be the first!
          </p>
        ) : (
          <>
            {supporters.slice(0, 5).map((s, i) => (
              <Row key={(s.supporter_user_id || s.wallet_address || "x") + i} supporter={s} rank={i + 1} />
            ))}
            {supporters.length > 5 && (
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full mt-2">
                    View all {supporters.length}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-primary" />
                      {title}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-1">
                    {supporters.map((s, i) => (
                      <Row key={(s.supporter_user_id || s.wallet_address || "x") + i} supporter={s} rank={i + 1} />
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
