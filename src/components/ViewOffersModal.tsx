/**
 * ViewOffersModal — thin Dialog wrapper around NFTOffersList so the owner can
 * see, accept, or reject incoming offers on one of their NFTs directly from
 * the My NFTs page.
 */

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, Image as ImageIcon } from "lucide-react";
import { NFTOffersList } from "@/components/NFTOffersList";

interface ViewOffersModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nft: {
        id: string;
        name: string | null;
        image_url: string | null;
    } | null;
    onAnyChange?: () => void;
}

export function ViewOffersModal({ open, onOpenChange, nft, onAnyChange }: ViewOffersModalProps) {
    if (!nft) return null;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-primary" />
                        Offers on {nft.name || "this NFT"}
                    </DialogTitle>
                    <DialogDescription>
                        Review and accept or reject standing offers from other users.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40">
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                        {nft.image_url ? (
                            <img
                                src={nft.image_url}
                                alt={nft.name || "NFT"}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        )}
                    </div>
                    <p className="font-medium truncate">{nft.name || "Unnamed NFT"}</p>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <NFTOffersList
                        nftId={nft.id}
                        isOwner
                        onOffersChange={onAnyChange}
                        onOfferAccepted={onAnyChange}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ViewOffersModal;
