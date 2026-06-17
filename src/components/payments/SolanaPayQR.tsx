import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
    buildSolanaPayIntent,
    buildSolanaPayQrDataUrl,
    type SolanaPayParams,
} from '@/chains/solana/solanaPay';

interface SolanaPayQRProps extends SolanaPayParams {
    /** Auto-poll the chain to confirm + record the tx. Default true. */
    autoConfirm?: boolean;
    /** Called once the payment is detected on-chain. */
    onConfirmed?: (signature: string) => void;
    /** Optional extra context recorded server-side (e.g. shop_item_id). */
    context?: Record<string, string | number>;
}

type Status = 'waiting' | 'confirming' | 'confirmed' | 'timeout';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function SolanaPayQR(props: SolanaPayQRProps) {
    const { autoConfirm = true, onConfirmed, context, ...payParams } = props;
    const { toast } = useToast();

    // Build the intent once per param change
    const intent = useMemo(() => buildSolanaPayIntent(payParams), [
        payParams.recipient,
        payParams.amountSol,
        payParams.action,
        payParams.label,
        payParams.message,
        JSON.stringify(payParams.meta ?? {}),
    ]);

    const [qrSrc, setQrSrc] = useState<string>('');
    const [status, setStatus] = useState<Status>('waiting');
    const [signature, setSignature] = useState<string>('');

    useEffect(() => {
        let cancelled = false;
        buildSolanaPayQrDataUrl(intent.url).then((src) => {
            if (!cancelled) setQrSrc(src);
        });
        return () => {
            cancelled = true;
        };
    }, [intent.url]);

    useEffect(() => {
        if (!autoConfirm) return;
        let cancelled = false;
        const start = Date.now();

        const poll = async () => {
            if (cancelled) return;
            if (Date.now() - start > POLL_TIMEOUT_MS) {
                setStatus('timeout');
                return;
            }
            try {
                const { data, error } = await supabase.functions.invoke(
                    'solana-pay-confirm',
                    {
                        body: {
                            reference: intent.reference,
                            recipient: payParams.recipient,
                            amountSol: payParams.amountSol,
                            action: payParams.action,
                            memo: intent.memo,
                            context: context ?? {},
                        },
                    },
                );
                if (cancelled) return;
                if (!error && data?.signature) {
                    setSignature(data.signature);
                    setStatus('confirmed');
                    onConfirmed?.(data.signature);
                    return;
                }
            } catch {
                // network blip — keep polling
            }
            setStatus('confirming');
            setTimeout(poll, POLL_INTERVAL_MS);
        };

        setStatus('confirming');
        poll();

        return () => {
            cancelled = true;
        };
    }, [autoConfirm, intent.reference, intent.memo, payParams.recipient, payParams.amountSol, payParams.action, JSON.stringify(context ?? {}), onConfirmed]);

    const copy = () => {
        navigator.clipboard.writeText(intent.url);
        toast({ title: 'Copied', description: 'Solana Pay link copied to clipboard.' });
    };

    return (
        <Card className="w-full max-w-sm mx-auto">
            <CardHeader>
                <CardTitle className="text-base">Scan to pay</CardTitle>
                <CardDescription>
                    Open your Solana wallet on your phone and scan this QR to send {payParams.amountSol} SOL.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="aspect-square w-full rounded-md border bg-white p-2 flex items-center justify-center">
                    {qrSrc ? (
                        <img src={qrSrc} alt="Solana Pay QR" className="w-full h-full" />
                    ) : (
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    )}
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={copy}>
                        <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link
                    </Button>
                    <Button asChild variant="outline" size="sm" className="flex-1">
                        <a href={intent.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open
                        </a>
                    </Button>
                </div>

                <StatusBadge status={status} signature={signature} />
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status, signature }: { status: Status; signature: string }) {
    if (status === 'confirmed') {
        return (
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-2 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Payment confirmed</span>
                <a
                    href={`https://solscan.io/tx/${signature}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs underline shrink-0"
                >
                    View
                </a>
            </div>
        );
    }
    if (status === 'timeout') {
        return (
            <p className="text-xs text-muted-foreground">
                Not detected yet. If you've paid, refresh the page in a minute — the confirmation will appear.
            </p>
        );
    }
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Waiting for payment...
        </div>
    );
}
