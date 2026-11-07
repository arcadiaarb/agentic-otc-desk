create type intent_status as enum ('open', 'negotiating', 'closed', 'expired');

-- Public: safe for everyone to read
create table public.intents (
  id          uuid primary key default gen_random_uuid(),
  pair        text not null,
  size_bucket text not null,
  commitment  text not null check (commitment ~ '^[0-9a-f]{64}$'),
  status      intent_status not null default 'open',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index intents_board_idx on public.intents (status, expires_at);

-- Private: server only. Seller wallet + encrypted amount/price/note/salt
create table public.intent_private (
  intent_id      uuid primary key references public.intents(id) on delete cascade,
  seller_account text not null,
  payload_enc    text not null,
  created_at     timestamptz not null default now()
);

alter table public.intents        enable row level security;
alter table public.intent_private enable row level security;

create policy "read open intents" on public.intents
  for select to anon, authenticated
  using (status = 'open' and expires_at > now());

revoke all on public.intent_private from anon, authenticated;
