use borsh::{BorshDeserialize, BorshSerialize};

#[derive(Clone, Copy, BorshSerialize, BorshDeserialize, PartialEq, Debug, Eq, Default)]
pub enum MarketStatus {
    /// warm up period for initialization, fills are paused
    #[default]
    Initialized,
    /// all operations allowed
    Active,
    /// fills only able to reduce liability
    ReduceOnly,
    /// market has determined settlement price and positions are expired must be settled
    Settlement,
    /// market has no remaining participants
    Delisted,
}
