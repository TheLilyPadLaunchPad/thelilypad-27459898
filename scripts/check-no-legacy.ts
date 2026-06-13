#!/usr/bin/env -S deno run --allow-read
// Sanity check: legacy Solana-side imports must not reappear.
// Run: deno run --allow-read scripts/check-no-legacy.ts
// (or: bunx tsx scripts/check-no-legacy.ts after porting to node)

const FORBIDDEN = [
  { pattern: "@metaplex-foundation/mpl-token-metadata", scope: "src/" },
  { pattern: "@/config/theLilyPad", scope: "src/" },
  { pattern: "@/hooks/useVerifyTheLilyPad", scope: "src/" },
];

let failed = false;
for (const { pattern, scope } of FORBIDDEN) {
  const cmd = new Deno.Command("rg", { args: ["-l", pattern, scope], stdout: "piped" });
  const { stdout } = await cmd.output();
  const hits = new TextDecoder().decode(stdout).trim();
  if (hits) {
    console.error(`✘ forbidden import "${pattern}" found in:\n${hits}`);
    failed = true;
  } else {
    console.log(`✓ no occurrences of "${pattern}"`);
  }
}
if (failed) Deno.exit(1);
