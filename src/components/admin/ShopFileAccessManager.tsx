import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw } from 'lucide-react';

type AccessUser = { user_id: string; name: string | null; wallet: string | null };
type Row = {
  object_id: string; file_path: string; uploaded_at: string; size_bytes: number | null;
  mime_type: string | null; uploader_id: string | null; uploader_name: string | null;
  uploader_wallet: string | null; item_id: string | null; item_name: string | null;
  access: AccessUser[];
};

const short = (w?: string | null) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '');
const who = (name?: string | null, wallet?: string | null, id?: string | null) =>
  name || short(wallet) || (id ? id.slice(0, 8) : 'Unknown');

export default function ShopFileAccessManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    const { data, error } = await (supabase.rpc as any)('admin_list_shop_files', { limit_count: 500 });
    if (error) setError('Could not load shop files.');
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const term = q.toLowerCase();
  const filtered = rows.filter(r => !term || [r.file_path, r.item_name, r.uploader_name, r.uploader_wallet]
    .some(v => v?.toLowerCase().includes(term)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Shop Files</CardTitle>
          <CardDescription>Who uploaded each file, when, and who can open it. Admins can always access every file.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Search file, pack or uploader…" value={q} onChange={e => setQ(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No shop files found.</p>
        )}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Uploaded by</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Who can access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const platform = r.file_path.startsWith('platform/');
                  return (
                    <TableRow key={r.object_id}>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate font-medium" title={r.file_path}>{r.file_path.split('/').pop()}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.item_name ? `Pack: ${r.item_name}` : 'Not linked to a pack'}
                          {r.size_bytes ? ` · ${(r.size_bytes / 1024 / 1024).toFixed(2)} MB` : ''}
                        </div>
                      </TableCell>
                      <TableCell>{platform ? <Badge variant="secondary">Platform (admin)</Badge> : who(r.uploader_name, r.uploader_wallet, r.uploader_id)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{new Date(r.uploaded_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {!platform && <Badge variant="outline">Uploader</Badge>}
                          <Badge variant="outline">Admins</Badge>
                          {r.access.map(a => (
                            <Badge key={a.user_id} title={a.wallet ?? ''}>{who(a.name, a.wallet, a.user_id)}</Badge>
                          ))}
                        </div>
                        {r.access.length > 0 && <div className="text-xs text-muted-foreground mt-1">{r.access.length} buyer{r.access.length === 1 ? '' : 's'}</div>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
