import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sparkles,
  Eye,
  Loader2,
  CheckCircle2,
  Image as ImageIcon,
  Wand2,
  Flame,
  Snowflake,
  Star,
  Clock,
  Calendar,
  X,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NFTRevealAnimation, RevealTheme } from "./NFTRevealAnimation";
import { format, parseISO, isFuture } from "date-fns";

interface MintedNFT {
  id: string;
  token_id: number;
  name: string | null;
  image_url: string | null;
  is_revealed: boolean;
  revealed_at: string | null;
}

interface RevealManagerProps {
  collectionId: string;
  collectionName: string;
  unrevealedImageUrl: string | null;
  isCollectionRevealed: boolean;
  scheduledRevealAt: string | null;
  onRevealComplete: () => void;
}

const REVEAL_THEMES: { id: RevealTheme; name: string; icon: React.ReactNode; description: string }[] = [
  { id: "magic", name: "Magic", icon: <Sparkles className="w-4 h-4" />, description: "Magical sparkles & confetti" },
  { id: "fire", name: "Fire", icon: <Flame className="w-4 h-4" />, description: "Blazing flames reveal" },
  { id: "ice", name: "Ice", icon: <Snowflake className="w-4 h-4" />, description: "Frozen crystal shatter" },
  { id: "galaxy", name: "Galaxy", icon: <Star className="w-4 h-4" />, description: "Cosmic stardust explosion" },
];

