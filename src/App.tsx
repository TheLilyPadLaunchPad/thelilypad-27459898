import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WalletProvider, useWallet } from "@/providers/WalletProvider";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { ChainProvider } from "@/providers/ChainProvider";
import { useIsAdmin } from "@/hooks/useIsAdmin";

import ErrorBoundary from "@/components/ErrorBoundary";
import NetworkStatusIndicator from "@/components/NetworkStatusIndicator";
import { AudioPlayerProvider } from "./providers/AudioPlayerProvider";
import { IpfsProvider } from "./providers/IpfsProvider";
import { MiniPlayer } from "./components/music/MiniPlayer";
import { MobileBottomNav } from "./components/MobileBottomNav";
import FrogLoader from "./components/FrogLoader";
import ProtectedRoute from "./components/ProtectedRoute";
import { PWAUpdateNotification } from "./components/PWAUpdateNotification";
import { AdminToolbar } from "./components/admin/AdminToolbar";
import { DevConsole } from "./components/admin/DevConsole";
import { DeploymentDebugPanel } from "./components/launchpad/DeploymentDebugPanel";
import { setupGlobalErrorHandlers } from "./lib/errorLogging";

// Lazy load ALL pages to reduce initial bundle and improve FID
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Auth guard for auth page - redirects to home if already connected
const AuthPageGuard = () => {
  const { isConnected, isConnecting } = useWallet();

  if (isConnecting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FrogLoader size="lg" />
      </div>
    );
  }

  if (isConnected) {
    return <Navigate to="/" replace />;
  }

  return <Auth />;
};

