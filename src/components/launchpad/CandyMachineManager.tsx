import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, AlertTriangle, FileJson, Trash2, Wand2 } from "lucide-react";
import { useSolanaLaunch } from '@/hooks/useSolanaLaunch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadCollectionMetadata } from '@/lib/metadataUpload';
import { RevealCandyMachinePanel } from './RevealCandyMachinePanel';

interface ArtworkMeta {
    id?: string;
    name?: string;
    imageUrl?: string;
    description?: string;
}

interface CandyMachineManagerProps {
    candyMachineAddress: string;
    candyGuardAddress?: string;
    collectionAddress?: string;
    collectionId?: string;
    collectionName?: string;
    artworks?: ArtworkMeta[] | null;
    itemsLoaded?: number;
    manifestRoot?: string;
    itemsAvailable?: number;
    isCreator: boolean;
    onRefresh: () => void;
}

export function CandyMachineManager({
    candyMachineAddress,
    candyGuardAddress,
    collectionAddress = '',
    collectionId,
    collectionName,
    artworks,
    itemsLoaded = 0,
    manifestRoot,
    itemsAvailable = 0,
    isCreator,
    onRefresh
}: CandyMachineManagerProps) {
    const {
        insertItemsToCandyMachine,
        deleteCandyMachine,
        isLoading
    } = useSolanaLaunch();

    const [itemsJson, setItemsJson] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [isAutoSyncing, setIsAutoSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<string | null>(null);

    const missingItems = Math.max(0, itemsAvailable - itemsLoaded);
    const canAutoSync = !!collectionId && Array.isArray(artworks) && artworks.length > 0;

    // Handler for inserting items (Stage 1 & 4 of Best Practices)
    const handleInsertItems = async () => {
        try {
            const items = JSON.parse(itemsJson);
            if (!Array.isArray(items)) {
                toast.error("Invalid JSON format. Expected an array of items.");
                return;
            }
            if (items.length === 0) {
                toast.error("Item list is empty.");
                return;
            }

            // Basic validation
            if (!items.every(i => i.name && i.uri)) {
                toast.error("Invalid item format. Each item must have 'name' and 'uri'.");
                return;
            }

            await insertItemsToCandyMachine(candyMachineAddress, items);
            await persistItemsLoaded(items.length);
            setItemsJson("");
            onRefresh();
        } catch (e) {
            toast.error("Failed to parse JSON.");
        }
    };

    const persistItemsLoaded = async (count: number) => {
        if (!collectionId) return;
        try {
            await supabase
                .from('collections')
                .update({ items_loaded: count })
                .eq('id', collectionId);
        } catch (e) {
            console.warn('[CandyMachineManager] failed to persist items_loaded', e);
        }
    };

    const handleAutoSync = async () => {
        if (!canAutoSync || !artworks) return;
        setIsAutoSyncing(true);
        setSyncProgress(null);
        try {
            const items: { name: string; uri: string }[] = [];
            for (let i = 0; i < artworks.length; i++) {
                const a = artworks[i];
                setSyncProgress(`Uploading metadata ${i + 1}/${artworks.length}…`);
                const nftName = a.name || `${collectionName || 'Item'} #${i + 1}`;
                const metadata = {
                    name: nftName,
                    description: a.description || '',
                    image: a.imageUrl || '',
                    attributes: [],
                    properties: {
                        files: a.imageUrl ? [{ uri: a.imageUrl, type: 'image/png' }] : [],
                        category: 'image',
                    },
                };
                const uploaded = await uploadCollectionMetadata(metadata, {
                    collectionId,
                    filename: `${collectionId}-item-${i}.json`,
                });
                items.push({ name: nftName, uri: uploaded.url });
            }
            setSyncProgress(`Inserting ${items.length} items on-chain…`);
            await insertItemsToCandyMachine(candyMachineAddress, items);
            await persistItemsLoaded(items.length);
            toast.success(`Synced ${items.length} items to the Candy Machine.`);
            onRefresh();
        } catch (e: any) {
            console.error('[CandyMachineManager] auto-sync failed', e);
            toast.error(e?.message || 'Auto-sync failed');
        } finally {
            setIsAutoSyncing(false);
            setSyncProgress(null);
        }
    };


    // Handler for deleting CM (Lifecycle Management)
    const handleDeleteCM = async () => {
        if (!confirm("Are you sure you want to delete this Candy Machine? This cannot be undone.")) return;

        setIsDeleting(true);
        const success = await deleteCandyMachine(candyMachineAddress, candyGuardAddress);
        setIsDeleting(false);

        if (success) {
            onRefresh();
        }
    };


    if (!isCreator) return null;

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Candy Machine Manager (Core)</CardTitle>
                <CardDescription>Advanced tools for managing your collection's deployment.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="items">
                    <TabsList className="mb-4">
                        <TabsTrigger value="items">Insert Items</TabsTrigger>
                        <TabsTrigger value="reveal">Reveal Manager</TabsTrigger>
                        <TabsTrigger value="danger">Danger Zone</TabsTrigger>
                    </TabsList>

                    <TabsContent value="items" className="space-y-4">
                        <Alert>
                            <FileJson className="h-4 w-4" />
                            <AlertTitle>JSON Format</AlertTitle>
                            <AlertDescription>
                                <code>[{"{"} "name": "Item #1", "uri": "https://..." {"}"}, ...]</code>
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-2">
                            <Label>Item List (JSON)</Label>
                            <Textarea
                                placeholder='[{"name": "Item 1", "uri": "https://..."}]'
                                value={itemsJson}
                                onChange={(e) => setItemsJson(e.target.value)}
                                rows={10}
                                className="font-mono text-xs"
                            />
                        </div>
                        <Button onClick={handleInsertItems} disabled={isLoading || !itemsJson}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Upload className="mr-2 h-4 w-4" />
                            Insert Items
                        </Button>
                    </TabsContent>

                    <TabsContent value="reveal" className="space-y-4">
                        <RevealCandyMachinePanel
                            candyMachineAddress={candyMachineAddress}
                            collectionAddress={collectionAddress}
                            manifestRoot={manifestRoot}
                            mintedCount={itemsAvailable}
                            onRevealComplete={onRefresh}
                        />
                    </TabsContent>

                    <TabsContent value="danger" className="space-y-4">
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Warning</AlertTitle>
                            <AlertDescription>
                                Deleting the Candy Machine will prevent any further minting.
                                Ensure you have withdrawn any funds (if applicable) and that minting is complete.
                                Valid Guards will be closed.
                            </AlertDescription>
                        </Alert>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteCM}
                            disabled={isLoading || isDeleting}
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Delete Candy Machine & Guard
                        </Button>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
