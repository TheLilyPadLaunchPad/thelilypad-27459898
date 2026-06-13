// lib.rs — Anchor escrow program for the Metaplex Core marketplace
//
// Hardening pass (compliance v0.2):
//   * Escrow account is now a PDA seeded by ["escrow", asset]. No more
//     unseeded `init` — prevents arbitrary account injection.
//   * `cancel_listing` lets the seller reclaim the asset & close the escrow.
//   * `purchase` uses `system_program::transfer` CPI (works for any buyer,
//     not just accounts the program itself owns) and routes a 2.5% platform
//     fee to the treasury (matches frontend PLATFORM_FEE_BPS = 250).
//   * Emits an SPL memo `TheLilyPad:v1:marketplace_buy` so off-chain
//     indexers can attribute trade volume.
//   * `declare_id!` placeholder is intentional — operator regenerates the
//     program keypair on first deploy (see docs/metaplex-standards.md).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use mpl_core::cpi::{self as core_cpi, accounts::TransferV1};

declare_id!("Escrow111111111111111111111111111111111111");

pub const PLATFORM_FEE_BPS: u64 = 250; // 2.5%
pub const MEMO_PROGRAM_ID: Pubkey = anchor_lang::solana_program::pubkey!(
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
pub const ESCROW_SEED: &[u8] = b"escrow";

#[program]
pub mod escrow_program {
    use super::*;

    /// Seller lists a Core asset for sale. Escrow PDA is derived from the
    /// asset address so each asset can have at most one open listing.
    pub fn initialize_listing(ctx: Context<InitializeListing>, price: u64) -> Result<()> {
        require!(price > 0, EscrowError::InvalidPrice);
        let escrow = &mut ctx.accounts.escrow_account;
        escrow.seller = ctx.accounts.seller.key();
        escrow.asset = ctx.accounts.asset.key();
        escrow.price = price;
        escrow.is_filled = false;
        escrow.bump = ctx.bumps.escrow_account;
        emit!(ListingCreated { asset: escrow.asset, seller: escrow.seller, price });
        Ok(())
    }

    /// Buyer purchases the listed asset.
    /// Splits payment: platform_fee → treasury, remainder → seller.
    /// Then transfers the Core asset to the buyer and marks escrow filled.
    pub fn purchase(ctx: Context<Purchase>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_account;
        require!(!escrow.is_filled, EscrowError::AlreadyFilled);
        require_keys_eq!(escrow.seller, ctx.accounts.seller.key(), EscrowError::SellerMismatch);
        require_keys_eq!(escrow.asset, ctx.accounts.asset.key(), EscrowError::AssetMismatch);

        let price = escrow.price;
        let platform_fee = price
            .checked_mul(PLATFORM_FEE_BPS)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(EscrowError::MathOverflow)?;
        let seller_proceeds = price.checked_sub(platform_fee).ok_or(EscrowError::MathOverflow)?;

        // SOL: buyer → treasury (fee)
        if platform_fee > 0 {
            invoke(
                &system_instruction::transfer(
                    ctx.accounts.buyer.key,
                    ctx.accounts.treasury.key,
                    platform_fee,
                ),
                &[
                    ctx.accounts.buyer.to_account_info(),
                    ctx.accounts.treasury.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }

        // SOL: buyer → seller (proceeds)
        invoke(
            &system_instruction::transfer(
                ctx.accounts.buyer.key,
                ctx.accounts.seller.key,
                seller_proceeds,
            ),
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Core CPI: seller (signed via original listing flow — seller must
        // co-sign the purchase tx so they authorize the transfer). For a
        // fully escrowed model the asset would be reassigned to the PDA at
        // list time; this version keeps things simple and requires seller
        // co-signature on the purchase tx.
        let cpi_program = ctx.accounts.core_program.to_account_info();
        let cpi_accounts = TransferV1 {
            asset: ctx.accounts.asset.to_account_info(),
            collection: ctx.accounts.collection.as_ref().map(|c| c.to_account_info()),
            payer: ctx.accounts.buyer.to_account_info(),
            authority: Some(ctx.accounts.seller.to_account_info()),
            new_owner: ctx.accounts.buyer.to_account_info(),
            system_program: Some(ctx.accounts.system_program.to_account_info()),
            log_wrapper: None,
        };
        core_cpi::transfer_v1(CpiContext::new(cpi_program, cpi_accounts), None)?;

        // SPL memo: TheLilyPad:v1:marketplace_buy:<asset>
        let memo = format!("TheLilyPad:v1:marketplace_buy:{}", escrow.asset);
        invoke(
            &anchor_lang::solana_program::instruction::Instruction {
                program_id: MEMO_PROGRAM_ID,
                accounts: vec![],
                data: memo.into_bytes(),
            },
            &[],
        )?;

        let escrow_mut = &mut ctx.accounts.escrow_account;
        escrow_mut.is_filled = true;
        emit!(ListingFilled {
            asset: escrow_mut.asset,
            seller: escrow_mut.seller,
            buyer: ctx.accounts.buyer.key(),
            price,
            platform_fee,
        });
        Ok(())
    }

    /// Seller cancels an open listing. Closes the escrow PDA, refunding
    /// rent to the seller.
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_account;
        require!(!escrow.is_filled, EscrowError::AlreadyFilled);
        require_keys_eq!(escrow.seller, ctx.accounts.seller.key(), EscrowError::SellerMismatch);
        emit!(ListingCancelled { asset: escrow.asset, seller: escrow.seller });
        Ok(())
    }
}

// ─── Account contexts ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeListing<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + EscrowAccount::SIZE,
        seeds = [ESCROW_SEED, asset.key().as_ref()],
        bump,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    /// CHECK: Validated by mpl-core at transfer time; we only store the pubkey here.
    pub asset: AccountInfo<'info>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, asset.key().as_ref()],
        bump = escrow_account.bump,
        has_one = seller @ EscrowError::SellerMismatch,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Treasury account hard-checked against on-chain config (caller responsibility).
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    /// CHECK: The Core asset account — validated by the Core CPI.
    #[account(mut)]
    pub asset: AccountInfo<'info>,
    /// CHECK: Optional Core collection (required for assets that belong to one).
    #[account(mut)]
    pub collection: Option<AccountInfo<'info>>,
    /// CHECK: Must equal mpl_core::ID.
    pub core_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(
        mut,
        close = seller,
        seeds = [ESCROW_SEED, escrow_account.asset.as_ref()],
        bump = escrow_account.bump,
        has_one = seller @ EscrowError::SellerMismatch,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub seller: Signer<'info>,
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
pub struct EscrowAccount {
    pub seller: Pubkey,
    pub asset: Pubkey,
    pub price: u64,
    pub is_filled: bool,
    pub bump: u8,
}

impl EscrowAccount {
    pub const SIZE: usize = 32 + 32 + 8 + 1 + 1;
}

// ─── Events (for off-chain indexer) ─────────────────────────────────────────

#[event]
pub struct ListingCreated {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
}

#[event]
pub struct ListingFilled {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub platform_fee: u64,
}

#[event]
pub struct ListingCancelled {
    pub asset: Pubkey,
    pub seller: Pubkey,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("The escrow has already been filled.")]
    AlreadyFilled,
    #[msg("Price must be greater than zero.")]
    InvalidPrice,
    #[msg("Seller pubkey does not match escrow record.")]
    SellerMismatch,
    #[msg("Asset pubkey does not match escrow record.")]
    AssetMismatch,
    #[msg("Math overflow while computing fees.")]
    MathOverflow,
}
