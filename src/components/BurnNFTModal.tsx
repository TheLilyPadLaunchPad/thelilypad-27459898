/**
 * BurnNFTModal — Permanently burn a Metaplex Core NFT or Bubblegum V2 cNFT.
 *
 * Flow:
 *  1. Detect asset standard via DAS (MplCoreAsset vs compressed leaf).
 *  2. Core → `burn()` from @metaplex-foundation/mpl-core.
 *     cNFT → `burnV2()` from @metaplex-foundation/mpl-bubblegum with the
 *     asset proof fetched via `getAssetWithProof()`.
 *  3. On success, delete the NFT row from Supabase so it disappears from
 *     "My NFTs" immediately.
 */

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, Loader2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { publicKey, some, Umi } from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { burn as coreBurn, fetchAssetV1, fetchCollectionV2 } from "@metaplex-foundation/mpl-core";
import { burnV2, getAssetWithProof, findTreeConfigPda } from "@metaplex-foundation/mpl-bubblegum";
import { setComputeUnitPrice } from "@metaplex-foundation/mpl-toolbox";
import { getDasUmi } from "@/utils/dasApi";
import { getSolanaRpcUrl } from "@/config/solana";
import { useWallet } from "@/providers/WalletProvider";
import { supabase } from "@/integrations/supabase/client";
import { createUmi } from "@/chains";
import { getErrorMessage } from "@/lib/errorUtils";

interface BurnNFTModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nft: {
        id: string;                 // DB row id (empty for pure on-chain NFTs)
        name: string | null;
        image_url: string | null;
        /** Asset mint/address on-chain. For DB rows this is collection.contract_address; for on-chain rows it's the asset id. */
        assetAddress: string | null;
        /** Core Collection address. Optional — Core burn works without it, just doesn't decrement `currentSize`. */
        collectionAddress?: string | null;
        source: "database" | "onchain";
    } | null;
    onBurnSuccess: () => void;
}

const CONFIRM_TEXT = "BURN";

