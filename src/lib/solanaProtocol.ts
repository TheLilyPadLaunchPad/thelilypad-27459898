/**
 * The Lily Pad Protocol Identification for Solana
 * 
 * This module provides utilities to tag all Solana transactions with
 * protocol identification using the SPL Memo Program, making transactions
 * searchable and attributable to The Lily Pad platform on-chain.
 */

import { TransactionInstruction, PublicKey } from '@solana/web3.js';

// Protocol constants
export const LILYPAD_PROTOCOL_ID = 'TheLilyPad';
export const PROTOCOL_VERSION = 'v1';

// SPL Memo Program ID
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Transaction action types
export type ProtocolAction = 
  | 'shop:bundle_purchase'
  | 'shop:item_purchase'
  | 'shop:sticker_pack'
  | 'shop:emote_pack'
  | 'shop:emoji_pack'
  | 'shop:blind_box'
  | 'marketplace:list'
  | 'marketplace:buy'
  | 'marketplace:offer'
  | 'launchpad:deploy_collection'
  | 'launchpad:create_candy_machine'
  | 'launchpad:create_candy_machine_hidden'
  | 'mint:nft'
  | 'mint:candy_machine'
  | 'tip:creator'
  | 'raffle:entry'
  | 'blindbox:purchase'
  | 'buyback:execute'
  | 'creator:register';

/**
 * Builds a protocol memo string
 * Format: TheLilyPad:v1:<action>:<optional-metadata>
 */
export function buildProtocolMemo(
  action: ProtocolAction, 
  metadata?: Record<string, string>
): string {
  let memo = `${LILYPAD_PROTOCOL_ID}:${PROTOCOL_VERSION}:${action}`;
  
  if (metadata && Object.keys(metadata).length > 0) {
    const metaString = Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    memo += `:${metaString}`;
  }
  
  return memo;
}

/**
 * Creates a Solana TransactionInstruction for the Memo Program
 * This instruction can be added to any transaction to tag it with protocol identity
 */
export function createMemoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

/**
 * Creates a protocol-tagged memo instruction
 * Convenience function combining buildProtocolMemo and createMemoInstruction
 */
export function createProtocolMemoInstruction(
  action: ProtocolAction,
  metadata?: Record<string, string>
): TransactionInstruction {
  const memo = buildProtocolMemo(action, metadata);
  return createMemoInstruction(memo);
}
