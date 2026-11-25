export function validTicketCount(count: unknown, used: number, maximum: number): count is number {
  return typeof count === "number" && Number.isSafeInteger(count) && count > 0 && count + used <= maximum;
}

export function verifyRaffleSolanaPayment(tx: any, wallets: Set<string>, treasury: string, lamports: bigint): boolean {
  if (!tx || tx.meta?.err !== null) return false;
  const keys: any[] = tx.transaction?.message?.accountKeys ?? [];
  const signers = new Set(keys.filter(k => k.signer === true).map(k => k.pubkey));
  const instructions: any[] = tx.transaction?.message?.instructions ?? [];
  if (!instructions.some(ix => ix.program === "spl-memo" && typeof ix.parsed === "string"
    && ix.parsed.startsWith("TheLilyPad:v1:raffle:entry"))) return false;
  let received = 0n;
  for (const ix of instructions) {
    const info = ix.parsed?.info;
    if (ix.program !== "system" || ix.parsed?.type !== "transfer" || !info
      || !wallets.has(info.source) || !signers.has(info.source) || info.destination !== treasury) continue;
    if (!Number.isSafeInteger(info.lamports) || info.lamports <= 0) continue;
    received += BigInt(info.lamports);
  }
  return received >= lamports;
}

export function verifyRaffleMonadPayment(tx: any, receipt: any, wallets: Set<string>, treasury: string, wei: bigint): boolean {
  if (!tx || receipt?.status !== "0x1" || !tx.blockNumber || !tx.to || !tx.from || !tx.value) return false;
  return [...wallets].some(w => w.toLowerCase() === tx.from.toLowerCase())
    && tx.to.toLowerCase() === treasury.toLowerCase() && BigInt(tx.value) >= wei;
}

export function nativeUnits(amount: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("Invalid ticket price");
  const [whole, fraction = ""] = amount.split(".");
  const digits = fraction.padEnd(decimals, "0");
  // Round up, never undercharge a fractional smallest unit.
  const base = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(digits.slice(0, decimals) || "0");
  return base + (/[1-9]/.test(digits.slice(decimals)) ? 1n : 0n);
}