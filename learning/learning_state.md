# LEARNING STATE

## Current Position
- Ring: 4 of 26
- Active Concept: 15-19 (Going on-chain: Solana accounts, four pillars, precision, safe math)
- Status: Not Started (Ring 3 just closed)

## Progress Overview

### PHASE 1 - THE WORLD
- [x] Ring 1: Trading, futures, perpetual, exchange -- COMPLETED
- [x] Ring 2: Long, short, PnL, collateral, margin, leverage -- COMPLETED

### PHASE 2 - THE ENGINE
- [x] Ring 3: AMM, constant product, price from reserves, peg -- COMPLETED
- [ ] Ring 4: Solana accounts, four pillars, precision, safe math -- NEXT

### PHASE 3 - THE TRADE
- [ ] Ring 5: PerpPosition struct, base/quote, direction
- [ ] Ring 6: Order struct, types, lifecycle, reduce-only, post-only
- [ ] Ring 7: Dutch auctions, keepers, fill flow, fees-on-fill
- [ ] Ring 8: Position updates: open/increase/decrease/close

### PHASE 4 - THE PRICING ENGINE
- [ ] Ring 9: AMM internals: reserves, sqrt_k, exposure, OI, bounds
- [ ] Ring 10: Oracles, price feeds, TWAP, strict pricing
- [ ] Ring 11: Spreads: what they are, bid/ask, asymmetry
- [ ] Ring 12: Living spreads: inventory, volatility, revenue retreat

### PHASE 5 - ONGOING COSTS
- [ ] Ring 13: Fee flow, accumulation, pools, total_fee_minus_distributions
- [ ] Ring 14: Funding rate, mark vs oracle, asymmetry, capping

### PHASE 6 - RISK
- [ ] Ring 15: Spot as collateral: SpotPosition, scaled_balance, get_token_value
- [ ] Ring 16: PnL calculation: exit - entry, AMM and oracle valuation
- [ ] Ring 17: Per-position margin: types, ratios, IMF, size premium
- [ ] Ring 18: Portfolio margin: PnL weights, aggregation, total collateral
- [ ] Ring 19: PnL settlement: pool, +/-, imbalance, margin check
- [ ] Ring 20: Liquidation: triggers, partial, fees, statuses
- [ ] Ring 21: Bankruptcy, social loss, insurance fund, contract tiers

### PHASE 7 - AMM HEALTH
- [ ] Ring 22: Repeg, K updates, AMM JIT
- [ ] Ring 23: Matching engine, fulfillment methods, crossing

### PHASE 8 - ADVANCED
- [ ] Ring 24: LP system: shares, sqrt_k, settlement, rebase
- [ ] Ring 25: Market lifecycle: statuses, pauses, expiry, delisting
- [ ] Ring 26: Special modes & infrastructure: high leverage, isolated, prediction, guard rails, events, full spot deep dive, DEX

## Mastery Notes

### Ring 1
- User knows long/short conceptually at a basic/UI level but does NOT actively trade perps. Do not assume trader intuition for PnL math, funding, liquidations, etc. Verify from scratch.
- Initial sticking point: "how can someone sell a promise for something they don't have?" -- landed once reframed as "a recorded bet in a database whose value tracks an external price." The word "promise" confused them; "bet" / "agreement" stuck.
- BREAKTHROUGH at Ring 1 close: user independently derived the counterparty matching problem -- "if I'm long $50, someone must be short $50; how does the protocol find exact opposite amounts among thousands of traders?" This IS the motivating question for the entire AMM (Rings 3, 9-12) and matching engine (Ring 23). They think at the system-design level, not just mechanics -- lean into this.
- Analogy that worked: "rain is independent, it happens on its own" -- user used this to explain that the underlying asset's price is separate from the bet. Reuse this framing when we introduce oracles (Ring 10).
- User prefers the word "bet" over "promise" -- stick with "bet" / "agreement" going forward.

### Ring 2
- Entered Ring 2 with the stock-market short-selling mental model ("Bob borrowed BTC, sold at $50k, rebought at $45k, kept the difference"). Classic perp-learner trap. Corrected by asking them to spot the contradiction with Ring 1 ("if longs don't touch real BTC, why would shorts?"). Landed cleanly.
- Ideas 5 (long/short) and 6 (PnL) now locked in. User understands: direction is just a sign, PnL flows between long and short as price moves, no asset is ever physically exchanged.
- Moving to idea 7 (collateral). Per the plan, this is where Ring 2 slows down -- collateral/margin/leverage are the genuinely new material for this user.
- Ring 2 closed out cleanly. User tends to give TERSE but CORRECT answers ("10,000", "trader a still alive"). Don't mistake brevity for shallow understanding -- they track the math, they just don't always spell it out. When they're terse, fill in the math on paper for the record, then keep moving.
- User asked to skip the collateral/margin check question ("i understand, let's move") but passed the follow-up leverage-math verification cleanly. They're pacing themselves; trust it but still verify at ring boundaries.
- STYLE PREFERENCE (explicit, mid-Ring-3): user wants pure atomic Socratic -- one variable per question, no multi-part questions, no explanation dumps, no recapping lists of ideas. Ask, wait, push one layer deeper. Don't spoon-feed answers. If they use jargon, make them define it first. Keep the ring framework (required by CLAUDE.md) but tighten style sharply within it.