export function BurnNFTModal({ open, onOpenChange, nft, onBurnSuccess }: BurnNFTModalProps) {
    const { network, getSolanaProvider } = useWallet();
    const [confirm, setConfirm] = useState("");
    const [isBurning, setIsBurning] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);

    const reset = () => {
        setConfirm("");
        setProgress(null);
    };

    const buildWalletUmi = async (): Promise<Umi> => {
        const provider = getSolanaProvider();
        if (!provider?.publicKey) throw new Error("Solana wallet not connected");
        const umi = await createUmi(network as "mainnet" | "devnet", null);
        const wallet = {
            publicKey: provider.publicKey,
            signTransaction: provider.signTransaction.bind(provider),
            signAllTransactions: provider.signAllTransactions.bind(provider),
            signMessage: provider.signMessage ? provider.signMessage.bind(provider) : undefined,
        };
        return umi.use(walletAdapterIdentity(wallet));
    };

    const handleBurn = async () => {
        if (!nft || !nft.assetAddress) {
            toast.error("This NFT has no on-chain address and can't be burned.");
            return;
        }
        if (confirm.trim().toUpperCase() !== CONFIRM_TEXT) {
            toast.error(`Type "${CONFIRM_TEXT}" to confirm.`);
            return;
        }

        setIsBurning(true);
        try {
            // ── Detect standard via DAS ─────────────────────────────────
            setProgress("Looking up asset…");
            const dasRpc = getSolanaRpcUrl(network as "mainnet" | "devnet");
            const dasUmi = getDasUmi(dasRpc);
            const asset = await (dasUmi.rpc as any).getAsset(publicKey(nft.assetAddress));
            const isCompressed = asset.compression?.compressed === true;
            const isCoreAsset = asset.interface === "MplCoreAsset";

            const umi = await buildWalletUmi();

            if (isCoreAsset) {
                // ── Standard Core NFT burn ──────────────────────────────
                setProgress("Burning Core NFT…");
                const assetV1 = await fetchAssetV1(umi, publicKey(nft.assetAddress));
                let builder = coreBurn(umi, {
                    asset: assetV1,
                    // If a Core collection is linked, pass it so currentSize decrements.
                    collection: nft.collectionAddress
                        ? await fetchCollectionV2(umi, publicKey(nft.collectionAddress)).catch(() => undefined)
                        : undefined,
                }).add(setComputeUnitPrice(umi, { microLamports: 50_000 }));

                await builder.sendAndConfirm(umi, {
                    send: { skipPreflight: false },
                    confirm: { commitment: "confirmed" },
                });
            } else if (isCompressed) {
                // ── Bubblegum V2 cNFT burn ──────────────────────────────
                setProgress("Fetching merkle proof…");
                const assetWithProof = await getAssetWithProof(
                    dasUmi as any,
                    publicKey(nft.assetAddress),
                    { truncateCanopy: true },
                );
                setProgress("Burning compressed NFT…");

                const coreCollection = nft.collectionAddress
                    ? publicKey(nft.collectionAddress)
                    : undefined;

                const builder = burnV2(umi, {
                    ...assetWithProof,
                    leafOwner: umi.identity.publicKey,
                    coreCollection,
                    treeConfig: findTreeConfigPda(umi, { merkleTree: assetWithProof.merkleTree }),
                }).add(setComputeUnitPrice(umi, { microLamports: 50_000 }));

                await builder.sendAndConfirm(umi, {
                    send: { skipPreflight: false },
                    confirm: { commitment: "confirmed" },
                });
            } else {
                throw new Error(
                    `Unsupported asset standard "${asset.interface}". Only Core NFTs and Bubblegum V2 cNFTs can be burned here.`,
                );
            }

            // ── Remove DB row (if any) ──────────────────────────────────
            if (nft.source === "database" && nft.id) {
                setProgress("Cleaning up…");
                const { error: dbErr } = await supabase
                    .from("minted_nfts")
                    .delete()
                    .eq("id", nft.id);
                if (dbErr) {
                    console.warn("DB delete failed after burn:", dbErr);
                    toast.warning("Burned on-chain, but local record will refresh on next load.");
                }
            }

            toast.success(`${nft.name || "NFT"} burned.`);
            onBurnSuccess();
            onOpenChange(false);
            reset();
        } catch (err) {
            console.error("Burn failed:", err);
            toast.error(getErrorMessage(err) || "Failed to burn NFT.");
        } finally {
            setIsBurning(false);
            setProgress(null);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!isBurning) {
                    onOpenChange(o);
                    if (!o) reset();
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Flame className="w-5 h-5 text-destructive" />
                        Burn NFT
                    </DialogTitle>
                    <DialogDescription>
                        Permanently destroy this NFT. This action is <b>irreversible</b> —
                        once burned, the asset account is closed and the token cannot be
                        recovered.
                    </DialogDescription>
                </DialogHeader>

                {nft && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40">
                        <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
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
                        <div className="min-w-0">
                            <p className="font-medium truncate">{nft.name || "Unnamed NFT"}</p>
                            {nft.assetAddress && (
                                <p className="text-xs text-muted-foreground truncate font-mono">
                                    {nft.assetAddress}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        You'll receive the account's rent back, but the NFT itself is gone
                        forever. Active listings or raffles referencing this NFT should be
                        cancelled first.
                    </AlertDescription>
                </Alert>

                <div className="space-y-2">
                    <Label htmlFor="burn-confirm">
                        Type <span className="font-mono font-bold">{CONFIRM_TEXT}</span> to confirm
                    </Label>
                    <Input
                        id="burn-confirm"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={CONFIRM_TEXT}
                        disabled={isBurning}
                        autoComplete="off"
                    />
                </div>

                {progress && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {progress}
                    </p>
                )}

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isBurning}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleBurn}
                        disabled={isBurning || confirm.trim().toUpperCase() !== CONFIRM_TEXT}
                    >
                        {isBurning ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Flame className="w-4 h-4 mr-2" />
                        )}
                        Burn NFT
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default BurnNFTModal;
