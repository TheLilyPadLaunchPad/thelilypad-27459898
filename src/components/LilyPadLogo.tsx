import React from "react";
import { useSiteAsset } from "@/hooks/useSiteAsset";
import lilypadLogoAsset from "@/assets/lilypad-logo.png.asset.json";
const lilypadLogoFallback = lilypadLogoAsset.url;

interface LilyPadLogoProps {
  className?: string;
  size?: number;
}

export const LilyPadLogo: React.FC<LilyPadLogoProps> = ({ className = "", size = 80 }) => {
  // Fetch dynamic logo from site_assets, fallback to local asset
  const { assetUrl } = useSiteAsset('logo', lilypadLogoFallback);

  return (
    <img
      src={assetUrl || lilypadLogoFallback}
      alt="The Lily Pad"
      width={size}
      height={size}
      fetchPriority="high"
      className={className}
    />
  );
};
