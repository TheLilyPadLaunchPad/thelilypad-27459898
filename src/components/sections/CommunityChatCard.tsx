import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Send, MessageCircle, Users, Loader2, LogIn, SmilePlus, MoreVertical, Trash2, Ban, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { PUBLIC_CHAT_MESSAGE_COLUMNS } from '@/integrations/supabase/columns';

const COMMUNITY_CHAT_ID = 'community-lounge';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '🎉'];

interface ChatMessage {
  id: string;
  playback_id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'text' | 'sticker' | 'emoji';
  sticker_url?: string | null;
  sticker_name?: string | null;
  created_at: string;
}

interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface ReactionCount {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export const CommunityChatCard: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check auth state and admin/banned status
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          checkUserStatus(session.user.id);
        } else {
          setIsAdmin(false);
          setIsBanned(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserStatus = async (userId: string) => {
    // Check if user is admin
    const { data: adminData } = await supabase.rpc('has_role', {
      _user_id: userId,
      _role: 'admin'
    });
    setIsAdmin(!!adminData);

    // Check if user is banned
    const { data: bannedData } = await supabase.rpc('is_user_banned', {
      _user_id: userId
    });
    setIsBanned(!!bannedData);
  };

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('stream_chat_messages')
        .select(PUBLIC_CHAT_MESSAGE_COLUMNS)
        .eq('playback_id', COMMUNITY_CHAT_ID)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages((data as ChatMessage[]) || []);

        // Fetch reactions for these messages
        if (data && data.length > 0) {
          const messageIds = data.map(m => m.id);
          const { data: reactionsData } = await supabase
            .from('chat_message_reactions')
            .select('*')
            .in('message_id', messageIds);

          if (reactionsData) {
            const grouped: Record<string, MessageReaction[]> = {};
            reactionsData.forEach((r: MessageReaction) => {
              if (!grouped[r.message_id]) grouped[r.message_id] = [];
              grouped[r.message_id].push(r);
            });
            setReactions(grouped);
          }
        }
      }
      setIsLoading(false);
    };

    fetchMessages();
  }, []);

  // Subscribe to new messages and reactions
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${COMMUNITY_CHAT_ID}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_chat_messages',
          filter: `playback_id=eq.${COMMUNITY_CHAT_ID}`
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages(prev => [...prev, newMsg]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'stream_chat_messages',
          filter: `playback_id=eq.${COMMUNITY_CHAT_ID}`
        },
        (payload) => {
          const deletedId = payload.old.id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_message_reactions'
        },
        (payload) => {
          const newReaction = payload.new as MessageReaction;
          setReactions(prev => ({
            ...prev,
            [newReaction.message_id]: [...(prev[newReaction.message_id] || []), newReaction]
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_message_reactions'
        },
        (payload) => {
          const deletedReaction = payload.old as MessageReaction;
          setReactions(prev => ({
            ...prev,
            [deletedReaction.message_id]: (prev[deletedReaction.message_id] || []).filter(r => r.id !== deletedReaction.id)
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Track presence for viewer count
  useEffect(() => {
    const presenceChannel = supabase.channel(`presence-${COMMUNITY_CHAT_ID}`, {
      config: {
        presence: {
          key: user?.id || `anon-${Math.random().toString(36).slice(2)}`
        }
      }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [user?.id]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim()) return;

    if (!user) {
      toast.error('Please sign in to chat');
      return;
    }

    if (isBanned) {
      toast.error('You are banned from chatting');
      return;
    }

    if (newMessage.length > 500) {
      toast.error('Message too long (max 500 characters)');
      return;
    }

    setIsSending(true);

    const { error } = await supabase
      .from('stream_chat_messages')
      .insert({
        playback_id: COMMUNITY_CHAT_ID,
        user_id: user.id,
        username: user.email?.split('@')[0] || 'Anonymous',
        message: newMessage.trim(),
        message_type: 'text'
      });

    if (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } else {
      setNewMessage('');
    }

    setIsSending(false);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) {
      toast.error('Please sign in to react');
      return;
    }

    if (isBanned) {
      toast.error('You are banned from chatting');
      return;
    }

    const messageReactions = reactions[messageId] || [];
    const existingReaction = messageReactions.find(r => r.user_id === user.id && r.emoji === emoji);

    if (existingReaction) {
      // Remove reaction
      const { error } = await supabase
        .from('chat_message_reactions')
        .delete()
        .eq('id', existingReaction.id);

      if (error) {
        console.error('Error removing reaction:', error);
      }
    } else {
      // Add reaction
      const { error } = await supabase
        .from('chat_message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji
        });

      if (error) {
        console.error('Error adding reaction:', error);
      }
    }
  };

  const getReactionCounts = (messageId: string): ReactionCount[] => {
    const messageReactions = reactions[messageId] || [];
    const counts: Record<string, ReactionCount> = {};

    messageReactions.forEach(r => {
      if (!counts[r.emoji]) {
        counts[r.emoji] = { emoji: r.emoji, count: 0, userReacted: false };
      }
      counts[r.emoji].count++;
      if (user && r.user_id === user.id) {
        counts[r.emoji].userReacted = true;
      }
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('stream_chat_messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    } else {
      toast.success('Message deleted');
    }
  };

  const handleBanUser = async (userId: string, username: string) => {
    if (!isAdmin || !user) return;

    const { error } = await supabase
      .from('banned_users')
      .insert({
        user_id: userId,
        banned_by: user.id,
        reason: 'Banned from community chat by admin'
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('User is already banned');
      } else {
        console.error('Error banning user:', error);
        toast.error('Failed to ban user');
      }
    } else {
      toast.success(`${username} has been banned`);
    }
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <Card className="relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm h-full">
        {/* Retro gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/10 opacity-50" />

        <CardContent className="relative p-0 flex flex-col h-[400px]">
          {/* Header */}
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-background/80 text-primary">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">Community Lounge</h3>
                  <p className="text-xs text-muted-foreground">Chat with fellow collectors</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <Users className="h-3 w-3" />
                {viewerCount} online
              </div>
            </div>
          </div>

          {/* Messages area */}
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
                  messages.map((msg) => {
                    const reactionCounts = getReactionCounts(msg.id);

                    return (
                      <div key={msg.id} className="group">
                        <div className="flex gap-2">
                          <Avatar className={`h-6 w-6 flex-shrink-0 ${getAvatarColor(msg.username)}`}>
                            <AvatarFallback className="text-xs text-white">
                              {msg.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-medium text-sm truncate text-foreground">
                                {msg.username}
                              </span>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            {msg.message_type === 'sticker' || msg.message_type === 'emoji' ? (
                              <img
                                src={msg.sticker_url || ''}
                                alt={msg.sticker_name || 'Sticker'}
                                className="max-w-24 max-h-24 rounded object-contain"
                              />
                            ) : (
                              <p className="text-sm text-foreground/90 break-words">
                                {msg.message}
                              </p>
                            )}
                          </div>

                          {/* Moderation & reaction buttons */}
                          <div className="flex items-start gap-1">
                            {/* Add reaction button */}
                            {user && !isBanned && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <SmilePlus className="h-3.5 w-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-2" side="top">
                                  <div className="flex gap-1">
                                    {REACTION_EMOJIS.map(emoji => (
                                      <button
                                        key={emoji}
                                        onClick={() => handleReaction(msg.id, emoji)}
                                        className="text-lg hover:scale-125 transition-transform p-1"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}

                            {/* Admin moderation menu */}
                            {isAdmin && msg.user_id !== user?.id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive/70 hover:text-destructive"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete message
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleBanUser(msg.user_id, msg.username)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Ban className="h-4 w-4 mr-2" />
                                    Ban user
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}

                            {/* Delete own message */}
                            {user?.id === msg.user_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteMessage(msg.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Reactions display */}
                        <AnimatePresence>
                          {reactionCounts.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex flex-wrap gap-1 mt-1 ml-8"
                            >
                              {reactionCounts.map(({ emoji, count, userReacted }) => (
                                <button
                                  key={emoji}
                                  onClick={() => user && handleReaction(msg.id, emoji)}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors ${userReacted
                                      ? 'bg-primary/20 border border-primary/40'
                                      : 'bg-muted/50 hover:bg-muted border border-transparent'
                                    }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-muted-foreground">{count}</span>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}

          {/* Input area */}
          <div className="p-3 border-t border-border/50 bg-background/30">
            {!user ? (
              <div className="text-center text-sm text-muted-foreground py-2">
                Connect your wallet to join the conversation
              </div>
            ) : isBanned ? (
              <div className="flex items-center justify-center gap-2 text-destructive text-sm py-2">
                <ShieldAlert className="h-4 w-4" />
                You are banned from chatting
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Say something..."
                  maxLength={500}
                  disabled={isSending}
                  className="flex-1 bg-background/50"
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
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};