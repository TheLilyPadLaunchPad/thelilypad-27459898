import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
    compositeNFTImage,
    compositeNFTImageToBlob,
    createReusableCanvas,
    estimateExportMemoryMB,
    nftToStandardMetadata,
    createZipStream,
    type GeneratedNFT,
    type NFTMetadata,
} from "@/lib/assetBundler";
import type { Layer } from "@/components/launchpad/LayerManager";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExportState {
    isExporting: boolean;
    exportProgress: number;
    exportStatus: string;
    isDownloadingAssets: boolean;
    downloadProgress: number;
    downloadStatus: string;
}

interface ExportOptions {
    collectionName: string;
    collectionDescription: string;
    outputResolution: number;
    layers: Layer[];
}

type GenerateNFTBatch = (count: number) => { nfts: GeneratedNFT[]; duplicatesAvoided: number };

// ── Memory-safe batch size ──────────────────────────────────────────────────
const BATCH_SIZE = 10;

// ── Hook ────────────────────────────────────────────────────────────────────

export function useNFTExport(
    opts: ExportOptions,
    generateNFTBatch: GenerateNFTBatch,
) {
    const { collectionName, collectionDescription, outputResolution, layers } = opts;

    // ── State ──────────────────────────────────────────────────────────────────
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState("");
    const [isDownloadingAssets, setIsDownloadingAssets] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadStatus, setDownloadStatus] = useState("");

    // ── Helpers ────────────────────────────────────────────────────────────────

    const hasImages = () => layers.some((l) => l.traits.some((t) => t.imageUrl));

    const nftToMetadata = (nft: GeneratedNFT, baseImageUri: string = ""): NFTMetadata => ({
        name: `${collectionName} #${nft.id}`,
        description: collectionDescription || `${collectionName} NFT #${nft.id}`,
        image: baseImageUri ? `${baseImageUri}/${nft.id}.png` : `ipfs://YOUR_CID/${nft.id}.png`,
        attributes: nft.traits.map((trait) => ({
            trait_type: trait.layerName,
            value: trait.traitName,
        })),
    });

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const safeName = () =>
        (collectionName || "collection").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    /**
     * Pre-flight memory advisory. Always returns true (never blocks).
     *
     * The streaming canvas approach (single reusable canvas + blob-per-item)
     * keeps real memory far below the theoretical estimate.  We only warn
     * users of very large exports so they can close other tabs.
     */
    const memoryCheck = (count: number, resolution: number): boolean => {
        const estimatedMB = estimateExportMemoryMB(count, resolution);
        if (estimatedMB > 3500) {
            toast.warning(
                `Very large export (~${Math.round(estimatedMB)} MB). ` +
                `Close other tabs and ensure enough disk space for best results.`,
                { duration: 8000 }
            );
        } else if (estimatedMB > 800) {
            toast.info(
                `Large export (~${Math.round(estimatedMB)} MB). Close other tabs for best performance.`,
                { duration: 5000 }
            );
        }
        return true;
    };

    // ── Export: Images + Metadata (JSON bundle) ────────────────────────────────

    const exportImagesWithMetadata = useCallback(async (exportCount: string) => {
        const count = Math.min(parseInt(exportCount) || 10, 100);
        if (!hasImages()) {
            toast.error("No images found. Add images to your traits first.");
            return;
        }

        setIsExporting(true);
        setExportProgress(0);
        setExportStatus("Generating NFTs...");

        try {
            const { nfts } = generateNFTBatch(count);
            const results: { id: number; imageDataUrl: string; metadata: NFTMetadata }[] = [];

            for (let i = 0; i < nfts.length; i++) {
                setExportStatus(`Compositing image ${i + 1} of ${count}...`);
                setExportProgress(((i + 1) / count) * 80);

                const imageDataUrl = await compositeNFTImage(nfts[i], outputResolution);
                if (imageDataUrl) {
                    results.push({
                        id: nfts[i].id,
                        imageDataUrl,
                        metadata: nftToMetadata(nfts[i]),
                    });
                }

                // Yield so React can flush progress bar updates
                await new Promise((r) => setTimeout(r, 0));
            }

            setExportProgress(90);
            setExportStatus("Packaging export...");

            const exportPackage = {
                collection: { name: collectionName, description: collectionDescription },
                nfts: results.map((r) => ({
                    id: r.id,
                    image: r.imageDataUrl,
                    metadata: r.metadata,
                })),
                generated_at: new Date().toISOString(),
                total: results.length,
            };

            const blob = new Blob([JSON.stringify(exportPackage, null, 2)], { type: "application/json" });
            downloadBlob(blob, `${safeName()}-full-export.json`);

            setExportProgress(100);
            setExportStatus("Complete!");
            toast.success(`Exported ${results.length} NFTs with images and metadata`);
        } catch (error: any) {
            console.error("Export failed:", error);
            toast.error(error?.message?.includes("memory") || error?.message?.includes("alloc")
                ? "Export ran out of memory. Try reducing the count or resolution."
                : "Export failed. Please try again.");
        } finally {
            setTimeout(() => {
                setIsExporting(false);
                setExportProgress(0);
                setExportStatus("");
            }, 1500);
        }
    }, [collectionName, collectionDescription, outputResolution, layers, generateNFTBatch]);

    // ── Download: Individual images ────────────────────────────────────────────

    const downloadIndividualImages = useCallback(async (exportCount: string) => {
        const count = Math.min(parseInt(exportCount) || 10, 20);
        if (!hasImages()) {
            toast.error("No images found. Add images to your traits first.");
            return;
        }

        setIsExporting(true);
        setExportProgress(0);
        setExportStatus("Generating images...");

        try {
            const { nfts } = generateNFTBatch(count);

            for (let i = 0; i < nfts.length; i++) {
                setExportStatus(`Downloading image ${i + 1} of ${count}...`);
                setExportProgress(((i + 1) / count) * 100);

                const imageDataUrl = await compositeNFTImage(nfts[i], outputResolution);
                if (imageDataUrl) {
                    const link = document.createElement("a");
                    link.download = `${safeName()}-${nfts[i].id}.png`;
                    link.href = imageDataUrl;
                    link.click();
                    await new Promise((r) => setTimeout(r, 300));
                }
            }

            toast.success(`Downloaded ${count} NFT images`);
        } catch (error: any) {
            console.error("Download failed:", error);
            toast.error("Download failed. Please try again.");
        } finally {
            setIsExporting(false);
            setExportProgress(0);
            setExportStatus("");
        }
    }, [collectionName, outputResolution, layers, generateNFTBatch]);

    // ── Export: Single metadata JSON ───────────────────────────────────────────

    const exportSingleMetadata = useCallback((nft: GeneratedNFT) => {
        const metadata = nftToMetadata(nft);
        const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${nft.id}.json`);
        toast.success(`Exported metadata for NFT #${nft.id}`);
    }, [collectionName, collectionDescription]);

    // ── Export: All metadata (bundled JSON) ────────────────────────────────────

    const exportAllMetadata = useCallback((exportCount: string, totalSupply: string) => {
        const count = parseInt(exportCount) || parseInt(totalSupply) || 100;
        const { nfts } = generateNFTBatch(count);
        const allMetadata = nfts.map((nft) => nftToMetadata(nft));

        const exportData = {
            name: collectionName,
            description: collectionDescription,
            total_supply: count,
            generated_at: new Date().toISOString(),
            metadata: allMetadata,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${safeName()}-metadata.json`);
        toast.success(`Exported ${count} NFT metadata files`);
    }, [collectionName, collectionDescription, generateNFTBatch]);

    // ── Export: Individual metadata files ──────────────────────────────────────

    const exportIndividualFiles = useCallback((exportCount: string, totalSupply: string) => {
        const count = parseInt(exportCount) || parseInt(totalSupply) || 100;
        const { nfts } = generateNFTBatch(count);

        const exportData = nfts.map((nft) => ({
            filename: `${nft.id}.json`,
            ...nftToMetadata(nft),
        }));

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${safeName()}-individual-metadata.json`);
        toast.success(`Exported ${count} individual metadata entries`);
    }, [collectionName, collectionDescription, generateNFTBatch]);

    // ── Export: ZIP (images + metadata) — MEMORY-SAFE ─────────────────────────

    const exportAsZip = useCallback(async (exportCount: string) => {
        const count = Math.min(parseInt(exportCount) || 100, 5000);
        if (!hasImages()) {
            toast.error("No images found. Add images to your traits first.");
            return;
        }
        if (!memoryCheck(count, outputResolution)) return;

        setIsExporting(true);
        setExportProgress(0);
        setExportStatus("Generating NFTs...");

        try {
            let zipStream;
            try {
                zipStream = await createZipStream(`${safeName()}-collection.zip`);
            } catch (err: any) {
                return; // user aborted file save
            }

            const { nfts } = generateNFTBatch(count);
            const { canvas, ctx } = createReusableCanvas(outputResolution);
            const encoder = new TextEncoder();

            for (let i = 0; i < nfts.length; i++) {
                setExportStatus(`Generating NFT ${i + 1} of ${count}...`);
                setExportProgress(((i + 1) / count) * 80);

                const blob = await compositeNFTImageToBlob(nfts[i], canvas, ctx);
                if (blob) {
                    const u8 = new Uint8Array(await blob.arrayBuffer());
                    zipStream.addFile(`images/${nfts[i].id}.png`, u8);
                }

                const metadata = {
                    name: `${collectionName} #${nfts[i].id}`,
                    description: collectionDescription || `${collectionName} NFT #${nfts[i].id}`,
                    image: `ipfs://YOUR_CID/${nfts[i].id}.png`,
                    attributes: nfts[i].traits.map((trait) => ({
                        trait_type: trait.layerName,
                        value: trait.traitName,
                    })),
                };

                zipStream.addFile(`metadata/${nfts[i].id}.json`, encoder.encode(JSON.stringify(metadata, null, 2)));

                // Yield every iteration so React can flush progress updates to the UI
                await new Promise((r) => setTimeout(r, 0));
            }

            zipStream.addFile("_collection.json", encoder.encode(JSON.stringify({
                name: collectionName,
                description: collectionDescription,
                total_supply: count,
                generated_at: new Date().toISOString(),
            }, null, 2)));

            setExportStatus("Creating ZIP file...");
            setExportProgress(90);

            const zipBlob = await zipStream.finish();
            if (zipBlob) {
                downloadBlob(zipBlob, `${safeName()}-collection.zip`);
            }

            setExportProgress(100);
            setExportStatus("Complete!");
            toast.success(`Exported ${count} NFTs as ZIP file`);
        } catch (error: any) {
            console.error("ZIP export failed:", error);
            const isOOM = error?.message?.includes("memory") || error?.message?.includes("alloc") || error?.name === "RangeError";
            toast.error(isOOM
                ? `Export ran out of memory at ${outputResolution}px. Try a lower resolution or fewer NFTs.`
                : "ZIP export failed. Please try again.");
        } finally {
            setTimeout(() => {
                setIsExporting(false);
                setExportProgress(0);
                setExportStatus("");
            }, 1500);
        }
    }, [collectionName, collectionDescription, outputResolution, layers, generateNFTBatch]);

    // ── Download: Generated assets ZIP (local only) — MEMORY-SAFE ─────────────

    const downloadGeneratedAssets = useCallback(async (exportCount: string) => {
        const count = Math.min(parseInt(exportCount) || 100, 10000);
        const resolution = outputResolution;
        if (!hasImages()) {
            toast.error("No images found. Add images to your traits first.");
            return;
        }
        if (!memoryCheck(count, resolution)) return;

        setIsDownloadingAssets(true);
        setDownloadProgress(0);
        setDownloadStatus(`Generating ${count} NFTs...`);

        try {
            const { nfts } = generateNFTBatch(count);
            let zipStream;
            try {
                zipStream = await createZipStream(`${safeName()}-${count}nfts-${resolution}px.zip`);
            } catch (err: any) {
                return; // user aborted
            }

            // Reuse a single canvas — prevents OOM from canvas allocation
            const { canvas, ctx } = createReusableCanvas(resolution);
            const encoder = new TextEncoder();

            for (let i = 0; i < nfts.length; i++) {
                setDownloadStatus(`Rendering NFT ${i + 1} of ${count}...`);
                setDownloadProgress(((i + 1) / count) * 70);

                const blob = await compositeNFTImageToBlob(nfts[i], canvas, ctx);
                if (blob) {
                    const u8 = new Uint8Array(await blob.arrayBuffer());
                    zipStream.addFile(`images/${nfts[i].id}.png`, u8);
                }

                const metadata = nftToStandardMetadata(nfts[i], collectionName, collectionDescription);

                zipStream.addFile(`metadata/${nfts[i].id}.json`, encoder.encode(JSON.stringify(metadata, null, 2)));

                // Yield every iteration so React can flush progress updates to the UI
                await new Promise((r) => setTimeout(r, 0));
            }

            setDownloadStatus("Packaging ZIP...");
            setDownloadProgress(85);

            zipStream.addFile("_collection.json", encoder.encode(JSON.stringify({
                name: collectionName,
                total_supply: count,
                resolution: `${resolution}x${resolution}`,
                exported_at: new Date().toISOString(),
                source: "The Lily Pad — https://thelilypad.io",
                note: "Replace 'YOUR_IMAGE_CID' in metadata files with your actual IPFS CID after uploading the images/ folder. Preview via https://cloudflare-ipfs.com/ipfs/<CID>",
            }, null, 2)));

            const readme = `${collectionName || "Collection"} — NFT Collection Assets\n${"━".repeat(44)}\n\nCONTENTS\n  images/      ${count} rendered NFT images at ${resolution}x${resolution}px\n  metadata/    ${count} JSON metadata files\n\nHOW TO LAUNCH ON ANOTHER LAUNCHPAD\n${"━".repeat(36)}\n1. Upload the images/ folder to IPFS (web3.storage, Filebase, or \`ipfs add\`)\n2. Copy the resulting folder CID\n3. In each metadata JSON, replace:\n   "image": "ipfs://YOUR_IMAGE_CID/N.png"\n   with your real CID, e.g. "image": "ipfs://bafybeif.../N.png"\n4. Upload the updated metadata/ folder to IPFS\n5. Use that metadata CID as your baseUri / baseURI\n\nIPFS GATEWAY (preview your files via HTTP)\n   https://cloudflare-ipfs.com/ipfs/<YOUR_CID>\n   https://cloudflare-ipfs.com/ipfs/<YOUR_CID>/0.png\n\nGenerated: ${new Date().toUTCString()}\nSource: The Lily Pad (thelilypad.io)\n`;
            zipStream.addFile("README.txt", encoder.encode(readme));

            setDownloadStatus("Compressing...");
            setDownloadProgress(93);

            const zipBlob = await zipStream.finish();
            if (zipBlob) {
                downloadBlob(zipBlob, `${safeName()}-${count}nfts-${resolution}px.zip`);
            }

            setDownloadProgress(100);
            setDownloadStatus("Done!");
            toast.success(`Downloaded ${count} NFTs!`, {
                description: `${resolution}×${resolution}px images + metadata ready for any launchpad.`,
            });
        } catch (err: any) {
            console.error("Asset download failed:", err);
            const isOOM = err?.message?.includes("memory") || err?.message?.includes("alloc") || err?.name === "RangeError";
            toast.error(isOOM
                ? `Ran out of memory processing ${count} NFTs at ${resolution}px. Try fewer NFTs or lower resolution.`
                : `Download failed: ${err.message || "Unknown error"}`);
        } finally {
            setTimeout(() => {
                setIsDownloadingAssets(false);
                setDownloadProgress(0);
                setDownloadStatus("");
            }, 1800);
        }
    }, [collectionName, collectionDescription, outputResolution, layers, generateNFTBatch]);

    // ── Clipboard ──────────────────────────────────────────────────────────────

    const copyToClipboard = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard!");
    }, []);

    return {
        // State
        isExporting,
        exportProgress,
        exportStatus,
        isDownloadingAssets,
        downloadProgress,
        downloadStatus,
        // Actions
        exportImagesWithMetadata,
        downloadIndividualImages,
        exportSingleMetadata,
        exportAllMetadata,
        exportIndividualFiles,
        exportAsZip,
        downloadGeneratedAssets,
        copyToClipboard,
    };
}
