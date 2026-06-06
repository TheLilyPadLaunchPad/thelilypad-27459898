import { useState, useEffect, useRef } from 'react';
import { useDecentralizedChat } from '@/hooks/useDecentralizedChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, MessageCircle, Users, Loader2, ShieldCheck, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { StickerEmojiPicker } from '@/components/chat/StickerEmojiPicker';

interface ChatMessage {
  id: string;
  playback_id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'text' | 'sticker' | 'emoji';
  sticker_url?: string | null;
  sticker_name?: string | null;
  sticker_item_id?: string | null;
  created_at: string;
}

interface SelectedSticker {
  url: string;
  name: string;
  itemId: string;
}

interface LiveChatProps {
  playbackId: string;
  className?: string;
}

export const LiveChat = ({ playbackId, className = '' }: LiveChatProps) => {
  const { messages, loading: isLoading, sendMessage, address: walletAddress } = useDecentralizedChat(playbackId);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Still track presence for viewer count via Supabase
  useEffect(() => {
    const presenceChannel = (window as any).supabase?.channel(`presence-${playbackId}`, {
      config: {
        presence: {
          key: walletAddress || `anon-${Math.random().toString(36).slice(2)}`
        }
      }
    });

    if (!presenceChannel) return;

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      (window as any).supabase?.removeChannel(presenceChannel);
    };
  }, [playbackId, walletAddress]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    if (!walletAddress) {
      toast.error('Please connect wallet to chat');
      return;
    }

    setIsSending(true);
    await sendMessage(newMessage.trim(), 'text');
    setNewMessage('');
    setIsSending(false);
  };

  const handleSendSticker = async (sticker: SelectedSticker) => {
    if (!walletAddress) {
      toast.error('Please connect wallet to chat');
      return;
    }

    setIsSending(true);
    await sendMessage('', 'sticker', {
      sticker_url: sticker.url,
      sticker_name: sticker.name,
      sticker_item_id: sticker.itemId
    });
    setIsSending(false);
  };

  const getAvatarColor = (username: string) => {
    const colors = [
      'bg-red-500', 'bg-blue-500', 'bg-green-500',
      'bg-yellow-500', 'bg-purple-500', 'bg-pink-500',
      'bg-indigo-500', 'bg-teal-500', 'bg-orange-500'
    ];
    const index = username.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const renderMessageContent = (msg: any) => {
    if (msg.message_type === 'sticker' || msg.message_type === 'emoji') {
      return (
        <img
          src={msg.sticker_url || ''}
          alt={msg.sticker_name || 'Sticker'}
          className="max-w-24 max-h-24 rounded object-contain"
          title={msg.sticker_name || undefined}
        />
      );
    }

    return (
      <p className="text-sm text-foreground/90 break-words">
        {msg.content}
      </p>
    );
  };

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="py-3 px-4 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Live Chat
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {viewerCount}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  No messages yet. Be the first to chat!
                </p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="flex gap-2 group">
                    <Avatar className={`h-6 w-6 flex-shrink-0 ${getAvatarColor(msg.sender_name)}`}>
                      <AvatarFallback className="text-xs text-white">
                        {msg.sender_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-sm truncate">
                          {msg.sender_name}
                        </span>
                        <div className="flex items-center gap-1">
                          {msg.is_decentralized ? (
                            <span title="Permanently Stored on Arweave">
                              <ShieldCheck className="h-3 w-3 text-primary opacity-60" />
                            </span>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      {renderMessageContent(msg)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}

        <form onSubmit={handleSendMessage} className="p-3 border-t">
          {!walletAddress ? (
            <p className="text-center text-muted-foreground text-sm py-2">
              Connect wallet to chat
            </p>
          ) : (
            <div className="flex gap-2">
              <StickerEmojiPicker
                userId={walletAddress}
                onSelect={handleSendSticker}
              />
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Send a message..."
                maxLength={500}
                disabled={isSending}
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isSending || !newMessage.trim()}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
};

export default LiveChat;
