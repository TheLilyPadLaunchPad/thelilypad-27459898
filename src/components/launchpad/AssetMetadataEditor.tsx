/**
 * AssetMetadataEditor — edit a generated NFT's name, description, attributes and artwork.
 *
 * Used by the generators' Review step. Replacing the artwork marks the asset as a
 * 1-of-1 piece (isOneOfOne + customFile), which excludes it from trait-based art.
 */
import React, { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Crown, ImageUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { GeneratedAsset } from "@/lib/assetGenerator";
import { checkMedia, MEDIA_ACCEPT } from "@/lib/uploadRules";

interface Props {
    asset: GeneratedAsset | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (asset: GeneratedAsset) => void;
    /** Optional: remove this asset from the collection */
    onDelete?: (assetId: string) => void;
}

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that image"));
        reader.readAsDataURL(file);
    });
}

export function AssetMetadataEditor({ asset, open, onOpenChange, onSave, onDelete }: Props) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [attributes, setAttributes] = useState<{ trait_type: string; value: string }[]>([]);
    const [preview, setPreview] = useState<string | undefined>(undefined);
    const [customFile, setCustomFile] = useState<File | undefined>(undefined);
    const [isOneOfOne, setIsOneOfOne] = useState(false);

    useEffect(() => {
        if (!asset) return;
        setName(asset.metadata.name || asset.name);
        setDescription(asset.metadata.description || "");
        setAttributes(asset.metadata.attributes.map((a) => ({ ...a })));
        setPreview(asset.preview);
        setCustomFile(asset.customFile);
        setIsOneOfOne(!!asset.isOneOfOne);
    }, [asset]);

    const handleArtwork = async (file?: File) => {
        if (!file) return;
        const problem = checkMedia(file);
        if (problem) return toast.error(problem);
        try {
            const dataUrl = await readAsDataUrl(file);
            setPreview(dataUrl);
            setCustomFile(file);
            setIsOneOfOne(true);
        } catch (err: any) {
            toast.error(err?.message || "Could not load that image");
        }
    };

    const handleSave = () => {
        if (!asset) return;
        if (!name.trim()) return toast.error("Give this piece a name");
        const cleaned = attributes
            .map((a) => ({ trait_type: a.trait_type.trim(), value: a.value.trim() }))
            .filter((a) => a.trait_type && a.value);

        onSave({
            ...asset,
            name: name.trim(),
            preview,
            customFile,
            isOneOfOne,
            metadata: { name: name.trim(), description: description.trim(), attributes: cleaned },
        });
        onOpenChange(false);
        toast.success(isOneOfOne ? "1-of-1 piece saved" : "Metadata updated");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Edit NFT
                        {isOneOfOne && (
                            <Badge className="gap-1">
                                <Crown className="w-3 h-3" /> 1 of 1
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        Change the name, description and traits. Uploading your own artwork turns this
                        into a one-of-a-kind piece inside the collection.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid md:grid-cols-[180px_1fr] gap-5">
                    <div className="space-y-2">
                        <div className="aspect-square rounded-xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center">
                            {preview && customFile?.type.startsWith("video/") ? (
                                <video src={preview} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                            ) : preview && customFile?.type.startsWith("audio/") ? (
                                <audio src={preview} controls className="w-full px-2" />
                            ) : preview ? (
                                <img src={preview} alt={name} className="w-full h-full object-cover" />
                            ) : null}
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center">GIF, JPG, MP3, MP4, PNG, SVG · max 50 MB</p>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={MEDIA_ACCEPT}
                            className="hidden"
                            onChange={(e) => handleArtwork(e.target.files?.[0])}
                        />
                        <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => fileRef.current?.click()}
                        >
                            <ImageUp className="w-4 h-4" /> Replace art
                        </Button>
                        {isOneOfOne && asset?.traits?.length ? (
                            <Button
                                variant="ghost"
                                className="w-full text-xs"
                                onClick={() => {
                                    setIsOneOfOne(false);
                                    setCustomFile(undefined);
                                    setPreview(asset?.preview);
                                }}
                            >
                                Revert to generated art
                            </Button>
                        ) : null}
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="asset-name">Name</Label>
                            <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="asset-desc">Description</Label>
                            <Textarea
                                id="asset-desc"
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Leave blank to use the collection description"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Traits</Label>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1"
                                    onClick={() =>
                                        setAttributes((prev) => [...prev, { trait_type: "", value: "" }])
                                    }
                                >
                                    <Plus className="w-3 h-3" /> Add trait
                                </Button>
                            </div>
                            {attributes.length === 0 && (
                                <p className="text-xs text-muted-foreground">No traits yet.</p>
                            )}
                            <div className="space-y-2">
                                {attributes.map((attr, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <Input
                                            value={attr.trait_type}
                                            placeholder="Type (e.g. Background)"
                                            onChange={(e) =>
                                                setAttributes((prev) =>
                                                    prev.map((a, idx) =>
                                                        idx === i ? { ...a, trait_type: e.target.value } : a
                                                    )
                                                )
                                            }
                                        />
                                        <Input
                                            value={attr.value}
                                            placeholder="Value (e.g. Gold)"
                                            onChange={(e) =>
                                                setAttributes((prev) =>
                                                    prev.map((a, idx) =>
                                                        idx === i ? { ...a, value: e.target.value } : a
                                                    )
                                                )
                                            }
                                        />
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() =>
                                                setAttributes((prev) => prev.filter((_, idx) => idx !== i))
                                            }
                                        >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    {onDelete && asset ? (
                        <Button
                            variant="ghost"
                            className="text-destructive gap-2"
                            onClick={() => {
                                onDelete(asset.id);
                                onOpenChange(false);
                            }}
                        >
                            <Trash2 className="w-4 h-4" /> Remove from collection
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>Save changes</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
