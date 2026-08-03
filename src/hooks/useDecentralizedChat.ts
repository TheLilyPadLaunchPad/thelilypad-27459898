import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/providers/WalletProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { DECENTRALIZED_CHAT_ENABLED } from '@/config/featureFlags';
import {
import { PUBLIC_CHAT_MESSAGE_COLUMNS } from '@/integrations/supabase/columns';
    getDecentralizedMessages,
    sendDecentralizedMessage,
    DecentralizedMessage
} from '@/integrations/arweave/messagingClient';

export interface MergedMessage extends Omit<DecentralizedMessage, 'id'> {
    id: string;
    is_decentralized: boolean;
    is_syncing?: boolean;
}

export const useDecentralizedChat = (contextId: string) => {
    const [messages, setMessages] = useState<MergedMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const { address, isConnected, network } = useWallet();
    const { profile } = useUserProfile();

    // 1. Fetch initial history
    useEffect(() => {
        const loadHistory = async () => {
            setLoading(true);
            try {
                // Fetch from Supabase (Centralized Cache)
                const { data: supabaseMsgs } = await supabase
                    .from('stream_chat_messages')
                    .select(PUBLIC_CHAT_MESSAGE_COLUMNS)
                    .eq('playback_id', contextId)
                    .order('created_at', { ascending: true })
                    .limit(50);

                // Fetch from Arweave (Decentralized Archive) — gated by feature flag.
                // Under native Arweave, per-message L1 txs are uneconomical, so the
                // on-chain archive is disabled by default. Supabase remains the source of truth.
                const arweaveMsgs = DECENTRALIZED_CHAT_ENABLED
                    ? await getDecentralizedMessages(contextId, 50)
                    : [];

                // Merge and deduplicate
                // Note: We use message content + timestamp as a proxy for deduplication 
                // if we don't have a shared ID yet.
                const mergedMap = new Map<string, MergedMessage>();

                supabaseMsgs?.forEach(m => {
                    const key = `${m.message}-${new Date(m.created_at).getTime()}`;
                    mergedMap.set(key, {
                        id: m.id,
                        context_id: m.playback_id,
                        sender_address: m.wallet_address || '', // Fallback if schema doesn't have it
                        sender_name: m.username,
                        content: m.message,
                        message_type: m.message_type as any,
                        sticker_url: m.sticker_url,
                        timestamp: m.created_at,
                        is_decentralized: false
                    });
                });

                arweaveMsgs.forEach(m => {
                    const key = `${m.content}-${new Date(m.timestamp).getTime()}`;
                    mergedMap.set(key, {
                        ...m,
                        id: m.id!,
                        is_decentralized: true
                    });
                });

                const sorted = Array.from(mergedMap.values())
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                setMessages(sorted);
            } catch (e) {
                console.warn("History fetch failed:", e);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, [contextId]);

    // 2. Real-time Subscription (Supabase)
    useEffect(() => {
        const channel = supabase
            .channel(`dchat-${contextId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'stream_chat_messages',
                filter: `playback_id=eq.${contextId}`
            }, (payload) => {
                const m = payload.new;
                setMessages(prev => {
                    // Avoid dups
                    if (prev.some(p => p.content === m.message && new Date(p.timestamp).getTime() === new Date(m.created_at).getTime())) {
                        return prev;
                    }
                    return [...prev, {
                        id: m.id,
                        context_id: m.playback_id,
                        sender_address: m.wallet_address || '',
                        sender_name: m.username,
                        content: m.message,
                        message_type: m.message_type as any,
                        sticker_url: m.sticker_url,
                        timestamp: m.created_at,
                        is_decentralized: false
                    }];
                });
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [contextId]);

    // 3. Send Message (Hybrid)
    const sendMessage = async (content: string, type: 'text' | 'sticker' = 'text', stickerMeta?: any) => {
        if (!isConnected || !address) return;

        const displayName = profile?.display_name || address.slice(0, 6);

        // optimistic update
        const tempId = `temp-${Date.now()}`;
        const newMsg: MergedMessage = {
            id: tempId,
            context_id: contextId,
            sender_address: address,
            sender_name: displayName,
            content,
            message_type: type as any,
            timestamp: new Date().toISOString(),
            is_decentralized: false,
            is_syncing: true,
            ...stickerMeta
        };

        setMessages(prev => [...prev, newMsg]);

        try {
            // A. Send to Supabase (Immediate)
            // Get session the right way
            const { data: { session } } = await supabase.auth.getSession();

            const { data: sbData } = await supabase.from('stream_chat_messages').insert({
                playback_id: contextId,
                user_id: session?.user?.id || null, // Optional in some schemas, but good to have
                wallet_address: address,
                username: displayName,
                message: content,
                message_type: type,
                ...stickerMeta
            }).select().single();

            // Replace temp msg with real one
            if (sbData) {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...newMsg, id: sbData.id, is_syncing: false } : m));
            }

            // B. Send to Arweave (Background Persistence) — gated.
            // Native Arweave requires a wallet signature + AR payment per message,
            // so this is disabled unless the feature flag is explicitly enabled.
            if (DECENTRALIZED_CHAT_ENABLED) {
                await sendDecentralizedMessage({
                    context_id: contextId,
                    sender_address: address,
                    sender_name: displayName,
                    content,
                    message_type: type as any,
                    ...stickerMeta
                }, { address, network });
            }

        } catch (e) {
            console.warn("Message delivery failed:", e);
        }
    };

    return {
        messages,
        loading,
        sendMessage,
        address
    };
};
