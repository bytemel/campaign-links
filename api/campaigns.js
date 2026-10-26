// POST: create a campaign with one short link per channel. GET ?slug=: links and click stats
// (needs the manage key in x-manage-key, except for the public demo).
import { db, migrate, allow, hash } from "../lib/db.js";
import { json, readJson, route, fail } from "../lib/http.js";
import { CHANNELS, campaignInput, newSlug, newKey, newCode, stats } from "../lib/core.js";

const TTL_DAYS = Number(process.env.LINK_TTL_DAYS) || 30; // short links on a free demo expire, so nobody can use it as a spam shortener

export const POST = route(async (request) => {
  await migrate();
  if (!(await allow(request, "campaign", 5, 60))) throw fail(429, "That is a lot of campaigns. Try again in an hour.");
  const input = campaignInput(await readJson(request), new URL(request.url).host);
  const sql = db();
  await sql`delete from campaign_links.campaigns where not is_demo and created_at < now() - interval '90 days'`;
  const slug = newSlug();
  const key = newKey();
  const [c] = await sql`
    insert into campaign_links.campaigns (slug, name, destination, key_hash, expires_at)
    values (${slug}, ${input.name}, ${input.destination}, ${hash(key)}, now() + make_interval(days => ${TTL_DAYS}))
    returning id`;
  await insertLinks(sql, c.id, input.channels);
  return json({ ok: true, slug, key }, 201);
});

async function insertLinks(sql, campaignId, channels) {
  const rows = channels.map((ch) => ({ code: newCode(), channel: ch, source: CHANNELS[ch].source, medium: CHANNELS[ch].medium }));
  await sql`
    insert into campaign_links.links (code, campaign_id, channel, utm_source, utm_medium)
    select x.code, ${campaignId}, x.channel, x.source, x.medium
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as x(code text, channel text, source text, medium text)`;
}

export const GET = route(async (request) => {
  await migrate();
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  if (!/^[a-z0-9]{3,16}$/.test(slug)) throw fail(404, "No campaign here.");
  const sql = db();
  if (slug === "demo") await ensureDemo(sql, url.origin);
  const [c] = await sql`select id, slug, name, destination, key_hash, is_demo, expires_at, created_at from campaign_links.campaigns where slug = ${slug}`;
  if (!c) throw fail(404, "No campaign here. Check the link.");
  const key = request.headers.get("x-manage-key") || "";
  if (!c.is_demo && hash(key) !== c.key_hash) throw fail(403, "Open this from your private stats link.");
  const links = await sql`select code, channel from campaign_links.links where campaign_id = ${c.id}`;
  const rows = await sql`
    select k.code, to_char(k.at at time zone 'Africa/Nairobi', 'YYYY-MM-DD') as day, k.device, k.bot, k.seeded, count(*)::int as n
    from campaign_links.clicks k join campaign_links.links l on l.code = k.code
    where l.campaign_id = ${c.id}
    group by 1, 2, 3, 4, 5`;
  return json({
    ok: true,
    campaign: { slug: c.slug, name: c.name, destination: c.destination, demo: c.is_demo, expiresAt: c.expires_at ? new Date(c.expires_at).toISOString() : null },
    links: links.map((l) => ({ code: l.code, channel: l.channel, label: CHANNELS[l.channel]?.label || l.channel })),
    stats: stats(links, rows),
  });
});

// The demo campaign points at this app's own /landing page and starts with clearly marked sample clicks.
async function ensureDemo(sql, origin) {
  const [existing] = await sql`select id from campaign_links.campaigns where slug = 'demo'`;
  if (existing) return;
  const [c] = await sql`
    insert into campaign_links.campaigns (slug, name, destination, key_hash, is_demo)
    values ('demo', 'Demo Hub cohort 5 applications', ${`${origin}/landing`}, ${hash(newKey())}, true)
    on conflict (slug) do nothing returning id`;
  if (!c) return; // another request created it first
  const channels = ["whatsapp", "linkedin", "x", "instagram", "email", "poster"];
  await insertLinks(sql, c.id, channels);
  // Sample clicks so the chart is not empty on day one. Marked seeded=true and shown as "sample" in the UI.
  const weights = { whatsapp: 9, linkedin: 4, x: 1, instagram: 3, email: 5, poster: 2 };
  await sql`
    insert into campaign_links.clicks (code, at, device, bot, seeded)
    select l.code,
           now() - (random() * interval '13 days'),
           case when random() < 0.78 then 'phone' else 'computer' end,
           false, true
    from campaign_links.links l
    cross join lateral generate_series(1, (${JSON.stringify(weights)}::jsonb ->> l.channel)::int * 6) g
    where l.campaign_id = ${c.id}`;
  await sql`
    insert into campaign_links.clicks (code, at, device, bot, seeded)
    select l.code, now() - (random() * interval '13 days'), 'computer', true, true
    from campaign_links.links l cross join generate_series(1, 7) g
    where l.campaign_id = ${c.id} and l.channel in ('whatsapp', 'linkedin')`;
}
