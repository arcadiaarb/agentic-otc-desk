# Tacet

> *"Confidential Intents makes transactions private. We make finding and negotiating them private too."*

*This project is licensed under the MIT License.*

## What is Tacet?

**Tacet** is a private, peer-to-peer Over-The-Counter (OTC) negotiation desk built on NEAR. 

In music, *tacet* means "it is silent." For high-stakes traders and institutions, Tacet provides a silent, confidential space to find counterparties and negotiate large trades without broadcasting your intentions to the public market.

## The Problem: The "Public" OTC Desk

Large trades (like selling 50 BTC) can't just be dumped on a public exchange without crashing the price (slippage). Traders use OTC desks to negotiate privately.

However, current Web3 OTC solutions have a major flaw: **Discovery is public.** 
If a seller posts an intent saying *"Large BTC sell, 1–5% below spot,"* everyone can see it. Worse, bots and malicious actors can fingerprint these listings by timing them with public market data, or spam the network to map out who holds what. By the time you negotiate, your privacy is already gone. 

Even NEAR's existing "Confidential Intents" only solve privacy *during the transaction*. They don't solve privacy *while you're finding someone to trade with.*

## The Solution: Tacet

Tacet acts as a **Confidential Negotiation Service (CNS)** that layers on top of NEAR Intents. We separate the *finding* from the *executing*. 

Instead of posting a public listing, Tacet hides your true intent inside a secure hardware enclave (a Trusted Execution Environment, or TEE) and only posts a cryptographic "sealed envelope" (a commitment hash) to the public.

### How it Works (The 3 Steps)

1. **Create a Sealed Intent (The Seller):**
   The seller enters their true terms (e.g., exact amount, exact price) into Tacet. This private data is encrypted and sent to the NEAR AI Cloud TEE. The public only sees a vague category (e.g., "Large BTC, USDC settlement") and a commitment hash.
2. **The Private Room (Discovery & Negotiation):**
   A buyer sees the vague category and requests to negotiate. The system opens a private room. Here, two isolated AI agents—one representing the buyer, one representing the seller—negotiate inside the TEE. They know the secret prices; the users and the public do not. 
3. **The Handoff (Execution):**
   Once the AI agents reach an agreement, a final "Agreement Artifact" is generated. Both parties sign it, and Tacet hands the signed intent to the **1Click API**, which settles the trade privately via the FAR private chain.

## What Tacet is NOT
*   **Not an Order Book:** We do not run a matching engine. Discovery is user-driven (browse + request).
*   **Not a Settlement Layer:** We don't move the money. We just safely hand the agreed-upon trade to NEAR's 1Click.
*   **Not a Dark Pool:** Tacet is non-custodial. Your funds stay in your wallet until you sign the final execution.

## Why NEAR & AI?
*   **NEAR Intents:** Provides the perfect execution layer. We just make the *front half* of the trade (discovery) as private as the *back half* (settlement).
*   **NEAR AI Cloud TEEs:** This is our secret weapon. By running the AI agents inside a TEE, we can cryptographically prove that the AI negotiation was fair, that neither party's reservation price was leaked, and that the operator (us) couldn't peek at the data. 

## Tech Stack (Under the Hood)
*   **Frontend:** Next.js 14+, Tailwind CSS, `shadcn/ui`.
*   **Wallet:** NEAR Wallet Selector.
*   **Backend/CNS:** Next.js + database for metadata storage.
*   **Privacy & AI:** NEAR AI Cloud (TEE).
*   **Execution:** 1Click (`@defuse-protocol/one-click-sdk-typescript`).

## Current Status
*Built for the Near Hackathon.*

*“Silence is golden. Trade in it.”*

## To Run
To Run a Copy of this repo on your local machine

```bash
# Clone This Repo,or whatever the current name is
git clone https://github.com/arcardiaarb/agentic-otc-desk
# Enter the folder
cd agentic-otc-desk
# Install Dependencies
npm install
# Create .env.local, copy and pass the values of .env.example into it
# Run Dev
npm run dev
```