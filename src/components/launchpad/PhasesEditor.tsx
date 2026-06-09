/**
 * PhasesEditor — multi-phase Candy Guard Group editor.
 *
 * Each phase compiles to a Metaplex Core Candy Machine guard group:
 *   { label, guards: { solPayment, startDate, endDate, mintLimit, allowList } }
 *
 * The UI surfaces:
 *   • Launch templates (Free / Standard / Premium / Open Edition)
 *   • Per-phase Date + Time + Timezone pickers (normalized to UTC instants)
 *   • Per-wallet mint limit + price + allowlist toggle
 *   • Validation summary (overlap detection, end<start, empty allowlists)
 *   • Live diagnostics of which guards will be deployed
 */
import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, AlertTriangle, Shield, Sparkles, Crown, Infinity as InfinityIcon, Gift } from 'lucide-react';
import type { LaunchpadPhase } from '@/chains/solana/programs';
import {
    COMMON_TIMEZONES,
    browserTimezone,
    utcToZonedWallTime,
    zonedWallTimeToUtc,
} from '@/lib/launchpad/timezone';

interface PhaseWithMeta extends LaunchpadPhase {
    name?: string;
    timezone?: string;
    requiresAllowlist?: boolean;
}

interface PhasesEditorProps {
    phases: PhaseWithMeta[];
    onChange: (phases: PhaseWithMeta[]) => void;
    chainSymbol: string;
}

// ─── Launch Templates ────────────────────────────────────────────────────────
type TemplateId = 'free' | 'standard' | 'premium' | 'openEdition';
const TEMPLATES: { id: TemplateId; label: string; icon: any; description: string; build: () => PhaseWithMeta[] }[] = [
    {
        id: 'free', label: 'Free Mint', icon: Gift,
        description: 'One free mint per wallet, no allowlist.',
        build: () => [{
            id: 'public', name: 'Free Mint', price: 0, maxPerWallet: 1,
            startTime: null, endTime: null, timezone: browserTimezone(),
        }],
    },
    {
        id: 'standard', label: 'Standard', icon: Shield,
        description: 'Whitelist phase → public phase.',
        build: () => [
            { id: 'wl', name: 'Whitelist', price: 0.25, maxPerWallet: 2, startTime: null, endTime: null, requiresAllowlist: true, timezone: browserTimezone() },
            { id: 'public', name: 'Public', price: 0.5, maxPerWallet: 5, startTime: null, endTime: null, timezone: browserTimezone() },
        ],
    },
    {
        id: 'premium', label: 'Premium', icon: Crown,
        description: 'OG → Whitelist → Public → Collectors.',
        build: () => [
            { id: 'og', name: 'OG Holders', price: 0.2, maxPerWallet: 3, startTime: null, endTime: null, requiresAllowlist: true, timezone: browserTimezone() },
            { id: 'wl', name: 'Whitelist', price: 0.3, maxPerWallet: 2, startTime: null, endTime: null, requiresAllowlist: true, timezone: browserTimezone() },
            { id: 'public', name: 'Public', price: 0.5, maxPerWallet: 5, startTime: null, endTime: null, timezone: browserTimezone() },
            { id: 'collectors', name: 'Collectors', price: 0.4, maxPerWallet: 10, startTime: null, endTime: null, timezone: browserTimezone() },
        ],
    },
    {
        id: 'openEdition', label: 'Open Edition', icon: InfinityIcon,
        description: 'Unlimited supply, timed window.',
        build: () => [{
            id: 'public', name: 'Open Edition', price: 0.1, maxPerWallet: 100,
            startTime: null, endTime: null, timezone: browserTimezone(),
        }],
    },
];

