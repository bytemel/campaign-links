import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignInput, campaignTag, tagged, isBot, device, stats, newCode, CHANNELS } from "../lib/core.js";

test("campaign input checks the link and the channels", () => {
  const c = campaignInput({ name: " Cohort 5  applications ", destination: "https://example.org/apply?ref=1", channels: ["whatsapp", "poster", "bogus", "whatsapp"] });
  assert.equal(c.name, "Cohort 5 applications");
  assert.deepEqual(c.channels, ["whatsapp", "poster"]);
  assert.equal(campaignTag(c.name), "cohort-5-applications");
  assert.throws(() => campaignInput({ name: "x", destination: "javascript:alert(1)", channels: ["x"] }), /https/);
  assert.throws(() => campaignInput({ name: "x", destination: "example.org", channels: ["x"] }), /full link/);
  assert.throws(() => campaignInput({ name: "x", destination: "https://a:b@example.org", channels: ["x"] }), /password/);
  assert.throws(() => campaignInput({ name: "x", destination: "https://short.example/c/abc", channels: ["x"] }, "short.example"), /another short link/);
  assert.throws(() => campaignInput({ name: "x", destination: "https://example.org", channels: [] }), /channel/);
});

test("UTM tags are added without clobbering the owner's own", () => {
  const out = new URL(tagged("https://example.org/apply?ref=1&utm_source=mine#form", { source: "whatsapp", medium: "social", campaign: "c5" }));
  assert.equal(out.searchParams.get("ref"), "1");
  assert.equal(out.searchParams.get("utm_source"), "mine");
  assert.equal(out.searchParams.get("utm_medium"), "social");
  assert.equal(out.searchParams.get("utm_campaign"), "c5");
  assert.equal(out.hash, "#form");
});

test("link preview fetchers are bots, phones are people", () => {
  assert.equal(isBot("WhatsApp/2.23.20.0 A"), true);
  assert.equal(isBot("LinkedInBot/1.0 (compatible; Mozilla/5.0)"), true);
  assert.equal(isBot("facebookexternalhit/1.1"), true);
  assert.equal(isBot("Slackbot-LinkExpanding 1.0"), true);
  assert.equal(isBot(""), true);
  const phone = "Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";
  assert.equal(isBot(phone), false);
  assert.equal(device(phone), "phone");
  assert.equal(device("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "computer");
});

test("stats split people from previews and bucket by Nairobi day", () => {
  const links = [{ code: "aaa", channel: "whatsapp" }, { code: "bbb", channel: "poster" }];
  const now = new Date("2026-11-05T20:30:00Z"); // 23:30 in Nairobi, still 5 Nov
  const rows = [
    { code: "aaa", day: "2026-11-05", device: "phone", bot: false, seeded: false, n: 4 },
    { code: "aaa", day: "2026-11-05", device: "phone", bot: true, seeded: false, n: 9 },
    { code: "bbb", day: "2026-11-04", device: "phone", bot: false, seeded: true, n: 6 },
    { code: "bbb", day: "2026-10-01", device: "computer", bot: false, seeded: false, n: 1 },
  ];
  const s = stats(links, rows, { days: 7, now });
  assert.equal(s.today, "2026-11-05");
  assert.equal(s.people, 11);
  assert.equal(s.previews, 9);
  assert.equal(s.seeded, 6);
  assert.equal(s.channels[0].label, "Poster QR", "sorted by people");
  assert.deepEqual(s.channels[0].series, [0, 0, 0, 0, 0, 6, 0], "old click outside the window is counted in total only");
  assert.deepEqual(s.devices, { phone: 10, tablet: 0, computer: 1 });
});

test("codes avoid look-alike characters", () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), /^[2-9a-km-zA-HJ-NP-Z]{7}$/);
  assert.ok(Object.keys(CHANNELS).length >= 8);
});
