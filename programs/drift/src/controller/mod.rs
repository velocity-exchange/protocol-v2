//! Stateful protocol operations: fills, liquidations, position mutations, funding settlements.
//! Pure math lives in `crate::math`. Instruction handlers (account validation) live in `crate::instructions`.
//! `orders.rs` = order lifecycle (placement, cancellation, fill matching for perp + spot).
//! `liquidation.rs` = margin checks, position reduction, social loss, insurance draws.
//! `position.rs` / `spot_position.rs` = position mutation primitives used by orders and liquidation.
//! `funding.rs` / `pnl.rs` / `repeg.rs` = market maintenance operations run by keeper cranks.

pub mod amm;
pub mod funding;
pub mod insurance;
pub mod isolated_position;
pub mod liquidation;
pub mod orders;
pub mod pda;
pub mod pnl;
pub mod position;
pub mod repeg;
pub mod revenue_share;
pub mod spot_balance;
pub mod spot_position;
pub mod token;
