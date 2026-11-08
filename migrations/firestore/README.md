# Firestore data model (no migration needed)

`intents/{id}` (public metadata)
- pair: string
- sizeBucket: string
- commitment: string (sha256 hex, 64 chars)
- status: "open" | "negotiating" | "closed" | "expired"
- createdAt, expiresAt: Timestamp

`intent_private/{id}` (server only, same id)
- sellerAccount: string
- payloadEnc: string (AES-256-GCM blob: amount, price, note, salt)
- createdAt: Timestamp

`rooms/{id}` (server only)
- intentId, pair, sizeBucket, sellerAccount, buyerAccount: string
- status: "negotiating" | "agreed" | "no_deal" | "closed"
- turn: "seller" | "buyer", turnCount: number, busyUntil: number (ms lock)
- agreement: { pair, amount, price, nonce, intentId } | null
- createdAt, updatedAt: Timestamp
- `messages/{auto}`: n, from, kind, text, price|null, ai, at

`room_private/{id}` (server only)
- payloadEnc: string (buyer's encrypted amount and max price)
- createdAt: Timestamp
