import React, { useState, useEffect } from "react";
import { ArrowLeft, Rocket } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import MistBackground from "@/components/ui/mist-background";
import { LaunchpadMintSection } from "@/components/launchpad/LaunchpadMintSection";
import { CollectionEditForm } from "@/components/launchpad/CollectionEditForm";
import { LaunchChecklist } from "@/components/launchpad/LaunchChecklist";
import { RevealManager } from "@/components/launchpad/RevealManager";
import { NFTGallery } from "@/components/NFTGallery";
import { PhaseConfigManager } from "@/components/launchpad/PhaseConfigManager";
import { CandyMachineManager } from "@/components/launchpad/CandyMachineManager";
import { CloseAndReclaimCard } from "@/components/launchpad/CloseAndReclaimCard";
import { ContractDeployModal } from "@/components/launchpad/ContractDeployModal";
import { ContractAllowlistManager } from "@/components/launchpad/ContractAllowlistManager";
import { RevealHistory } from "@/components/RevealHistory";
import { RarityLeaderboard } from "@/components/RarityLeaderboard";
import { CollectionAnalytics } from "@/components/CollectionAnalytics";
import { BuybackProgramInfo } from "@/components/BuybackProgramInfo";
import { NFTRevealModal } from "@/components/NFTRevealModal";
import { BuybackAllocationModal } from "@/components/modals/BuybackAllocationModal";
import { useCollectionDetail } from "@/components/collection-detail/useCollectionDetail";
import { useSEO } from "@/hooks/useSEO";
import { getExplorerUrl } from "@/config/chains";

// Section Components
import { CollectionHero } from "@/components/collection-detail/CollectionHero";
import { CollectionAboutCard } from "@/components/collection-detail/CollectionAboutCard";
import { CollectionPhasesCard } from "@/components/collection-detail/CollectionPhasesCard";
import { CollectionSupplyCard } from "@/components/collection-detail/CollectionSupplyCard";
import { CollectionMintCard } from "@/components/collection-detail/CollectionMintCard";

