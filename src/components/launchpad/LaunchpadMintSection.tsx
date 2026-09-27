import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { MintButton } from '@/components/launchpad/MintButton';
import { toast } from 'sonner';
import { getBaseChain } from '@/components/collection-detail/utils';

/**
 * Simplified mint section for a collection using a candy machine.
 * It displays a phase selector (if multiple phases) and a Mint button.
 * No custom styling beyond the existing design system.
 */
export function LaunchpadMintSection({
    collection,
    phases,
    onMintSuccess,
}: {
    collection: any; // using any to avoid importing full type here
    phases: any[]; // array of phase objects
    onMintSuccess: () => void;
}) {
    const defaultPhase = phases.find((p) => p.isActive) || phases[0] || null;
    const [selectedPhase, setSelectedPhase] = useState(defaultPhase);

    if (!collection || !phases || phases.length === 0) {
        return null;
    }

    const handlePhaseSelect = (phase: any) => {
        setSelectedPhase(phase);
    };

    const price = selectedPhase?.price ? parseFloat(selectedPhase.price) : 0;
    const candyMachineAddress = selectedPhase?.candyMachineAddress || collection.contract_address;

    const handleMintSuccess = () => {
        onMintSuccess();
    };

    return (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            {/* Phase selector */}
            {phases.length > 1 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            {selectedPhase?.id || selectedPhase?.name || 'Select Phase'}
                            <ChevronDown className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[200px]">
                        {phases.map((phase) => (
                            <DropdownMenuItem
                                key={phase.id}
                                onClick={() => handlePhaseSelect(phase)}
                                className="flex items-center justify-between"
                            >
                                <span>{phase.id}</span>
                                {selectedPhase?.id === phase.id && <span className="text-primary">✓</span>}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {/* Mint button */}
            <MintButton
                collectionId={collection.id}
                candyMachineAddress={candyMachineAddress}
                collectionAddress={collection.contract_address}
                price={price}
                chain={getBaseChain(collection.chain || collection.blockchain)}
                onMintSuccess={handleMintSuccess}
            />
        </div>
    );
}
