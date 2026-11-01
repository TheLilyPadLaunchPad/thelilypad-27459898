import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { TipModal } from "./TipModal";
import { useStreamerWallet } from "@/hooks/useStreamerWallet";
import { toast } from "@/hooks/use-toast";

interface TipButtonProps {
  streamerId: string;
  streamerName: string;
  streamId?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export const TipButton: React.FC<TipButtonProps> = ({
  streamerId,
  streamerName,
  streamId,
  variant = "default",
  size = "default",
  className,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { fetchWalletAddress, isLoading } = useStreamerWallet();

  const handleOpenTipModal = async () => {
    setWalletAddress(null);
    try {
      const result = await fetchWalletAddress(streamerId);
      setWalletAddress(result.wallet_address);
      setIsModalOpen(true);
    } catch (error) {
      toast({
        title: "Cannot tip",
        description: error instanceof Error ? error.message : "Unable to load the streamer’s tip wallet. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleOpenTipModal}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Heart className="w-4 h-4 mr-2" />
        )}
        Tip
      </Button>

      {walletAddress && (
        <TipModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          streamerAddress={walletAddress}
          streamerName={streamerName}
          streamerId={streamerId}
          streamId={streamId}
        />
      )}
    </>
  );
};