### Ring 3
- User independently derived FOUR major concepts: (1) x*y=k with y/x = price, correctly mapping y=USDC, x=BTC; (2) virtual reserves insight -- "AMM does not actually have any BTC reserve, just collateral" -- caught this on their own, usually a taught concept not a derived one; (3) arbitrage as a gap-closer -- "won't traders long to capture the 50k vs 55k gap?"; (4) peg-induced instant PnL redistribution -- "if peg moves, longs win instantly and shorts lose instantly."
- Teaching pattern that worked: stress-test the user's "simple oracle-only AMM" hypothesis with a concrete pile-in scenario ($100 long x 1M traders x 20% move = $20M owed). Made them FEEL why a curve is needed. They derived the mechanism from the pain.
- CONFUSION MODE: user shuts down with "no idea what you are telling" when a scenario has too many variables at once (1M traders + $5M + oracle ticks in one question). Fix: one variable at a time. One trader, one move. Scale up in separate turns.
- Self-aware: user explicitly flagged "partially understand, not solid" and later "what if there are hidden parts I don't know" -- honor this, do audits at ring close. They prefer honesty over false completion.
- Mini-callbacks landed well: when user asked "is this x*y?" mid-derivation, parking the formula for one more atomic step ("price moves which direction?") forced them to verbalize the mechanism BEFORE seeing the formula name. Do this again.
- Vocabulary introduced at Ring 3 close: `mark_price` (the AMM's quoted price = (y/x) * peg_multiplier), `slippage` (teaser -- own trade moves price; full math Ring 9).
- Forward refs planted for Rings 9 (price impact), 10 (oracles), 11 (bid/ask spread), 14 (funding rate), 22 (repeg cost/triggers), 24 (where virtual reserves come from / LPs). Don't let these become vapor -- resurface each when its ring opens.

## Vocabulary Unlocked
- trading, buying, selling
- future (a bet on what a price WILL be)
- perpetual (a bet that never expires)
- exchange / marketplace / middleman (the program that holds money, tracks bets, forces payouts)
- bet / agreement (the record that tracks a position's value)
- long (bet that price goes up)
- short (bet that price goes down)
- PnL / profit and loss (money flowing between sides as price moves; drains from loser's collateral, adds to winner's)
- collateral (locked deposit guaranteeing you can pay if you lose; USDC on Drift)
- margin / margin requirement (required collateral-to-size ratio, enforced before a bet can open; stored as margin_ratio_initial per market)
- leverage (bet size / collateral ratio; inverse of margin; e.g. 5% margin = up to 20x leverage)
- liquidation (teaser only: forcible bet closure before collateral hits zero; full topic in Ring 20)
- AMM (automated market maker -- always-available robot counterparty)
- reserves / virtual reserves (x = base, y = quote; purely accounting numbers on a perp AMM, no actual BTC anywhere)
- constant product / x*y=k (the curve: as one reserve drops, the other must rise to keep product constant; price never runs out, just gets arbitrarily expensive)
- liquidity (implicitly: the size of the reserves; thicker reserves = less price impact per trade)
- peg / peg_multiplier (scalar knob in the price formula: mark_price = (y/x) * peg_multiplier; aligns AMM baseline to real-world oracle price)
- mark price (the AMM's quoted price from its formula)
- slippage (teaser only: own trade moves the price against you; full math Ring 9)
- arbitrage (user-derived: traders capture the AMM-oracle gap, which also closes the gap)
- funding rate (teaser only: indirect ongoing gap-closer; full topic Ring 14)
- repeg / repeg cost (teaser only: peg updates cost the AMM when net-exposed, paid from fee pool; full mechanics Ring 22)

## Next Up
- Ring 4: going on-chain. The conceptual AMM now needs a home. Introduce Solana accounts (where data lives), the four pillars (State, PerpMarket, CollateralMarket placeholder, User), fixed-point precision (why no decimals on-chain, PRICE_PRECISION / BASE_PRECISION / QUOTE_PRECISION), safe math (checked arithmetic, overflow prevention).
- Opening move for Ring 4: user has been pricing everything in clean dollar math. Break that. Ask: "on-chain, there are no decimals. How would you store $50,123.45 as an integer?" Let them derive fixed-point.
- Forward refs to resurface when their ring opens: Ring 9 (price impact formula, sqrt_k, open interest), Ring 10 (oracle mechanics), Ring 11 (bid/ask spread), Ring 14 (funding rate), Ring 22 (repeg), Ring 24 (LPs / virtual reserve origination).
