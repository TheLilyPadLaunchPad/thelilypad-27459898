/**
 * XRPL Wallet Storage - AES-GCM encrypted wallet storage
 * 
 * Note: This is obfuscation, not true encryption. The key is derived from
 * public information (address + hardcoded salt). For production, use a proper
 * key derivation scheme with user-provided secrets.
 */

import { Wallet } from 'xrpl';

const STORAGE_KEY = 'xrpl-wallet-seed';
const SALT = 'thelilypad-xrpl-salt-v1';

/**
 * Derive encryption key from address (obfuscation, not true encryption)
 */
async function deriveKey(address: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(address + SALT),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(SALT),
            iterations: 1000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt seed using AES-GCM
 */
async function encryptSeed(seed: string, address: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await deriveKey(address);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(seed)
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt seed using AES-GCM
 */
async function decryptSeed(encryptedData: string, address: string): Promise<string> {
    const decoder = new TextDecoder();
    const key = await deriveKey(address);
    
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
    );

    return decoder.decode(decrypted);
}

/**
 * Save XRPL wallet seed to localStorage (encrypted)
 */
export async function saveXRPLWallet(seed: string, address: string): Promise<void> {
    const encrypted = await encryptSeed(seed, address);
    localStorage.setItem(STORAGE_KEY, encrypted);
}

/**
 * Load XRPL wallet seed from localStorage (decrypted)
 */
export async function loadXRPLWallet(address: string): Promise<string | null> {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) return null;

    try {
        return await decryptSeed(encrypted, address);
    } catch (error) {
        console.error('Failed to decrypt XRPL wallet:', error);
        return null;
    }
}

/**
 * Clear XRPL wallet from localStorage
 */
export function clearXRPLWallet(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Generate new XRPL wallet
 */
export function generateXRPLWallet(): Wallet {
    return Wallet.generate();
}

/**
 * Create XRPL wallet from seed
 */
export function createXRPLWalletFromSeed(seed: string): Wallet {
    return Wallet.fromSeed(seed);
}