export default function CollectionDetail() {
  const {
    collection,
    isLoading,
    isConnected,
    address,
    mintQuantity,
    setMintQuantity,
    activePhase,
    setActivePhase,
    isRefreshing,
    copied,
    isEditMode,
    setIsEditMode,
    isPreviewMode,
    setIsPreviewMode,
    isAllowlistModalOpen,
    setIsAllowlistModalOpen,
    showRevealModal,
    setShowRevealModal,
    revealedNfts,
    revealTxHash,
    isDeployModalOpen,
    setIsDeployModalOpen,
    isMinting,
    isLivePolling,
    lastUpdated,
    // Derived
    collectionChain,
    collectionNetwork,
    isCollectionTestnet,
    collectionExplorerUrl,
    currency,
    isCreator,
    isSolana,
    totalSupply,
    liveSupply,
    userBalance,
    phases,
    isLive,
    isWhitelisted,
    // Actions
    fetchCollection,
    handleRefreshSupply,
    handleCopyAddress,
    handleConnectWallet,
    handleMint,
  } = useCollectionDetail();

  const [isBuybackModalOpen, setIsBuybackModalOpen] = useState(false);

  useEffect(() => {
    if (isCreator && totalSupply > 0 && liveSupply >= totalSupply) {
      setIsBuybackModalOpen(true);
    }
  }, [isCreator, liveSupply, totalSupply]);

  useSEO({
    title: collection?.name ? `${collection.name} | The Lily Pad` : "NFT Collection | The Lily Pad",
    description: collection?.description || "Mint NFTs from this collection on The Lily Pad. View phases, pricing, and mint progress.",
    ogType: "product",
    structuredData: collection
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: collection.name,
          description: collection.description || `Mint ${collection.name} on The Lily Pad.`,
          image: collection.image_url || collection.banner_url || undefined,
          brand: { "@type": "Brand", name: "The Lily Pad" },
          url: typeof window !== "undefined" ? window.location.href : undefined,
        }
      : undefined,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-background text-center">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12 flex flex-col items-center">
          <Rocket className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
          <h1 className="text-2xl font-bold mb-2">Collection Not Found</h1>
          <p className="text-muted-foreground mb-6">This collection doesn't exist or has been removed.</p>
          <Button onClick={() => window.history.back()} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </main>
      </div>
    );
  }

  if (isEditMode) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <Button variant="ghost" size="sm" onClick={() => setIsEditMode(false)} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Collection
          </Button>
          <CollectionEditForm
            collection={collection as any}
            onSave={() => {
              setIsEditMode(false);
              fetchCollection();
            }}
            onCancel={() => setIsEditMode(false)}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <MistBackground />
      <Navbar />

      <CollectionHero
        collection={collection as any}
        isCreator={!!isCreator}
        isPreviewMode={isPreviewMode}
        setIsPreviewMode={setIsPreviewMode}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        setIsDeployModalOpen={setIsDeployModalOpen}
        setIsAllowlistModalOpen={setIsAllowlistModalOpen}
        isCollectionTestnet={isCollectionTestnet}
        collectionNetwork={collectionNetwork}
        collectionExplorerUrl={collectionExplorerUrl}
        handleCopyAddress={handleCopyAddress}
        copied={copied}
      />

      <main className="container mx-auto px-4 relative z-10 pb-20">
        {/* L3AP-branded address badge */}
        {collection?.contract_address?.endsWith('L3AP') && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            🪷 L3AP-verified address
            <span className="font-mono text-[10px] opacity-70">…L3AP</span>
          </div>
        )}

        {/* Empty Candy Machine warning (creator only) */}
        {isCreator && (collection as any).candy_machine_address && totalSupply > 0 && Number((collection as any).items_loaded ?? 0) < totalSupply && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              ⚠️ Candy Machine has {Number((collection as any).items_loaded ?? 0)} / {totalSupply} items loaded
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your collection was deployed but the per-NFT items haven't been written on-chain yet. Mints will fail until items are loaded. Scroll down to <span className="font-medium">Candy Machine Manager → Insert Items → Auto-sync</span> to fix it in one click.
            </p>
          </div>
        )}


        {/* Intro/Mint Prelaunch Section */}
        {collection && (
          <LaunchpadMintSection
            collection={collection as any}
            phases={phases}
            onMintSuccess={fetchCollection}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Left Column: Details & Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Launch Checklist for creators */}
            {isCreator && !collection.contract_address && !isPreviewMode && (
              <LaunchChecklist
                collection={collection as any}
                onEditClick={() => setIsEditMode(true)}
                onDeployClick={() => setIsDeployModalOpen(true)}
                onAllowlistClick={() => setIsAllowlistModalOpen(true)}
              />
            )}

            {/* Reveal Manager for creators */}
            {isCreator && collection.contract_address && !isPreviewMode && collection.minted > 0 && (
              <RevealManager
                collectionId={collection.id}
                collectionName={collection.name}
                unrevealedImageUrl={collection.unrevealed_image_url}
                isCollectionRevealed={collection.is_revealed}
                scheduledRevealAt={collection.scheduled_reveal_at}
                onRevealComplete={fetchCollection}
              />
            )}

            {/* Collection Analytics Visualiser */}
            <CollectionAnalytics
              collectionId={collection.id}
              totalSupply={collection.total_supply}
              minted={collection.minted}
              currency={currency}
            />

            <BuybackProgramInfo collectionId={collection.id} currency={currency} />

            <CollectionAboutCard
              collection={collection as any}
              isCollectionTestnet={isCollectionTestnet}
              collectionNetwork={collectionNetwork}
            />

            <CollectionPhasesCard
              phases={phases}
              activePhase={activePhase}
              setActivePhase={setActivePhase}
              currency={currency}
            />

            <NFTGallery
              collectionId={collection.id}
              collectionName={collection.name}
              collectionImage={collection.image_url}
              unrevealedImage={collection.unrevealed_image_url}
              contractAddress={collection.contract_address}
              explorerUrl={collectionExplorerUrl}
              chain={collectionChain}
              isTestnet={isCollectionTestnet}
            />

            <RevealHistory collectionId={collection.id} collectionName={collection.name} />
            <RarityLeaderboard collectionId={collection.id} collectionName={collection.name} />
          </div>

          {/* Right Column: Interaction & Management */}
          <div className="space-y-6">
            {/* Admin Management Tools */}
            {isCreator && collection.contract_address && (
              <>
                <PhaseConfigManager
                  contractAddress={collection.contract_address}
                  phases={phases}
                  chain={collectionChain}
                  onConfigured={fetchCollection}
                />
                <CandyMachineManager
                  candyMachineAddress={(collection as any).candy_machine_address || collection.contract_address}
                  candyGuardAddress={(collection as any).candy_guard_address || undefined}
                  collectionAddress={(collection as any).collection_mint_address || collection.contract_address}
                  collectionId={collection.id}
                  collectionName={collection.name}
                  collectionWebsite={(collection as any).social_website || undefined}
                  artworks={Array.isArray((collection as any).artworks_metadata) ? (collection as any).artworks_metadata : null}
                  itemsLoaded={Number((collection as any).items_loaded ?? 0)}
                  manifestRoot={(collection as any).manifest_root || undefined}
                  itemsAvailable={totalSupply}
                  isCreator={!!isCreator}
                  onRefresh={fetchCollection}
                />


                <CloseAndReclaimCard
                  collectionId={collection.id}
                  chain={collectionChain}
                  candyMachineAddress={(collection as any).candy_machine_address}
                  candyGuardAddress={(collection as any).candy_guard_address}
                  minted={liveSupply}
                  totalSupply={totalSupply}
                  mintEndDate={(collection as any).mint_end_date}
                  closedAt={(collection as any).closed_at}
                  isCreator={!!isCreator}
                  onClosed={fetchCollection}
                />
              </>
            )}

            <CollectionSupplyCard
              liveSupply={liveSupply}
              totalSupply={totalSupply}
              isLivePolling={isLivePolling}
              isRefreshing={isRefreshing}
              handleRefreshSupply={handleRefreshSupply}
              lastUpdated={lastUpdated}
            />

            <CollectionMintCard
              activePhase={activePhase}
              phases={phases}
              setActivePhase={setActivePhase}
              mintQuantity={mintQuantity}
              setMintQuantity={setMintQuantity}
              handleMint={handleMint}
              isMinting={isMinting}
              isWalletConnected={!!isConnected}
              handleConnectWallet={handleConnectWallet}
              userBalance={userBalance}
              currency={currency}
              isLive={isLive}
              isWhitelisted={isWhitelisted}
              isTestnet={isCollectionTestnet}
              walletAddress={address}
            />
          </div>
        </div>
      </main>

      {/* Modals */}
      <NFTRevealModal
        open={showRevealModal}
        onOpenChange={setShowRevealModal}
        nfts={revealedNfts}
        txHash={revealTxHash}
        explorerUrl={getExplorerUrl(collectionChain, revealTxHash, 'tx', isCollectionTestnet ? 'testnet' : 'mainnet')}
        collectionName={collection.name}
      />

      <ContractDeployModal
        open={isDeployModalOpen}
        onOpenChange={setIsDeployModalOpen}
        collection={collection as any}
        onDeploySuccess={(addr) => {
          setIsDeployModalOpen(false);
          fetchCollection();
        }}
      />

      <ContractAllowlistManager
        open={isAllowlistModalOpen}
        onOpenChange={setIsAllowlistModalOpen}
        collectionId={collection.id}
        contractAddress={collection.contract_address || ""}
        creatorId={collection.creator_id}
        phases={phases}
      />

      {collection?.id && collection?.creator_id && (
        <BuybackAllocationModal
          open={isBuybackModalOpen}
          onOpenChange={setIsBuybackModalOpen}
          collectionId={collection.id}
          creatorId={collection.creator_id}
        />
      )}
    </div>
  );
}