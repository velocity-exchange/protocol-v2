//! Tiered admin authority predicates.
//!
//! Three tiers, additive: `cold ⊇ warm ⊇ hot(role)`. All three live on `State`:
//! `state.cold_admin` is the root authority (set at `initialize`), `state.warm_admin`
//! is the operational multisig+timelock pubkey, and `state.hot_*` fields hold one
//! purpose-specific bot key per `HotRole`.
//!
//! `Pubkey::default()` in any role field means the role is unassigned and falls
//! through to warm-or-cold only.

use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::state::{HotRole, State};

/// Anchor `constraint = ...` helper. Loads State via the AccountLoader so the
/// constraint can be expressed as `check_warm(&signer.key(), &state)?` inside
/// `#[derive(Accounts)]`. Returns `Ok(true)` iff the signer is cold or warm.
pub fn check_warm(signer: &Pubkey, state: &AccountLoader<'_, State>) -> Result<bool> {
    let state = state.load()?;
    Ok(state.is_warm(signer))
}

/// Anchor `constraint = ...` helper for hot-role-gated handlers. Returns
/// `Ok(true)` iff `signer` is cold, warm, or the configured key for `role`.
pub fn check_hot(
    signer: &Pubkey,
    state: &AccountLoader<'_, State>,
    role: HotRole,
) -> Result<bool> {
    let state = state.load()?;
    Ok(state.is_hot(signer, role))
}

pub fn require_cold(signer: &Pubkey, state: &State) -> Result<()> {
    require!(state.is_cold(signer), ErrorCode::Unauthorized);
    Ok(())
}

pub fn require_warm(signer: &Pubkey, state: &State) -> Result<()> {
    require!(state.is_warm(signer), ErrorCode::Unauthorized);
    Ok(())
}

pub fn require_hot(signer: &Pubkey, state: &State, role: HotRole) -> Result<()> {
    require!(state.is_hot(signer, role), ErrorCode::Unauthorized);
    Ok(())
}
