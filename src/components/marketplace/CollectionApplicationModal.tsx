import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, CheckCircle } from 'lucide-react';

interface CollectionApplicationModalProps {
  trigger?: React.ReactNode;
}

export const CollectionApplicationModal: React.FC<CollectionApplicationModalProps> = ({ trigger }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
        throw new Error('You must be logged in to apply.');
      }

      const { error } = await supabase
        .from('marketplace_applications')
        .insert({
          user_id: user.id,
          collection_address: formData.collection_address.trim(),
          name: formData.name.trim(),
          symbol: formData.symbol.trim(),
          image_url: formData.image_url.trim() || null,
          description: formData.description.trim() || null,
          status: 'pending'
        });

      if (error) {
        if (error.code === '23505') { // Unique violation
          throw new Error('This collection address has already been submitted.');
        }
        throw error;
      }

      setSuccess(true);
      toast({
        title: 'Application Submitted!',
        description: 'Your collection is under review by the admin team.',
      });
      
    } catch (error: any) {
      console.error('Error submitting application:', error);
      toast({
        title: 'Submission Failed',
        description: error.message || 'There was an error submitting your application.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSuccess(false);
      setFormData({
        collection_address: '',
        name: '',
        symbol: '',
        image_url: '',
        description: '',
      });
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) resetAndClose(); else setOpen(val); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <PlusCircle className="w-4 h-4" />
            Apply for Marketplace
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Marketplace Application</DialogTitle>
          <DialogDescription>
            Submit your existing on-chain collection to be listed on The Lily Pad Marketplace.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500 mb-2" />
            <h3 className="text-xl font-bold">Success!</h3>
            <p className="text-muted-foreground text-sm">
              Your application has been received. Our team will review it shortly. 
              Once approved, your collection will be live on the marketplace.
            </p>
            <Button className="mt-4 w-full" onClick={resetAndClose}>Close</Button>
          </div>
        ) : (
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
                  placeholder="e.g. Lily Frogs" 
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
                  placeholder="e.g. LILY" 
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
                placeholder="Tell us about your collection..." 
                rows={3}
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={resetAndClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : 'Submit Application'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
