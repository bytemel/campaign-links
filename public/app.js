// Campaign Links front end. Home (/) and stats (/s/slug#key=...).
import qrcode from "./vendor/qrcode.mjs";

const $ = (id) => document.getElementById(id);
const path = location.pathname.split("/").filter(Boolean);
const slug = path[0] === "s" ? (path[1] || "").toLowerCase() : "";
const key = new URLSearchParams(location.hash.slice(1)).get("key") || "";
// Same ids as lib/core.js CHANNELS; the server checks them again.
const CHANNELS = [["whatsapp", "WhatsApp"], ["linkedin", "LinkedIn"], ["x", "X"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["email", "Email"], ["sms", "SMS"], ["poster", "Poster QR"], ["partner", "Partner shares"]];
const DEFAULT_ON = new Set(["whatsapp", "linkedin", "instagram", "email", "poster"]);
const SVG = "http://www.w3.org/2000/svg";
const nf = new Intl.NumberFormat("en-KE");

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter((k) => k != null && k !== false));
  return node;
}
function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
function status(message, kind = "") {
  $("status").hidden = !message;
  $("status").textContent = message || "";
  $("status").className = `notice ${kind}`;
}
async function api(url, { method = "GET", body } = {}) {
  const headers = { "content-type": "application/json" };
  if (key) headers["x-manage-key"] = key;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({ ok: false, message: "The server did not answer properly." }));
  if (!res.ok || data.ok === false) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const out = svg("svg", { viewBox: `-4 -4 ${n + 8} ${n + 8}`, role: "img", "aria-label": `QR code for ${text}`, "shape-rendering": "crispEdges", xmlns: SVG });
  out.append(svg("rect", { x: -4, y: -4, width: n + 8, height: n + 8, fill: "#fff" }), svg("path", { d, fill: "#000" }));
  return out;
}

