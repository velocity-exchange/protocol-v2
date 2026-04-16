# MASTER MAP: Drift Protocol v2 - Perpetual Futures Engine

## Source
- Type: GitHub Repo (local clone)
- Key context file: `drift_perp_futures_context.md`
- Program source: `programs/drift/src/`
- Total files mapped: 80 (30 CRITICAL, 22 IMPORTANT, 28 SUPPORTING)

---

## The Bucket - All Concepts to Cover

### PHASE 1 - THE WORLD (no code, pure understanding)

1. What is trading - buying and selling things
2. What are futures - betting on a future price
3. What makes a future "perpetual" - no expiry date
4. The exchange - the middleman that holds the rules
   → BRIDGE: "Now you know the pieces: a marketplace, agreements on future prices that never expire, and a middleman enforcing rules. But HOW do people actually make or lose money here?"

5. Long vs Short - betting price goes up vs down
6. How traders make and lose money - profit and loss basics
7. Collateral - putting up money as a guarantee
8. Margin - how much guarantee you need relative to your bet size
9. Leverage - controlling a big position with small collateral
   → BRIDGE: "You need someone on the other side of every bet. What if no one wants to take the other side?"

### PHASE 2 - THE ENGINE (conceptual + on-chain intro)

10. Who takes the other side of your trade - counterparty problem
11. The Automated Market Maker (AMM) - a robot counterparty
12. Constant product formula (x * y = k) - intuitive level
13. How the AMM sets prices from its reserves
14. The peg multiplier - anchoring AMM price to real-world price (WHERE the real price comes from → external price feeds, taught in Ring 10)
    → BRIDGE: "The AMM is a formula. But formulas need to live somewhere, store state, execute on commands."

