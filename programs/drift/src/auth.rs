//! Tiered admin authority predicates.
//!
//! Three tiers, additive: `cold ⊇ warm ⊇ hot(role)`. `state.admin` is cold.
//! `AdminAuthorityConfig.warm_admin` is the warm multisig+timelock pubkey.
//! Each `HotRole` field on `AdminAuthorityConfig` is a purpose-specific bot key.
//!
//! `Pubkey::default()` in any role field means the role is unassigned and
//! falls through to warm-or-cold only.

use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::admin_authority_config::{AdminAuthorityConfig, HotRole};
use crate::state::state::State;

pub fn admin_is_cold(signer: &Pubkey, state: &State) -> bool {
    *signer == state.admin
}

pub fn admin_is_warm(signer: &Pubkey, state: &State, config: &AdminAuthorityConfig) -> bool {
    admin_is_cold(signer, state)
        || (config.warm_admin != Pubkey::default() && *signer == config.warm_admin)
}

pub fn admin_is_hot(
    signer: &Pubkey,
    state: &State,
    config: &AdminAuthorityConfig,
    role: HotRole,
) -> bool {
    if admin_is_warm(signer, state, config) {
        return true;
    }
    let role_key = config.role_key(role);
    role_key != Pubkey::default() && *signer == role_key
}

pub fn require_cold(signer: &Pubkey, state: &State) -> Result<()> {
    require!(admin_is_cold(signer, state), ErrorCode::Unauthorized);
    Ok(())
}

pub fn require_warm(signer: &Pubkey, state: &State, config: &AdminAuthorityConfig) -> Result<()> {
    require!(
        admin_is_warm(signer, state, config),
        ErrorCode::Unauthorized
    );
    Ok(())
}

pub fn require_hot(
    signer: &Pubkey,
    state: &State,
    config: &AdminAuthorityConfig,
    role: HotRole,
) -> Result<()> {
    require!(
        admin_is_hot(signer, state, config, role),
        ErrorCode::Unauthorized
    );
    Ok(())
}

// AccountLoader-taking variants for use directly inside Anchor `constraint = ...`
// clauses. These call `.load()` internally and propagate the result.

pub fn check_warm_loader(
    signer: &Pubkey,
    state: &State,
    config_loader: &AccountLoader<'_, AdminAuthorityConfig>,
) -> Result<bool> {
    let config = config_loader.load()?;
    Ok(admin_is_warm(signer, state, &config))
}

pub fn check_hot_loader(
    signer: &Pubkey,
    state: &State,
    config_loader: &AccountLoader<'_, AdminAuthorityConfig>,
    role: HotRole,
) -> Result<bool> {
    let config = config_loader.load()?;
    Ok(admin_is_hot(signer, state, &config, role))
}
