/**
 * Offline vanity grinder.
 *
 *   npx tsx scripts/vanity/grind.ts --match L3AP --position prefix
 *   npx tsx scripts/vanity/grind.ts --match L3AP --position suffix --timeout 0
 *
 * Prints the public key and base58 secret to stdout. Never writes to disk.
 */
import { grindKeypairSync } from "../../src/lib/vanity/grindKeypair";

function arg(name: string, fallback?: string) {
    const idx = process.argv.indexOf(`--${name}`);
    return idx >= 0 ? process.argv[idx + 1] : fallback;
}

const match = arg("match", "L3AP")!;
const position = (arg("position", "prefix") as "prefix" | "suffix");
const timeoutMs = Number(arg("timeout", "0"));

console.log(`Grinding ${position} "${match}" (timeout: ${timeoutMs || "none"}ms)…`);
const start = Date.now();
const result = grindKeypairSync({
    match,
    position,
    timeoutMs,
    onProgress: (n) => {
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        process.stdout.write(`\r  ${n.toLocaleString()} attempts (${sec}s)…`);
    },
});

console.log("\n\n✅ Match found");
console.log(`  Public key: ${result.publicKey}`);
console.log(`  Secret key: ${result.secretKey}`);
console.log(`  Attempts:   ${result.attempts.toLocaleString()}`);
console.log(`  Elapsed:    ${(result.elapsedMs / 1000).toFixed(1)}s`);
console.log("\n⚠️  Store the secret key in a Lovable Cloud secret. Never commit it.");
