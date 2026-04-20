import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, ImageIcon, Layers, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useWallet } from '@/providers/WalletProvider';
import AddToCollectionModal from './AddToCollectionModal';

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
}

interface ManageCollectionsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function ManageCollectionsModal({ open, onOpenChange, onSuccess }: ManageCollectionsModalProps) {
    const { address, userId } = useWallet();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        if (open && userId) {
            loadCollections();
        }
    }, [open, userId]);

    const loadCollections = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('collections')
                .select('*')
                .eq('creator_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCollections(data || []);
        } catch (err) {
            console.error('Error loading collections:', err);
            toast.error('Failed to load your collections');
        } finally {
            setIsLoading(false);
        }
    };

    const getCollectionTypeLabel = (type: Collection['collection_type']) => {
        switch (type) {
            case '1of1':
                return '1-of-1';
            case 'editions':
                return 'Edition';
            case 'generative':
                return 'Generative';
            case 'candy_machine':
                return 'Candy Machine';
            default:
                return type;
        }
    };

    const getStatusColor = (status: Collection['status']) => {
        switch (status) {
            case 'live':
                return 'bg-green-500';
            case 'upcoming':
                return 'bg-yellow-500';
            case 'ended':
                return 'bg-gray-500';
            default:
                return 'bg-blue-500';
        }
    };

    const handleAddNfts = (collection: Collection) => {
        setSelectedCollection(collection);
        setShowAddModal(true);
    };

    const handleAddSuccess = () => {
        setShowAddModal(false);
        setSelectedCollection(null);
        loadCollections();
        onSuccess?.();
    };

    const formatAddress = (addr: string) => {
        if (!addr || addr.length < 8) return addr;
        return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Layers className="w-5 h-5" />
                            Manage Your Collections
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <p className="text-muted-foreground text-sm">
                            View and manage your existing NFT collections. You can add more NFTs to any collection below.
                        </p>

                        {isLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[1, 2, 3].map((i) => (
                                    <Card key={i}>
                                        <CardHeader>
                                            <Skeleton className="h-4 w-3/4" />
                                        </CardHeader>
                                        <CardContent>
                                            <Skeleton className="h-20 w-full mb-2" />
                                            <Skeleton className="h-4 w-1/2" />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : collections.length === 0 ? (
                            <div className="text-center py-12">
                                <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Collections Yet</h3>
                                <p className="text-muted-foreground mb-4">
                                    You haven&apos;t created any NFT collections yet.
                                </p>
                                <Button onClick={() => onOpenChange(false)}>
                                    Create Your First Collection
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {collections.map((collection) => (
                                    <Card key={collection.id} className="overflow-hidden">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <CardTitle className="text-lg line-clamp-1">
                                                        {collection.name}
                                                    </CardTitle>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant="secondary" className="text-xs">
                                                            {getCollectionTypeLabel(collection.collection_type)}
                                                        </Badge>
                                                        <div className={`w-2 h-2 rounded-full ${getStatusColor(collection.status)}`} />
                                                        <span className="text-xs text-muted-foreground capitalize">
                                                            {collection.status}
                                                        </span>
                                                    </div>
                                                </div>
                                                {collection.image_url && (
                                                    <img
                                                        src={collection.image_url}
                                                        alt={collection.name}
                                                        className="w-12 h-12 rounded-lg object-cover"
                                                    />
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                                {collection.description || 'No description'}
                                            </p>
                                            
                                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                                                <span>Items: {collection.total_supply}</span>
                                                <span className="font-mono">
                                                    {formatAddress(collection.contract_address)}
                                                </span>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() => handleAddNfts(collection)}
                                                >
                                                    <Plus className="w-4 h-4 mr-1" />
                                                    Add NFTs
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        window.open(
                                                            `https://solscan.io/account/${collection.contract_address}`,
                                                            '_blank'
                                                        );
                                                    }}
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {selectedCollection && (
                <AddToCollectionModal
                    open={showAddModal}
                    onOpenChange={setShowAddModal}
                    collection={selectedCollection}
                    onSuccess={handleAddSuccess}
                />
            )}
        </>
    );
}

export default ManageCollectionsModal;