function showQr(link, label) {
  const code = qrSvg(link);
  $("qr").replaceChildren(code);
  $("qr-h").textContent = `QR code: ${label}`;
  $("qr-link").textContent = link;
  $("qr-download").href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(code)], { type: "image/svg+xml" }));
  $("qr-download").download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr.svg`;
  $("qr-dialog").showModal();
}

function drawDays(s) {
  const totals = s.days.map((_, i) => s.channels.reduce((sum, c) => sum + c.series[i], 0));
  const max = Math.max(1, ...totals);
  const W = 560, H = 180, top = 10, bottom = 24, gap = 4;
  const colW = (W - gap * (totals.length - 1)) / totals.length;
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `People per day: ${totals.map((t, i) => `${s.days[i]} ${t}`).join(", ")}` });
  chart.append(svg("line", { class: "axis", x1: 0, x2: W, y1: H - bottom + 0.5, y2: H - bottom + 0.5 }));
  const tip = el("div", { className: "tip", hidden: true });
  const fmt = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: "UTC" });
  totals.forEach((t, i) => {
    const x = i * (colW + gap);
    const h = t ? Math.max(3, ((H - top - bottom) * t) / max) : 0;
    const label = `${fmt.format(new Date(`${s.days[i]}T00:00:00Z`))}: ${t} ${t === 1 ? "person" : "people"}`;
    const hit = svg("rect", { class: "col-hit", x, y: top, width: colW, height: H - top - bottom, tabindex: 0, "aria-label": label });
    const col = svg("path", { class: "col", d: h ? `M${x} ${H - bottom}V${H - bottom - h + 4}q0 -4 4 -4h${colW - 8}q4 0 4 4V${H - bottom}z` : "" });
    const show = () => {
      tip.hidden = false;
      tip.textContent = label;
      const box = chart.getBoundingClientRect();
      tip.style.left = `${((x + colW / 2) / W) * box.width}px`;
      tip.style.top = `${((H - bottom - h) / H) * box.height}px`;
    };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("focus", show);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; });
    hit.addEventListener("blur", () => { tip.hidden = true; });
    chart.append(hit, col);
    if (i === 0 || i === totals.length - 1 || i === Math.floor(totals.length / 2)) {
      const tx = svg("text", { x: x + colW / 2, y: H - 6, "text-anchor": "middle" });
      tx.textContent = fmt.format(new Date(`${s.days[i]}T00:00:00Z`));
      chart.append(tx);
    }
  });
  const peak = totals.indexOf(Math.max(...totals));
  $("days").replaceChildren(chart, tip);
  $("days-hint").textContent = totals[peak] ? `Busiest day: ${fmt.format(new Date(`${s.days[peak]}T00:00:00Z`))} with ${totals[peak]}. Hover or tab through the columns for each day.` : "No clicks in the last 14 days yet.";
}

function render(data) {
  const s = data.stats;
  $("title").textContent = data.campaign.name;
  document.title = `${data.campaign.name} | Campaign Links`;
  $("lead").textContent = data.campaign.demo ? "The demo campaign. Click any link below, then reload: your visit shows up." : "Your campaign. Share each link only in its own channel so the counts mean something.";
  $("t-people").textContent = nf.format(s.people);
  $("t-people-sub").textContent = s.seeded ? `${nf.format(s.seeded)} are sample clicks from setup` : "clicked a link";
  const top = s.channels[0];
  $("t-top").textContent = top && top.people ? top.label : "None yet";
  $("t-top-sub").textContent = top && top.people && s.people ? `${Math.round((top.people / s.people) * 100)}% of people` : "";
  $("t-phone").textContent = s.people ? `${Math.round(((s.devices.phone || 0) / s.people) * 100)}%` : "0%";
  $("t-previews").textContent = nf.format(s.previews);

  const max = Math.max(1, ...s.channels.map((c) => c.people));
  $("bars").replaceChildren(...s.channels.map((c) => el("li", { className: "bar-row" },
    el("span", { className: "bar-label", textContent: c.label }),
    el("span", { className: "bar-track", role: "img", ariaLabel: `${c.label}: ${c.people} people` }, (() => { const f = el("span", { className: "bar-fill" }); f.style.width = `${(c.people / max) * 100}%`; f.style.display = "block"; return f; })()),
    el("span", { className: "bar-num", textContent: nf.format(c.people) }),
    c.previews ? el("span", { className: "bar-sub", textContent: `plus ${c.previews} link previews, not counted` }) : null)));
  drawDays(s);

  const linkFor = (code) => `${location.origin}/c/${code}`;
  $("link-rows").replaceChildren(...data.links.map((l) => {
    const url = linkFor(l.code);
    return el("tr", {},
      el("td", {}, el("strong", { textContent: l.label })),
      el("td", { className: "code" }, el("a", { href: url, target: "_blank", rel: "noopener", textContent: url.replace(/^https?:\/\//, "") })),
      el("td", {}, el("div", { className: "actions" },
        el("button", { className: "btn", type: "button", textContent: "Copy", onclick: async (e) => { try { await navigator.clipboard.writeText(url); e.target.textContent = "Copied"; setTimeout(() => { e.target.textContent = "Copy"; }, 1500); } catch { showQr(url, l.label); } } }),
        el("button", { className: "btn", type: "button", textContent: "QR", onclick: () => showQr(url, l.label) }))));
  }));
  $("dest").textContent = data.campaign.destination;
  $("expires").textContent = data.campaign.expiresAt ? `Links work until ${new Date(data.campaign.expiresAt).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}` : "";
  if (!data.campaign.demo) {
    $("private-card").hidden = false;
    $("stats-link").value = location.href;
  }
}

async function load() {
  try {
    render(await api(`/api/campaigns?slug=${encodeURIComponent(slug)}`));
  } catch (e) {
    status(e.message, "notice-alert");
  }
}

$("qr-close").addEventListener("click", () => $("qr-dialog").close());
document.addEventListener("click", async (e) => {
  const id = e.target.dataset?.copy;
  if (!id) return;
  $(id).select();
  try { await navigator.clipboard.writeText($(id).value); e.target.textContent = "Copied"; } catch { document.execCommand("copy"); }
  setTimeout(() => { e.target.textContent = "Copy"; }, 1500);
});

if (slug) {
  $("stats").hidden = false;
  load();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
} else {
  $("home").hidden = false;
  $("channel-boxes").replaceChildren(...CHANNELS.map(([id, label]) => el("label", { className: "check" },
    el("input", { type: "checkbox", name: "channels", value: id, checked: DEFAULT_ON.has(id) }), label)));
  $("create").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      const data = await api("/api/campaigns", { method: "POST", body: { name: form.get("name"), destination: form.get("destination"), channels: form.getAll("channels") } });
      location.assign(`/s/${data.slug}#key=${data.key}`);
    } catch (err) {
      status(err.message, "notice-alert");
    }
  });
}
