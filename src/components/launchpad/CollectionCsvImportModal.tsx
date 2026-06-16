import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Upload, DownloadCloud, CheckCircle, AlertCircle, X, FileText, Plus } from 'lucide-react';
import { useWallet } from '@/providers/WalletProvider';
import { SupportedChain } from '@/config/chains';

interface CollectionImportEntry {
  collectionAddress: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  description?: string;
  website?: string;
  twitter?: string;
  discord?: string;
}

interface CsvImportResults {
  valid: CollectionImportEntry[];
  invalid: { line: number; content: string; reason: string }[];
  duplicates: string[];
}

interface CollectionCsvImportModalProps {
  chain: SupportedChain;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

/**
 * CSV Collection Import Modal - Similar to Magic Eden's hashlist upload
 * Allows bulk importing of collections via CSV with collection addresses
 */
export const CollectionCsvImportModal: React.FC<CollectionCsvImportModalProps> = ({
  chain,
  onSuccess,
  trigger,
}) => {
  const { address, isConnected } = useWallet();
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [csvImportResults, setCsvImportResults] = useState<CsvImportResults | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const cancelRef = useRef(false);

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

  const processCsvContent = useCallback(async (content: string) => {
    cancelRef.current = false;
    const lines = content.split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      toast.error('CSV file is empty');
      setIsProcessing(false);
      setProgress(null);
      return;
    }

    // Detect header row
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('address') ||
      firstLine.includes('collection') ||
      firstLine.includes('name') ||
      !validateAddress(lines[0].split(',')[0]?.trim() || '');

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const totalLines = dataLines.length;

    setProgress({ current: 0, total: totalLines });

    const valid: CollectionImportEntry[] = [];
    const invalid: { line: number; content: string; reason: string }[] = [];
    const duplicates: string[] = [];
    const seenInFile = new Set<string>();

    // Process in batches for large files
    const BATCH_SIZE = 100;
    let wasCancelled = false;

    for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
      if (cancelRef.current) {
        wasCancelled = true;
        break;
      }

      const batch = dataLines.slice(i, i + BATCH_SIZE);

      batch.forEach((line, batchIndex) => {
        const index = i + batchIndex;
        const lineNum = hasHeader ? index + 2 : index + 1;
        const trimmedLine = line.trim();

        if (!trimmedLine) return;

        // Parse CSV columns (handle quoted values)
        const columns = parseCsvLine(trimmedLine);
        const collectionAddress = columns[0] || '';
        const name = columns[1] || '';
        const symbol = columns[2] || '';
        const imageUrl = columns[3] || '';
        const description = columns[4] || '';
        const website = columns[5] || '';
        const twitter = columns[6] || '';
        const discord = columns[7] || '';

        // Validate address
        const addrError = validateAddress(collectionAddress);
        if (addrError) {
          invalid.push({ line: lineNum, content: trimmedLine, reason: addrError });
          return;
        }

        // Check for duplicates
        const lowerAddress = collectionAddress.toLowerCase();
        if (seenInFile.has(lowerAddress)) {
          duplicates.push(collectionAddress);
          return;
        }
        seenInFile.add(lowerAddress);

        // Validate required fields
        if (!name.trim()) {
          invalid.push({ line: lineNum, content: trimmedLine, reason: 'Name is required' });
          return;
        }

        if (!symbol.trim()) {
          invalid.push({ line: lineNum, content: trimmedLine, reason: 'Symbol is required' });
          return;
        }

        valid.push({
          collectionAddress: collectionAddress.trim(),
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          imageUrl: imageUrl.trim() || undefined,
          description: description.trim() || undefined,
          website: website.trim() || undefined,
          twitter: twitter.trim() || undefined,
          discord: discord.trim() || undefined,
        });
      });

      const processed = Math.min(i + BATCH_SIZE, totalLines);
      setProgress({ current: processed, total: totalLines });

      if (totalLines > BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (wasCancelled) {
      toast.info('CSV processing cancelled');
      setProgress(null);
      setIsProcessing(false);
      return;
    }

    setCsvImportResults({ valid, invalid, duplicates });
    setProgress(null);
    setIsProcessing(false);
  }, [chain]);

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setCsvImportResults(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        processCsvContent(content);
      } catch (error) {
        console.error('CSV parsing error:', error);
        toast.error('Failed to parse CSV file');
        setIsProcessing(false);
      } finally {
        event.target.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read file');
      setIsProcessing(false);
    };

    reader.readAsText(file);
  }, [processCsvContent]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file =>
      file.type === 'text/csv' ||
      file.name.endsWith('.csv')
    );

    if (!csvFile) {
      toast.error('Please drop a CSV file');
      return;
    }

    setIsProcessing(true);
    setCsvImportResults(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        processCsvContent(content);
      } catch (error) {
        console.error('CSV parsing error:', error);
        toast.error('Failed to parse CSV file');
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read file');
      setIsProcessing(false);
    };

    reader.readAsText(csvFile);
  }, [processCsvContent]);

  const downloadTemplate = () => {
    const template = `collection_address,name,symbol,image_url,description,website,twitter,discord
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU,My Collection,MYCOL,https://example.com/image.png,My awesome collection,https://example.com,@myhandle,https://discord.gg/example
9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsV,Cool NFTs,COOL,https://example.com/cool.png,Cool NFT collection,https://cool.com,@coolnft,https://discord.gg/cool`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'collection-import-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Template downloaded');
  };

  const confirmImport = async () => {
    if (!csvImportResults || csvImportResults.valid.length === 0) {
      toast.error('No valid entries to import');
      return;
    }

    if (!isConnected || !address) {
      toast.error('Connect your wallet to import collections');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');

      for (const entry of csvImportResults.valid) {
        try {
          // Check for duplicates in database
          const { data: existing } = await supabase
            .from('collections')
            .select('id, name')
            .eq('contract_address', entry.collectionAddress)
            .is('deleted_at', null)
            .maybeSingle();

          if (existing) {
            console.log(`Skipping duplicate: ${entry.collectionAddress}`);
            continue;
          }

          const { error } = await supabase.from('collections').insert({
            creator_id: user.id,
            creator_address: address,
            name: entry.name,
            symbol: entry.symbol,
            image_url: entry.imageUrl || null,
            description: entry.description || null,
            social_website: entry.website || null,
            social_twitter: entry.twitter || null,
            social_discord: entry.discord || null,
            status: 'live',
            chain,
            contract_address: entry.collectionAddress,
            collection_mint_address: chain === 'solana' ? entry.collectionAddress : null,
            collection_type: 'imported',
            phases: [],
            total_supply: 0,
            minted: 0,
            royalty_percent: 0,
          });

          if (error) {
            if (error.code === '23505') {
              console.log(`Skipping duplicate (constraint): ${entry.collectionAddress}`);
              continue;
            }
            throw error;
          }

          successCount++;
        } catch (error) {
          console.error(`Failed to import ${entry.collectionAddress}:`, error);
          errorCount++;
        }
      }

      toast.success(`Imported ${successCount} collections successfully${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
      setCsvImportResults(null);
      setOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error importing collections:', error);
      toast.error(error.message || 'Failed to import collections');
    } finally {
      setIsImporting(false);
    }
  };

  const cancelProcessing = () => {
    cancelRef.current = true;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2">
            <Upload className="w-4 h-4" />
            CSV Import
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Collections (CSV)</DialogTitle>
          <DialogDescription>
            Import multiple collections at once using a CSV file with collection addresses, similar to Magic Eden's hashlist upload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!csvImportResults ? (
            <>
              {/* Upload Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium mb-2">
                  Drag & drop CSV file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Supports CSV files with collection addresses and metadata
                </p>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                  className="max-w-xs mx-auto"
                />
              </div>

              {/* Progress */}
              {progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Processing CSV...</span>
                    <span>{progress.current} / {progress.total}</span>
                  </div>
                  <Progress value={(progress.current / progress.total) * 100} />
                  {isProcessing && (
                    <Button variant="outline" size="sm" onClick={cancelProcessing}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}

              {/* Template Download */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">Download CSV Template</p>
                  <p className="text-xs text-muted-foreground">
                    Get started with the correct format
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <DownloadCloud className="w-4 h-4 mr-2" />
                  Template
                </Button>
              </div>

              {/* Format Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">CSV Format</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2">
                  <p><strong>Required columns:</strong></p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>collection_address - {chain === 'monad' ? '0x...' : 'Solana mint address'}</li>
                    <li>name - Collection name</li>
                    <li>symbol - Collection symbol (ticker)</li>
                  </ul>
                  <p className="mt-2"><strong>Optional columns:</strong></p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>image_url - Cover image URL</li>
                    <li>description - Collection description</li>
                    <li>website - Website URL</li>
                    <li>twitter - Twitter handle</li>
                    <li>discord - Discord invite link</li>
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Import Results */}
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Valid</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {csvImportResults.valid.length}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Invalid</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">
                        {csvImportResults.invalid.length}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Duplicates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {csvImportResults.duplicates.length}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Valid Entries Preview */}
                {csvImportResults.valid.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        Valid Entries ({csvImportResults.valid.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {csvImportResults.valid.slice(0, 5).map((entry, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs p-2 bg-muted rounded">
                            <Badge variant="outline" className="text-[10px]">{entry.symbol}</Badge>
                            <span className="flex-1 truncate">{entry.name}</span>
                            <span className="text-muted-foreground truncate max-w-[150px]">
                              {entry.collectionAddress.slice(0, 8)}...{entry.collectionAddress.slice(-4)}
                            </span>
                          </div>
                        ))}
                        {csvImportResults.valid.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center">
                            ...and {csvImportResults.valid.length - 5} more
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Invalid Entries */}
                {csvImportResults.invalid.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        Invalid Entries ({csvImportResults.invalid.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {csvImportResults.invalid.slice(0, 5).map((entry, idx) => (
                          <div key={idx} className="text-xs p-2 bg-red-50 dark:bg-red-950/20 rounded">
                            <p className="font-medium text-red-600">Line {entry.line}: {entry.reason}</p>
                            <p className="text-muted-foreground truncate">{entry.content}</p>
                          </div>
                        ))}
                        {csvImportResults.invalid.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center">
                            ...and {csvImportResults.invalid.length - 5} more
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCsvImportResults(null);
                  }}
                  disabled={isImporting}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={confirmImport}
                  disabled={isImporting || csvImportResults.valid.length === 0}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Import {csvImportResults.valid.length} Collections
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
