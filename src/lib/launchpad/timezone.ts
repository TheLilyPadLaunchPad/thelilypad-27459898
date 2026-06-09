/**
 * Timezone helpers for the launchpad.
 *
 * The UI lets creators pick a wall-clock date/time + an IANA timezone.
 * We convert that to a true UTC `Date` instant before sending to the
 * Metaplex `startDate` / `endDate` guards (which are unix timestamps).
 */

export const COMMON_TIMEZONES = [
    'UTC',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Istanbul',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
];

/** Get the browser's IANA timezone (fallback "UTC"). */
export function browserTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

/**
 * Convert a wall-clock `YYYY-MM-DDTHH:mm` (or `:ss`) string in the given
 * IANA timezone to a true UTC `Date`. Handles DST correctly.
 */
export function zonedWallTimeToUtc(local: string, tz: string): Date {
    if (!local) return new Date(NaN);
    // Pretend the local string IS UTC, then ask what that instant looks
    // like when rendered in `tz`. The diff gives us the offset to subtract.
    const pretendUtc = new Date(local.length === 16 ? `${local}:00Z` : `${local}Z`);
    if (Number.isNaN(pretendUtc.getTime())) return pretendUtc;

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(pretendUtc);

    const pick = (t: string) => Number(parts.find(p => p.type === t)?.value || 0);
    const asUtcMs = Date.UTC(
        pick('year'), pick('month') - 1, pick('day'),
        pick('hour') % 24, pick('minute'), pick('second'),
    );
    const offset = asUtcMs - pretendUtc.getTime();
    return new Date(pretendUtc.getTime() - offset);
}

/**
 * Convert a UTC `Date` (or ISO string) back to a wall-clock
 * `YYYY-MM-DDTHH:mm` string suitable for `<input type="datetime-local">`
 * in the given timezone.
 */
export function utcToZonedWallTime(date: Date | string | null, tz: string): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const pick = (t: string) => parts.find(p => p.type === t)?.value || '';
    const hour = pick('hour') === '24' ? '00' : pick('hour');
    return `${pick('year')}-${pick('month')}-${pick('day')}T${hour}:${pick('minute')}`;
}
