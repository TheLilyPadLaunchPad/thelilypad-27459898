import { Link } from 'react-router-dom';
import { ArrowRight, Layers } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { ChainIcon } from '@/components/launchpad/ChainSelector';
import { useSEO } from '@/hooks/useSEO';
import { WalletLinkStatusPanel } from '@/components/account/WalletLinkStatusPanel';

const generators = [
  { name: 'Solana & Monad Art Generator', chain: 'solana' as const, path: '/launchpad/art-generator' },
  { name: 'ApeChain Trait Generator', chain: 'apechain' as const, path: '/launchpad/apechain-trait-generator' },
  { name: 'Robinhood Trait Generator', chain: 'robinhood' as const, path: '/launchpad/robinhood-trait-generator' },
  { name: 'XRPL Trait Generator', chain: 'xrpl' as const, path: '/launchpad/xrpl-trait-generator' },
  { name: 'XRPL Easy Generator', chain: 'xrpl' as const, path: '/launchpad/xrpl-generator' },
];

export default function Generators() {
  useSEO({ title: 'Generators | Lily Launchpad', description: 'Create artwork with the Lily Launchpad multi-chain generators.' });
  return <div className="min-h-screen bg-background">
    <Navbar />
    <main className="container mx-auto max-w-4xl px-4 pt-28 pb-24">
      <div className="flex items-center gap-3 mb-8"><Layers className="h-8 w-8 text-primary" /><h1 className="text-3xl font-bold">Generators</h1></div>
      <div className="divide-y divide-border">
        {generators.map(generator => <div key={generator.path} className="flex items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-3 min-w-0"><ChainIcon chain={generator.chain} className="w-8 h-8 shrink-0" /><h2 className="text-lg font-semibold">{generator.name}</h2></div>
          <Button asChild variant="outline" size="icon"><Link to={generator.path} aria-label={`Open ${generator.name}`}><ArrowRight className="h-5 w-5" /></Link></Button>
        </div>)}
      </div>
      <WalletLinkStatusPanel returnTo="/generators" className="mt-10" />
    </main>
  </div>;
}