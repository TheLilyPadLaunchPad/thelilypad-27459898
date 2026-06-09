import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface PhaseLike {
    startTime?: string | Date | null;
    endTime?: string | Date | null;
    name?: string;
}

function diff(target: Date) {
    const ms = target.getTime() - Date.now();
    if (ms <= 0) return null;
    const s = Math.floor(ms / 1000);
    return {
        d: Math.floor(s / 86400),
        h: Math.floor((s % 86400) / 3600),
        m: Math.floor((s % 3600) / 60),
        s: s % 60,
    };
}

const Cell: React.FC<{ value: number; label: string }> = ({ value, label }) => (
    <div className="flex flex-col items-center min-w-[52px] rounded-xl bg-primary/10 px-3 py-2 border border-primary/20">
        <span className="text-2xl font-black tabular-nums leading-none">
            {String(value).padStart(2, '0')}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</span>
    </div>
);

/**
 * Live countdown to the active phase's next state-change.
 *
 *  • Before `startTime` → "Mint Starts In …"
 *  • Between start/end → "Mint Ends In …"
 *  • After `endTime`   → "Mint Closed"
 */
export const PhaseCountdown: React.FC<{ phase: PhaseLike | null | undefined }> = ({ phase }) => {
    const [, tick] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => tick((n) => n + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    if (!phase || (!phase.startTime && !phase.endTime)) return null;

    const start = phase.startTime ? new Date(phase.startTime) : null;
    const end = phase.endTime ? new Date(phase.endTime) : null;
    const now = Date.now();

    let label = '';
    let target: Date | null = null;
    let closed = false;

    if (start && now < start.getTime()) {
        label = 'Mint Starts In';
        target = start;
    } else if (end && now < end.getTime()) {
        label = 'Mint Ends In';
        target = end;
    } else if (end && now >= end.getTime()) {
        closed = true;
    } else {
        return null;
    }

    if (closed) {
        return (
            <div className="rounded-xl border border-muted bg-muted/30 px-4 py-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Mint Closed</span>
            </div>
        );
    }

    const remaining = target ? diff(target) : null;
    if (!remaining) return null;

    return (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wide text-primary">{label}</span>
            </div>
            <div className="flex items-center justify-around gap-2">
                <Cell value={remaining.d} label="Days" />
                <Cell value={remaining.h} label="Hours" />
                <Cell value={remaining.m} label="Min" />
                <Cell value={remaining.s} label="Sec" />
            </div>
        </div>
    );
};

export default PhaseCountdown;
