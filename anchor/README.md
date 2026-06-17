# Anchor Programs - Post-Mint Modules

This directory contains **Anchor programs** that operate as separate modules interacting with NFTs AFTER they are minted.

## Architecture

Per 2026 Metaplex Core Standards:
- **Core Candy Machine** (in `src/chains/solana/`) = Exclusive mint engine
- **Anchor programs** (this directory) = Post-mint functionality modules

## Programs

### escrow_program
**Purpose**: Marketplace escrow for NFT trading  
**Status**: ✅ Production-ready, Core CPI compliant  
**Location**: `escrow_program/`  
**Audit**: [AUDIT.md](./escrow_program/AUDIT.md)

Features:
- Core Asset escrow using `mpl_core::cpi::transfer_v1`
- Non-custodial (seller co-signs transfers)
- Platform fee routing (2.5% to treasury)
- SPL memo for indexing

### battle_program
**Purpose**: Experimental gaming/battle system  
**Status**: ⚠️ Experimental, localnet only  
**Location**: `programs/battle_program/`  
**Documentation**: [README.md](./programs/battle_program/README.md)

Features:
- Battle creation with entry fees
- Participant management
- Swap volume recording (off-chain verified)
- Reward distribution

## Core Integration

All Anchor programs:
- ✅ Use Core CPI where applicable (escrow_program)
- ✅ Do NOT implement custom minting logic
- ✅ Operate on Core Assets post-mint
- ✅ Complement Core Candy Machine, not replace it

## Deployment

### escrow_program
```bash
cd escrow_program
anchor build
anchor deploy --provider.cluster devnet
```

### battle_program
**Not deployed** - experimental/localnet only

## Testing

Integration tests verify Anchor + Core Asset compatibility:
```bash
anchor test
```

## Security

- PDA-seeded accounts prevent injection
- Authority-controlled operations
- Core CPI validated by program ID
- No asset custody without explicit authorization

## Maintenance

- Monitor Core SDK updates for CPI changes
- Regenerate program keypairs before mainnet deploy
- Audit annually for security compliance
