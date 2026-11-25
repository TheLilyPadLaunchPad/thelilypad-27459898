import { useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/downloadBlob';
import { whitelistCsv, type WhitelistExportRow } from '@/lib/whitelistCsv';

export function WhitelistWalletExport() {
  const { isAdmin, loading } = useAdmin();
  const [preparing, setPreparing] = useState(false);
  const [file, setFile] = useState<Blob | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    if (!isAdmin || loading || preparing) return;
    setPreparing(true); setError(null); setFile(null); setCount(0);
    try {
      const rows: WhitelistExportRow[] = [];
      let cursor: string | null = null;
      while (true) {
        const { data, error } = await supabase.rpc('admin_export_whitelist_wallets', { p_after: cursor ?? undefined, p_limit: 500 });
        if (error) throw error;
        const batch = data ?? [];
        rows.push(...batch);
        setCount(rows.length);
        if (batch.length < 500) break;
        const next = batch[batch.length - 1]?.profile_id;
        if (!next || next === cursor) throw new Error('Export pagination failed');
        cursor = next;
      }
      setFile(new Blob([whitelistCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    } catch {
      setError('Could not prepare the whitelist export. Check your admin sign-in and retry.');
    } finally { setPreparing(false); }
  };

  if (loading || !isAdmin) return null;
  return <section className="mb-6 border-b border-border pb-6 space-y-3">
    <h2 className="text-xl font-semibold">Whitelist wallet export</h2>
    <p className="text-sm text-muted-foreground">Registered = wallet saved with a completed profile. Pending profile = wallet saved but setup incomplete. No separate historical claim receipt is recorded.</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={prepare} disabled={preparing}>
        {preparing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
        {preparing ? 'Preparing CSV…' : file ? 'Refresh CSV' : 'Prepare whitelist CSV'}
      </Button>
      {file && <Button onClick={() => downloadBlob(file, `lilypad-whitelist-${new Date().toISOString().slice(0, 10)}.csv`)}><Download className="w-4 h-4 mr-2" />Download CSV</Button>}
      {(preparing || file) && <span className="text-sm text-muted-foreground" role="status">{count} wallet registrations{file ? ' ready' : ' loaded'}</span>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}