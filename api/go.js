// GET /c/<code>: log the click, then redirect to the destination with UTM tags.
// Link preview fetchers are logged as bots so the counts mean people.
import { db, migrate } from "../lib/db.js";
import { tagged, isBot, device, campaignTag } from "../lib/core.js";

const page = (status, title, body) => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/style.css"><main class="wrap top"><h1>${title}</h1><p>${body}</p><p><a href="/">Campaign Links</a></p></main></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

export async function GET(request) {
  const code = new URL(request.url).searchParams.get("code") || "";
  if (!/^[2-9a-zA-Z]{7}$/.test(code)) return page(404, "Link not found", "Check the link and try again.");
  try {
    await migrate();
    const sql = db();
    const [l] = await sql`
      select l.code, l.utm_source, l.utm_medium, c.name, c.destination, c.expires_at
      from campaign_links.links l join campaign_links.campaigns c on c.id = l.campaign_id
      where l.code = ${code}`;
    if (!l) return page(404, "Link not found", "Check the link and try again.");
    if (l.expires_at && new Date(l.expires_at) < new Date()) return page(410, "This link has expired", "Short links made on the free demo last 30 days.");
    const ua = request.headers.get("user-agent") || "";
    if (request.method !== "HEAD") {
      await sql`insert into campaign_links.clicks (code, device, bot) values (${code}, ${device(ua)}, ${isBot(ua)})`;
    }
    const campaign = campaignTag(l.name);
    return new Response(null, { status: 302, headers: { location: tagged(l.destination, { source: l.utm_source, medium: l.utm_medium, campaign }), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  } catch (e) {
    console.error(e);
    return page(503, "Try again in a moment", "The link service is busy.");
  }
}

export const HEAD = GET;
