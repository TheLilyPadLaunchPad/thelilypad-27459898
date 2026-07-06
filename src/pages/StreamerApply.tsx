import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio, ArrowLeft, Send, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { Navbar } from '@/components/Navbar';
import { useSEO } from '@/hooks/useSEO';

export default function StreamerApply() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [existingApp, setExistingApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [email, setEmail] = useState('');
  const [contentType, setContentType] = useState('');
  const [platformLinks, setPlatformLinks] = useState('');
  const [schedule, setSchedule] = useState('');
  const [motivation, setMotivation] = useState('');
  const [socialTwitter, setSocialTwitter] = useState('');
  const [socialYoutube, setSocialYoutube] = useState('');

  useSEO({ title: 'Apply to Stream | The Lily Pad', description: 'Apply to become a streamer on The Lily Pad' });

  useEffect(() => {
    if (!profile?.user_id) return;
    const check = async () => {
      const { data } = await (supabase as any)
        .from('my_streamer_application')
        .select('*')
        .eq('user_id', profile.user_id)
        .maybeSingle();
      if (data) setExistingApp(data);
      setLoading(false);
    };
    check();
  }, [profile?.user_id]);

  const handleSubmit = async () => {
    if (!profile?.user_id) return;
    if (!displayName || !email || !contentType) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const links = platformLinks.split('\n').map(l => l.trim()).filter(Boolean);
      await (supabase.from('streamer_applications') as any).insert({
        user_id: profile.user_id,
        display_name: displayName,
        email,
        content_type: contentType,
        platform_links: links,
        schedule_description: schedule,
        motivation,
        social_links: { twitter: socialTwitter, youtube: socialYoutube },
      });

      toast.success('Application submitted! 🎉');
      navigate('/waitroom', { replace: true });
    } catch (e: any) {
      toast.error('Failed to submit', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;

  if (existingApp) {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        case 'reviewing': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        case 'interview_scheduled': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
        case 'approved': return 'bg-green-500/20 text-green-400 border-green-500/30';
        case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
        default: return '';
      }
    };

    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="max-w-2xl mx-auto">
            <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 mb-6">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Card className="border-primary/20">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                  <FileText className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="text-2xl">Application Status</CardTitle>
                <CardDescription>Your streamer application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <Badge className={`text-sm px-4 py-2 ${getStatusColor(existingApp.status)}`}>
                    {existingApp.status === 'interview_scheduled' ? '📅 Interview Scheduled' :
                      existingApp.status === 'approved' ? '✅ Approved' :
                        existingApp.status === 'rejected' ? '❌ Rejected' :
                          existingApp.status === 'reviewing' ? '🔍 Under Review' :
                            '⏳ Pending Review'}
                  </Badge>
                </div>

                <div className="grid gap-4 text-sm">
                  <div className="flex justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-muted-foreground">Applied as</span>
                    <span className="font-medium capitalize text-right">{existingApp.content_type || 'Streamer'}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="font-medium text-right">{new Date(existingApp.created_at).toLocaleDateString()}</span>
                  </div>
                  {existingApp.interview_scheduled_at && (
                    <div className="flex flex-col sm:flex-row justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 gap-2">
                      <span className="text-purple-400">Interview</span>
                      <span className="font-medium text-purple-300 sm:text-right">
                        {new Date(existingApp.interview_scheduled_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {existingApp.status === 'interview_scheduled' && existingApp.interview_room_id ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate(`/interview/${existingApp.id}`)}
                  >
                    <Radio className="h-4 w-4" />
                    Join Interview Room
                  </Button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-center text-muted-foreground mb-2">We'll notify you when it's reviewed. In the meantime, hang out in the wait room!</p>
                    <Button onClick={() => navigate('/waitroom')} className="gap-2 w-full" variant="outline">
                      Go to Wait Room 🐸
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-lg">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                Streamer Application
              </CardTitle>
              <p className="text-sm text-muted-foreground">Apply to become a verified streamer on The Lily Pad</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Display Name *</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your streamer name" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              </div>
              <div className="space-y-2">
                <Label>Content Type *</Label>
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger><SelectValue placeholder="What will you stream?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gaming">Gaming</SelectItem>
                    <SelectItem value="just-chatting">Just Chatting</SelectItem>
                    <SelectItem value="music">Music / DJ</SelectItem>
                    <SelectItem value="art">Art / Creative</SelectItem>
                    <SelectItem value="crypto">Crypto / DeFi</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Platform Links (one per line)</Label>
                <Textarea value={platformLinks} onChange={(e) => setPlatformLinks(e.target.value)} placeholder="https://twitch.tv/yourname&#10;https://youtube.com/@yourname" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Streaming Schedule</Label>
                <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="e.g. Mon-Fri 8pm EST" />
              </div>
              <div className="space-y-2">
                <Label>Why do you want to stream on The Lily Pad?</Label>
                <Textarea value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="Tell us about yourself..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Twitter / X</Label>
                  <Input value={socialTwitter} onChange={(e) => setSocialTwitter(e.target.value)} placeholder="@handle" />
                </div>
                <div className="space-y-2">
                  <Label>YouTube</Label>
                  <Input value={socialYoutube} onChange={(e) => setSocialYoutube(e.target.value)} placeholder="@channel" />
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2">
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
