// AniList card: Luffy image on the left, 1 currently-watching + 1 recently-completed anime on the right.
// Vercel function: /card/<username> is rewritten to /api/card?user=<username>
// Optional files in the repo root: luffy.(png|jpg|jpeg|webp|gif) and luffy-font.(woff2|woff|ttf|otf)

const fs = require("fs");
const path = require("path");

// ---- Theme (change freely) ----
const THEME = {
  bg: "#1b1212",
  border: "#e0a526",
  title: "#ffd966",
  text: "#fff1d6",
  sub: "#e6b86a",
  bar: "#4a2a20",
  barFill: "#e5372c",
  watching: "Currently Watching",
  completed: "Recently Completed",
};

// ---- Character image (optional) ----
function loadImage() {
  for (const f of ["luffy.gif", "luffy.png", "luffy.jpg", "luffy.jpeg", "luffy.webp"]) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) {
      const ext = path.extname(f).slice(1).replace("jpg", "jpeg");
      return `data:image/${ext};base64,${fs.readFileSync(p).toString("base64")}`;
    }
  }
  return null;
}
const HERO = loadImage();

// ---- Custom font (optional) ----
function loadFont() {
  const fmts = { woff2: ["font/woff2", "woff2"], woff: ["font/woff", "woff"],
                 ttf: ["font/ttf", "truetype"], otf: ["font/otf", "opentype"] };
  for (const ext of Object.keys(fmts)) {
    const p = path.join(process.cwd(), `luffy-font.${ext}`);
    if (fs.existsSync(p)) {
      const [mime, fmt] = fmts[ext];
      return { fmt, uri: `data:${mime};base64,${fs.readFileSync(p).toString("base64")}` };
    }
  }
  return null;
}
const FONT = loadFont();
const FAM = FONT ? "'CardFont', Georgia, serif" : "Georgia, serif";

const QUERY = `
query ($name: String) {
  watching: Page(perPage: 1) {
    mediaList(userName: $name, type: ANIME, status: CURRENT, sort: UPDATED_TIME_DESC) {
      progress
      media { title { romaji english } episodes coverImage { large medium }
        nextAiringEpisode { episode timeUntilAiring } }
    }
  }
  done: Page(perPage: 1) {
    mediaList(userName: $name, type: ANIME, status: COMPLETED, sort: FINISHED_ON_DESC) {
      score(format: POINT_10)
      completedAt { year month day }
      media { title { romaji english } episodes coverImage { large medium } }
    }
  }
}`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function wrap(s, max, lines) {
  const out = [];
  let cur = "";
  for (const w of s.split(/\s+/)) {
    const next = (cur + " " + w).trim();
    if (next.length <= max) cur = next;
    else { if (cur) out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  const kept = out.slice(0, lines).map((l) => (l.length > max ? l.slice(0, max - 1) + "…" : l));
  if (out.length > lines) kept[lines - 1] = kept[lines - 1].replace(/…$/, "").slice(0, max - 1) + "…";
  return kept;
}

async function fetchData(name) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { name } }),
  });
  const { data, errors } = await res.json();
  if (errors) throw new Error(errors[0].message);
  return { watching: data.watching.mediaList[0], done: data.done.mediaList[0] };
}

// SVGs used as <img> can't load external images, so embed covers as base64.
async function toDataUri(url) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:${r.headers.get("content-type")};base64,${buf.toString("base64")}`;
}

const eta = (sec) => {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h`;
};

async function renderCard(name) {
  const { watching, done } = await fetchData(name);

  const W = 640, H = 360;                 // 16:9
  const leftW = HERO ? 280 : 0;
  const listX = leftW + 16;
  const tx = listX + 84;                  // text column (right of the cover)
  const textW = W - 16 - tx;

  // One section = heading + big cover + title (2 lines max) + details
  async function section(headY, label, e, emptyText, detail) {
    const head = `<text x="${listX}" y="${headY}" class="h">${label}</text>`;
    if (!e) return head + `<text x="${listX}" y="${headY + 34}" class="s">${emptyText}</text>`;
    const m = e.media;
    const img = await toDataUri(m.coverImage.large || m.coverImage.medium);
    const top = headY + 12;
    const lines = wrap(m.title.english || m.title.romaji, 26, 2);
    const titleSvg = lines
      .map((l, i) => `<text x="${tx}" y="${top + 18 + i * 18}" class="t">${esc(l)}</text>`)
      .join("");
    const nextY = top + 18 + lines.length * 18 + 8;
    return `${head}
    <clipPath id="c${headY}"><rect x="${listX}" y="${top}" width="72" height="102" rx="6"/></clipPath>
    <image href="${img}" x="${listX}" y="${top}" width="72" height="102" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${headY})"/>
    ${titleSvg}${detail(nextY, e)}`;
  }

  const watchingSvg = await section(34, THEME.watching, watching, "Nothing on your Watching list", (y, e) => {
    const m = e.media;
    const total = m.episodes;
    const pct = total ? Math.min(e.progress / total, 1) : 0.3;
    const next = m.nextAiringEpisode
      ? `ep ${m.nextAiringEpisode.episode} in ${eta(m.nextAiringEpisode.timeUntilAiring)}` : "";
    return `
    <text x="${tx}" y="${y}" class="s">EP ${e.progress}${total ? " / " + total : ""}</text>
    <rect x="${tx}" y="${y + 8}" width="${textW}" height="4" rx="2" fill="${THEME.bar}"/>
    <rect x="${tx}" y="${y + 8}" width="${textW * pct}" height="4" rx="2" fill="${THEME.barFill}"/>
    <text x="${tx}" y="${y + 30}" class="s">${esc(next)}</text>`;
  });

  const doneSvg = await section(212, THEME.completed, done, "Nothing completed yet", (y, e) => {
    const c = e.completedAt || {};
    const date = c.month && c.year ? `${MONTHS[c.month - 1]}${c.day ? " " + c.day : ""}, ${c.year}` : "";
    return `
    <text x="${tx}" y="${y}" class="s">Completed${date ? " · " + date : ""}</text>
    ${e.score ? `<text x="${tx}" y="${y + 22}" class="s">★ ${e.score}/10</text>` : ""}`;
  });

  const hero = HERO
    ? `<clipPath id="hero"><rect x="12" y="12" width="${leftW - 12}" height="${H - 24}" rx="10"/></clipPath>
       <image href="${HERO}" x="12" y="12" width="${leftW - 12}" height="${H - 24}"
         preserveAspectRatio="xMidYMid slice" clip-path="url(#hero)"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    ${FONT ? `@font-face { font-family: 'CardFont'; src: url(${FONT.uri}) format('${FONT.fmt}'); }` : ""}
    .t { font: ${FONT ? "400" : "700"} 14px ${FAM}; fill: ${THEME.text} }
    .s { font: 12px ${FONT ? FAM : "sans-serif"}; fill: ${THEME.sub} }
    .h { font: ${FONT ? "400 18px" : "italic 700 16px"} ${FAM}; fill: ${THEME.title} }
  </style>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${THEME.bg}" stroke="${THEME.border}" stroke-width="2"/>
  ${hero}
  ${watchingSvg}
  <line x1="${listX}" y1="190" x2="${W - 16}" y2="190" stroke="${THEME.bar}" stroke-width="1"/>
  ${doneSvg}
</svg>`;
}

module.exports = async (req, res) => {
  const name = String(req.query.user || "").match(/^[\w-]+$/)?.[0];
  if (!name) return res.status(400).send("Use /card/<username>");
  try {
    const svg = await renderCard(name);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(svg);
  } catch (err) {
    res.status(500).send(String(err.message));
  }
};
