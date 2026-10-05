# Music NFT generator check and fixes

Music NFTs (Solana only) go through the launch wizard: upload audio, add a cover for each track, edit details, then deploy. The overall flow is sound. These problems turned up:

## Problems found

1. **Storage is paid after the audio uploads.** All audio tracks are uploaded to Arweave *before* the step that pre-pays storage for the whole batch, even though that pre-payment also counts the audio files. Result: extra wallet popups or failed uploads on large tracks, and the audio gets paid for twice.
2. **Reordering only goes one way.** Each track card has a "move up" handle but no "move down" button, even though the code supports it.
3. **Removing a track leaves gaps in track numbers** (e.g. 1, 2, 4).
4. **Duration is saved as a long decimal** in the NFT details (e.g. "183.4523") instead of whole seconds.
5. **Pending tracks can get the wrong cover.** Tracks waiting for cover art are tracked by list position, so removing one while another is open can attach the cover to the wrong track.
6. **Leftover test-network path.** The deploy still has a test-network IPFS branch for music, but the app is mainnet-only now.

## Fixes

- Pre-pay storage first (cover, artwork and audio together), then upload audio, then artwork and details.
- Add up/down arrow buttons on each track card.
- Renumber tracks after removing one.
- Round duration to whole seconds.
- Give each pending track a stable ID.
- Leave the test-network branch alone (harmless, unreachable) unless you want it removed.

## Verification

- Typecheck and build.
- In the preview: choose Music NFTs, add two tracks with covers, reorder, remove one, and check the numbering and review step. A real mainnet deploy costs SOL, so I won't run that.

## Technical details

- `src/pages/LaunchpadCreate.tsx`: move the `preFundIrysForBatch` block (around line 833) ahead of the `isMusic` audio upload loop (line 777) by building the file list from `tracks` up front.
- `src/components/launchpad/MusicArtworkUploader.tsx`: add ChevronUp/ChevronDown buttons using `onMoveUp`/`onMoveDown`; renumber in `removeTrack`; add `id` to pending entries and key and look them up by id.
- `src/lib/musicMetadata.ts`: `Math.round(durationSeconds)`.
