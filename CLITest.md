
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

### Example Output

```bash

C:\Users\PC\Desktop\tacet>npx tsx scripts/p2p-proof.ts balances

In each account's wallet (plain tokens, NOT usable for trades until deposited):
  seller: 2.88612275352112679272448 wNEAR, 0 USDC, 5 NEAR for gas
  buyer: 0 wNEAR, 10.197816 USDC, 5 NEAR for gas

Inside the verifier (what trades use):
  seller: 0 wNEAR, 0 USDC
  buyer:  0 wNEAR, 0 USDC


C:\Users\PC\Desktop\tacet>npx tsx scripts/p2p-proof.ts deposit

seller: depositing 2.88612275352112679272448 wNEAR into the verifier...
  tx: https://testnet.nearblocks.io/txns/5UVnXXvLbNSYN4oxvbuZ3N9RRhRYuTesnN6No4mkRfYX

buyer: depositing 10.197816 USDC into the verifier...
  tx: https://testnet.nearblocks.io/txns/ALyxGCaBsHvtaaSxeVLFme3D4NTPRoy2hqwX7XfsaxxP

Done. Run `balances` to confirm the funds now show inside the verifier.


C:\Users\PC\Desktop\tacet>npx tsx scripts/p2p-proof.ts balances

In each account's wallet (plain tokens, NOT usable for trades until deposited):
  seller: 0 wNEAR, 0 USDC, 4.999188780562974699999999 NEAR for gas
  buyer: 0 wNEAR, 0 USDC, 4.999189822698894699999999 NEAR for gas

Inside the verifier (what trades use):
  seller: 2.88612275352112679272448 wNEAR, 0 USDC
  buyer:  0 wNEAR, 10.197816 USDC


C:\Users\PC\Desktop\tacet>npx tsx scripts/p2p-proof.ts simulate

Signed intents built. Asking the verifier to simulate (nothing changes on chain)...
{
  "intents_executed": [
    {
      "intent_hash": "EpJEpHKPfrJwkW5SEppWtEa8GHTgVYub2sUQHqEPTjpy",
      "account_id": "88a2ab19164976707f02bf5978c59b645641bc37d162f7a15f9fefa47d678f5d",
      "nonce": "/E0Q8T31ODbnNgaLsCEHPq0W26f6il1RmNKMaxyccwg="
    },
    {
      "intent_hash": "4YfhAFG6UDTswr5mjgExo1jdbTtTqbiA11vZHcs2sEaM",
      "account_id": "b906bcf0b970f853ef04179f5cd007379f92dc73a4013677260c25ad11531186",
      "nonce": "/E0Q8RYcPp9EdvCpsKVoBveYMEybIghkW7Pm4A4KRUE="
    }
  ],
  "logs": [
    "EVENT_JSON:{\"standard\":\"dip4\",\"version\":\"0.4.3\",\"event\":\"token_diff\",\"data\":[{\"intent_hash\":\"EpJEpHKPfrJwkW5SEppWtEa8GHTgVYub2sUQHqEPTjpy\",\"account_id\":\"88a2ab19164976707f02bf5978c59b645641bc37d162f7a15f9fefa47d678f5d\",\"diff\":{\"nep141:usdc.tidepool-sandbox.testnet\":\"3000000\",\"nep141:wnear.tidepool-sandbox.testnet\":\"-1000000000000000000000000\"}}]}",
    "EVENT_JSON:{\"standard\":\"dip4\",\"version\":\"0.4.3\",\"event\":\"token_diff\",\"data\":[{\"intent_hash\":\"4YfhAFG6UDTswr5mjgExo1jdbTtTqbiA11vZHcs2sEaM\",\"account_id\":\"b906bcf0b970f853ef04179f5cd007379f92dc73a4013677260c25ad11531186\",\"diff\":{\"nep141:usdc.tidepool-sandbox.testnet\":\"-3000000\",\"nep141:wnear.tidepool-sandbox.testnet\":\"1000000000000000000000000\"}}]}",
    "EVENT_JSON:{\"standard\":\"dip4\",\"version\":\"0.4.3\",\"event\":\"intents_executed\",\"data\":[{\"intent_hash\":\"EpJEpHKPfrJwkW5SEppWtEa8GHTgVYub2sUQHqEPTjpy\",\"account_id\":\"88a2ab19164976707f02bf5978c59b645641bc37d162f7a15f9fefa47d678f5d\",\"nonce\":\"/E0Q8T31ODbnNgaLsCEHPq0W26f6il1RmNKMaxyccwg=\"},{\"intent_hash\":\"4YfhAFG6UDTswr5mjgExo1jdbTtTqbiA11vZHcs2sEaM\",\"account_id\":\"b906bcf0b970f853ef04179f5cd007379f92dc73a4013677260c25ad11531186\",\"nonce\":\"/E0Q8RYcPp9EdvCpsKVoBveYMEybIghkW7Pm4A4KRUE=\"}]}"
  ],
  "min_deadline": "2026-11-10T23:04:00.918Z",
  "state": {
    "fee": 0,
    "current_salt": "fc4d10f1"
  }
}

C:\Users\PC\Desktop\tacet>npx tsx scripts/p2p-proof.ts trade

Plan: seller gives 1 wNEAR, buyer pays 3 USDC (3 per wNEAR)
Before:
  seller: 2.88612275352112679272448 wNEAR, 0 USDC
  buyer:  0 wNEAR, 10.197816 USDC

Submitting execute_intents with both signatures in ONE transaction...
  tx: https://testnet.nearblocks.io/txns/47HQaLgvniXXzBcDmZDfuLkWPBCQmbfMn1g4e7ECf1cS
  status: {"SuccessValue":""}

After:
  seller: 1.88612275352112679272448 wNEAR, 3 USDC
  buyer:  1 wNEAR, 7.197816 USDC

✓ PASS: both sides moved by exactly the agreed amounts, in one atomic transaction.


C:\Users\PC\Desktop\tacet>npx tsx scripts/p2p-proof.ts balances

In each account's wallet (plain tokens, NOT usable for trades until deposited):
  seller: 0 wNEAR, 0 USDC, 4.998448114775212399999999 NEAR for gas
  buyer: 0 wNEAR, 0 USDC, 4.999189822698894699999999 NEAR for gas

Inside the verifier (what trades use):
  seller: 1.88612275352112679272448 wNEAR, 3 USDC
  buyer:  1 wNEAR, 7.197816 USDC


C:\Users\PC\Desktop\tacet>

```