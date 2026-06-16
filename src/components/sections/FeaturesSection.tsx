import React, { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { Send, Users } from "lucide-react";
import { LilyPadLogo } from "@/components/LilyPadLogo";

interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

export const FeaturesSection: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { profile } = useUserProfile();
  const { walletAddress } = useAuth();

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('waitroom_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
      if (data) setMessages(data as ChatMessage[]);
    };
    fetchMessages();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('waitroom-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waitroom_messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: profile?.user_id || 'anon', online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [profile?.user_id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !profile) return;
    setSending(true);
    try {
      await (supabase.from('waitroom_messages') as any).insert({
        user_id: profile.user_id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        content: newMessage.trim(),
      });
      setNewMessage('');
    } catch (e: any) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const shortWallet = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  return (
    <section className="py-16 relative">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Community <span className="gradient-text">Chat</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Connect with the community while waiting for the next big drop!
          </p>
        </div>

        {/* Chat area */}
        <div className="max-w-4xl mx-auto">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <div className="p-4 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LilyPadLogo size={32} />
                <div>
                  <h2 className="font-bold text-lg">The Lily Pad Community</h2>
                  <p className="text-xs text-muted-foreground">Chat with fellow collectors and creators 🐸</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <Users className="w-4 h-4" />
                <span>{onlineCount} online</span>
              </div>
            </div>

            <ScrollArea className="h-[500px]">
              <div className="p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <LilyPadLogo size={48} />
                    <p className="mt-4">No messages yet. Be the first to say hello! 👋</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-3"
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarImage src={msg.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary/20">
                        {msg.display_name?.[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm truncate">
                          {msg.display_name || 'Anonymous'}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 break-words">{msg.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border/50">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex gap-2"
              >
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={500}
                  disabled={sending}
                />
                <Button type="submit" disabled={sending || !newMessage.trim()} size="icon">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};
