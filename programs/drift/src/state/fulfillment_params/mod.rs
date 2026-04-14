//! Fulfillment parameter types for routing spot orders to external DEX venues
//! (Drift AMM, OpenBook, Phoenix, Serum). Each variant carries the venue-specific accounts needed at fill time.

pub mod drift;
pub mod openbook_v2;
pub mod phoenix;
pub mod serum;
