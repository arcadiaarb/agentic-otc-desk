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
