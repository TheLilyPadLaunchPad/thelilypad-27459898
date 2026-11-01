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
import { Youtube, Radio, Square, ExternalLink, Copy, Check } from "lucide-react";
import { parseYouTubeVideoId } from "@/lib/youtube";
import { youtubeWatchUrl } from "@/lib/streamPlayback";

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

export function YouTubeLivePanel() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore an in-progress YouTube stream after a refresh or navigation,
  // so "End stream" is always reachable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("streams")
        .select("id, youtube_video_id")
        .eq("user_id", user.id)
        .eq("is_live", true)
        .not("youtube_video_id", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) {
        setLiveId(data.id);
        setVideoId(data.youtube_video_id);
      }
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
      is_live: true,
      started_at: new Date().toISOString(),
      youtube_video_id: parsed,
      thumbnail_url: `https://i.ytimg.com/vi/${parsed}/hqdefault.jpg`,
    }).select("id").single();
    setBusy(false);
    if (error || !data) {
      toast({ title: "Could not go live", description: "Please try again.", variant: "destructive" });
      return;
    }
    setLiveId(data.id);
    setVideoId(parsed);
    toast({
      title: "You're live!",
      description: "Viewers can watch your YouTube stream here with chat and tips.",
    });
  };

  const end = async () => {
    if (!liveId) return;
    setBusy(true);
    await supabase.from("streams").update({ is_live: false, ended_at: new Date().toISOString() }).eq("id", liveId);
    setBusy(false);
    setLiveId(null);
    setVideoId(null);
    setLink("");
    setTitle("");
    setCategory("");
    toast({ title: "Stream ended" });
  };

  const copyWatchLink = async () => {
    if (!liveId) return;
    await navigator.clipboard.writeText(`${window.location.origin}/watch/${liveId}`);
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
        {liveId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your stream is live. Share the watch link — Lily Pad chat and tips run beside it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/watch/${liveId}`)} className="gap-2">
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
              <Button variant="destructive" onClick={end} disabled={busy} className="gap-2">
                <Square className="w-4 h-4" />
                End stream
              </Button>
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
            <Button onClick={start} disabled={busy} className="w-full gap-2">
              <Radio className="w-4 h-4" />
              Go live with YouTube
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
