import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { X, Upload, Plus, ImageIcon, Loader2, Coins, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useWallet } from '@/providers/WalletProvider';
import { useSolanaLaunch } from '@/hooks/useSolanaLaunch';
import type { BatchNftItem } from '@/chains';
import { supabase } from '@/integrations/supabase/client';

interface Collection {
    id: string;
    name: string;
    symbol: string;
    description: string;
    image_url: string;
    contract_address: string;
    collection_type: '1of1' | 'editions' | 'generative' | 'candy_machine';
    total_supply: number;
    status: 'upcoming' | 'live' | 'ended';
    created_at: string;
    chain?: string;
    tree_address?: string;
}

interface NftFormData {
    id: string;
    name: string;
    description: string;
    image: File | null;
    imagePreview: string | null;
    attributes: { trait_type: string; value: string }[];
}

interface AddToCollectionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collection: Collection;
    onSuccess?: () => void;
}

export function AddToCollectionModal({ open, onOpenChange, collection, onSuccess }: AddToCollectionModalProps) {
    const { address } = useWallet();
    const { batchMintCompressedCore, batchMintCore, calculateBatchMintCost, isLoading, uploadFiles, uploadMetadata: _um, uploadJsonMetadataBatch: uploadJsonBatch } = useSolanaLaunch() as any;
    
    const [nfts, setNfts] = useState<NftFormData[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [mintProgress, setMintProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState<'form' | 'upload' | 'mint' | 'success'>('form');
    const [mintedCount, setMintedCount] = useState(0);
    const [platformFee, setPlatformFee] = useState(0.001); // 0.001 SOL per NFT platform fee

    const generateId = () => Math.random().toString(36).substring(2, 9);

    const addNft = () => {
        if (nfts.length >= 10) {
            toast.error('Maximum 10 NFTs per batch');
            return;
        }
        setNfts([...nfts, {
            id: generateId(),
            name: '',
            description: '',
            image: null,
            imagePreview: null,
            attributes: [],
        }]);
    };

    const removeNft = (id: string) => {
        setNfts(nfts.filter(n => n.id !== id));
    };

    const updateNft = (id: string, updates: Partial<NftFormData>) => {
        setNfts(nfts.map(n => n.id === id ? { ...n, ...updates } : n));
    };

    const handleImageChange = (nftId: string, file: File | null) => {
        if (!file) return;
        
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Image must be under 10MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            updateNft(nftId, { 
                image: file, 
                imagePreview: e.target?.result as string 
            });
        };
        reader.readAsDataURL(file);
    };

    const removeImage = (nftId: string) => {
        updateNft(nftId, { image: null, imagePreview: null });
    };

    const validateNfts = (): boolean => {
        for (const nft of nfts) {
            if (!nft.name.trim()) {
                toast.error('All NFTs must have a name');
                return false;
            }
            if (!nft.image) {
                toast.error('All NFTs must have an image');
                return false;
            }
        }
        return true;
    };

    const handleSubmit = async () => {
        if (!validateNfts()) return;
        if (!address || !userId) {
            toast.error('Wallet not connected');
            return;
        }

        setCurrentStep('upload');
        setIsUploading(true);
        setUploadProgress(0);

        try {
            // Upload images
            const images = nfts.map(n => n.image!);
            const imageUrls = await uploadFiles(images);
            setUploadProgress(50);

            // Prepare metadata
            const metadataList = nfts.map((nft, index) => ({
                name: nft.name,
                description: nft.description || collection.description,
                image: imageUrls[index],
                attributes: nft.attributes.length > 0 ? nft.attributes : undefined,
                collection: {
                    name: collection.name,
                    family: collection.symbol,
                },
            }));

            // Upload metadata
            const metadataUris = await uploadJsonBatch(metadataList);
            setUploadProgress(100);

            // Move to minting step
            setCurrentStep('mint');
            setMintProgress(0);

            // Calculate costs for display
            const costBreakdown = calculateBatchMintCost(nfts.length, platformFee, true);
            console.log('Minting cost breakdown:', costBreakdown);

            // Prepare batch items
            const batchItems: BatchNftItem[] = nfts.map((nft, index) => ({
                name: nft.name,
                uri: metadataUris[index],
                sellerFeeBasisPoints: 0,
                owner: address,
            }));

            // Determine minting method based on collection type and available tree
            let result;
            
            if (collection.tree_address) {
                // Use compressed NFT minting
                console.log('Using compressed NFT batch minting...');
                result = await batchMintCompressedCore(
                    collection.tree_address,
                    collection.contract_address,
                    batchItems
                );
            } else {
                // Use standard Core NFT minting
                console.log('Using standard Core NFT batch minting...');
                result = await batchMintCore(
                    collection.contract_address,
                    batchItems
                );
            }

            setMintProgress(100);
            setMintedCount(result.assetIds.length - result.failedIndices.length);

            // Save to database
            const successfulIndices = nfts
                .map((_, i) => i)
                .filter(i => !result.failedIndices.includes(i));
            
            const nftRecords = successfulIndices.map((index, i) => ({
                collection_id: collection.id,
                name: nfts[index].name,
                description: nfts[index].description || collection.description,
                image_url: imageUrls[index],
                metadata_uri: metadataUris[index],
                owner_address: address,
                creator_address: address,
                token_id: result.assetIds[i]?.replace('pending_', '') || `batch_${Date.now()}_${i}`,
                asset_id: result.assetIds[i] || null,
                mint_transaction: Buffer.from(result.signature).toString('hex'),
                status: 'minted',
                chain: 'solana',
            }));

            if (nftRecords.length > 0) {
                const { error: insertError } = await supabase
                    .from('minted_nfts')
                    .insert(nftRecords);

                if (insertError) {
                    console.error('Database insert error:', insertError);
                    toast.error('NFTs minted but failed to save to database');
                } else {
                    // Update collection total supply
                    await supabase
                        .from('collections')
                        .update({ total_supply: collection.total_supply + nftRecords.length })
                        .eq('id', collection.id);
                }
            }

            setCurrentStep('success');
            toast.success(`Successfully minted ${nftRecords.length} NFTs!`);
            onSuccess?.();

        } catch (err: any) {
            console.error('Batch mint error:', err);
            toast.error(err.message || 'Failed to mint NFTs');
            setCurrentStep('form');
        } finally {
            setIsUploading(false);
        }
    };

    const getStepContent = () => {
        switch (currentStep) {
            case 'upload':
                return (
                    <div className="text-center py-12">
                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
                        <h3 className="text-lg font-semibold mb-2">Uploading Files...</h3>
                        <Progress value={uploadProgress} className="w-full max-w-xs mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{uploadProgress}% complete</p>
                    </div>
                );

            case 'mint':
                return (
                    <div className="text-center py-12">
                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
                        <h3 className="text-lg font-semibold mb-2">Minting NFTs...</h3>
                        <Progress value={mintProgress} className="w-full max-w-xs mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                            Please approve the transaction in your wallet
                        </p>
                    </div>
                );

            case 'success':
                return (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Plus className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Success!</h3>
                        <p className="text-muted-foreground mb-4">
                            Successfully minted {mintedCount} NFTs to {collection.name}
                        </p>
                        <Button onClick={() => onOpenChange(false)}>Done</Button>
                    </div>
                );

            default:
                return null;
        }
    };

    const isFormStep = currentStep === 'form';
    const costBreakdown = nfts.length > 0 ? calculateBatchMintCost(nfts.length, platformFee, true) : null;

    return (
        <Dialog open={open} onOpenChange={(newOpen) => {
            if (!isUploading && !isLoading) {
                onOpenChange(newOpen);
            }
        }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Add NFTs to {collection.name}
                    </DialogTitle>
                </DialogHeader>

                {!isFormStep ? (
                    getStepContent()
                ) : (
                    <div className="space-y-6">
                        {/* Cost Estimation Card */}
                        {costBreakdown && (
                            <Card className="bg-muted/50">
                                <CardContent className="pt-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Coins className="w-4 h-4 text-muted-foreground" />
                                        <span className="font-medium">Estimated Cost</span>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Network Fees:</span>
                                            <span>{costBreakdown.networkFees.toFixed(6)} SOL</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Platform Fees:</span>
                                            <span>{costBreakdown.platformFees.toFixed(6)} SOL</span>
                                        </div>
                                        <Separator />
                                        <div className="flex justify-between font-semibold">
                                            <span>Total:</span>
                                            <span>{costBreakdown.total.toFixed(6)} SOL</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                                        <Info className="w-3 h-3" />
                                        One transaction mints all {nfts.length} NFTs with a single signature
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* NFT List */}
                        <div className="space-y-4">
                            {nfts.map((nft, index) => (
                                <Card key={nft.id}>
                                    <CardContent className="pt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <Badge variant="secondary">NFT #{index + 1}</Badge>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeNft(nft.id)}
                                                disabled={nfts.length === 1}
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Image Upload */}
                                            <div>
                                                <Label>Image *</Label>
                                                {nft.imagePreview ? (
                                                    <div className="relative mt-2">
                                                        <img
                                                            src={nft.imagePreview}
                                                            alt="Preview"
                                                            className="w-full h-48 object-cover rounded-lg"
                                                        />
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            className="absolute top-2 right-2"
                                                            onClick={() => removeImage(nft.id)}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="mt-2">
                                                        <Input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(e) => handleImageChange(nft.id, e.target.files?.[0] || null)}
                                                            className="hidden"
                                                            id={`image-${nft.id}`}
                                                        />
                                                        <Label
                                                            htmlFor={`image-${nft.id}`}
                                                            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-muted-foreground/50 transition-colors"
                                                        >
                                                            <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
                                                            <span className="text-sm text-muted-foreground">
                                                                Click to upload image
                                                            </span>
                                                        </Label>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Name */}
                                            <div>
                                                <Label htmlFor={`name-${nft.id}`}>Name *</Label>
                                                <Input
                                                    id={`name-${nft.id}`}
                                                    value={nft.name}
                                                    onChange={(e) => updateNft(nft.id, { name: e.target.value })}
                                                    placeholder="Enter NFT name"
                                                    className="mt-1"
                                                />
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <Label htmlFor={`desc-${nft.id}`}>Description</Label>
                                                <Input
                                                    id={`desc-${nft.id}`}
                                                    value={nft.description}
                                                    onChange={(e) => updateNft(nft.id, { description: e.target.value })}
                                                    placeholder="Enter description (optional)"
                                                    className="mt-1"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Add More Button */}
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={addNft}
                            disabled={nfts.length >= 10}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Another NFT ({nfts.length}/10)
                        </Button>

                        {/* Warning for large batches */}
                        {nfts.length >= 8 && (
                            <p className="text-xs text-amber-500 flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                Large batches may require higher compute units. If the transaction fails, try minting fewer NFTs at once.
                            </p>
                        )}
                    </div>
                )}

                {isFormStep && (
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={nfts.length === 0 || isLoading || !nfts.every(n => n.name && n.image)}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Minting...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Mint {nfts.length} NFTs
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default AddToCollectionModal;
