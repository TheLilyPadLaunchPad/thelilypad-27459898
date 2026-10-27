import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function MintIntroDialog({ open, url, onClose }: { open: boolean; url: string; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Mint introduction</DialogTitle>
        <video src={url} autoPlay controls playsInline onEnded={onClose} className="w-full max-h-[70vh] bg-muted" />
        <div className="p-3 flex justify-end">
          <Button onClick={onClose}>Skip to Mint</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MintProcessingOverlay({ open, gifUrl }: { open: boolean; gifUrl?: string | null }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-border bg-card shadow-xl">
        {gifUrl ? (
          <img src={gifUrl} alt="Mint processing" className="w-56 h-56 object-cover rounded-xl" />
        ) : (
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        )}
        <p className="font-semibold">Processing your mint…</p>
        <p className="text-xs text-muted-foreground">Confirm in your wallet and keep this page open.</p>
      </div>
    </div>
  );
}
