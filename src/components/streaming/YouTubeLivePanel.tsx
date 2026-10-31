import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Youtube, Radio, Square, ExternalLink } from "lucide-react";
import { parseYouTubeVideoId } from "@/lib/youtube";

export function YouTubeLivePanel({ category }: { category?: string }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveId, setLiveId] = useState<string | null>(null);

  const start = async () => {
    const videoId = parseYouTubeVideoId(link);
    if (!videoId) return toast({ title: "Invalid YouTube link", description: "Paste your YouTube Live or video link.", variant: "destructive" });
    if (!title.trim()) return toast({ title: "Stream title required", variant: "destructive" });
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return toast({ title: "Please connect your wallet first", variant: "destructive" }); }
    const { data, error } = await supabase.from("streams").insert({
      user_id: user.id, title: title.trim(), category: category || null, is_live: true,
      started_at: new Date().toISOString(), youtube_video_id: videoId,
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    }).select("id").single();
    setBusy(false);
    if (error || !data) return toast({ title: "Could not go live", description: "Please try again.", variant: "destructive" });
    setLiveId(data.id);
    toast({ title: "You're live!", description: "Viewers can watch your YouTube stream here with chat and tips." });
  };

  const end = async () => {
    if (!liveId) return;
    setBusy(true);
    await supabase.from("streams").update({ is_live: false, ended_at: new Date().toISOString() }).eq("id", liveId);
    setBusy(false); setLiveId(null); setLink(""); setTitle("");
    toast({ title: "Stream ended" });
  };

  return (
    <Card className="glass-card border-border/50">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg"><Youtube className="w-5 h-5 text-destructive" />Stream from YouTube</CardTitle>
        <CardDescription>Go live on YouTube (OBS, phone or web), then paste the link to show it here with chat and tipping.</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
        {liveId ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/watch/${liveId}`)} className="gap-2"><ExternalLink className="w-4 h-4" />Open watch page</Button>
            <Button variant="destructive" onClick={end} disabled={busy} className="gap-2"><Square className="w-4 h-4" />End stream</Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="yt-title">Stream Title *</Label>
              <Input id="yt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Enter a title..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="yt-link">YouTube Live link *</Label>
              <Input id="yt-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/live/..." />
            </div>
            <Button onClick={start} disabled={busy} className="w-full gap-2"><Radio className="w-4 h-4" />Go live with YouTube</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
