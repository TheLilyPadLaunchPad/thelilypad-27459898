/**
 * Credit-free description writer for Music NFTs.
 * Builds polished track and collection descriptions from creator inputs using
 * templates — runs entirely in the browser, no AI calls.
 */

export interface TrackDescriptionInput {
  title: string;
  artist?: string;
  album?: string;
  genre?: string;
  bpm?: number | null;
  durationSeconds?: number | null;
  notes?: string;
}

export interface CollectionDescriptionInput {
  collectionName: string;
  notes?: string;
  tracks: { title: string; artist?: string; genre?: string }[];
}

const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();

function sentence(s: string): string {
  const t = clean(s);
  if (!t) return '';
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

function notesToSentences(notes?: string): string {
  return clean(notes)
    .split(/(?<=[.!?])\s+|\n+|;\s*/)
    .map(sentence)
    .filter(Boolean)
    .join(' ');
}

function formatLength(sec?: number | null): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function tempoWord(bpm?: number | null): string {
  if (!bpm) return '';
  if (bpm < 80) return 'slow-burning';
  if (bpm < 110) return 'laid-back';
  if (bpm < 130) return 'driving';
  return 'high-energy';
}

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/** Returns a polished track description. `variant` cycles phrasing. */
export function writeTrackDescription(input: TrackDescriptionInput, variant = 0): string {
  const title = clean(input.title) || 'Untitled';
  const artist = clean(input.artist);
  const genre = clean(input.genre);
  const tempo = tempoWord(input.bpm);
  const seed = hash(title) + variant;

  const style = [tempo, genre ? genre.toLowerCase() : ''].filter(Boolean).join(' ');
  const by = artist ? ` by ${artist}` : '';
  const openers = style
    ? [
        `"${title}"${by} is ${article(style)} ${style} track built to stay with you.`,
        `${artist ? `${artist} delivers` : 'Here is'} "${title}", ${article(style)} ${style} cut with real character.`,
        `"${title}"${by} brings ${article(style)} ${style} feel from the first second.`,
      ]
    : [
        `"${title}"${by} is a one-of-a-kind release, minted on-chain.`,
        `${artist ? `${artist} presents` : 'Introducing'} "${title}", a track made to be owned.`,
      ];

  const parts = [pick(openers, seed), notesToSentences(input.notes)];

  const details = [
    input.bpm ? `${input.bpm} BPM` : '',
    formatLength(input.durationSeconds),
    clean(input.album) ? `from ${clean(input.album)}` : '',
  ].filter(Boolean);
  if (details.length) parts.push(`${sentence(details.join(' · '))}`);

  parts.push(
    pick(
      [
        'Own the original — the full audio lives permanently on-chain with this NFT.',
        'Collect it, play it, keep it: the audio is stored permanently with the token.',
        'Every holder owns a permanent, playable copy of the original recording.',
      ],
      seed + 1,
    ),
  );

  return parts.filter(Boolean).join(' ');
}

/** Returns a polished collection description. */
export function writeCollectionDescription(input: CollectionDescriptionInput, variant = 0): string {
  const name = clean(input.collectionName) || 'This collection';
  const tracks = input.tracks.filter(t => clean(t.title));
  const artists = [...new Set(tracks.map(t => clean(t.artist)).filter(Boolean))];
  const genres = [...new Set(tracks.map(t => clean(t.genre)).filter(Boolean))];
  const seed = hash(name) + variant;

  const count = tracks.length;
  const countText = count === 1 ? 'a single track' : `${count} tracks`;
  const artistText =
    artists.length === 0 ? '' : artists.length === 1 ? ` from ${artists[0]}` : ` from ${artists.slice(0, -1).join(', ')} and ${artists.at(-1)}`;
  const genreText = genres.length ? ` spanning ${genres.slice(0, 3).join(', ').toLowerCase()}` : '';

  const opener = pick(
    [
      `${name} is a music NFT collection of ${countText}${artistText}${genreText}.`,
      `${name} brings together ${countText}${artistText}${genreText}, each minted as its own NFT.`,
    ],
    seed,
  );

  const parts = [opener, notesToSentences(input.notes)];

  if (count > 1 && count <= 6) {
    parts.push(`Tracklist: ${tracks.map(t => `"${clean(t.title)}"`).join(', ')}.`);
  }

  parts.push(
    pick(
      [
        'Each NFT includes cover art and the full audio, stored permanently on Arweave.',
        'Every piece pairs original cover art with the complete recording, kept permanently on-chain.',
      ],
      seed + 1,
    ),
  );

  return parts.filter(Boolean).join(' ');
}
