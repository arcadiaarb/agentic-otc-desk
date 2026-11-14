# Tacet — Private OTC Trading

> **Confidential Intents make transactions private. Tacet makes finding and negotiating them private too.**

Tacet is a non-custodial, peer-to-peer OTC desk built on NEAR. It gives buyers and sellers a private way to discover one another, negotiate large trades, and settle with NEAR Intents—without publishing exact listing terms to the market.

## The problem

Large public orders can reveal a trader's plans and move the market. Traditional OTC trading avoids public order books, but finding a counterparty and negotiating terms can still expose sensitive information.

## How Tacet works

1. **Create a private intent.** A seller enters the asset pair, exact amount, minimum price, and optional note. A cryptographic commitment represents the private terms.
2. **Discover counterparties.** The public board shows only broad listing details, such as the asset pair and approximate size range.
3. **Negotiate privately.** NEAR AI agents negotiate in a privacy-preserving TEE. Each agent follows its user's price limits, while Tacet's mediator validates proposals. A rule-based fallback keeps negotiations moving if AI is unavailable.
4. **Settle the trade.** Once both sides agree, each signs their trade terms. Tacet submits the complementary NEAR Intents together for atomic peer-to-peer settlement.

## Why Tacet

- **Privacy from discovery onward:** exact listing terms are not exposed on the public board.
- **Fair, bounded negotiation:** server-side rules enforce each party's limits and keep negotiations focused.
- **Non-custodial settlement:** users authorize their own trades; Tacet does not hold their trading funds.
- **A complete trading flow:** create an intent, find a counterparty, negotiate, sign, and settle in one product.

## Built with

- Next.js, React, TypeScript, and Tailwind CSS
- NEAR Wallet Selector and NEP-413 signatures
- NEAR AI privacy TEE for agent-based negotiation
- Database for public intent metadata and encrypted private terms
- NEAR Intents for peer-to-peer settlement

## Demo flow

Connect a wallet, create an intent with private terms, and view its broad summary on the board. From a second wallet, request a negotiation and follow the agents' proposals. After agreement, both parties sign and complete settlement.

**Tacet — Silence is golden. Trade in it.**
