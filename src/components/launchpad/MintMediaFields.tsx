import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

const MAX_VIDEO = 50 * 1024 * 1024;
const MAX_GIF = 15 * 1024 * 1024;

interface Props {
  introVideoUrl: string;
  setIntroVideoUrl: (v: string) => void;
  processingGifUrl: string;
  setProcessingGifUrl: (v: string) => void;
  upload: (file: File) => Promise<string | null>;
}

/** Creator inputs for the mint intro video and the "mint processing" GIF. */
export function MintMediaFields({ introVideoUrl, setIntroVideoUrl, processingGifUrl, setProcessingGifUrl, upload }: Props) {
  const [busy, setBusy] = useState<"video" | "gif" | null>(null);

  const handle = async (file: File | undefined, kind: "video" | "gif") => {
    if (!file) return;
    if (kind === "video" && !["video/mp4", "video/webm"].includes(file.type)) return toast.error("Intro video must be MP4 or WebM");
    if (kind === "video" && file.size > MAX_VIDEO) return toast.error("Intro video must be 50 MB or less");
    if (kind === "gif" && file.type !== "image/gif") return toast.error("Processing animation must be a GIF");
    if (kind === "gif" && file.size > MAX_GIF) return toast.error("GIF must be 15 MB or less");
    setBusy(kind);
    try {
      const url = await upload(file);
      if (url) (kind === "video" ? setIntroVideoUrl : setProcessingGifUrl)(url);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Mint Intro Video</Label>
        <p className="text-xs text-muted-foreground">Plays as an opening introduction before collectors mint. MP4/WebM, up to 50 MB.</p>
        <div className="flex gap-2">
          <Input placeholder="https://... (or upload)" value={introVideoUrl} onChange={(e) => setIntroVideoUrl(e.target.value)} />
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => document.getElementById("mint-intro-upload")?.click()}>
            {busy === "video" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </Button>
          {introVideoUrl && <Button type="button" variant="ghost" onClick={() => setIntroVideoUrl("")} aria-label="Remove intro video"><X className="w-4 h-4" /></Button>}
        </div>
        <input id="mint-intro-upload" type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => handle(e.target.files?.[0], "video")} />
        {introVideoUrl && <video src={introVideoUrl} controls playsInline className="w-full max-h-64 rounded-lg border border-border bg-muted" />}
      </div>

      <div className="space-y-2">
        <Label>Mint Processing GIF</Label>
        <p className="text-xs text-muted-foreground">Shown while a collector's mint is processing. GIF, up to 15 MB.</p>
        <div className="flex gap-2">
          <Input placeholder="https://... (or upload)" value={processingGifUrl} onChange={(e) => setProcessingGifUrl(e.target.value)} />
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => document.getElementById("mint-gif-upload")?.click()}>
            {busy === "gif" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </Button>
          {processingGifUrl && <Button type="button" variant="ghost" onClick={() => setProcessingGifUrl("")} aria-label="Remove GIF"><X className="w-4 h-4" /></Button>}
        </div>
        <input id="mint-gif-upload" type="file" accept="image/gif" className="hidden" onChange={(e) => handle(e.target.files?.[0], "gif")} />
        {processingGifUrl && <img src={processingGifUrl} alt="Mint processing animation preview" className="w-40 h-40 object-cover rounded-lg border border-border" />}
      </div>
    </div>
  );
}
