import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { RotateCcw, Trash2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TrashedCollection {
  id: string;
  name: string;
  chain: string | null;
  status: string | null;
  minted: number | null;
  total_supply: number | null;
  deleted_at: string;
}

export function CollectionTrashManager() {
  const [items, setItems] = useState<TrashedCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('collections')
      .select('id, name, chain, status, minted, total_supply, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(200);
    if (error) toast({ title: 'Could not load trash', description: error.message, variant: 'destructive' });
    setItems((data as TrashedCollection[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from('collections').update({ deleted_at: null }).eq('id', id);
    setBusy(null);
    if (error) return toast({ title: 'Restore failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Collection restored' });
    load();
  };

  const purge = async (id: string, name: string) => {
    if (!confirm(`Permanently delete "${name}" and all related NFTs, listings and mints? This cannot be undone.`)) return;
    setBusy(id);
    const { error } = await supabase.rpc('admin_hard_delete_collection', { p_collection_id: id });
    setBusy(null);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Collection permanently deleted' });
    load();
  };

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg sm:text-xl">Trash</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Deleted collections stay here until restored or permanently deleted.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Trash is empty.</p>
        ) : (
          items.map((c) => (
            <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {c.chain && <Badge variant="secondary">{c.chain}</Badge>}
                  <span>{c.minted ?? 0}/{c.total_supply ?? 0} minted</span>
                  <span>deleted {formatDistanceToNow(new Date(c.deleted_at), { addSuffix: true })}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={() => restore(c.id)} disabled={busy === c.id}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Restore
                </Button>
                <Button size="sm" variant="destructive" onClick={() => purge(c.id, c.name)} disabled={busy === c.id}>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete forever
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