// ─── Validation ──────────────────────────────────────────────────────────────
interface ValidationIssue { level: 'error' | 'warning'; message: string; }
function validate(phases: PhaseWithMeta[], allowConcurrent: boolean): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    phases.forEach((p, i) => {
        if (p.startTime && p.endTime && new Date(p.endTime) <= new Date(p.startTime)) {
            issues.push({ level: 'error', message: `${p.name || p.id}: end time must be after start time.` });
        }
        if ((p.maxPerWallet || 0) < 1) {
            issues.push({ level: 'warning', message: `${p.name || p.id}: wallet limit should be at least 1.` });
        }
        if (p.requiresAllowlist && !p.merkleRoot && !(p as any).allowlistCount) {
            issues.push({ level: 'warning', message: `${p.name || p.id}: allowlist enabled but no wallets uploaded yet.` });
        }
        if ((p.price ?? 0) < 0) {
            issues.push({ level: 'error', message: `${p.name || p.id}: price cannot be negative.` });
        }
        if (!allowConcurrent && p.startTime && p.endTime) {
            for (let j = i + 1; j < phases.length; j++) {
                const q = phases[j];
                if (!q.startTime || !q.endTime) continue;
                const aS = new Date(p.startTime!).getTime();
                const aE = new Date(p.endTime!).getTime();
                const bS = new Date(q.startTime).getTime();
                const bE = new Date(q.endTime).getTime();
                if (aS < bE && bS < aE) {
                    issues.push({ level: 'error', message: `Phase "${p.name || p.id}" overlaps "${q.name || q.id}" — disable concurrent or adjust times.` });
                }
            }
        }
    });
    return issues;
}

export function getPhaseValidationIssues(phases: PhaseWithMeta[], allowConcurrent = false) {
    return validate(phases, allowConcurrent);
}

