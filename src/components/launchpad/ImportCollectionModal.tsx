import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, DownloadCloud } from 'lucide-react';
import { useWallet } from '@/providers/WalletProvider';
import { SupportedChain } from '@/config/chains';

interface ImportCollectionModalProps {
  chain: SupportedChain;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

/**
 * User-facing modal that lets a connected creator import an already-deployed
 * on-chain collection (Solana mint address or Monad contract address) so it
 * shows up in the Launchpad / Marketplace. The creator owns the row via
 * `creator_id = auth.uid()` and their connected `wallet_address`.
 */
export const ImportCollectionModal: React.FC<ImportCollectionModalProps> = ({
  chain,
  onSuccess,
  trigger,
}) => {
  const { address, isConnected } = useWallet();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    collection_address: '',
    name: '',
    symbol: '',
    image_url: '',
    description: '',
    social_website: '',
    social_twitter: '',
    social_discord: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () =>
    setFormData({
      collection_address: '',
      name: '',
      symbol: '',
      image_url: '',
      description: '',
      social_website: '',
      social_twitter: '',
      social_discord: '',
    });

  const validateAddress = (addr: string): string | null => {
    const a = addr.trim();
    if (!a) return 'Collection address is required';
    if (chain === 'monad') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return 'Invalid Monad contract address';
    } else {
      // Solana base58, mint addresses are 32–44 chars
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return 'Invalid Solana mint address';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      toast.error('Connect your wallet to import a collection');
      return;
    }

    const addrError = validateAddress(formData.collection_address);
    if (addrError) {
      toast.error(addrError);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');

      const contractAddress = formData.collection_address.trim();

      // Prevent duplicate imports
      const { data: existing } = await supabase
        .from('collections')
        .select('id, name')
        .eq('contract_address', contractAddress)
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        throw new Error(`Already imported as "${existing.name}".`);
      }

      const { error } = await supabase.from('collections').insert({
        creator_id: user.id,
        creator_address: address,
        name: formData.name.trim(),
        symbol: formData.symbol.trim().toUpperCase(),
        image_url: formData.image_url.trim() || null,
        description: formData.description.trim() || null,
        social_website: formData.social_website.trim() || null,
        social_twitter: formData.social_twitter.trim() || null,
        social_discord: formData.social_discord.trim() || null,
        status: 'live',
        chain,
        contract_address: contractAddress,
        collection_mint_address: chain === 'solana' ? contractAddress : null,
        collection_type: 'imported',
        phases: [],
        total_supply: 0,
        minted: 0,
        royalty_percent: 0,
      });

      if (error) {
        if (error.code === '23505') {
          throw new Error('This collection address has already been imported.');
        }
        throw error;
      }

      toast.success('Collection imported', {
        description: 'It will now appear in the Launchpad.',
      });
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (err: any) {
      console.error('Error importing collection:', err);
      toast.error(err.message || 'Failed to import collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2">
            <DownloadCloud className="w-4 h-4" />
            Import Existing
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Existing Collection</DialogTitle>
          <DialogDescription>
            Already deployed on-chain? Paste the {chain === 'monad' ? 'contract' : 'mint'} address
            to add it to your Lily Pad profile.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="collection_address">
              {chain === 'monad' ? 'Contract Address' : 'Collection Mint Address'} *
            </Label>
            <Input
              id="collection_address"
              name="collection_address"
              placeholder={chain === 'monad' ? '0x...' : 'e.g. 7q8...'}
              required
              value={formData.collection_address}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Collection Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="My Collection"
                required
                maxLength={100}
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol *</Label>
              <Input
                id="symbol"
                name="symbol"
                placeholder="MYCOL"
                required
                maxLength={10}
                value={formData.symbol}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Cover Image URL</Label>
            <Input
              id="image_url"
              name="image_url"
              placeholder="https://..."
              type="url"
              value={formData.image_url}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="About this collection..."
              rows={3}
              maxLength={1000}
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-2">
              <Label htmlFor="social_website">Website</Label>
              <Input
                id="social_website"
                name="social_website"
                type="url"
                placeholder="https://..."
                value={formData.social_website}
                onChange={handleChange}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="social_twitter">Twitter</Label>
                <Input
                  id="social_twitter"
                  name="social_twitter"
                  placeholder="@handle"
                  value={formData.social_twitter}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="social_discord">Discord</Label>
                <Input
                  id="social_discord"
                  name="social_discord"
                  placeholder="invite link"
                  value={formData.social_discord}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !isConnected}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import Collection'
              )}
            </Button>
          </DialogFooter>
          {!isConnected && (
            <p className="text-xs text-muted-foreground text-center">
              Connect your wallet to import a collection.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};
