import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Youtube, Radio, Square, ExternalLink, Copy, Check, CalendarClock } from "lucide-react";
import { parseYouTubeVideoId } from "@/lib/youtube";
import { youtubeWatchUrl } from "@/lib/streamPlayback";
import { format, formatDistanceToNow } from "date-fns";

const CATEGORIES = [
  "Gaming",
  "Art",
  "Music",
  "Just Chatting",
  "NFTs",
  "DeFi",
  "Crypto News",
  "Education",
  "IRL",
];

/** datetime-local inputs want "YYYY-MM-DDTHH:mm" in the viewer's own timezone. */
function localInputValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function scheduleLabel(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "later";
  return `${format(when, "MMM d, h:mm a")} (${formatDistanceToNow(when, { addSuffix: true })})`;
}

export function YouTubeLivePanel() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [scheduleInput, setScheduleInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore an in-progress or announced YouTube stream after a refresh or
  // navigation, so "End stream" / "Go live now" is always reachable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("streams")
        .select("id, youtube_video_id, is_live, scheduled_at")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .not("youtube_video_id", "is", null)
        .order("started_at", { ascending: false })
        .limit(5);
      if (cancelled || !data) return;
      const now = Date.now();
      const row =
        data.find((r) => r.is_live) ??
        data.find((r) => r.scheduled_at && Date.parse(r.scheduled_at) > now);
      if (!row) return;
      setRowId(row.id);
      setVideoId(row.youtube_video_id);
      setIsLive(!!row.is_live);
      setScheduledAt(row.is_live ? null : (row.scheduled_at ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async () => {
    const parsed = parseYouTubeVideoId(link);
    if (!parsed) {
      toast({
        title: "Invalid YouTube link",
        description: "Paste your YouTube Live or video link, like youtube.com/live/...",
        variant: "destructive",
      });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Stream title required", variant: "destructive" });
      return;
    }

    let startsAt: Date | null = null;
    if (scheduleInput) {
      startsAt = new Date(scheduleInput);
      if (Number.isNaN(startsAt.getTime())) {
        toast({ title: "Invalid start time", variant: "destructive" });
        return;
      }
      if (startsAt.getTime() <= Date.now()) {
        toast({
          title: "Start time already passed",
          description: "Pick a time in the future, or leave it blank to go live now.",
          variant: "destructive",
        });
        return;
      }
    }

    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      toast({ title: "Please connect your wallet first", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.from("streams").insert({
      user_id: user.id,
      title: title.trim(),
      category: category || null,
      is_live: !startsAt,
      started_at: (startsAt ?? new Date()).toISOString(),
      scheduled_at: startsAt ? startsAt.toISOString() : null,
      youtube_video_id: parsed,
      thumbnail_url: `https://i.ytimg.com/vi/${parsed}/hqdefault.jpg`,
    }).select("id").single();
    setBusy(false);
    if (error || !data) {
      toast({ title: "Could not go live", description: "Please try again.", variant: "destructive" });
      return;
    }
    setRowId(data.id);
    setVideoId(parsed);
    setIsLive(!startsAt);
    setScheduledAt(startsAt ? startsAt.toISOString() : null);
    toast(
      startsAt
        ? {
            title: "Stream scheduled",
            description: "Viewers can see it on the Streams page until you go live.",
          }
        : {
            title: "You're live!",
            description: "Viewers can watch your YouTube stream here with chat and tips.",
          },
    );
  };

  const goLiveNow = async () => {
    if (!rowId) return;
    setBusy(true);
    const { error } = await supabase
      .from("streams")
      .update({ is_live: true, started_at: new Date().toISOString() })
      .eq("id", rowId);
    setBusy(false);
    if (error) {
      toast({ title: "Could not start the stream", description: "Please try again.", variant: "destructive" });
      return;
    }
    setIsLive(true);
    setScheduledAt(null);
    toast({ title: "You're live!", description: "Viewers can watch your YouTube stream here with chat and tips." });
  };

  const cancelSchedule = async () => {
    if (!rowId) return;
    setBusy(true);
    const { error } = await supabase.from("streams").delete().eq("id", rowId);
    setBusy(false);
    if (error) {
      toast({ title: "Could not cancel the schedule", description: "Please try again.", variant: "destructive" });
      return;
    }
    setRowId(null);
    setVideoId(null);
    setIsLive(false);
    setScheduledAt(null);
    setScheduleInput("");
    toast({ title: "Schedule cancelled" });
  };

  const end = async () => {
    if (!rowId) return;
    setBusy(true);
    await supabase
      .from("streams")
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq("id", rowId);
    setBusy(false);
    setRowId(null);
    setVideoId(null);
    setIsLive(false);
    setScheduledAt(null);
    setLink("");
    setTitle("");
    setCategory("");
    toast({ title: "Stream ended" });
  };

  const copyWatchLink = async () => {
    if (!rowId) return;
    await navigator.clipboard.writeText(`${window.location.origin}/watch/${rowId}`);
    setCopied(true);
    toast({ title: "Watch link copied!", description: "Send it to your viewers." });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="glass-card border-border/50">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Youtube className="w-5 h-5 text-destructive" />
          Stream from YouTube
        </CardTitle>
        <CardDescription>
          Go live on YouTube (OBS, phone or web), then paste the link to show it here with chat and tipping.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
        {rowId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isLive
                ? "Your stream is live. Share the watch link — Lily Pad chat and tips run beside it."
                : scheduledAt
                  ? `Scheduled for ${scheduleLabel(scheduledAt)}. Share the watch link now — it opens as soon as you go live.`
                  : "Your stream is ready."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/watch/${rowId}`)} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Open watch page
              </Button>
              <Button variant="outline" onClick={copyWatchLink} className="gap-2">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy watch link
              </Button>
              {videoId && (
                <Button
                  variant="ghost"
                  className="gap-2"
                  onClick={() => window.open(youtubeWatchUrl(videoId), "_blank", "noopener,noreferrer")}
                >
                  <Youtube className="w-4 h-4" />
                  Your YouTube stream
                </Button>
              )}
              {isLive ? (
                <Button variant="destructive" onClick={end} disabled={busy} className="gap-2">
                  <Square className="w-4 h-4" />
                  End stream
                </Button>
              ) : (
                <>
                  <Button onClick={goLiveNow} disabled={busy} className="gap-2">
                    <Radio className="w-4 h-4" />
                    Go live now
                  </Button>
                  <Button variant="outline" onClick={cancelSchedule} disabled={busy} className="gap-2">
                    <CalendarClock className="w-4 h-4" />
                    Cancel schedule
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="yt-title">Stream Title *</Label>
              <Input
                id="yt-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="Enter a title..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="yt-link">YouTube Live link *</Label>
              <Input
                id="yt-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://youtube.com/live/..."
              />
              <p className="text-xs text-muted-foreground">
                Works with youtube.com/live, youtube.com/watch, youtu.be links or a bare video id.
                Your stream must be public or unlisted with embedding allowed.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="yt-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="yt-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="yt-schedule">Start time (optional)</Label>
              <Input
                id="yt-schedule"
                type="datetime-local"
                value={scheduleInput}
                min={localInputValue(new Date())}
                onChange={(e) => setScheduleInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to go live straight away. Set a time to announce the stream on the
                Streams page under Scheduled until you press Go live now.
              </p>
            </div>
            <Button onClick={start} disabled={busy} className="w-full gap-2">
              {scheduleInput ? <CalendarClock className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
              {scheduleInput ? "Schedule stream" : "Go live with YouTube"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
