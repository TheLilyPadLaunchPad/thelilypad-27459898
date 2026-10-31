import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ShoppingBag, Rocket, Radio, Sparkles, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/providers/AuthProvider';
import { useSEO } from '@/hooks/useSEO';
import { LilyPadLogo } from '@/components/LilyPadLogo';
import { supabase } from '@/integrations/supabase/client';

interface RoleOption {
  id: string;
  title: string;
  description: string;
  icon: typeof ShoppingBag;
  roles: { isCollector: boolean; isCreator: boolean; isStreamer: boolean };
  gradient: string;
  needsApproval: boolean;
}

const roleOptions: RoleOption[] = [
  {
    id: 'collector',
    title: 'Collector',
    description: 'Buy, trade, and showcase NFTs from your favorite creators',
    icon: ShoppingBag,
    roles: { isCollector: true, isCreator: false, isStreamer: false },
    gradient: 'from-blue-500/20 to-cyan-500/20',
    needsApproval: false,
  },
  {
    id: 'creator',
    title: 'Creator',
    description: 'Launch your own NFT collections and sell digital art',
    icon: Rocket,
    roles: { isCollector: false, isCreator: true, isStreamer: false },
    gradient: 'from-purple-500/20 to-pink-500/20',
    needsApproval: true,
  },
  {
    id: 'streamer',
    title: 'Streamer',
    description: 'Stream live content and engage with your community',
    icon: Radio,
    roles: { isCollector: false, isCreator: false, isStreamer: true },
    gradient: 'from-red-500/20 to-orange-500/20',
    needsApproval: true,
  },
  {
    id: 'collector-creator',
    title: 'Collector + Creator',
    description: 'Collect NFTs and create your own collections',
    icon: Sparkles,
    roles: { isCollector: true, isCreator: true, isStreamer: false },
    gradient: 'from-indigo-500/20 to-purple-500/20',
    needsApproval: true,
  },
  {
    id: 'creator-streamer',
    title: 'Creator + Streamer',
    description: 'Launch collections, stream, and build your brand',
    icon: Sparkles,
    roles: { isCollector: false, isCreator: true, isStreamer: true },
    gradient: 'from-pink-500/20 to-red-500/20',
    needsApproval: true,
  },
  {
    id: 'all',
    title: 'All Above',
    description: 'Full access to collect, create, and stream',
    icon: Sparkles,
    roles: { isCollector: true, isCreator: true, isStreamer: true },
    gradient: 'from-primary/20 to-accent/20',
    needsApproval: true,
  },
];

export default function ProfileTypeSelection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const { createProfile } = useUserProfile();
  const { state: authState } = useAuth();
  const referralCode = searchParams.get('ref');

  // Redirect once auth state catches up after profile creation
  useEffect(() => {
    if (authState === 'AUTHENTICATED') {
      navigate(pendingRedirect || '/waitroom', { replace: true });
    }
  }, [authState, pendingRedirect, navigate]);

  useSEO({
    title: 'Welcome to The Lily Pad - Set Up Your Profile',
    description: 'Choose your role and get started on The Lily Pad',
  });

  const selectedOption = roleOptions.find((opt) => opt.id === selectedRole);

  const handleSubmit = async () => {
    if (!selectedRole || !selectedOption) {
      toast.error('Please select a profile type');
      return;
    }

    setIsSubmitting(true);

    try {
      const profile = await createProfile(selectedOption.roles, displayName);

      // Track referral if code exists
      if (referralCode && profile) {
        try {
          const { data: referrerId } = await (supabase.rpc as any)(
            'resolve_referral_code',
            { p_code: referralCode }
          );

          if (referrerId) {
            await (supabase.from('referral_signups') as any).insert({
              referrer_id: referrerId as string,
              referred_user_id: profile.user_id,
              referral_code: referralCode,
            });
            await (supabase.from('user_profiles') as any)
              .update({ referred_by: referralCode })
              .eq('id', profile.id);
          }
        } catch (e) {
          console.error('Referral tracking error:', e);
        }
      }

      toast.success('Profile created! Welcome to The Lily Pad 🐸');

      // Determine target route based on role
      let targetRoute = '/waitroom';
      if (selectedOption.roles.isCreator) {
        targetRoute = '/creator/apply';
      } else if (selectedOption.roles.isStreamer) {
        targetRoute = '/streamer/apply';
      }

      // Set pending redirect — the useEffect will navigate once auth state updates
      setPendingRedirect(targetRoute);
    } catch (error: any) {
      console.error('Error creating profile:', error);
      toast.error('Failed to create profile', { description: error.message || 'Please try again' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-hero-gradient" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-glow-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-glow-pulse delay-1000" />

      <div className="relative z-10 w-full max-w-4xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <LilyPadLogo size={80} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Welcome to <span className="text-primary">The Lily Pad</span>
          </h1>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
            <div className={`w-12 h-0.5 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {step === 1 ? 'Step 1: Your Identity' : 'Step 2: Choose Your Role'}
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="max-w-sm mx-auto space-y-4">
                <Label htmlFor="display-name" className="block text-sm font-medium text-center">
                  What should we call you?
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name or alias..."
                    className="pl-9"
                    maxLength={30}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  This will be shown on your public profile and WL card.
                </p>
              </div>

              <div className="flex justify-center">
                <Button size="lg" onClick={() => setStep(2)} className="gap-2 px-12">
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
              <p className="text-center text-muted-foreground">
                Choose your role to get started. Creator & Streamer roles require approval.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roleOptions.map((option, index) => {
                  const Icon = option.icon;
                  const isSelected = selectedRole === option.id;

                  return (
                    <motion.div key={option.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}>
                      <Card
                        className={`relative cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 ${isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/30' : 'hover:ring-1 hover:ring-primary/50'}`}
                        onClick={() => setSelectedRole(option.id)}
                      >
                        <CardContent className="p-6">
                          <div className={`absolute inset-0 bg-gradient-to-br ${option.gradient} rounded-lg opacity-50`} />
                          <div className="relative z-10">
                            <div className="flex items-start justify-between mb-4">
                              <div className={`p-3 rounded-lg ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                <Icon className="w-6 h-6" />
                              </div>
                              <div className="flex items-center gap-2">
                                {option.needsApproval && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">Requires Approval</span>
                                )}
                                {isSelected && (
                                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                    <CheckCircle2 className="w-6 h-6 text-primary" />
                                  </motion.div>
                                )}
                              </div>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">{option.title}</h3>
                            <p className="text-sm text-muted-foreground">{option.description}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex justify-center gap-4">
                <Button variant="ghost" onClick={() => setStep(1)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!selectedRole || isSubmitting}
                  className="gap-2 px-12"
                >
                  {isSubmitting
                    ? 'Creating Profile...'
                    : selectedOption?.needsApproval
                      ? 'Continue to Application'
                      : 'Enter The Lily Pad 🐸'}
                </Button>
              </div>

              <p className="text-center text-sm text-muted-foreground">
                You can change or add more roles anytime in your profile settings.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
