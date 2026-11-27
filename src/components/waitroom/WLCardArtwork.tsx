import artwork from '@/assets/whitelist-lake-frog.png.asset.json';

export const whitelistArtworkUrl = artwork.url;

export function WLCardArtwork() {
  return <img src={whitelistArtworkUrl} alt="Original Lily Pad frog beside a mountain lake" className="block aspect-video w-full object-contain" />;
}