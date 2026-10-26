-- The app runs these itself on first request (lib/db.js). Kept here so you can read the shape.
create schema if not exists campaign_links;

create table if not exists campaign_links.campaigns (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  destination text not null,
  key_hash text not null,          -- sha256 of the private stats key; the key itself is never stored
  is_demo boolean not null default false,
  expires_at timestamptz,          -- short links on the free demo stop working after 30 days
  created_at timestamptz not null default now()
);

create table if not exists campaign_links.links (
  code text primary key,           -- the 7 characters after /c/
  campaign_id bigint not null references campaign_links.campaigns(id) on delete cascade,
  channel text not null,
  utm_source text not null,
  utm_medium text not null,
  unique (campaign_id, channel)
);

create table if not exists campaign_links.clicks (
  id bigserial primary key,
  code text not null references campaign_links.links(code) on delete cascade,
  at timestamptz not null default now(),
  device text not null,            -- phone, tablet or computer, from the user agent
  bot boolean not null default false,     -- link preview fetchers, counted apart
  seeded boolean not null default false   -- sample clicks on the demo campaign
);
create index if not exists clicks_code_at on campaign_links.clicks (code, at);

create table if not exists campaign_links.hits (
  bucket text primary key,
  n int not null,
  expires_at timestamptz not null
);
