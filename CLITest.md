
# Tacet CLI End-to-End Test

This document outlines the steps to run the end-to-end (E2E) proof test for the Tacet negotiation and settlement engine using the command line. 

> **Note:** All commands in this document must be run in a bash terminal from the root directory of the project.

## Prerequisites
Ensure you have installed the project dependencies (`npm install`) and that you have a way to fund testnet accounts (e.g., a testnet wallet or faucet).

## Step-by-Step Guide

### 1. Check Signing Offline (Self-Test)
First, run a self-test to ensure the cryptographic signing logic works offline.

```bash
npx tsx scripts/p2p-proof.ts selftest
```
**Expected Result:** The script should end with the text `"selftest OK"`. 

### 2. Create the Accounts
Generate the testnet accounts for the seller and the buyer.

```bash
npx tsx scripts/p2p-proof.ts setup
```
**Expected Result:** The terminal will print two long testnet addresses (one seller, one buyer). The secret keys will be saved locally in `.proof/keys.json` (this folder is git-ignored for security).

### 3. Fund the Accounts
Send a small amount of testnet NEAR to **each** of the two addresses printed in Step 2. 
*You can do this from any testnet wallet or a testnet faucet.* This NEAR is required for the accounts to exist and to pay for tiny gas fees.

### 4. Check Balances & Move Funds
Verify that both accounts have `wNEAR` and `USDC`, then deposit them into the verifier.

Check the current balances:
```bash
npx tsx scripts/p2p-proof.ts balances
```
Confirm both accounts show `wNEAR` and `USDC`. Next, move the funds to the verifier:
```bash
npx tsx scripts/p2p-proof.ts deposit
```

### 5. Dry-Run the Trade
Simulate the trade to ensure everything is configured correctly before moving real testnet funds.

```bash
npx tsx scripts/p2p-proof.ts simulate
```
**Expected Result:** The verifier simulates the trade. **Nothing changes on-chain.** 

### 6. Execute the Trade
Run the actual trade. By default, this will execute a trade of **1 wNEAR sold for 3 USDC**.

```bash
npx tsx scripts/p2p-proof.ts trade
```
*Optional:* You can pass custom amounts and prices by using the flags:
```bash
npx tsx scripts/p2p-proof.ts trade --amount 5 --price 15
```

---

## How to Read the Result

When you run the `trade` command, the script will print the balances before and after the transaction. 

**To pass, the following must be true:**
*   The seller's `wNEAR` went down by exactly the trade amount.
*   The seller's `USDC` went up by exactly the total price.
*   The buyer's balances moved the exact opposite way.

**Success Indicator:** The script will end with **`✓ PASS`**. It will also print a testnet explorer link to the transaction so you can verify it on-chain.
