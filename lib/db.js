// Neon Postgres over HTTP. One query per request, no pool to manage, works on Vercel functions.
// The tables live in their own schema so this app can share a database with others.
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

let sql = null;
let ready = null;

export function db() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error("DATABASE_URL is not set"), { status: 503 });
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

// Creates the tables on the first request after a cold start. Every statement is idempotent,
// so a fresh Neon database needs no setup step. The same SQL is in schema.sql for reading.
export function migrate() {
  ready ??= db().transaction((q) => [
    q`create schema if not exists campaign_links`,
    q`create table if not exists campaign_links.campaigns (
        id bigserial primary key,
        slug text not null unique,
        name text not null,
        destination text not null,
        key_hash text not null,
        is_demo boolean not null default false,
        expires_at timestamptz,
        created_at timestamptz not null default now())`,
    q`create table if not exists campaign_links.links (
        code text primary key,
        campaign_id bigint not null references campaign_links.campaigns(id) on delete cascade,
        channel text not null,
        utm_source text not null,
        utm_medium text not null,
        unique (campaign_id, channel))`,
    // One row per click. bot = link preview fetchers (WhatsApp, LinkedIn, Slack...), counted apart.
    q`create table if not exists campaign_links.clicks (
        id bigserial primary key,
        code text not null references campaign_links.links(code) on delete cascade,
        at timestamptz not null default now(),
        device text not null,
        bot boolean not null default false,
        seeded boolean not null default false)`,
    q`create index if not exists clicks_code_at on campaign_links.clicks (code, at)`,
    q`create table if not exists campaign_links.hits (
        bucket text primary key,
        n int not null,
        expires_at timestamptz not null)`,
  ]).catch((e) => { ready = null; throw e; });
  return ready;
}

export const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

// The caller's IP, hashed so the table never stores a raw address.
export function clientId(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
  return hash(`campaign-links:${ip}`).slice(0, 32);
}

// Fixed-window rate limit in Postgres: at most `max` calls per `minutes` for one action and caller.
export async function allow(request, action, max, minutes) {
  const bucket = `${action}:${clientId(request)}`;
  const [row] = await db()`
    insert into campaign_links.hits (bucket, n, expires_at)
    values (${bucket}, 1, now() + make_interval(mins => ${minutes}))
    on conflict (bucket) do update set
      n = case when hits.expires_at < now() then 1 else hits.n + 1 end,
      expires_at = case when hits.expires_at < now() then excluded.expires_at else hits.expires_at end
    returning n`;
  return row.n <= max;
}
