# Campaign Links

Which channel brought your applicants? One short link per channel (WhatsApp, LinkedIn, posters, email and more), with click counts you can trust.

**Live demo: [campaign-links-theta.vercel.app/s/demo](https://campaign-links-theta.vercel.app/s/demo)** (open any link, reload the stats, see your visit; the demo started with sample clicks, marked as such)

## The problem it fixes

Every intake, a programme team argues about what worked: the WhatsApp blast, the LinkedIn post or the posters at the hub. One link per campaign cannot answer that. And most click counters inflate the answer: paste a link in a WhatsApp group and WhatsApp's servers fetch it to draw the preview. LinkedIn, Slack, X and Telegram do the same.

## What it does

- **A short link per channel**, `/c/<7 characters>`, with no look-alike characters (no 0/O or 1/l/I), so it reads off a poster.
- **UTM tags added on the way through** (`utm_source`, `utm_medium`, `utm_campaign`), so Google Analytics or a form tool sees the channel too. Tags already on your link win.
- **People and previews counted apart.** Link preview fetchers are logged as bots and shown as "previews left out", never as people.
- **Stats page**: people per channel, people per day for 14 days (Nairobi days), share on phones, the top channel. A QR code (SVG download) for any link, for posters and slides.
- **No sign-up.** Creating a campaign returns a private stats link (`/s/<slug>#key=...`). The key stays in the URL fragment and only its SHA-256 is stored.
- **Not a spam shortener.** Links made on the free demo expire after 30 days (`LINK_TTL_DAYS`), creation is rate limited per hashed IP, only `http(s)` destinations, and campaigns go after 90 days.

## Stack

- Static HTML, CSS and vanilla JS in `public/` (QR codes: vendored [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4, MIT)
- Vercel Functions (Web `Request`/`Response`) in `api/`
- [Neon](https://neon.tech) serverless Postgres over HTTP (`@neondatabase/serverless`, the only dependency)

The app creates its own tables on the first request (`lib/db.js`) in a `campaign_links` schema. `schema.sql` holds the same SQL for reading.

## Run your own

1. Fork, then import the repo on Vercel.
2. Add Neon from the Vercel Marketplace (Storage tab). It sets `DATABASE_URL`.
3. Deploy. Optional: set `LINK_TTL_DAYS` (default 30).

Locally: `npm install`, `vercel env pull`, `vercel dev`. Tests: `npm test`.

## Files

| Path | What |
|---|---|
| `lib/core.js` | Channels and UTM tags, link checks, bot and device detection, stats shaping |
| `lib/db.js` | Neon client, idempotent migration, Postgres rate limit |
| `api/campaigns.js` | Create a campaign, read its stats |
| `api/go.js` | The redirect: log the click, add UTM tags, send people on |
| `public/` | Home, stats page and the demo landing page |

MIT licence. Built by [Timothy Mwangi](https://timmwangi.com).