export function RevealManager({
  collectionId,
  collectionName,
  unrevealedImageUrl,
  isCollectionRevealed,
  scheduledRevealAt,
  onRevealComplete,
}: RevealManagerProps) {
  const [nfts, setNfts] = useState<MintedNFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevealing, setIsRevealing] = useState(false);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRevealAnimation, setShowRevealAnimation] = useState(false);
  const [revealedNftsForAnimation, setRevealedNftsForAnimation] = useState<MintedNFT[]>([]);
  const [revealMode, setRevealMode] = useState<"all" | "selected">("all");
  const [selectedTheme, setSelectedTheme] = useState<RevealTheme>("magic");

  // Scheduled reveal state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [localScheduledAt, setLocalScheduledAt] = useState<string | null>(scheduledRevealAt);

  useEffect(() => {
    setLocalScheduledAt(scheduledRevealAt);
  }, [scheduledRevealAt]);

  useEffect(() => {
    fetchNFTs();
  }, [collectionId]);

  const fetchNFTs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("minted_nfts")
      .select("id, token_id, name, image_url, is_revealed, revealed_at")
      .eq("collection_id", collectionId)
      .order("token_id", { ascending: true });

    if (!error && data) {
      setNfts(data);
    }
    setIsLoading(false);
  };

  const unrevealedCount = nfts.filter(nft => !nft.is_revealed).length;
  const revealedCount = nfts.filter(nft => nft.is_revealed).length;
  const totalCount = nfts.length;

  const handleSelectNft = (nftId: string) => {
    setSelectedNfts(prev => {
      const updated = new Set(prev);
      if (updated.has(nftId)) {
        updated.delete(nftId);
      } else {
        updated.add(nftId);
      }
      return updated;
    });
  };

  const handleSelectAllUnrevealed = () => {
    const unrevealedIds = nfts.filter(nft => !nft.is_revealed).map(nft => nft.id);
    setSelectedNfts(new Set(unrevealedIds));
  };

  const handleDeselectAll = () => {
    setSelectedNfts(new Set());
  };

  const handleRevealAll = () => {
    setRevealMode("all");
    setShowConfirmDialog(true);
  };

  const handleRevealSelected = () => {
    if (selectedNfts.size === 0) {
      toast.error("Please select at least one NFT to reveal");
      return;
    }
    setRevealMode("selected");
    setShowConfirmDialog(true);
  };

  const handleSaveSchedule = async () => {
    if (!scheduleDate || !scheduleTime) {
      toast.error("Please select both date and time");
      return;
    }

    const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);

    if (!isFuture(scheduledDateTime)) {
      toast.error("Scheduled time must be in the future");
      return;
    }

    setIsSavingSchedule(true);

    try {
      const { error } = await supabase
        .from("collections")
        .update({ scheduled_reveal_at: scheduledDateTime.toISOString() })
        .eq("id", collectionId);

      if (error) throw error;

      setLocalScheduledAt(scheduledDateTime.toISOString());
      setShowScheduleForm(false);
      setScheduleDate("");
      setScheduleTime("");
      toast.success("Reveal scheduled successfully!");
      onRevealComplete();
    } catch (error) {
      console.error("Error scheduling reveal:", error);
      toast.error("Failed to schedule reveal");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleCancelSchedule = async () => {
    setIsSavingSchedule(true);

    try {
      const { error } = await supabase
        .from("collections")
        .update({ scheduled_reveal_at: null })
        .eq("id", collectionId);

      if (error) throw error;

      setLocalScheduledAt(null);
      toast.success("Scheduled reveal cancelled");
      onRevealComplete();
    } catch (error) {
      console.error("Error cancelling schedule:", error);
      toast.error("Failed to cancel scheduled reveal");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const executeReveal = async () => {
    setIsRevealing(true);
    setShowConfirmDialog(false);

    try {
      const now = new Date().toISOString();
      let nftsToAnimate: MintedNFT[] = [];

      if (revealMode === "all") {
        // Get the NFTs that will be revealed for animation
        nftsToAnimate = nfts.filter(nft => !nft.is_revealed);

        // Reveal all unrevealed NFTs
        const { error: nftError } = await supabase
          .from("minted_nfts")
          .update({ is_revealed: true, revealed_at: now })
          .eq("collection_id", collectionId)
          .eq("is_revealed", false);

        if (nftError) throw nftError;

        // Mark collection as revealed
        const { error: collectionError } = await supabase
          .from("collections")
          .update({ is_revealed: true })
          .eq("id", collectionId);

        if (collectionError) throw collectionError;
      } else {
        // Get the NFTs that will be revealed for animation
        nftsToAnimate = nfts.filter(nft => selectedNfts.has(nft.id));

        // Reveal only selected NFTs
        const { error } = await supabase
          .from("minted_nfts")
          .update({ is_revealed: true, revealed_at: now })
          .in("id", Array.from(selectedNfts));

        if (error) throw error;

        // Check if all NFTs are now revealed
        const remainingUnrevealed = nfts.filter(
          nft => !nft.is_revealed && !selectedNfts.has(nft.id)
        ).length;

        if (remainingUnrevealed === 0) {
          await supabase
            .from("collections")
            .update({ is_revealed: true })
            .eq("id", collectionId);
        }

        setSelectedNfts(new Set());
      }

      // Show reveal animation
      if (nftsToAnimate.length > 0) {
        setRevealedNftsForAnimation(nftsToAnimate);
        setShowRevealAnimation(true);
      }

      await fetchNFTs();
      onRevealComplete();
    } catch (error) {
      console.error("Error revealing NFTs:", error);
      toast.error("Failed to reveal NFTs. Please try again.");
    } finally {
      setIsRevealing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Reveal Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Reveal Manager
          </CardTitle>
          <CardDescription>
            Reveal your collection's NFTs to show their final artwork
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No NFTs have been minted yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              NFTs will appear here after they are minted
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Reveal Manager
              </CardTitle>
              <CardDescription className="mt-1">
                Reveal your collection's NFTs to show their final artwork
              </CardDescription>
            </div>
            {isCollectionRevealed && (
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Collection Revealed
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Hidden-settings CM hint */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-blue-400">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              <span className="font-semibold">Candy Machine hidden-settings collection?</span>{" "}
              Use the <span className="font-medium">Candy Machine Manager → Reveal</span> tab to
              run the on-chain <code className="text-[10px]">updateCandyMachine</code> step first,
              then return here to mark items as revealed in the database.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{totalCount}</p>
              <p className="text-xs text-muted-foreground">Total Minted</p>
            </div>
            <div className="text-center p-4 bg-emerald-500/10 rounded-lg">
              <p className="text-2xl font-bold text-emerald-500">{revealedCount}</p>
              <p className="text-xs text-muted-foreground">Revealed</p>
            </div>
            <div className="text-center p-4 bg-amber-500/10 rounded-lg">
              <p className="text-2xl font-bold text-amber-500">{unrevealedCount}</p>
              <p className="text-xs text-muted-foreground">Unrevealed</p>
            </div>
          </div>

          {/* Unrevealed Image Preview */}
          {unrevealedImageUrl && unrevealedCount > 0 && (
            <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0">
                <img
                  src={unrevealedImageUrl}
                  alt="Unrevealed placeholder"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-medium text-sm">Unrevealed Image</p>
                <p className="text-xs text-muted-foreground">
                  This image is shown to collectors before reveal
                </p>
              </div>
            </div>
          )}

          {/* Theme Selector */}
          {unrevealedCount > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Reveal Animation Theme</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {REVEAL_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setSelectedTheme(theme.id)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${selectedTheme === theme.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={selectedTheme === theme.id ? "text-primary" : "text-muted-foreground"}>
                        {theme.icon}
                      </span>
                      <span className="font-medium text-sm">{theme.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{theme.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled Reveal Section */}
          {unrevealedCount > 0 && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <p className="font-medium text-sm">Scheduled Reveal</p>
                </div>
                {localScheduledAt && (
                  <Badge variant="outline" className="text-primary border-primary/30">
                    <Calendar className="w-3 h-3 mr-1" />
                    Scheduled
                  </Badge>
                )}
              </div>

              {localScheduledAt ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">
                      Auto-reveal scheduled for{" "}
                      <span className="font-medium text-primary">
                        {!isNaN(new Date(localScheduledAt).getTime())
                          ? format(parseISO(localScheduledAt), "MMM d, yyyy 'at' h:mm a")
                          : "Invalid Date"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      All unrevealed NFTs will be revealed automatically
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelSchedule}
                    disabled={isSavingSchedule}
                    className="text-destructive hover:text-destructive"
                  >
                    {isSavingSchedule ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ) : showScheduleForm ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="schedule-date" className="text-xs">Date</Label>
                      <Input
                        id="schedule-date"
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        min={format(new Date(), "yyyy-MM-dd")}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="schedule-time" className="text-xs">Time</Label>
                      <Input
                        id="schedule-time"
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveSchedule}
                      disabled={!scheduleDate || !scheduleTime || isSavingSchedule}
                    >
                      {isSavingSchedule ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Clock className="w-4 h-4 mr-2" />
                      )}
                      Schedule Reveal
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowScheduleForm(false)}
                      disabled={isSavingSchedule}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowScheduleForm(true)}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Schedule Auto-Reveal
                </Button>
              )}
            </div>
          )}

          {/* Actions */}
          {unrevealedCount > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleRevealAll}
                disabled={isRevealing}
                className="flex-1 sm:flex-none"
              >
                {isRevealing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Reveal All ({unrevealedCount})
              </Button>
              <Button
                variant="outline"
                onClick={handleRevealSelected}
                disabled={isRevealing || selectedNfts.size === 0}
                className="flex-1 sm:flex-none"
              >
                <Eye className="w-4 h-4 mr-2" />
                Reveal Selected ({selectedNfts.size})
              </Button>
            </div>
          )}

          {/* NFT Selection Grid */}
          {unrevealedCount > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Select NFTs to Reveal</p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAllUnrevealed}
                    disabled={selectedNfts.size === unrevealedCount}
                  >
                    Select All Unrevealed
                  </Button>
                  {selectedNfts.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeselectAll}
                    >
                      Deselect All
                    </Button>
                  )}
                </div>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg p-3">
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {nfts.map((nft) => (
                    <div
                      key={nft.id}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${nft.is_revealed
                          ? "border-emerald-500/50 opacity-60"
                          : selectedNfts.has(nft.id)
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/50"
                        }`}
                      onClick={() => !nft.is_revealed && handleSelectNft(nft.id)}
                    >
                      <img
                        src={nft.is_revealed ? nft.image_url || unrevealedImageUrl : unrevealedImageUrl || nft.image_url}
                        alt={nft.name || `#${nft.token_id}`}
                        className="w-full h-full object-cover"
                      />

                      {/* Selection Checkbox */}
                      {!nft.is_revealed && (
                        <div className="absolute top-1 left-1">
                          <Checkbox
                            checked={selectedNfts.has(nft.id)}
                            onCheckedChange={() => handleSelectNft(nft.id)}
                            className="bg-background/80"
                          />
                        </div>
                      )}

                      {/* Revealed Badge */}
                      {nft.is_revealed && (
                        <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                          <Eye className="w-4 h-4 text-emerald-500" />
                        </div>
                      )}

                      {/* Token ID */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                        <p className="text-[10px] text-white text-center">
                          #{nft.token_id}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* All Revealed State */}
          {unrevealedCount === 0 && totalCount > 0 && (
            <div className="text-center py-8 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-4" />
              <p className="font-medium text-emerald-500">All NFTs Revealed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                All {totalCount} NFTs in this collection have been revealed
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Reveal</AlertDialogTitle>
            <AlertDialogDescription>
              {revealMode === "all" ? (
                <>
                  You are about to reveal <strong>all {unrevealedCount} unrevealed NFTs</strong> in {collectionName}.
                  This action cannot be undone. The final artwork will be visible to all collectors.
                </>
              ) : (
                <>
                  You are about to reveal <strong>{selectedNfts.size} selected NFT(s)</strong> in {collectionName}.
                  This action cannot be undone. The final artwork will be visible to all collectors.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeReveal}>
              <Sparkles className="w-4 h-4 mr-2" />
              Reveal NFTs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reveal Animation */}
      <NFTRevealAnimation
        open={showRevealAnimation}
        onOpenChange={setShowRevealAnimation}
        nfts={revealedNftsForAnimation}
        unrevealedImage={unrevealedImageUrl}
        collectionName={collectionName}
        theme={selectedTheme}
      />
    </>
  );
}
