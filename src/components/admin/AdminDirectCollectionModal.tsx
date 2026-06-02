import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Loader2, PlusCircle } from 'lucide-react';

interface AdminDirectCollectionModalProps {
  onSuccess: () => void;
}

export const AdminDirectCollectionModal: React.FC<AdminDirectCollectionModalProps> = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    collection_address: '',
    name: '',
    symbol: '',
    image_url: '',
    description: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('You must be logged in.');
      }

      const { error } = await supabase
        .from('collections')
        .insert({
          creator_id: user.id,
          creator_address: formData.collection_address.trim(), // Placeholder
          name: formData.name.trim(),
          symbol: formData.symbol.trim(),
          image_url: formData.image_url.trim() || null,
          description: formData.description.trim() || null,
          status: 'live',
          contract_address: formData.collection_address.trim(),
        });

      if (error) {
        if (error.code === '23505') { 
          throw new Error('This collection address has already been added.');
        }
        throw error;
      }

      toast({
        title: 'Collection Added',
        description: 'The collection was successfully imported directly.',
      });
      
      setOpen(false);
      setFormData({ collection_address: '', name: '', symbol: '', image_url: '', description: '' });
      onSuccess();
      
    } catch (error: any) {
      console.error('Error adding collection:', error);
      toast({
        title: 'Failed to add collection',
        description: error.message || 'There was an error adding the collection.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PlusCircle className="w-4 h-4" />
          Add Big Project
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Big Project (Direct Import)</DialogTitle>
          <DialogDescription>
            Bypass the application queue and directly import an on-chain collection.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="collection_address">Collection Mint Address *</Label>
            <Input 
              id="collection_address" 
              name="collection_address" 
              placeholder="Solana address (e.g. 7q8...)" 
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
                placeholder="e.g. DeGods" 
                required 
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol *</Label>
              <Input 
                id="symbol" 
                name="symbol" 
                placeholder="e.g. DEGODS" 
                required 
                value={formData.symbol}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Image URL</Label>
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
              placeholder="About this project..." 
              rows={3}
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</> : 'Import Collection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