// ─── Per-Phase Card ──────────────────────────────────────────────────────────
const PhaseCard: React.FC<{
    phase: PhaseWithMeta;
    index: number;
    canRemove: boolean;
    onChange: (patch: Partial<PhaseWithMeta>) => void;
    onRemove: () => void;
    chainSymbol: string;
}> = ({ phase, index, canRemove, onChange, onRemove, chainSymbol }) => {
    const tz = phase.timezone || browserTimezone();

    const updateTime = (field: 'startTime' | 'endTime', wall: string) => {
        if (!wall) { onChange({ [field]: null } as any); return; }
        const d = zonedWallTimeToUtc(wall, tz);
        onChange({ [field]: Number.isNaN(d.getTime()) ? null : d } as any);
    };

    return (
        <Card className="border-border/60">
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">Phase {index + 1}</Badge>
                        <Input
                            value={phase.name || ''}
                            onChange={(e) => onChange({ name: e.target.value, id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32) || `phase-${index}` })}
                            placeholder="Phase name (e.g. Whitelist)"
                            className="h-8 text-sm font-semibold w-56"
                            maxLength={32}
                        />
                    </div>
                    {canRemove && (
                        <Button variant="ghost" size="icon" onClick={onRemove} className="text-destructive h-8 w-8">
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Price ({chainSymbol})</Label>
                        <Input
                            type="number" min={0} step={0.01}
                            value={phase.price ?? 0}
                            onChange={(e) => onChange({ price: Number(e.target.value) || 0 })}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Max per wallet</Label>
                        <Input
                            type="number" min={1}
                            value={phase.maxPerWallet ?? 5}
                            onChange={(e) => onChange({ maxPerWallet: Number(e.target.value) || 1 })}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Timezone</Label>
                        <Select value={tz} onValueChange={(v) => onChange({ timezone: v })}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {COMMON_TIMEZONES.map((z) => (
                                    <SelectItem key={z} value={z} className="text-xs">{z}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Start (date & time)</Label>
                        <Input
                            type="datetime-local"
                            value={utcToZonedWallTime(phase.startTime ?? null, tz)}
                            onChange={(e) => updateTime('startTime', e.target.value)}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">End (date & time)</Label>
                        <Input
                            type="datetime-local"
                            value={utcToZonedWallTime(phase.endTime ?? null, tz)}
                            onChange={(e) => updateTime('endTime', e.target.value)}
                            className="h-9"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <div className="space-y-0.5">
                        <Label className="text-xs">Whitelist only</Label>
                        <p className="text-[10px] text-muted-foreground">Require an allowlist (Merkle / CSV) for this phase.</p>
                    </div>
                    <Switch
                        checked={!!phase.requiresAllowlist}
                        onCheckedChange={(v) => onChange({ requiresAllowlist: v })}
                    />
                </div>

                {phase.requiresAllowlist && (
                    <Input
                        value={phase.merkleRoot || ''}
                        onChange={(e) => onChange({ merkleRoot: e.target.value || null })}
                        placeholder="Optional: paste existing Merkle root (hex)"
                        className="h-8 text-xs font-mono"
                    />
                )}
            </CardContent>
        </Card>
    );
};

// ─── Main Editor ─────────────────────────────────────────────────────────────
export const PhasesEditor: React.FC<PhasesEditorProps> = ({ phases, onChange, chainSymbol }) => {
    const [allowConcurrent, setAllowConcurrent] = React.useState(false);
    const [botTax, setBotTax] = React.useState(true);
    const issues = useMemo(() => validate(phases, allowConcurrent), [phases, allowConcurrent]);

    const setPhase = (i: number, patch: Partial<PhaseWithMeta>) => {
        onChange(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    };
    const addPhase = () => {
        const id = `phase-${phases.length + 1}`;
        onChange([
            ...phases,
            { id, name: `Phase ${phases.length + 1}`, price: 0.1, maxPerWallet: 5, startTime: null, endTime: null, timezone: browserTimezone() },
        ]);
    };
    const removePhase = (i: number) => onChange(phases.filter((_, idx) => idx !== i));
    const applyTemplate = (t: TemplateId) => {
        const tpl = TEMPLATES.find((x) => x.id === t);
        if (tpl) onChange(tpl.build());
    };

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold">Mint Phases</span>
                    <Badge variant="outline" className="text-[10px]">{phases.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                    Each phase becomes a Candy Guard Group on-chain. Add multiple phases
                    for whitelist, OG, public, and custom audiences.
                </p>
            </div>

            {/* Templates */}
            <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Quick Templates</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {TEMPLATES.map((t) => {
                        const Icon = t.icon;
                        return (
                            <Button
                                key={t.id} variant="outline" type="button"
                                onClick={() => applyTemplate(t.id)}
                                className="h-auto flex-col items-start py-2 px-3 text-left"
                            >
                                <div className="flex items-center gap-1.5 text-xs font-semibold">
                                    <Icon className="w-3.5 h-3.5" /> {t.label}
                                </div>
                                <span className="text-[10px] text-muted-foreground font-normal mt-0.5 leading-tight">{t.description}</span>
                            </Button>
                        );
                    })}
                </div>
            </div>

            {/* Phase list */}
            <div className="space-y-3">
                {phases.map((p, i) => (
                    <PhaseCard
                        key={`${p.id}-${i}`}
                        phase={p}
                        index={i}
                        canRemove={phases.length > 1}
                        onChange={(patch) => setPhase(i, patch)}
                        onRemove={() => removePhase(i)}
                        chainSymbol={chainSymbol}
                    />
                ))}
                <Button variant="outline" onClick={addPhase} className="w-full border-dashed" type="button">
                    <Plus className="w-4 h-4 mr-1" /> Add Phase
                </Button>
            </div>

            {/* Advanced toggles */}
            <div className="rounded-xl border border-border/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-xs">Bot Tax (recommended)</Label>
                        <p className="text-[10px] text-muted-foreground">Charges 0.01 SOL on failed mints to deter bots.</p>
                    </div>
                    <Switch checked={botTax} onCheckedChange={setBotTax} />
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-xs">Allow concurrent phases</Label>
                        <p className="text-[10px] text-muted-foreground">Phases may overlap in time (e.g. WL discount during public).</p>
                    </div>
                    <Switch checked={allowConcurrent} onCheckedChange={setAllowConcurrent} />
                </div>
            </div>

            {/* Validation summary */}
            {issues.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                    <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold">
                        <AlertTriangle className="w-4 h-4" /> {issues.length} issue{issues.length === 1 ? '' : 's'} to review
                    </div>
                    <ul className="text-xs space-y-0.5 ml-6 list-disc">
                        {issues.map((it, i) => (
                            <li key={i} className={it.level === 'error' ? 'text-destructive' : 'text-amber-600'}>{it.message}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default PhasesEditor;
