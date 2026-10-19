# Game2 Economy — prototype contracts

- Dollar-denominated **game** balances, not money or a redeemable asset.
- World average salary (comparison anchor): $2,000 per month.
- User Firestore path is unchanged: `users/{uid}/player/economy`. The added `companions` object is separate from `SCHEMA_VERSION=4` companion state and from user-editable memory.
- `addVirtualMoney` is a free debug top-up. Must be disabled or fully server-controlled before any paid-money launch.
- `spendVirtualCurrency` executes one transaction on the user's economy document and separately tracks the recipient's cash/gifts and financial memory. Gift price is not cash.
- `advanceCompanionExpenses` simulates one low-cost daily purchase when app opens, if funds are present, with deterministic fixed-category logic. Not GPT-powered or active when app is closed.
- `economy_<uuid>` event ID + typed encoded payload render a transfer/gift visual card. Companion receives the human-readable contextText for a separate dialogue decision. Chat is retriable by the same immutable event ID, not by replaying a second debit.
- Financial memories for gifts/transfers >= $500 survive changes to the 30-message chat window and are injected at the next reply; no 50-message summarizer has been enabled.
- Existing v0.21.4 balances and transactions are decoded without breaking. Wallet's `appliedIds` improves retry protection, capped at 300 events. Scaling to real payments requires a server-side journal/subcollection.