15. Solana accounts - where all data lives on the blockchain
16. The four pillars: State, PerpMarket, CollateralMarket, User accounts (the collateral market account holds token config — we'll call it by its code name and explore it fully in Ring 15)
17. Fixed-point precision - why there are no decimals on-chain
18. Precision constants (PRICE_PRECISION, BASE_PRECISION, QUOTE_PRECISION)
19. Safe math - checked arithmetic to prevent overflow/underflow
    → BRIDGE: "Now you know WHERE data lives. What exactly IS stored when you open a position?"

### PHASE 3 - THE TRADE (following one trade through the code)

20. PerpPosition struct - the record of your bet
21. base_asset_amount - how much you're betting (size, in the "base" side of x*y=k from Ring 3)
22. quote_asset_amount - what you paid to enter (the "quote" side of x*y=k)
23. quote_entry_amount vs quote_break_even_amount (they differ because the exchange takes a cut — how that cut works is Ring 7)
24. Position direction (PositionDirection::Long/Short)
    → BRIDGE: "Your position exists in code. But HOW do you create it? You need to tell the exchange what you want."

25. Order struct - the instruction to trade
26. OrderType enum - Market, Limit, TriggerMarket, TriggerLimit, and one more type that uses an external price feed (fully explained in Ring 10)
27. OrderParams - what the user submits to place an order
28. Order lifecycle - Open -> Filled/Canceled/Expired
29. Reduce-only orders - can only shrink a position
30. Post-only orders - your order must wait to be matched, not execute immediately (the full maker/taker distinction plays out in Ring 23)
31. Immediate-or-cancel orders
    → BRIDGE: "You placed an order. Who fills it, at what price? Market orders need a price NOW."

32. Dutch auction mechanism - price slides from start to end over slots
33. auction_start_price and auction_end_price
34. auction_duration - how many slots the auction lasts
35. Fillers/Keepers - off-chain bots that trigger on-chain fills
36. The fill flow: place_order -> fill_order orchestration (controller/orders.rs). NOTE: fill_order loads a reference price as its first step — WHERE this price comes from is fully explained in Ring 10. For now, treat it as "the real-world price fed into the system."
37. Fees charged on fill - taker fee, maker rebate, filler reward (WHERE these fees accumulate → Ring 13)
    → BRIDGE: "A fill happened. What changes on the position?"

38. Opening, increasing, decreasing, closing a position (controller/position.rs)
39. PositionDelta - the change applied to a position on fill
40. update_position_and_market - how a fill mutates position state (the USER side: base_asset_amount, quote_asset_amount change). This function ALSO mutates the AMM's own tracking fields — the MARKET side is explained in Ring 9 once we know those fields.
    → BRIDGE: "Your order was filled by the AMM. But how did the AMM actually calculate the swap? Let's go deeper."

### PHASE 4 - THE PRICING ENGINE (what happened inside that fill)

41. AMM struct - the full robot market maker state (connecting Ring 3 concepts to actual code)
42. base_asset_reserve and quote_asset_reserve - the AMM's inventory
43. sqrt_k - the liquidity depth parameter
44. terminal_quote_asset_reserve - the balanced-market reference
45. base_asset_amount_with_amm - net exposure the AMM holds (sum of all positions from Ring 5)
46. base_asset_amount_long / _short - total market open interest tracking
47. Concentration coefficient - tightening liquidity without adding depth
48. min/max_base_asset_reserve - AMM availability bounds (what sets these bounds → Ring 12)
    → BRIDGE: "The AMM computes prices from reserves. But how does it know if its price is RIGHT? It needs truth from outside."

49. Why external price feeds are needed (the AMM's peg from Ring 3 needs a source of truth)
50. OraclePriceData struct - price, confidence, delay
51. OracleSource enum - Pyth, Switchboard, Pyth Lazer, etc.
52. HistoricalOracleData - TWAP, 5min TWAP, timestamps
53. StrictOraclePrice - using min/max of oracle for safety
54. OracleMap - loading and caching oracle accounts efficiently
    → BRIDGE: "Now the AMM knows the real price. But it doesn't just quote one number - it quotes a bid and an ask. Why?"

55. Bid/ask spread - the AMM's profit margin on each trade (the AMM's protection during fills from Ring 7)
56. base_spread and max_spread - the range
57. long_spread and short_spread - asymmetric spreads
    → BRIDGE: "You know the AMM quotes a bid and an ask with a spread. But this spread isn't fixed — it reacts to what's happening in the market."

58. Dynamic spread from inventory - wider when AMM is imbalanced (uses base_asset_amount_with_amm from Ring 9)
59. Dynamic spread from volatility (mark_std, oracle_std - uses oracle from Ring 10)
60. ask/bid_base_asset_reserve and ask/bid_quote_asset_reserve - transformed reserves
61. Revenue-based spread retreat - calculate_spread() takes the AMM's cumulative revenue and recent revenue tracking fields as direct inputs. When AMM is losing money, spreads widen to protect it. These fields are fully explained in Ring 13; here we learn THAT revenue affects spreads and the DIRECTION (losing money → wider spread).
    → BRIDGE: "Spreads widen when the AMM loses money. Fees were charged on fill (Ring 7). Where does all this money actually go, and how does the AMM track whether it's profitable?"

### PHASE 5 - ONGOING COSTS (what does holding a position cost?)

62. Fee flow & accumulation - total_fee, total_exchange_fee, total_mm_fee
63. total_fee_minus_distributions - the protocol's running balance
64. Fee pool (PoolBalance) - partition of fees reserved for specific protocol needs (you'll see exactly which needs in Rings 14 and 19)
65. Fee tiers - volume-based discounts
66. fee_adjustment per market - custom fee scaling
    → BRIDGE: "Fees accumulate in pools. One critical use: funding. What if the AMM's price drifts from oracle? There must be a force pulling them together."

67. Why funding rates exist - anchoring perp price to oracle (mark TWAP from spreads Rings 11-12, oracle TWAP from Ring 10)
68. Mark price TWAP vs Oracle price TWAP - the divergence signal
69. Funding rate calculation - payment from one side to the other
70. Long/short funding rate asymmetry - protocol pays/receives the gap
71. Capped funding rate - protecting total_fee_minus_distributions (from Ring 13, now the cap makes sense)
72. Cumulative funding rate tracking (per-market, per-position — reveals PerpPosition.last_cumulative_funding_rate field not covered in Ring 5)
73. Funding period and update cadence
74. net_revenue_since_last_funding - AMM P&L tracking per funding epoch (this is the field that feeds back into spread retreat from Ring 12)
    → BRIDGE: "You hold a position and pay ongoing costs. But what IS your collateral in code? Where does your deposited money actually live on-chain?"

### PHASE 6 - RISK (are you safe?)

75. Your collateral in code - SpotPosition on the User account (state/user.rs). User.spot_positions[0] is always the quote asset (USDC). Your deposit lives here.
76. scaled_balance and SpotBalanceType (Deposit vs Borrow) - how balances are stored
77. get_token_amount - converts scaled_balance to real token amount using the collateral market's interest multipliers (the collateral market account was introduced as a pillar in Ring 4, concept 16; the full interest math is in Ring 26)
78. get_token_value / get_strict_token_value - dollar value of a spot position using oracle price
79. When fees are charged or funding is paid → your spot balance changes via update_spot_balances (controller/spot_balance.rs). This is the single pipe connecting all money flow to your account (more flows use this same pipe in later rings).
    → BRIDGE: "Now you know what collateral IS in code. How much profit or loss is your perp position sitting on?"

80. Core PnL calculation - exit value minus entry value (math/pnl.rs)
81. calculate_base_asset_value - what closing your position is worth (uses AMM reserves from Ring 9)
82. calculate_base_asset_value_and_pnl_with_oracle_price - oracle-based valuation (uses oracle from Ring 10)
    → BRIDGE: "PnL tells you your profit/loss. But the exchange needs to know: do you have ENOUGH collateral to cover potential losses?"

83. MarginRequirementType - Initial, Fill, Maintenance
84. margin_ratio_initial and margin_ratio_maintenance on PerpMarket
85. How margin requirement is calculated for a position
86. IMF factor - Initial Margin Fraction for size-based premium
87. calculate_size_premium_liability_weight - bigger position = more margin
    → BRIDGE: "You know how much margin one position needs. But traders hold multiple positions with spot collateral. How does the system add it all up?"

88. Unrealized PnL asset weights - discounting positive PnL (uses PnL calc from Ring 16)
89. unrealized_pnl_imf_factor and a cap on how much positive PnL counts toward margin (why this cap exists → Ring 19)
90. MarginCalculation struct - aggregating across all positions and spot positions. For each perp position, calls calculate_funding_payment (Ring 14) to include unsettled funding in unrealized PnL
91. Total collateral (sum of spot position values from Ring 15) vs total margin requirement
92. MarginMode - the system supports different ways of calculating margin (details in Ring 26)
    → BRIDGE: "Margin is calculated. Now positive PnL can be cashed out, negative PnL must be paid - but settlement needs margin checks."

93. PnL pool (PoolBalance on PerpMarket) - where settled PnL flows
94. Settling positive PnL - withdrawing from pool, increasing user's spot balance (Ring 15)
95. Settling negative PnL - depositing into pool, decreasing user's spot balance (Ring 15)
96. PnL imbalance - when net user PnL exceeds pool capacity
97. Price divergence checks for safe PnL settlement
98. settle_pnl calls meets_settle_pnl_maintenance_margin_requirement (uses margin from Rings 17-18)
    → BRIDGE: "What happens when your losses grow so large that your collateral can't cover maintenance margin?"

99. When liquidation triggers - total collateral < maintenance margin requirement (margin from Rings 17-18)
100. Liquidation flow (controller/liquidation.rs) - the full process
101. Partial liquidation - initial_pct_to_liquidate, liquidation over time
102. Liquidator fee and a second fee that goes to a safety fund (that fund is explained in Ring 21)
103. Max liquidation fee - bounded by maintenance margin
104. BeingLiquidated status and a second terminal status (what that status means → Ring 21)
105. liquidation_margin_freed - tracking partial liquidation progress
    → BRIDGE: "Liquidation usually recovers enough. But what if the market moves so fast that even liquidation leaves a hole?"

106. When a user goes bankrupt - negative equity
107. Social loss - spreading loss across winning positions
108. Insurance fund claims (InsuranceClaim on PerpMarket)
109. ContractTier (A/B/C/Speculative/HighlySpeculative/Isolated) - insurance eligibility
110. Insurance fund as backstop before socialized loss
    → BRIDGE: "The risk system protects users. But the AMM itself needs maintenance - its peg drifts, its liquidity can be wrong-sized."

### PHASE 7 - AMM HEALTH (keeping the engine running)

111. Repeg - adjusting peg_multiplier to track oracle price (peg from Ring 3, oracle from Ring 10)
112. Repeg cost calculation (math/repeg.rs) - paid from fee pool (Ring 13)
113. Formulaic K updates - auto-scaling liquidity depth (sqrt_k from Ring 9)
114. curve_update_intensity - how aggressively K adjusts
115. Budgeted K scale - bounded by fee pool (Ring 13)
116. AMM JIT - protocol filling as maker alongside user orders (extends fill flow from Ring 7)
117. amm_jit_intensity - participation level
    → BRIDGE: "The AMM isn't the only way orders get filled. Two users' orders can match directly."

118. Fulfillment methods - PerpFulfillmentMethod::AMM vs Match (the choice made in Ring 7's fill flow)
119. determine_perp_fulfillment_methods - priority ordering
120. Maker/taker matching - do_orders_cross logic
121. calculate_fill_for_matched_orders
122. Filler multiplier for matched orders
    → BRIDGE: "The protocol provides liquidity via AMM. But users can ALSO provide liquidity."

### PHASE 8 - ADVANCED (extending the core)

123. LP shares - users providing liquidity through the AMM (extends AMM from Ring 9)
124. user_lp_shares and sqrt_k relationship
125. base_asset_amount_per_lp and quote_asset_amount_per_lp
126. LP settlement - syncing LP position with AMM state
127. base_asset_amount_with_unsettled_lp
128. LP rebase mechanics
    → BRIDGE: "LPs commit capital to markets. But what happens if a market needs to wind down — can it just stop? What controls whether a market is active, paused, or shutting down?"

129. MarketStatus enum - Initialized -> Active -> ReduceOnly -> Settlement -> Delisted
130. PausedOperations (PerpOperation bitflags) - granular pause controls
131. ExchangeStatus bitflags - global pause controls on State
132. Market expiry (expiry_ts, expiry_price) - winding down a market
133. Delisting PnL settlement (controller/pnl/delisting.rs) - extends PnL settlement (Ring 19)
    → BRIDGE: "A market can launch, run, pause, and delist. But the system we've built assumes one margin mode, one fill source, and trusted price data. What if traders need different margin rules, or price feeds go stale, or orders can route through external venues?"

134. High leverage mode - reduced margin for smaller positions (extends margin from Rings 17-18)
135. high_leverage_margin_ratio_initial/maintenance
136. Isolated margin positions - per-position collateral (extends MarginMode from Ring 18)
137. isolated_position_scaled_balance on PerpPosition
138. Protected maker orders - maker-side protection (extends matching from Ring 23)
139. Prediction markets (ContractType::Prediction) - binary outcomes
140. Oracle guard rails - staleness, confidence, volatility checks (extends oracle from Ring 10)
141. OracleValidity enum and validation logic
142. Account maps (PerpMarketMap, SpotMarketMap, OracleMap) - efficient loading
143. MarketSet - tracking which markets need writable access
144. Events (state/events.rs) - OrderActionRecord, OrderRecord emission
145. Full SpotMarket deep dive - borrowing, interest rates, cumulative interest (extends spot basics from Ring 15)
146. Spot balance math for cross-collateral valuation
147. Revenue pool and fee withdrawal mechanics (extends fee flow from Ring 13)
148. External DEX fulfillment params (Phoenix, OpenBook v2, Serum)

---

## Concept Dependencies

Each ring's concepts require ONLY concepts from prior rings. No circular dependencies.

- Concepts 5-9 require: 1-4 (need trading basics for long/short/margin)
- Concepts 10-14 require: 5-9 (need long/short to understand counterparty problem)
- Concepts 15-19 require: 10-14 (need AMM concept to motivate on-chain storage)
- Concepts 20-24 require: 12-13, 15-19 (base/quote come from x*y=k, stored in accounts)
- Concepts 25-31 require: 20-24 (need position to understand orders that create them)
- Concepts 32-37 require: 25-31 (orders need to be filled, auctions give fill prices; reference price used as input → forward ref to Ring 10)
- Concepts 38-40 require: 20-24, 32-37 (fills mutate positions; AMM-side mutations → forward ref to Ring 9)
- Concepts 41-48 require: 12-14, 38-40 (AMM internals explain what happened in that fill, AMM tracks aggregate positions from Ring 5)
- Concepts 49-54 require: 14, 41-48 (oracle gives AMM its peg source of truth)
- Concepts 55-57 require: 41-48 (basic spreads are parameters on the AMM struct)
- Concepts 58-61 require: 55-57, 49-54 (dynamic factors use oracle data + AMM inventory; revenue retreat uses fee fields → forward ref to Ring 13)
- Concepts 62-66 require: 37, 55-61 (fee flow extends fees-on-fill, explains fields that feed into spread retreat from Ring 12)
- Concepts 67-74 require: 55-61, 62-66 (funding uses mark TWAP from spreads Rings 11-12, capped by fee pool Ring 13)
- Concepts 75-79 require: 15-19, 49-54 (spot position uses accounts + oracle for valuation)
- Concepts 80-82 require: 41-48, 49-54, 75-79 (PnL uses AMM + oracle valuation, result lands in spot balance)
- Concepts 83-87 require: 80-82 (per-position margin needs position valuation from Ring 16)
- Concepts 88-92 require: 83-87, 67-74, 80-82, 75-79 (portfolio margin aggregates per-position margin + unsettled funding from Ring 14 + PnL weights from Ring 16 + spot collateral from Ring 15)
- Concepts 93-98 require: 62-66, 83-92 (PnL settlement uses fee pool Ring 13 + margin checks Rings 17-18 + spot balance updates Ring 15)
- Concepts 99-105 require: 83-92 (liquidation triggers on margin breach)
- Concepts 106-110 require: 99-105 (bankruptcy when liquidation isn't enough)
- Concepts 111-117 require: 14, 41-48, 49-54, 62-66 (repeg uses peg+oracle+fee pool, JIT extends fills)
- Concepts 118-122 require: 32-37, 55-61 (matching is alternative to AMM fills, uses spreads)
- Concepts 123-128 require: 41-48, 93-98, 111-117 (LP extends AMM, settlement extends PnL, rebase uses update_k from Ring 22)
- Concepts 129-133 require: 93-98, 99-105 (lifecycle includes settlement and delisting PnL)
- Concepts 134-148 require: all prior (advanced modes extend margin, oracle, matching, fees, full spot deep dive)

---

## Ring Plan

### PHASE 1 - THE WORLD
- **Ring 1**: Concepts 1-4 -- The real world: trading, futures, perpetual, exchange
- **Ring 2**: Concepts 5-9 -- Your first trade: long, short, PnL, collateral, margin, leverage

### PHASE 2 - THE ENGINE
- **Ring 3**: Concepts 10-14 -- The robot trader: AMM, constant product, price from reserves, peg
- **Ring 4**: Concepts 15-19 -- Going on-chain: Solana accounts, four pillars, precision, safe math

### PHASE 3 - THE TRADE (following one trade through the code)
- **Ring 5**: Concepts 20-24 -- Your position in code: PerpPosition struct, base/quote amounts, direction
- **Ring 6**: Concepts 25-31 -- Placing your bet: Order struct, types, lifecycle, reduce-only, post-only
- **Ring 7**: Concepts 32-37 -- Getting filled: Dutch auctions, keepers, fill flow, fees-on-fill
- **Ring 8**: Concepts 38-40 -- Position updates: open/increase/decrease/close, PositionDelta

### PHASE 4 - THE PRICING ENGINE (what happened inside that fill)
- **Ring 9**: Concepts 41-48 -- AMM internals: reserves, sqrt_k, exposure, OI, bounds
- **Ring 10**: Concepts 49-54 -- Truth from outside: oracles, price feeds, TWAP, strict pricing
- **Ring 11**: Concepts 55-57 -- The AMM's edge: what spreads are, bid/ask, asymmetry
- **Ring 12**: Concepts 58-61 -- Living spreads: inventory, volatility, transformed reserves, revenue retreat

### PHASE 5 - ONGOING COSTS
- **Ring 13**: Concepts 62-66 -- Where money flows: fee accumulation, pools, total_fee_minus_distributions
- **Ring 14**: Concepts 67-74 -- Staying anchored: funding rate, mark vs oracle, asymmetry, capping

### PHASE 6 - RISK (the safety cascade)
- **Ring 15**: Concepts 75-79 -- Your collateral in code: SpotPosition, scaled_balance, get_token_value, spot balance updates
- **Ring 16**: Concepts 80-82 -- PnL calculation: exit - entry, AMM-based and oracle-based valuation
- **Ring 17**: Concepts 83-87 -- Per-position margin: types, ratios, IMF, size premium
- **Ring 18**: Concepts 88-92 -- Portfolio margin: PnL weights, aggregation, total collateral
- **Ring 19**: Concepts 93-98 -- PnL settlement: pool, settling +/-, imbalance, margin requirement
- **Ring 20**: Concepts 99-105 -- Liquidation: triggers, partial flow, fees, statuses
- **Ring 21**: Concepts 106-110 -- Bankruptcy & insurance: social loss, insurance fund, contract tiers

### PHASE 7 - AMM HEALTH
- **Ring 22**: Concepts 111-117 -- AMM maintenance: repeg, K updates, AMM JIT
- **Ring 23**: Concepts 118-122 -- Matching engine: fulfillment methods, crossing, matched fills

### PHASE 8 - ADVANCED
- **Ring 24**: Concepts 123-128 -- LP system: shares, sqrt_k, settlement, rebase
- **Ring 25**: Concepts 129-133 -- Market lifecycle: statuses, pauses, expiry, delisting
- **Ring 26**: Concepts 134-148 -- Special modes & infrastructure: high leverage, isolated, prediction, guard rails, account maps, events, full spot deep dive, DEX

---

## Vocabulary Restrictions Per Ring

- **Ring 1**: No jargon. "Marketplace" not "exchange." "Bet" not "position." "Agreement" not "contract."
- **Ring 2**: Can introduce: long, short, profit, loss, collateral, margin, leverage
- **Ring 3**: Can introduce: AMM, reserves, constant product, liquidity, peg
- **Ring 4**: Can introduce: account, program, precision, fixed-point, struct
- **Ring 5**: Can introduce: position, base asset, quote asset, entry price, break-even, direction
- **Ring 6**: Can introduce: order, limit, market order, trigger, reduce-only, post-only, IOC
- **Ring 7**: Can introduce: auction, Dutch auction, keeper, filler, slot, taker fee, maker rebate
- **Ring 8**: Can introduce: position delta, open/increase/decrease/close
- **Ring 9**: Can introduce: sqrt_k, concentration, open interest, net exposure, terminal reserves
- **Ring 10**: Can introduce: oracle, price feed, TWAP, confidence interval, staleness
- **Ring 11**: Can introduce: spread, bid, ask, mark price
- **Ring 12**: Can introduce: inventory, volatility, revenue retreat, transformed reserves
- **Ring 13**: Can introduce: fee pool, total_fee_minus_distributions, fee tier, revenue pool
- **Ring 14**: Can introduce: funding rate, funding payment, cumulative funding, capping
- **Ring 15**: Can introduce: spot position, scaled balance, token amount, token value, deposit, borrow
- **Ring 16**: Can introduce: PnL, exit value, entry value, base asset value
- **Ring 17**: Can introduce: initial margin, maintenance margin, fill margin, IMF, liability weight
- **Ring 18**: Can introduce: asset weight, total collateral, margin calculation, margin mode
- **Ring 19**: Can introduce: PnL settlement, PnL pool, imbalance, divergence
- **Ring 20**: Can introduce: liquidation, liquidator, partial liquidation, margin freed
- **Ring 21**: Can introduce: bankruptcy, social loss, insurance fund, contract tier
- **Ring 22**: Can introduce: repeg, K update, formulaic, curve intensity, AMM JIT
- **Ring 23**: Can introduce: fulfillment method, maker/taker matching, crossing
- **Ring 24**: Can introduce: LP shares, liquidity provider, LP settlement, rebase
- **Ring 25**: Can introduce: market status, paused operations, expiry, delisting
- **Ring 26**: Can introduce: high leverage mode, isolated margin, protected maker, prediction market, oracle guard rails, account map, events, cumulative interest, external DEX

---

## Key Source Files Per Ring

- **Ring 5**: `state/user.rs` (PerpPosition)
- **Ring 6**: `state/user.rs` (Order), `state/order_params.rs`
- **Ring 7**: `math/auction.rs`, `controller/orders.rs`, `math/fees.rs`
- **Ring 8**: `controller/position.rs`, `math/orders.rs`
- **Ring 9**: `state/perp_market.rs` (AMM struct), `math/amm.rs`
- **Ring 10**: `state/oracle.rs`, `state/oracle_map.rs`
- **Ring 11**: `math/amm_spread.rs` (base spread params), `state/perp_market.rs` (spread fields)
- **Ring 12**: `math/amm_spread.rs` (dynamic spread calculations)
- **Ring 13**: `state/state.rs` (FeeStructure), `state/perp_market.rs` (PoolBalance, fee fields)
- **Ring 14**: `math/funding.rs`, `controller/funding.rs`
- **Ring 15**: `state/user.rs` (SpotPosition), `state/spot_market.rs` (SpotBalanceType), `math/spot_balance.rs`, `controller/spot_balance.rs`
- **Ring 16**: `math/pnl.rs`, `math/position.rs`
- **Ring 17**: `math/margin.rs` (per-position margin requirement)
- **Ring 18**: `math/margin.rs` (aggregation, weights), `state/margin_calculation.rs`
- **Ring 19**: `controller/pnl.rs`
- **Ring 20**: `math/liquidation.rs`, `controller/liquidation.rs`
- **Ring 21**: `math/bankruptcy.rs`, `state/perp_market.rs` (InsuranceClaim, ContractTier)
- **Ring 22**: `math/repeg.rs`, `math/cp_curve.rs`, `math/amm_jit.rs`, `controller/repeg.rs`
- **Ring 23**: `math/matching.rs`, `math/fulfillment.rs`
- **Ring 24**: `controller/lp.rs`
- **Ring 25**: `state/perp_market.rs` (MarketStatus), `state/paused_operations.rs`
- **Ring 26**: `state/high_leverage_mode_config.rs`, `controller/isolated_position.rs`, `math/oracle.rs`, `state/perp_market_map.rs`, `state/events.rs`, `state/spot_market.rs` (full), `state/fulfillment_params/`