/**
 * AdminRoute — waits for the isAdmin async check to resolve before rendering.
 * Prevents the flash of admin UI that occurs when AdminDashboard redirects
 * non-admins after its own useIsAdmin hook settles.
 */
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FrogLoader size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Lazy load non-critical pages for better initial bundle size
const WalletProfile = lazy(() => import("./pages/WalletProfile"));
const Streams = lazy(() => import("./pages/Streams"));
const Streamers = lazy(() => import("./pages/Streamers"));
const GoLive = lazy(() => import("./pages/GoLive"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DonorProfile = lazy(() => import("./pages/DonorProfile"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminBuyback = lazy(() => import("./pages/admin/AdminBuyback"));

// Profile pages
const ProfileSuspended = lazy(() => import("./pages/ProfileSuspended"));
const StreamerProfile = lazy(() => import("./pages/StreamerProfile"));
const StreamerCollections = lazy(() => import("./pages/StreamerCollections"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const Following = lazy(() => import("./pages/Following"));
const ClipViewer = lazy(() => import("./pages/ClipViewer"));
const Moderation = lazy(() => import("./pages/Moderation"));
const Launchpad = lazy(() => import("./pages/Launchpad"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const StickerPackDetail = lazy(() => import("./pages/StickerPackDetail"));
const CreatorStickerPacks = lazy(() => import("./pages/CreatorStickerPacks"));
const ChannelEmotes = lazy(() => import("./pages/ChannelEmotes"));
const CollectionDetail = lazy(() => import("./pages/CollectionDetail"));
const Watch = lazy(() => import("./pages/Watch"));
const MyNFTs = lazy(() => import("./pages/MyNFTs"));
const FeesAndPricing = lazy(() => import("./pages/FeesAndPricing"));
const BuybackProgram = lazy(() => import("./pages/BuybackProgram"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const OfficialPacks = lazy(() => import("./pages/OfficialPacks"));
const MyPurchases = lazy(() => import("./pages/MyPurchases"));
const MusicStore = lazy(() => import("./pages/MusicStore"));
const ArtistProfile = lazy(() => import("./pages/ArtistProfile"));
const Raffles = lazy(() => import("./pages/Raffles"));
const BlindBoxes = lazy(() => import("./pages/BlindBoxes"));
// (ProfileSuspended already imported above at line 81)
const ProfileTypeSelection = lazy(() => import("./pages/ProfileTypeSelection"));
const LimitedEditionMint = lazy(() => import("./pages/LimitedEditionMint"));
const ReadyTrade = lazy(() => import("./pages/ReadyTrade"));
const CreateCollectionPage = lazy(() => import("./pages/LaunchpadCreate"));
const ArtGenerator = lazy(() => import("./pages/ArtGenerator"));
const CreatorApply = lazy(() => import("./pages/CreatorApply"));
const InterviewRoom = lazy(() => import("./pages/InterviewRoom"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const XRPLEasyGenerator = lazy(() => import("./pages/XRPLEasyGenerator"));
const WaitRoom = lazy(() => import("./pages/WaitRoom"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const StreamerApply = lazy(() => import("./pages/StreamerApply"));
const Earnings = lazy(() => import("./pages/Earnings"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <FrogLoader size="lg" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // 1 minute
      gcTime: 300000, // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Set up global error handlers once
setupGlobalErrorHandlers();

const AppContent = () => {
  const { isAdmin } = useIsAdmin();
  const { state } = useAuth();
  const isFullyAuthenticated = state === "AUTHENTICATED";

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/auth" element={<AuthPageGuard />} />
          <Route path="/auth/callback" element={<Suspense fallback={<PageLoader />}><AuthCallback /></Suspense>} />
          <Route path="/profile-setup" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ProfileTypeSelection /></Suspense></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><WalletProfile /></ProtectedRoute>} />
          <Route path="/streams" element={<ProtectedRoute><Streams /></ProtectedRoute>} />
          <Route path="/streamers" element={<ProtectedRoute><Streamers /></ProtectedRoute>} />
          <Route path="/go-live" element={<ProtectedRoute><GoLive /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/earnings" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Earnings /></Suspense></ProtectedRoute>} />
          <Route path="/donor-profile" element={<ProtectedRoute><DonorProfile /></ProtectedRoute>} />
          <Route path="/streamer/:streamerId" element={<ProtectedRoute><StreamerProfile /></ProtectedRoute>} />
          <Route path="/streamer/:streamerId/collections" element={<ProtectedRoute><StreamerCollections /></ProtectedRoute>} />
          <Route path="/edit-profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
          <Route path="/following" element={<ProtectedRoute><Following /></ProtectedRoute>} />
          <Route path="/clip/:clipId" element={<ProtectedRoute><ClipViewer /></ProtectedRoute>} />
          <Route path="/moderation" element={<ProtectedRoute><Moderation /></ProtectedRoute>} />
          <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
          <Route path="/marketplace/sticker/:packId" element={<ProtectedRoute><StickerPackDetail /></ProtectedRoute>} />
          <Route path="/my-sticker-packs" element={<ProtectedRoute><CreatorStickerPacks /></ProtectedRoute>} />
          <Route path="/channel-emotes" element={<ProtectedRoute><ChannelEmotes /></ProtectedRoute>} />
          <Route path="/launchpad" element={<ProtectedRoute><Launchpad /></ProtectedRoute>} />
          <Route path="/launchpad/:collectionId" element={<ProtectedRoute><CollectionDetail /></ProtectedRoute>} />
          <Route path="/collection/:collectionId" element={<CollectionDetail />} />
          <Route path="/my-nfts" element={<ProtectedRoute><MyNFTs /></ProtectedRoute>} />
          <Route path="/watch/:playbackId" element={<ProtectedRoute><Watch /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
          <Route path="/admin/buyback" element={<ProtectedRoute><AdminRoute><AdminBuyback /></AdminRoute></ProtectedRoute>} />
          <Route path="/fees" element={<ProtectedRoute><FeesAndPricing /></ProtectedRoute>} />
          <Route path="/buyback-program" element={<ProtectedRoute><BuybackProgram /></ProtectedRoute>} />
          <Route path="/official-packs" element={<ProtectedRoute><OfficialPacks /></ProtectedRoute>} />
          <Route path="/my-purchases" element={<ProtectedRoute><MyPurchases /></ProtectedRoute>} />
          <Route path="/music-store" element={<ProtectedRoute><MusicStore /></ProtectedRoute>} />
          <Route path="/artist/:artistAddress" element={<ProtectedRoute><ArtistProfile /></ProtectedRoute>} />
          <Route path="/raffles" element={<ProtectedRoute><Raffles /></ProtectedRoute>} />
          <Route path="/blind-boxes" element={<ProtectedRoute><BlindBoxes /></ProtectedRoute>} />
          <Route path="/profile-suspended" element={<ProfileSuspended />} />
          <Route path="/limited-edition" element={<ProtectedRoute><LimitedEditionMint /></ProtectedRoute>} />
          <Route path="/ready-trade" element={<ProtectedRoute><ReadyTrade /></ProtectedRoute>} />
          <Route path="/launchpad/create/:chain" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CreateCollectionPage /></Suspense></ProtectedRoute>} />
          <Route path="/launchpad/create/:chain/:type" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CreateCollectionPage /></Suspense></ProtectedRoute>} />
          <Route path="/launchpad/art-generator" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ArtGenerator /></Suspense></ProtectedRoute>} />
          <Route path="/launchpad/xrpl-generator" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><XRPLEasyGenerator /></Suspense></ProtectedRoute>} />
          <Route path="/creator/apply" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CreatorApply /></Suspense></ProtectedRoute>} />
          <Route path="/interview/:applicationId" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InterviewRoom /></Suspense></ProtectedRoute>} />
          <Route path="/u/:identifier" element={<Suspense fallback={<PageLoader />}><PublicProfile /></Suspense>} />
          <Route path="/waitroom" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><WaitRoom /></Suspense></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Leaderboard /></Suspense></ProtectedRoute>} />
          <Route path="/streamer/apply" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><StreamerApply /></Suspense></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <MobileBottomNav />
      <MiniPlayer />
      <PWAUpdateNotification />
      <DeploymentDebugPanel />
      {/* Only render AdminToolbar once fully authenticated to prevent flash */}
      {isAdmin && isFullyAuthenticated && <AdminToolbar />}
      {isAdmin && isFullyAuthenticated && <DevConsole />}
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <ChainProvider>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <AuthProvider>
            <IpfsProvider>
              <AudioPlayerProvider>
                <TooltipProvider>
                  <NetworkStatusIndicator />
                  <Toaster />
                  <Sonner />
                  <AppContent />
                </TooltipProvider>
              </AudioPlayerProvider>
            </IpfsProvider>
          </AuthProvider>
        </WalletProvider>
      </QueryClientProvider>
    </ChainProvider>
  </ErrorBoundary>
);

export default App;
