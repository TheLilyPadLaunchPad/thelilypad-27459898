import { authUrl } from "@/lib/guestEntry";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Upload, Smile } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFeatureUnlock } from "@/hooks/useFeatureLocks";
import { Skeleton } from "@/components/ui/skeleton";

interface ChannelEmote {
  id: string;
  name: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

export default function ChannelEmotes() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [emotes, setEmotes] = useState<ChannelEmote[]>([]);
  const [loading, setLoading] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newEmoteName, setNewEmoteName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { 
    isUnlocked, 
    isLoading: featureLockLoading, 
    requiredFollowers,
    isFeatureEnabled,
    progress 
  } = useFeatureUnlock("channel_emotes", followerCount);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchEmotes();
      fetchFollowerCount();
    }
  }, [userId]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate(authUrl());
      return;
    }
    setUserId(user.id);
  };

  const fetchFollowerCount = async () => {
    if (!userId) return;
    const { count } = await supabase
      .from("followers")
      .select("*", { count: "exact", head: true })
      .eq("streamer_id", userId);
    setFollowerCount(count || 0);
  };

  const fetchEmotes = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("channel_emotes")
      .select("*")
      .eq("streamer_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load emotes");
    } else {
      setEmotes(data || []);
    }
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 512 * 1024) {
        toast.error("Emote must be under 512KB");
        return;
      }
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      if (!newEmoteName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setNewEmoteName(nameWithoutExt.toLowerCase().replace(/[^a-z0-9]/g, ""));
      }
    }
  };

  const handleCreateEmote = async () => {
    if (!userId || !selectedFile || !newEmoteName.trim()) {
      toast.error("Please provide a name and image");
      return;
    }

    const emoteName = newEmoteName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (emoteName.length < 2 || emoteName.length > 20) {
      toast.error("Emote name must be 2-20 characters (letters and numbers only)");
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${userId}/${emoteName}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("channel-emotes")
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("channel-emotes")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("channel_emotes")
        .insert({
          streamer_id: userId,
          name: emoteName,
          image_url: urlData.publicUrl,
        });

      if (insertError) throw insertError;

      toast.success("Emote created!");
      setIsCreateOpen(false);
      resetForm();
      fetchEmotes();
    } catch (error: any) {
      toast.error(error.message || "Failed to create emote");
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleActive = async (emote: ChannelEmote) => {
    const { error } = await supabase
      .from("channel_emotes")
      .update({ is_active: !emote.is_active })
      .eq("id", emote.id);

    if (error) {
      toast.error("Failed to update emote");
    } else {
      setEmotes(emotes.map(e => 
        e.id === emote.id ? { ...e, is_active: !e.is_active } : e
      ));
    }
  };

  const handleDeleteEmote = async (emoteId: string) => {
    const { error } = await supabase
      .from("channel_emotes")
      .delete()
      .eq("id", emoteId);

    if (error) {
      toast.error("Failed to delete emote");
    } else {
      toast.success("Emote deleted");
      setEmotes(emotes.filter(e => e.id !== emoteId));
    }
  };

  const resetForm = () => {
    setNewEmoteName("");
    setSelectedFile(null);
    setFilePreview(null);
  };

  if (featureLockLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-40 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Channel Emotes</h1>
            <p className="text-muted-foreground">
              Create custom emotes for your subscribers
            </p>
          </div>
          {isUnlocked && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Emote
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Emote</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="emoteName">Emote Name</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-muted-foreground">:</span>
                      <Input
                        id="emoteName"
                        value={newEmoteName}
                        onChange={(e) => setNewEmoteName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                        placeholder="poggers"
                        maxLength={20}
                      />
                      <span className="text-muted-foreground">:</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      2-20 characters, letters and numbers only
                    </p>
                  </div>

                  <div>
                    <Label>Emote Image</Label>
                    <div className="mt-1">
                      {filePreview ? (
                        <div className="flex items-center gap-4">
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="w-16 h-16 object-contain bg-muted rounded"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedFile(null);
                              setFilePreview(null);
                            }}
                          >
                            Change
                          </Button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                          <span className="text-sm text-muted-foreground">
                            Click to upload (max 512KB)
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                          />
                        </label>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Recommended: 112x112px, transparent PNG
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsCreateOpen(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateEmote}
                      disabled={isUploading || !selectedFile || !newEmoteName.trim()}
                    >
                      {isUploading ? "Creating..." : "Create Emote"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {!isUnlocked && isFeatureEnabled && (
          <Card className="mb-8">
            <CardContent className="py-8 text-center">
              <Smile className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                Unlock Channel Emotes
              </h2>
              <p className="text-muted-foreground mb-4">
                Reach {requiredFollowers} followers to create custom emotes for your subscribers
              </p>
              <div className="max-w-xs mx-auto">
                <div className="flex justify-between text-sm mb-1">
                  <span>{followerCount} followers</span>
                  <span>{requiredFollowers} needed</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(progress, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isUnlocked && (
          <>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="w-16 h-16 bg-muted rounded mx-auto mb-2" />
                      <div className="h-4 bg-muted rounded w-20 mx-auto" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : emotes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Smile className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No emotes yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first channel emote for your subscribers
                  </p>
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Emote
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {emotes.map((emote) => (
                  <Card key={emote.id} className={!emote.is_active ? "opacity-50" : ""}>
                    <CardContent className="p-4">
                      <img
                        src={emote.image_url}
                        alt={emote.name}
                        className="w-16 h-16 object-contain mx-auto mb-2"
                      />
                      <p className="text-center font-mono text-sm mb-3">
                        :{emote.name}:
                      </p>
                      <div className="flex items-center justify-between">
                        <Switch
                          checked={emote.is_active}
                          onCheckedChange={() => handleToggleActive(emote)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteEmote(emote.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
