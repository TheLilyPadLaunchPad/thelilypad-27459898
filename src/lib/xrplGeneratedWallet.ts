/**
 * In-browser XRPL wallet generation, encrypted local cache, and faucet helper.
 * No seeds are ever sent to the server. Equivalent capability to the rippled
 * `wallet_propose` admin RPC, but generated locally via xrpl.js.
 */
import { Wallet } from 'xrpl';

export interface GeneratedXRPLWallet {
    address: string;
    seed: string;
    publicKey: string;
}

export interface EncryptedSeed {
    v: 1;
    salt: string; // base64
    iv: string;   // base64
    ct: string;   // base64
}

const SAVED_INDEX_KEY = 'xrpl:saved';
const ENC_PREFIX = 'xrpl:enc:';

/* ------------------------------ generation ------------------------------ */

export function generateXRPLWallet(): GeneratedXRPLWallet {
    const w = Wallet.generate();
    return { address: w.address, seed: w.seed!, publicKey: w.publicKey };
}

/** Reconstruct a signing Wallet from a seed. Throws if invalid. */
export function walletFromSeed(seed: string): Wallet {
    return Wallet.fromSeed(seed.trim());
}

/* --------------------------- in-memory signer --------------------------- */

let _signer: Wallet | null = null;

export function setActiveSigner(w: Wallet | null) {
    _signer = w;
}

export function getActiveSigner(): Wallet | null {
    return _signer;
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { _signer = null; });
}

/* ------------------------------- encryption ----------------------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

function ub64(s: string): Uint8Array {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250_000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptSeed(seed: string, password: string): Promise<EncryptedSeed> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(seed));
    return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export async function decryptSeed(payload: EncryptedSeed, password: string): Promise<string> {
    const key = await deriveKey(password, ub64(payload.salt));
    const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ub64(payload.iv) }, key, ub64(payload.ct)
    );
    return dec.decode(pt);
}

/* ------------------------------ persistence ----------------------------- */

export interface SavedWalletMeta {
    address: string;
    network: 'mainnet' | 'testnet';
    createdAt: number;
}

export function listSavedWallets(): SavedWalletMeta[] {
    try {
        const raw = localStorage.getItem(SAVED_INDEX_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

export function saveEncryptedWallet(address: string, network: 'mainnet' | 'testnet', payload: EncryptedSeed) {
    localStorage.setItem(ENC_PREFIX + address, JSON.stringify(payload));
    const list = listSavedWallets().filter(w => w.address !== address);
    list.push({ address, network, createdAt: Date.now() });
    localStorage.setItem(SAVED_INDEX_KEY, JSON.stringify(list));
}

export function getEncryptedWallet(address: string): EncryptedSeed | null {
    try {
        const raw = localStorage.getItem(ENC_PREFIX + address);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function removeEncryptedWallet(address: string) {
    localStorage.removeItem(ENC_PREFIX + address);
    const list = listSavedWallets().filter(w => w.address !== address);
    localStorage.setItem(SAVED_INDEX_KEY, JSON.stringify(list));
}

/* --------------------------------- faucet -------------------------------- */

const FAUCET_URL = 'https://faucet.altnet.rippletest.net/accounts';

export async function fundFromTestnetFaucet(address: string): Promise<{ ok: boolean; balanceXrp?: number; error?: string }> {
    try {
        const res = await fetch(FAUCET_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination: address }),
        });
        if (!res.ok) return { ok: false, error: `Faucet HTTP ${res.status}` };
        const data = await res.json();
        const drops = Number(data?.balance ?? data?.account?.balance ?? 0);
        const balanceXrp = drops > 1_000_000 ? drops / 1_000_000 : drops; // faucet may return XRP or drops
        return { ok: true, balanceXrp };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Faucet request failed' };
    }
}

/* --------------------------------- backup -------------------------------- */

export function downloadSeedBackup(address: string, seed: string, network: 'mainnet' | 'testnet') {
    const content =
`The Lily Pad — XRPL Wallet Backup
=================================
Network: ${network}
Address: ${address}
Master Seed: ${seed}
Created: ${new Date().toISOString()}

KEEP THIS FILE SECRET AND SAFE.
Anyone with the master seed has full control of this wallet.
This file is the ONLY way to recover the account if you clear browser data.
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xrpl-wallet-${address.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
