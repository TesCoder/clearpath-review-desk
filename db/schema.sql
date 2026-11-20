-- ClearPath ad review desk: schema and trusted reference data.
-- Idempotent: safe to run on every deploy.
-- All companies, offers, rates, affiliates and ads are fictional.

-- Trusted reference data (owned by ClearPath, never typed by a marketer) ----

create table if not exists offers (
  id        text primary key,
  product   text not null,
  campaign  text not null
);

-- An offer's terms change over time. Each revision has effective dates, and
-- the revision in effect on an ad's planned publication date is the one the
-- ad is checked against.
create table if not exists offer_revisions (
  id                   text primary key,
  offer_id             text not null references offers (id),
  revision             int  not null,
  effective_from       date not null,
  effective_to         date,
  apr_min              numeric(5, 2),
  apr_max              numeric(5, 2),
  origination_fee_pct  numeric(5, 2),
  term_min_months      int,
  term_max_months      int,
  source               text not null,
  unique (offer_id, revision)
);

create table if not exists affiliates (
  id    text primary key,
  name  text not null,
  kind  text not null
);

-- Per-visitor demo workspace -------------------------------------------------

-- The browser holds a random token in an httpOnly cookie. Only its SHA-256
-- hash is stored, so a database read does not reveal a usable token.
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  ref           text not null,
  title         text not null,
  affiliate_id  text not null references affiliates (id),
  offer_id      text not null references offers (id),
  placement     text not null,
  planned_date  date not null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, ref)
);

-- Every edit is a new version. A version's text never changes.
create table if not exists versions (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references assets (id) on delete cascade,
  number       int  not null,
  body         text not null,
  fingerprint  text not null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (asset_id, number)
);

-- A decision records exactly what was decided on: the version's text
-- fingerprint, the offer revision it was checked against, and the planned
-- date and placement at that moment. An approval holds only while all four
-- still match.
create table if not exists decisions (
  id                 uuid primary key default gen_random_uuid(),
  version_id         uuid not null references versions (id) on delete cascade,
  kind               text not null check (kind in ('approve', 'request_changes')),
  fingerprint        text not null,
  offer_revision_id  text not null references offer_revisions (id),
  planned_date       date not null,
  placement          text not null,
  reviewer           text not null,
  created_at         timestamptz not null default now()
);

create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references versions (id) on delete cascade,
  decision_id  uuid references decisions (id) on delete cascade,
  anchor_text  text,
  body         text not null,
  author_role  text not null check (author_role in ('reviewer', 'marketer')),
  created_at   timestamptz not null default now()
);

-- Append-only log. Time to decision and revision rounds are computed from it.
create table if not exists events (
  id            bigserial primary key,
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  asset_id      uuid references assets (id) on delete cascade,
  version_id    uuid references versions (id) on delete cascade,
  type          text not null,
  actor_role    text not null,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists assets_workspace_idx on assets (workspace_id);
create index if not exists versions_asset_idx on versions (asset_id);
create index if not exists decisions_version_idx on decisions (version_id);
create index if not exists comments_version_idx on comments (version_id);
create index if not exists events_workspace_idx on events (workspace_id, created_at);

-- AI review results, kept by content: the same text checked against the same
-- offer revision gives the same result for every visitor, so it is stored
-- once. The key is the text's own fingerprint, so nothing here belongs to one
-- workspace. Only answers from the model are stored, never "unavailable".
create table if not exists ai_reviews (
  fingerprint        text not null,
  offer_revision_id  text not null references offer_revisions (id),
  placement          text not null,
  prompt_version     text not null,
  status             text not null check (status in ('complete', 'incomplete')),
  findings           jsonb not null,
  dropped            int  not null,
  missed             jsonb not null,
  reason             text,
  model              text not null,
  created_at         timestamptz not null default now(),
  primary key (fingerprint, offer_revision_id, placement, prompt_version)
);

-- One row per model call, to cap spend on a public demo.
create table if not exists ai_calls (
  id            bigserial primary key,
  workspace_id  uuid references workspaces (id) on delete set null,
  outcome       text not null,
  created_at    timestamptz not null default now()
);
create index if not exists ai_calls_created_idx on ai_calls (created_at);

-- Reference data -------------------------------------------------------------

insert into offers (id, product, campaign) values
  ('pl-winter', 'Personal loan', 'Winter Personal Loan'),
  ('cc-everyday', 'Credit card', 'Everyday Cash Card'),
  ('mtg-prequal', 'Mortgage prequalification', 'Home Prequalification')
on conflict (id) do update set product = excluded.product, campaign = excluded.campaign;

insert into offer_revisions
  (id, offer_id, revision, effective_from, effective_to, apr_min, apr_max,
   origination_fee_pct, term_min_months, term_max_months, source)
values
  ('pl-winter-r1', 'pl-winter', 1, '2026-11-01', '2026-12-31', 8.99, 35.99, 2.00, 24, 60,
   'ClearPath offer sheet PL-2026-W, revision 1 (fictional)'),
  ('pl-winter-r2', 'pl-winter', 2, '2027-01-01', null, 9.49, 35.99, 2.00, 24, 60,
   'ClearPath offer sheet PL-2026-W, revision 2 (fictional)'),
  ('cc-everyday-r1', 'cc-everyday', 1, '2026-09-01', null, 19.24, 29.24, null, null, null,
   'ClearPath offer sheet CC-2026-E, revision 1 (fictional)'),
  ('mtg-prequal-r1', 'mtg-prequal', 1, '2026-09-01', null, null, null, null, null, null,
   'ClearPath offer sheet MTG-2026-P, revision 1 (fictional)')
on conflict (id) do update set
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  apr_min = excluded.apr_min,
  apr_max = excluded.apr_max,
  origination_fee_pct = excluded.origination_fee_pct,
  term_min_months = excluded.term_min_months,
  term_max_months = excluded.term_max_months,
  source = excluded.source;

insert into affiliates (id, name, kind) values
  ('pinecrest', 'Pinecrest Compare', 'Comparison site'),
  ('tallowmere', 'Tallowmere Money Blog', 'Personal finance blog'),
  ('quillon', 'Quillon Deals Letter', 'Email newsletter')
on conflict (id) do update set name = excluded.name, kind = excluded.kind;
