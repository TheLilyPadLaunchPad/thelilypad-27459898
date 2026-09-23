import { authUrl } from "@/lib/guestEntry";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { BrowserStreamPreview } from "@/components/streaming/BrowserStreamPreview";
import { PipOverlay } from "@/components/streaming/PipOverlay";
import { StreamControls } from "@/components/streaming/StreamControls";
import { useWebRTCStream, StreamSource, StreamQuality } from "@/hooks/useWebRTCStream";
import { useStreamPresence } from "@/hooks/useStreamPresence";
import { useAdaptiveStreamQuality } from "@/hooks/useAdaptiveStreamQuality";
import {
  Radio,
  Settings,
  Video,
  Monitor,
  ImagePlus,
  X,
  Camera,
  Users,
  Clock,
  Wifi,
  Loader2 as SpeedLoader,
  Activity,
  SwitchCamera
} from "lucide-react";
import { LiveChat } from "@/components/LiveChat";
import { useWallet } from "@/providers/WalletProvider";
import { useUserProfile } from "@/hooks/useUserProfile";

export default function GoLive() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isConnected, address } = useWallet();
  const { profile, loading: profileLoading } = useUserProfile();
  const [user, setUser] = useState<any>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Browser stream metadata
  const [browserStreamTitle, setBrowserStreamTitle] = useState("");
  const [browserStreamCategory, setBrowserStreamCategory] = useState("");
  const [browserStreamThumbnail, setBrowserStreamThumbnail] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [streamSource, setStreamSource] = useState<StreamSource>('camera');
  const [streamQuality, setStreamQuality] = useState<StreamQuality>('720p');
  const [recommendedQuality, setRecommendedQuality] = useState<StreamQuality | null>(null);
  const [internetSpeed, setInternetSpeed] = useState<number | null>(null);
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [autoAdjustQuality, setAutoAdjustQuality] = useState(true);
  const thumbnailInputRef = React.useRef<HTMLInputElement>(null);

  // WebRTC Browser Streaming
  const {
    isStreaming,
    isConnecting,
    isSwitchingSource,
    isSwitchingCamera,
    isPipEnabled,
    roomId,
    source: currentSource,
    cameraFacing,
    error: webrtcError,
    startStream,
    stopStream,
    switchSource,
    togglePip,
    flipCamera,
    hasMultipleCameras,
    getMediaStream,
    getPipStream,
    isScreenShareSupported,
  } = useWebRTCStream();

  // Handle quality change from adaptive quality hook
  const handleAdaptiveQualityChange = useCallback((newQuality: StreamQuality) => {
    setStreamQuality(newQuality);
  }, []);

  // Adaptive quality monitoring
  const { connectionStats, isMonitoring } = useAdaptiveStreamQuality({
    enabled: isStreaming && autoAdjustQuality,
    currentQuality: streamQuality,
    onQualityChange: handleAdaptiveQualityChange,
  });

  const [pipStream, setPipStream] = useState<MediaStream | null>(null);
  const [showFlipButton, setShowFlipButton] = useState(false);

  // Stream duration timer
  const [streamDuration, setStreamDuration] = useState(0);
  const streamStartTimeRef = useRef<number | null>(null);

  // Track viewer count for active stream
  const { viewerCount, isConnected: presenceConnected } = useStreamPresence(isStreaming ? roomId : undefined);

  // Check for multiple cameras on mount
  useEffect(() => {
    hasMultipleCameras().then(setShowFlipButton);
  }, [hasMultipleCameras]);

  // Stream duration timer effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isStreaming) {
      if (!streamStartTimeRef.current) {
        streamStartTimeRef.current = Date.now();
      }

      intervalId = setInterval(() => {
        if (streamStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - streamStartTimeRef.current) / 1000);
          setStreamDuration(elapsed);
        }
      }, 1000);
    } else {
      streamStartTimeRef.current = null;
      setStreamDuration(0);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming]);

  // Format duration as HH:MM:SS
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useSEO({
    title: "Go Live | The Lily Pad",
    description: "Start streaming on The Lily Pad. Stream directly from your browser."
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []); // Removed navigate dependency and redirect logic


  // Update media stream reference when streaming
  useEffect(() => {
    if (isStreaming) {
      setMediaStream(getMediaStream());
    } else {
      setMediaStream(null);
    }
  }, [isStreaming, getMediaStream]);

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Thumbnail must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setThumbnailFile(file);
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setBrowserStreamThumbnail(previewUrl);
  };

  const uploadThumbnail = async (): Promise<string | null> => {
    if (!thumbnailFile || !user) return null;

    setIsUploadingThumbnail(true);
    try {
      const fileExt = thumbnailFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('stream-thumbnails')
        .upload(fileName, thumbnailFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('stream-thumbnails')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Thumbnail upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload thumbnail",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const removeThumbnail = () => {
    if (browserStreamThumbnail) {
      URL.revokeObjectURL(browserStreamThumbnail);
    }
    setBrowserStreamThumbnail(null);
    setThumbnailFile(null);
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = '';
    }
  };

  // Internet speed test to recommend quality
  const testInternetSpeed = async () => {
    setIsTestingSpeed(true);
    try {
      // Use a small file to test download speed
      const testUrls = [
        'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
        'https://www.cloudflare.com/favicon.ico',
      ];

      let totalSpeed = 0;
      let successfulTests = 0;

      for (const url of testUrls) {
        try {
          const startTime = performance.now();
          const response = await fetch(url + '?t=' + Date.now(), {
            mode: 'no-cors',
            cache: 'no-store'
          });
          const endTime = performance.now();

          // Estimate based on typical file sizes and time
          const estimatedSizeKB = 15;
          const timeSeconds = (endTime - startTime) / 1000;
          const speedMbps = (estimatedSizeKB * 8) / (timeSeconds * 1000);

          totalSpeed += speedMbps;
          successfulTests++;
        } catch {
          // Individual test failed, continue with others
        }
      }

      // If fetch tests fail, use Navigation Timing API as fallback
      if (successfulTests === 0) {
        const connection = (navigator as any).connection;
        if (connection?.downlink) {
          totalSpeed = connection.downlink;
          successfulTests = 1;
        }
      }

      if (successfulTests > 0) {
        const avgSpeed = totalSpeed / successfulTests;
        setInternetSpeed(Math.round(avgSpeed * 10) / 10);

        // Recommend quality based on estimated upload speed
        let recommended: StreamQuality;
        if (avgSpeed >= 25) {
          recommended = '1080p';
        } else if (avgSpeed >= 10) {
          recommended = '720p';
        } else {
          recommended = '480p';
        }

        setRecommendedQuality(recommended);
        setStreamQuality(recommended);

        toast({
          title: "Speed test complete",
          description: `Detected ~${Math.round(avgSpeed)} Mbps. Recommended: ${recommended}`,
        });
      } else {
        toast({
          title: "Speed test inconclusive",
          description: "Could not determine speed. Defaulting to 720p.",
          variant: "destructive",
        });
        setRecommendedQuality('720p');
      }
    } catch (error) {
      console.error('Speed test error:', error);
      toast({
        title: "Speed test failed",
        description: "Using default quality (720p)",
        variant: "destructive",
      });
    } finally {
      setIsTestingSpeed(false);
    }
  };

  const handleBrowserStreamStart = async () => {
    if (!browserStreamTitle.trim()) {
      toast({
        title: "Stream title required",
        description: "Please enter a title for your stream",
        variant: "destructive",
      });
      return;
    }

    // Upload thumbnail if selected
    let thumbnailUrl: string | undefined;
    if (thumbnailFile) {
      const uploadedUrl = await uploadThumbnail();
      if (uploadedUrl) {
        thumbnailUrl = uploadedUrl;
      }
    }

    const result = await startStream({
      source: streamSource,
      quality: streamQuality,
      metadata: {
        title: browserStreamTitle.trim(),
        category: browserStreamCategory || undefined,
        thumbnailUrl,
      },
    });
    if (result) {
      setMediaStream(result.stream);
    }
  };

  const handleBrowserStreamStop = async () => {
    await stopStream();
    setMediaStream(null);
    setBrowserStreamTitle("");
    setBrowserStreamCategory("");
    setStreamSource('camera');
    setStreamQuality('720p');
    removeThumbnail();
  };

  if (!user && !isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
          <Card className="max-w-md w-full border-border/50 shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                <Activity className="w-6 h-6 text-yellow-500" />
              </div>
              <CardTitle>Authentication Required</CardTitle>
              <CardDescription>
                Streaming requires an active wallet connection. Please connect your wallet to start streaming.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={() => navigate(authUrl())} variant="default" className="w-full">
                Connect Wallet
              </Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>Retry Loading</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-3 sm:px-4 pt-20 sm:pt-24 pb-8 sm:pb-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Video className="h-8 w-8 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-bold">Go Live</h1>
            </div>
            <p className="text-muted-foreground">Stream directly from your browser</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview and Controls */}
            <div className="lg:col-span-2 space-y-6">
              {/* Stream Details Form */}
              {!isStreaming && (
                <Card className="glass-card border-border/50">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Settings className="w-5 h-5" />
                      Stream Details
                    </CardTitle>
                    <CardDescription>
                      Set your stream title and category before going live
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                    {/* Stream Source Selection */}
                    <div className="space-y-2">
                      <Label>Stream Source</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setStreamSource('camera')}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${streamSource === 'camera'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                            }`}
                        >
                          <Camera className="h-6 w-6" />
                          <span className="text-sm font-medium">Camera</span>
                          <span className="text-xs text-muted-foreground">Webcam + Mic</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => isScreenShareSupported && setStreamSource('screen')}
                          disabled={!isScreenShareSupported}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${!isScreenShareSupported
                            ? 'opacity-50 cursor-not-allowed border-border'
                            : streamSource === 'screen'
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                            }`}
                        >
                          <Monitor className="h-6 w-6" />
                          <span className="text-sm font-medium">Screen</span>
                          <span className="text-xs text-muted-foreground">
                            {isScreenShareSupported ? 'Screen Share + Mic' : 'Desktop only'}
                          </span>
                        </button>
                      </div>
                      {!isScreenShareSupported && (
                        <p className="text-xs text-muted-foreground">
                          Screen sharing is only available on desktop browsers.
                        </p>
                      )}
                    </div>

                    {/* Stream Quality Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Stream Quality</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={testInternetSpeed}
                          disabled={isTestingSpeed}
                          className="h-7 text-xs gap-1"
                        >
                          {isTestingSpeed ? (
                            <>
                              <SpeedLoader className="h-3 w-3 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <Wifi className="h-3 w-3" />
                              Test Speed
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Speed test result */}
                      {internetSpeed !== null && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                          <Wifi className="h-3 w-3" />
                          <span>~{internetSpeed} Mbps detected</span>
                          {recommendedQuality && (
                            <Badge variant="secondary" className="ml-auto text-xs">
                              {recommendedQuality} recommended
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setStreamQuality('480p')}
                          className={`relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${streamQuality === '480p'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                            }`}
                        >
                          {recommendedQuality === '480p' && (
                            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                              Best
                            </span>
                          )}
                          <span className="text-sm font-medium">480p</span>
                          <span className="text-xs text-muted-foreground">854×480</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setStreamQuality('720p')}
                          className={`relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${streamQuality === '720p'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                            }`}
                        >
                          {recommendedQuality === '720p' && (
                            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                              Best
                            </span>
                          )}
                          <span className="text-sm font-medium">720p HD</span>
                          <span className="text-xs text-muted-foreground">1280×720</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setStreamQuality('1080p')}
                          className={`relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${streamQuality === '1080p'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                            }`}
                        >
                          {recommendedQuality === '1080p' && (
                            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                              Best
                            </span>
                          )}
                          <span className="text-sm font-medium">1080p</span>
                          <span className="text-xs text-muted-foreground">1920×1080</span>
                        </button>
                      </div>

                      {/* Auto-adjust quality toggle */}
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium">Auto-adjust quality</span>
                            <p className="text-xs text-muted-foreground">
                              Automatically adjust based on connection
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={autoAdjustQuality}
                          onCheckedChange={setAutoAdjustQuality}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="stream-title">Stream Title *</Label>
                      <Input
                        id="stream-title"
                        placeholder="Enter a title for your stream..."
                        value={browserStreamTitle}
                        onChange={(e) => setBrowserStreamTitle(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stream-category">Category</Label>
                      <Select
                        value={browserStreamCategory}
                        onValueChange={setBrowserStreamCategory}
                      >
                        <SelectTrigger id="stream-category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Gaming">Gaming</SelectItem>
                          <SelectItem value="Art">Art</SelectItem>
                          <SelectItem value="Music">Music</SelectItem>
                          <SelectItem value="Just Chatting">Just Chatting</SelectItem>
                          <SelectItem value="NFTs">NFTs</SelectItem>
                          <SelectItem value="DeFi">DeFi</SelectItem>
                          <SelectItem value="Crypto News">Crypto News</SelectItem>
                          <SelectItem value="Education">Education</SelectItem>
                          <SelectItem value="IRL">IRL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Thumbnail Upload */}
                    <div className="space-y-2">
                      <Label>Stream Thumbnail</Label>
                      <input
                        ref={thumbnailInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleThumbnailSelect}
                        className="hidden"
                      />

                      {browserStreamThumbnail ? (
                        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
                          <img
                            src={browserStreamThumbnail}
                            alt="Stream thumbnail preview"
                            className="w-full h-full object-cover"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8"
                            onClick={removeThumbnail}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div
                          onClick={() => thumbnailInputRef.current?.click()}
                          className="w-full aspect-video rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer flex flex-col items-center justify-center gap-2 bg-muted/50 transition-colors"
                        >
                          <ImagePlus className="h-8 w-8 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Click to upload thumbnail</p>
                          <p className="text-xs text-muted-foreground">Recommended: 1280x720 (16:9)</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stream Preview */}
              <Card className="glass-card border-border/50">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Video className="w-5 h-5" />
                      {isStreaming ? browserStreamTitle || 'Live Stream' : 'Camera Preview'}
                    </CardTitle>
                    {isStreaming && (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-500 text-white">
                          <Radio className="w-3 h-3 mr-1 animate-pulse" />
                          LIVE
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {formatDuration(streamDuration)}
                        </Badge>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {presenceConnected ? viewerCount : '...'}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <CardDescription>
                    {isStreaming
                      ? `You're live${currentSource === 'screen' ? ' (Screen Share)' : ' (Camera)'}! ${browserStreamCategory ? `Category: ${browserStreamCategory}` : ''}`
                      : "Click 'Go Live' to start streaming from your camera."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                  <div className="relative">
                    <BrowserStreamPreview
                      stream={mediaStream}
                      isLive={isStreaming}
                      className="aspect-video"
                    />
                    {/* PiP Camera Overlay */}
                    <PipOverlay
                      stream={pipStream}
                      isVisible={isPipEnabled && currentSource === 'screen'}
                      onClose={async () => {
                        await togglePip();
                        setPipStream(null);
                      }}
                    />
                  </div>

                  {/* Source Switcher and Quality Stats - Only visible while streaming */}
                  {isStreaming && (
                    <div className="space-y-3">
                      {/* Connection Stats */}
                      {isMonitoring && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <Activity className="h-4 w-4 text-primary" />
                              <span className="text-xs font-medium">Quality:</span>
                              <Badge variant="outline" className="text-xs">
                                {streamQuality}
                              </Badge>
                            </div>
                            {connectionStats.rtt !== null && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Latency:</span>
                                <span className={`text-xs font-medium ${connectionStats.rtt < 100 ? 'text-green-500' :
                                  connectionStats.rtt < 300 ? 'text-yellow-500' : 'text-red-500'
                                  }`}>
                                  {Math.round(connectionStats.rtt)}ms
                                </span>
                              </div>
                            )}
                            {connectionStats.downlink !== null && (
                              <div className="flex items-center gap-1.5">
                                <Wifi className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {connectionStats.downlink} Mbps
                                </span>
                              </div>
                            )}
                          </div>
                          {autoAdjustQuality && (
                            <Badge variant="secondary" className="text-xs">
                              Auto-adjusting
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Source Switch Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={currentSource === 'camera' ? "default" : "outline"}
                          size="sm"
                          onClick={() => switchSource('camera')}
                          disabled={isSwitchingSource || currentSource === 'camera'}
                          className="gap-2"
                        >
                          <Camera className="h-4 w-4" />
                          Camera
                        </Button>
                        {isScreenShareSupported && (
                          <Button
                            variant={currentSource === 'screen' ? "default" : "outline"}
                            size="sm"
                            onClick={() => switchSource('screen')}
                            disabled={isSwitchingSource || currentSource === 'screen'}
                            className="gap-2"
                          >
                            <Monitor className="h-4 w-4" />
                            Screen
                          </Button>
                        )}
                        {currentSource === 'screen' && (
                          <Button
                            variant={isPipEnabled ? "default" : "outline"}
                            size="sm"
                            onClick={async () => {
                              await togglePip();
                              if (!isPipEnabled) {
                                setPipStream(getPipStream());
                              } else {
                                setPipStream(null);
                              }
                            }}
                            className="gap-2"
                          >
                            <Camera className="h-4 w-4" />
                            {isPipEnabled ? 'Hide Camera' : 'Show Camera'}
                          </Button>
                        )}
                        {showFlipButton && currentSource === 'camera' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={flipCamera}
                            disabled={isSwitchingCamera}
                            className="gap-2"
                          >
                            <SwitchCamera className="h-4 w-4" />
                            {isSwitchingCamera ? 'Switching...' : 'Flip Camera'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stream Controls */}
                  <StreamControls
                    isStreaming={isStreaming}
                    isConnecting={isConnecting || isUploadingThumbnail}
                    onStart={handleBrowserStreamStart}
                    onStop={handleBrowserStreamStop}
                    roomId={roomId}
                  />

                  {/* Show WebRTC error if any */}
                  {webrtcError && (
                    <p className="text-sm text-destructive">{webrtcError}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - Chat when live */}
            <div className="lg:col-span-1 space-y-6">
              {/* Chat placeholder when not streaming */}
              {!isStreaming && (
                <Card className="h-[400px] flex flex-col items-center justify-center glass-card border-border/50">
                  <Radio className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Chat will appear here<br />when you go live
                  </p>
                </Card>
              )}

              {/* Live Chat when streaming */}
              {isStreaming && roomId && (
                <Card className="h-[400px] flex flex-col glass-card border-border/50">
                  <CardHeader className="pb-2 p-4">
                    <CardTitle className="text-base">Live Chat</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 p-0 overflow-hidden">
                    <LiveChat playbackId={roomId} className="h-full" />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}