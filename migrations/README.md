# Migrations
Tacet's data model has two collections/tables that share one id:

| | Public (safe to read) | Private (server only) |
|---|---|---|
| Supabase | `intents` | `intent_private` |
| Firestore | `intents` | `intent_private` |

- **Active database: Firestore** (`migrations/firestore/`). Nothing to run; collections are created on first write. Paste `firestore.rules` into Firebase console, Firestore, Rules.
- **Supabase (kept in case we switch back):** run `migrations/supabase/001_init.sql` in the SQL editor, then swap `lib/firebase.ts` and `app/api/intents/route.ts` for a `@supabase/supabase-js` client.
