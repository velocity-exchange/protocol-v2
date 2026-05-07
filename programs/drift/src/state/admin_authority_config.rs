//! Tiered admin authority configuration.
//!
//! `state.admin` is the cold authority. This PDA holds the warm authority (a
//! multisig+timelock pubkey) and one purpose-specific hot pubkey per
//! operational role. Cold rotates warm; warm rotates the hot roles.
//!
//! `Pubkey::default()` in any field means the role is unassigned and only
//! warm/cold can call those handlers.

use crate::state::traits::Size;
use anchor_lang::prelude::*;

pub const ADMIN_AUTHORITY_CONFIG_SEED: &[u8] = b"admin_authority_config";

#[account(zero_copy(unsafe))]
#[derive(Eq, PartialEq, Debug)]
#[repr(C)]
pub struct AdminAuthorityConfig {
    pub warm_admin: Pubkey,
    pub amm_crank: Pubkey,
    pub lp_cache: Pubkey,
    pub lp_swap: Pubkey,
    pub lp_settle: Pubkey,
    pub if_rebalance: Pubkey,
    pub feature_flag: Pubkey,
    pub fuel: Pubkey,
    pub user_flag: Pubkey,
    pub vault_deposit: Pubkey,
    pub mm_oracle_crank: Pubkey,
    pub amm_spread_adjust: Pubkey,
    pub padding: [u8; 256],
}

impl Default for AdminAuthorityConfig {
    fn default() -> Self {
        Self {
            warm_admin: Pubkey::default(),
            amm_crank: Pubkey::default(),
            lp_cache: Pubkey::default(),
            lp_swap: Pubkey::default(),
            lp_settle: Pubkey::default(),
            if_rebalance: Pubkey::default(),
            feature_flag: Pubkey::default(),
            fuel: Pubkey::default(),
            user_flag: Pubkey::default(),
            vault_deposit: Pubkey::default(),
            mm_oracle_crank: Pubkey::default(),
            amm_spread_adjust: Pubkey::default(),
            padding: [0u8; 256],
        }
    }
}

impl Size for AdminAuthorityConfig {
    const SIZE: usize = 8 + 32 * 12 + 256;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum HotRole {
    AmmCrank,
    LpCache,
    LpSwap,
    LpSettle,
    IfRebalance,
    FeatureFlag,
    Fuel,
    UserFlag,
    VaultDeposit,
    MmOracleCrank,
    AmmSpreadAdjust,
}

impl AdminAuthorityConfig {
    pub fn role_key(&self, role: HotRole) -> Pubkey {
        match role {
            HotRole::AmmCrank => self.amm_crank,
            HotRole::LpCache => self.lp_cache,
            HotRole::LpSwap => self.lp_swap,
            HotRole::LpSettle => self.lp_settle,
            HotRole::IfRebalance => self.if_rebalance,
            HotRole::FeatureFlag => self.feature_flag,
            HotRole::Fuel => self.fuel,
            HotRole::UserFlag => self.user_flag,
            HotRole::VaultDeposit => self.vault_deposit,
            HotRole::MmOracleCrank => self.mm_oracle_crank,
            HotRole::AmmSpreadAdjust => self.amm_spread_adjust,
        }
    }

    pub fn set_role_key(&mut self, role: HotRole, key: Pubkey) {
        match role {
            HotRole::AmmCrank => self.amm_crank = key,
            HotRole::LpCache => self.lp_cache = key,
            HotRole::LpSwap => self.lp_swap = key,
            HotRole::LpSettle => self.lp_settle = key,
            HotRole::IfRebalance => self.if_rebalance = key,
            HotRole::FeatureFlag => self.feature_flag = key,
            HotRole::Fuel => self.fuel = key,
            HotRole::UserFlag => self.user_flag = key,
            HotRole::VaultDeposit => self.vault_deposit = key,
            HotRole::MmOracleCrank => self.mm_oracle_crank = key,
            HotRole::AmmSpreadAdjust => self.amm_spread_adjust = key,
        }
    }
}
