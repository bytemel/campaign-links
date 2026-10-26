// Pure rules: channels, destination checks, UTM tagging, bot and device detection, stats shaping.
import { randomBytes } from "node:crypto";

// The channels a Kenyan programme team actually posts in, with the UTM tags analytics tools expect.
export const CHANNELS = {
  whatsapp: { label: "WhatsApp", source: "whatsapp", medium: "social" },
  linkedin: { label: "LinkedIn", source: "linkedin", medium: "social" },
  x: { label: "X", source: "x", medium: "social" },
  instagram: { label: "Instagram", source: "instagram", medium: "social" },
  facebook: { label: "Facebook", source: "facebook", medium: "social" },
  tiktok: { label: "TikTok", source: "tiktok", medium: "social" },
  email: { label: "Email", source: "newsletter", medium: "email" },
  sms: { label: "SMS", source: "sms", medium: "sms" },
  poster: { label: "Poster QR", source: "poster", medium: "qr" },
  partner: { label: "Partner shares", source: "partner", medium: "referral" },
};

export class InputError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

export const newSlug = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();
export const newKey = () => randomBytes(24).toString("base64url");
// 7 characters from a 54-letter alphabet without look-alikes (0/O, 1/l/I): easy to read off a poster.
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export function newCode() {
  const bytes = randomBytes(7);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function campaignInput(body, ownHost = "") {
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new InputError("Name the campaign.");
  if (name.length > 80) throw new InputError("Keep the name under 80 characters.");
  let url;
  try { url = new URL(String(body.destination ?? "").trim()); } catch { throw new InputError("Paste the full link people should land on, starting with https://"); }
  if (!/^https?:$/.test(url.protocol)) throw new InputError("The link must start with https:// or http://");
  if (url.username || url.password) throw new InputError("Links with a username or password are not allowed.");
  if (ownHost && url.host === ownHost) throw new InputError("Point the campaign at your own page, not at another short link.");
  if (url.href.length > 600) throw new InputError("That link is too long.");
  const channels = [...new Set((Array.isArray(body.channels) ? body.channels : []).map(String))].filter((c) => Object.hasOwn(CHANNELS, c));
  if (!channels.length) throw new InputError("Pick at least one channel.");
  return { name, destination: url.href, channels };
}

// utm_campaign comes from the campaign name: "Cohort 5 applications" becomes cohort-5-applications.
export const campaignTag = (name) => String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "campaign";

// Adds utm_source, utm_medium and utm_campaign, keeping any query the destination already has.
// Tags already on the destination win: the owner put them there on purpose.
export function tagged(destination, { source, medium, campaign }) {
  const url = new URL(destination);
  const set = (k, v) => { if (!url.searchParams.has(k)) url.searchParams.set(k, v); };
  set("utm_source", source);
  set("utm_medium", medium);
  set("utm_campaign", campaign);
  return url.href;
}

// Link previews are the classic way click counts lie: paste a link in a WhatsApp group and
// WhatsApp's servers fetch it once per preview. These are counted apart, never as people.
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegram|discord|slack|linkedin|twitter|skype|preview|embedly|quora link|pinterest|vkshare|bitly|curl|wget|python-requests|httpclient|go-http|okhttp|headless|lighthouse/i;
export const isBot = (ua) => !ua || BOT_RE.test(ua);

export function device(ua = "") {
  if (/ipad|tablet|kindle|silk/i.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod|opera mini|kaios/i.test(ua)) return "phone";
  return "computer";
}

// Shapes raw rows into what the dashboard draws. Days are Nairobi calendar days.
export function stats(links, rows, { days = 14, now = new Date() } = {}) {
  const dayOf = (d) => new Date(new Date(d).getTime() + 3 * 3600e3).toISOString().slice(0, 10);
  const today = dayOf(now);
  const span = [];
  for (let i = days - 1; i >= 0; i--) span.push(dayOf(new Date(now.getTime() - i * 86400e3)));
  const byChannel = links.map((l) => ({ code: l.code, channel: l.channel, label: CHANNELS[l.channel]?.label || l.channel, people: 0, previews: 0, seeded: 0, series: span.map(() => 0) }));
  const index = new Map(byChannel.map((c) => [c.code, c]));
  const devices = { phone: 0, tablet: 0, computer: 0 };
  for (const r of rows) {
    const c = index.get(r.code);
    if (!c) continue;
    const n = Number(r.n);
    if (r.bot) { c.previews += n; continue; }
    c.people += n;
    if (r.seeded) c.seeded += n;
    devices[r.device] = (devices[r.device] || 0) + n;
    const i = span.indexOf(r.day);
    if (i >= 0) c.series[i] += n;
  }
  byChannel.sort((a, b) => b.people - a.people || a.label.localeCompare(b.label));
  const people = byChannel.reduce((s, c) => s + c.people, 0);
  return { days: span, today, people, previews: byChannel.reduce((s, c) => s + c.previews, 0), seeded: byChannel.reduce((s, c) => s + c.seeded, 0), devices, channels: byChannel };
}
