import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useSEO } from '@/hooks/useSEO';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, ArrowRight, Check, Loader2, Sparkles,
    Link as LinkIcon, Twitter, Youtube, MessageCircle, Music2,
    Send, FileText, User, Palette, Mic, Radio, CheckCircle
} from 'lucide-react';

const CONTENT_TYPES = [
    { value: 'streamer', label: 'Streamer', icon: Radio, description: 'Live stream content creator' },
    { value: 'artist', label: 'Visual Artist', icon: Palette, description: 'Digital art, illustrations, generative art' },
    { value: 'musician', label: 'Musician', icon: Mic, description: 'Music producer, DJ, songwriter' },
    { value: 'other', label: 'Other', icon: Sparkles, description: 'Something unique!' },
];

const STEPS = ['Basic Info', 'Portfolio', 'Socials', 'Motivation', 'Review'];

interface FormData {
    display_name: string;
    email: string;
    content_type: string;
    portfolio_urls: string[];
    social_twitter: string;
    social_youtube: string;
    social_discord: string;
    social_tiktok: string;
    motivation: string;
}

const CreatorApply: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [existingApp, setExistingApp] = useState<any>(null);
    const [checkingExisting, setCheckingExisting] = useState(true);
    const [formData, setFormData] = useState<FormData>({
        display_name: '',
        email: '',
        content_type: '',
        portfolio_urls: [''],
        social_twitter: '',
        social_youtube: '',
        social_discord: '',
        social_tiktok: '',
        motivation: '',
    });

    useSEO({
        title: 'Apply to Creator Beta | The Lily Pad',
        description: 'Join The Lily Pad creator program. Apply to become a verified creator, launch NFT collections, and start streaming.',
    });

    // Check if user already has an application
    useEffect(() => {
        const checkExisting = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setCheckingExisting(false); return; }

            const { data } = await (supabase as any)
                .from('my_creator_beta_application')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (data) setExistingApp(data);
            setCheckingExisting(false);
        };
        checkExisting();
    }, []);

    const updateField = (field: keyof FormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const addPortfolioUrl = () => {
        setFormData(prev => ({ ...prev, portfolio_urls: [...prev.portfolio_urls, ''] }));
    };

    const updatePortfolioUrl = (index: number, value: string) => {
        setFormData(prev => {
            const urls = [...prev.portfolio_urls];
            urls[index] = value;
            return { ...prev, portfolio_urls: urls };
        });
    };

    const removePortfolioUrl = (index: number) => {
        setFormData(prev => ({
            ...prev,
            portfolio_urls: prev.portfolio_urls.filter((_, i) => i !== index),
        }));
    };

    // Step validation
    const canAdvance = (): boolean => {
        switch (step) {
            case 0:
                return formData.display_name.trim().length > 0
                    && formData.email.includes('@')
                    && formData.content_type !== '';
            case 1:
                return formData.portfolio_urls.filter(u => u.trim().length > 0).length >= 1;
            case 2:
                return true; // Socials are optional
            case 3:
                return formData.motivation.trim().length >= 50;
            default:
                return true;
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const socialLinks: Record<string, string> = {};
            if (formData.social_twitter) socialLinks.twitter = formData.social_twitter;
            if (formData.social_youtube) socialLinks.youtube = formData.social_youtube;
            if (formData.social_discord) socialLinks.discord = formData.social_discord;
            if (formData.social_tiktok) socialLinks.tiktok = formData.social_tiktok;

            const { error } = await supabase.from('creator_beta_applications').insert({
                user_id: user.id,
                display_name: formData.display_name.trim(),
                email: formData.email.trim(),
                content_type: formData.content_type,
                portfolio_urls: formData.portfolio_urls.filter(u => u.trim().length > 0),
                social_links: socialLinks,
                motivation: formData.motivation.trim(),
                status: 'pending',
            });

            if (error) {
                if (error.code === '23505') {
                    toast({ title: 'Already Applied', description: 'You already have an active application.', variant: 'destructive' });
                } else {
                    throw error;
                }
                return;
            }

            toast({ title: '🎉 Application Submitted!', description: "We'll review your application and get back to you soon." });
            navigate('/dashboard');
        } catch (err) {
            console.error('Submit error:', err);
            toast({ title: 'Submission Failed', description: 'Please try again later.', variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

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

    if (checkingExisting) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar />
                <main className="container mx-auto px-4 pt-24 pb-12 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </main>
            </div>
        );
    }

    // Show existing application status
    if (existingApp) {
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
                                <CardDescription>Your creator beta application</CardDescription>
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
                                        <span className="font-medium capitalize">{existingApp.content_type}</span>
                                    </div>
                                    <div className="flex justify-between p-3 rounded-lg bg-muted/30">
                                        <span className="text-muted-foreground">Submitted</span>
                                        <span className="font-medium">{new Date(existingApp.created_at).toLocaleDateString()}</span>
                                    </div>
                                    {existingApp.interview_scheduled_at && (
                                        <div className="flex justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                            <span className="text-purple-400">Interview</span>
                                            <span className="font-medium text-purple-300">
                                                {new Date(existingApp.interview_scheduled_at).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {existingApp.status === 'interview_scheduled' && existingApp.interview_room_id && (
                                    <Button
                                        className="w-full gap-2"
                                        onClick={() => navigate(`/interview/${existingApp.id}`)}
                                    >
                                        <Radio className="h-4 w-4" />
                                        Join Interview Room
                                    </Button>
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
            <main className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-2xl mx-auto">
                    <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 mb-6">
                        <ArrowLeft className="h-4 w-4" /> Back
                    </Button>

                    {/* Header */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
                        <div className="mx-auto mb-4 p-4 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 w-fit">
                            <Sparkles className="h-10 w-10 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold mb-2">Apply to Creator Beta</h1>
                        <p className="text-muted-foreground">
                            Join The Lily Pad as a verified creator. Launch NFT collections, go live, and grow your audience.
                        </p>
                    </motion.div>

                    {/* Progress Bar */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-2">
                            {STEPS.map((label, i) => (
                                <div key={label} className="flex items-center gap-1 text-xs">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i < step ? 'bg-primary text-primary-foreground' :
                                            i === step ? 'bg-primary/20 text-primary border-2 border-primary' :
                                                'bg-muted text-muted-foreground'
                                        }`}>
                                        {i < step ? <Check className="h-3 w-3" /> : i + 1}
                                    </div>
                                    <span className={`hidden sm:inline ${i === step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                        {label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full"
                                animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                    </div>

                    {/* Form Steps */}
                    <Card className="border-border/50">
                        <CardContent className="p-6 sm:p-8">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {/* Step 0: Basic Info */}
                                    {step === 0 && (
                                        <div className="space-y-6">
                                            <div>
                                                <h2 className="text-xl font-semibold mb-1">Tell us about yourself</h2>
                                                <p className="text-sm text-muted-foreground">Basic information for your creator profile</p>
                                            </div>
                                            <div className="space-y-4">
                                                <div>
                                                    <Label htmlFor="display_name">Display Name *</Label>
                                                    <Input
                                                        id="display_name"
                                                        placeholder="Your creator name"
                                                        value={formData.display_name}
                                                        onChange={e => updateField('display_name', e.target.value)}
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="email">Email *</Label>
                                                    <Input
                                                        id="email"
                                                        type="email"
                                                        placeholder="you@example.com"
                                                        value={formData.email}
                                                        onChange={e => updateField('email', e.target.value)}
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label>Content Type *</Label>
                                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                                        {CONTENT_TYPES.map(ct => {
                                                            const Icon = ct.icon;
                                                            const isSelected = formData.content_type === ct.value;
                                                            return (
                                                                <button
                                                                    key={ct.value}
                                                                    type="button"
                                                                    onClick={() => updateField('content_type', ct.value)}
                                                                    className={`p-4 rounded-xl border-2 text-left transition-all ${isSelected
                                                                            ? 'border-primary bg-primary/10'
                                                                            : 'border-border/50 hover:border-primary/30 hover:bg-muted/30'
                                                                        }`}
                                                                >
                                                                    <Icon className={`h-5 w-5 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                                                                    <p className="font-medium text-sm">{ct.label}</p>
                                                                    <p className="text-xs text-muted-foreground mt-0.5">{ct.description}</p>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 1: Portfolio */}
                                    {step === 1 && (
                                        <div className="space-y-6">
                                            <div>
                                                <h2 className="text-xl font-semibold mb-1">Your Portfolio</h2>
                                                <p className="text-sm text-muted-foreground">Share links to your best work (at least 1 required)</p>
                                            </div>
                                            <div className="space-y-3">
                                                {formData.portfolio_urls.map((url, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        <Input
                                                            placeholder="https://your-portfolio.com"
                                                            value={url}
                                                            onChange={e => updatePortfolioUrl(i, e.target.value)}
                                                        />
                                                        {formData.portfolio_urls.length > 1 && (
                                                            <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" onClick={() => removePortfolioUrl(i)}>
                                                                ×
                                                            </Button>
                                                        )}
                                                    </div>
                                                ))}
                                                {formData.portfolio_urls.length < 5 && (
                                                    <Button variant="outline" size="sm" onClick={addPortfolioUrl} className="gap-2">
                                                        <LinkIcon className="h-3 w-3" /> Add Another Link
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 2: Socials */}
                                    {step === 2 && (
                                        <div className="space-y-6">
                                            <div>
                                                <h2 className="text-xl font-semibold mb-1">Social Presence</h2>
                                                <p className="text-sm text-muted-foreground">Optional — helps us understand your reach</p>
                                            </div>
                                            <div className="space-y-4">
                                                {[
                                                    { key: 'social_twitter' as const, icon: Twitter, placeholder: 'https://twitter.com/yourhandle', label: 'Twitter / X' },
                                                    { key: 'social_youtube' as const, icon: Youtube, placeholder: 'https://youtube.com/@channel', label: 'YouTube' },
                                                    { key: 'social_discord' as const, icon: MessageCircle, placeholder: 'https://discord.gg/invite', label: 'Discord' },
                                                    { key: 'social_tiktok' as const, icon: Music2, placeholder: 'https://tiktok.com/@handle', label: 'TikTok' },
                                                ].map(social => (
                                                    <div key={social.key}>
                                                        <Label className="flex items-center gap-2">
                                                            <social.icon className="h-4 w-4" /> {social.label}
                                                        </Label>
                                                        <Input
                                                            placeholder={social.placeholder}
                                                            value={formData[social.key]}
                                                            onChange={e => updateField(social.key, e.target.value)}
                                                            className="mt-1"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 3: Motivation */}
                                    {step === 3 && (
                                        <div className="space-y-6">
                                            <div>
                                                <h2 className="text-xl font-semibold mb-1">Why The Lily Pad?</h2>
                                                <p className="text-sm text-muted-foreground">Tell us why you want to join and what you plan to create (min 50 characters)</p>
                                            </div>
                                            <div>
                                                <Textarea
                                                    placeholder="I'm excited to join because..."
                                                    value={formData.motivation}
                                                    onChange={e => updateField('motivation', e.target.value)}
                                                    rows={6}
                                                    className="resize-none"
                                                />
                                                <p className={`text-xs mt-2 ${formData.motivation.length < 50 ? 'text-muted-foreground' : 'text-green-500'}`}>
                                                    {formData.motivation.length}/50 characters minimum
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 4: Review */}
                                    {step === 4 && (
                                        <div className="space-y-6">
                                            <div>
                                                <h2 className="text-xl font-semibold mb-1">Review Your Application</h2>
                                                <p className="text-sm text-muted-foreground">Make sure everything looks good before submitting</p>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground text-sm">Name</span>
                                                        <span className="font-medium text-sm">{formData.display_name}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground text-sm">Email</span>
                                                        <span className="font-medium text-sm">{formData.email}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground text-sm">Type</span>
                                                        <Badge variant="secondary" className="capitalize">{formData.content_type}</Badge>
                                                    </div>
                                                </div>
                                                <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                                                    <p className="text-muted-foreground text-sm mb-2">Portfolio ({formData.portfolio_urls.filter(u => u.trim()).length} links)</p>
                                                    {formData.portfolio_urls.filter(u => u.trim()).map((url, i) => (
                                                        <p key={i} className="text-sm text-primary truncate">{url}</p>
                                                    ))}
                                                </div>
                                                <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                                                    <p className="text-muted-foreground text-sm mb-2">Motivation</p>
                                                    <p className="text-sm">{formData.motivation}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>

                            {/* Navigation */}
                            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/50">
                                <Button
                                    variant="ghost"
                                    onClick={() => setStep(s => s - 1)}
                                    disabled={step === 0}
                                    className="gap-2"
                                >
                                    <ArrowLeft className="h-4 w-4" /> Back
                                </Button>

                                {step < STEPS.length - 1 ? (
                                    <Button
                                        onClick={() => setStep(s => s + 1)}
                                        disabled={!canAdvance()}
                                        className="gap-2"
                                    >
                                        Next <ArrowRight className="h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="gap-2 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
                                    >
                                        {submitting ? (
                                            <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
                                        ) : (
                                            <><Send className="h-4 w-4" /> Submit Application</>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
};

export default CreatorApply;
