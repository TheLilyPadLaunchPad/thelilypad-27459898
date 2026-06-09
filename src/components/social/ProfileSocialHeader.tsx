import { useProfileSocial } from "@/hooks/useProfileSocial";
import { FollowButton } from "@/components/FollowButton";
import { Users, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileSocialHeaderProps {
  targetUserId: string | null | undefined;
  className?: string;
  showFollowButton?: boolean;
  compact?: boolean;
}

const formatCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export function ProfileSocialHeader({
  targetUserId,
  className,
  showFollowButton = true,
  compact = false,
}: ProfileSocialHeaderProps) {
  const { followersCount, followingCount, loading } = useProfileSocial(targetUserId);

  if (!targetUserId) return null;

  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
      <div className="flex items-center gap-1.5 text-sm">
        <Users className="h-4 w-4 text-primary" />
        <span className="font-semibold">{loading ? "—" : formatCount(followersCount)}</span>
        <span className="text-muted-foreground">Followers</span>
      </div>
      {!compact && (
        <div className="flex items-center gap-1.5 text-sm">
          <UserPlus className="h-4 w-4 text-primary" />
          <span className="font-semibold">{loading ? "—" : formatCount(followingCount)}</span>
          <span className="text-muted-foreground">Following</span>
        </div>
      )}
      {showFollowButton && (
        <FollowButton streamerId={targetUserId} variant={compact ? "compact" : "default"} />
      )}
    </div>
  );
}
