import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSEO } from '@/hooks/useSEO';
import { toast } from '@/hooks/use-toast';
import FrogLoader from '@/components/FrogLoader';
import { Video, ShieldCheck, ArrowLeft, ExternalLink, Clock, Users } from 'lucide-react';

const InterviewRoom: React.FC = () => {
    const { applicationId } = useParams<{ applicationId: string }>();
    const navigate = useNavigate();
    const { isAdmin, loading: adminLoading } = useIsAdmin();
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [roomName, setRoomName] = useState<string | null>(null);
    const [application, setApplication] = useState<any>(null);
    const [jitsiLoaded, setJitsiLoaded] = useState(false);

    useSEO({
        title: 'Creator Interview | The Lily Pad',
        description: 'Private interview room for creator beta program',
    });

    useEffect(() => {
        const checkAccess = async () => {
            if (!applicationId) { setLoading(false); return; }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast({ title: 'Not Authenticated', description: 'Please log in to access this page.', variant: 'destructive' });
                navigate('/auth');
                return;
            }

            const query = isAdmin
                ? (supabase as any).from('creator_beta_applications').select('*').eq('id', applicationId).single()
                : (supabase as any).rpc('get_my_creator_beta_application').eq('id', applicationId).maybeSingle();
            const { data: app, error } = await query;


            if (error || !app) {
                toast({ title: 'Not Found', description: 'Interview not found.', variant: 'destructive' });
                navigate('/');
                return;
            }

            setApplication(app);

            // Auth check: only the applicant or admins can access
            const isApplicant = user.id === (app as any).user_id;

            if (!isApplicant && !isAdmin) {
                toast({ title: 'Access Denied', description: 'You are not authorized to join this interview.', variant: 'destructive' });
                navigate('/');
                return;
            }

            if ((app as any).interview_room_id) {
                setRoomName((app as any).interview_room_id);
            } else {
                // Auto-generate room for admin
                const newRoom = `thelilypad-interview-${applicationId.slice(0, 12)}`;
                await supabase
                    .from('creator_beta_applications')
                    .update({ interview_room_id: newRoom, status: 'interview_scheduled' } as any)
                    .eq('id', applicationId);
                setRoomName(newRoom);
            }

            setAuthorized(true);
            setLoading(false);
        };

        if (!adminLoading) {
            checkAccess();
        }
    }, [applicationId, isAdmin, adminLoading, navigate]);

    // Load Jitsi Meet external API script dynamically
    useEffect(() => {
        if (!authorized || !roomName) return;

        const existingScript = document.querySelector('script[src*="meet.jit.si"]');
        if (existingScript) {
            setJitsiLoaded(true);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.async = true;
        script.onload = () => setJitsiLoaded(true);
        script.onerror = () => {
            toast({ title: 'Error', description: 'Failed to load video conferencing. Please try again.', variant: 'destructive' });
        };
        document.head.appendChild(script);

        return () => {
            // Cleanup: we leave the script for potential re-use
        };
    }, [authorized, roomName]);

    // Initialize Jitsi when script is loaded
    useEffect(() => {
        if (!jitsiLoaded || !roomName) return;

        const container = document.getElementById('jitsi-container');
        if (!container) return;

        // Clear any existing meeting
        container.innerHTML = '';

        try {
            const api = new (window as any).JitsiMeetExternalAPI('meet.jit.si', {
                roomName: roomName,
                parentNode: container,
                width: '100%',
                height: '100%',
                configOverwrite: {
                    startWithAudioMuted: true,
                    startWithVideoMuted: true,
                    prejoinPageEnabled: true,
                    disableDeepLinking: true,
                    toolbarButtons: [
                        'microphone', 'camera', 'closedcaptions', 'desktop',
                        'fullscreen', 'hangup', 'chat', 'recording',
                        'settings', 'raisehand', 'videoquality',
                        'tileview', 'select-background',
                    ],
                },
                interfaceConfigOverwrite: {
                    SHOW_JITSI_WATERMARK: false,
                    SHOW_WATERMARK_FOR_GUESTS: false,
                    DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
                    MOBILE_APP_PROMO: false,
                },
                userInfo: {
                    displayName: application?.display_name || 'Participant',
                },
            });

            api.addEventListener('readyToClose', () => {
                navigate(isAdmin ? '/admin' : '/dashboard');
            });

            return () => {
                api.dispose();
            };
        } catch (err) {
            console.error('Jitsi init error:', err);
        }
    }, [jitsiLoaded, roomName, application, isAdmin, navigate]);

    if (loading || adminLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <FrogLoader text="Preparing interview room..." />
            </div>
        );
    }

    if (!authorized) {
        return null;
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Compact header */}
            <div className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-primary/10">
                                <Video className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-sm font-semibold">Creator Interview</h1>
                                <p className="text-xs text-muted-foreground">
                                    {application?.display_name} — {application?.content_type}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <Badge className="bg-primary/20 text-primary border-primary/30">
                                <ShieldCheck className="w-3 h-3 mr-1" /> Admin
                            </Badge>
                        )}
                        <Badge variant="outline" className="text-green-500 border-green-500/30">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1" />
                            Live
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Jitsi container */}
            <div className="flex-1 relative">
                {!jitsiLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                        <div className="text-center">
                            <FrogLoader text="Loading video conference..." />
                        </div>
                    </div>
                )}
                <div id="jitsi-container" className="w-full h-full" style={{ minHeight: 'calc(100vh - 57px)' }} />
            </div>
        </div>
    );
};

export default InterviewRoom;
