/* ═══════════════════════════════════════════════════════════════════════
   build-header.mjs — regenerates assets/header.svg from live GitHub data

   GitHub renders README images inside an <img>, which is a sandbox: no
   external fetches, no web fonts, no scripts. So the avatar is downloaded
   and inlined as a data URI, and every font is a generic family the
   viewer already has. Anything referenced by URL here would silently
   render as a blank box.

   Run: node scripts/build-header.mjs
   The daily workflow runs it and commits the result if it changed.
   ═══════════════════════════════════════════════════════════════════════ */
import { writeFile, mkdir } from 'node:fs/promises';

const USER = process.env.GH_USER || 'yugankfatehpuria4';
const TOKEN = process.env.GITHUB_TOKEN || '';

const W = 880;
const H = 250;

/* GitHub's own language colours, so the chips read as familiar */
const LANG_COLOR = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#663399',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Shell: '#89e051',
  Jupyter: '#DA5B0B'
};

const xml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'profile-header-builder',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    }
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

/* Bio arrives as a bullet list with newlines; flatten it to one line.
   The cap is a width budget, not a style choice: the stars column starts
   at x=762 and the bio starts at x=150, so anything past ~72 characters
   at 13.5px runs underneath the star count. */
function flattenBio(bio, max = 72) {
  const line = String(bio || '')
    .split('\n')
    .map((l) => l.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean)
    .join(' · ');
  return line.length > max ? line.slice(0, max - 1).trimEnd() + '…' : line;
}

/* Rough advance-width estimate — there is no text measurement available
   when the SVG is rendered as an image, so chip widths are computed here
   from character count rather than laid out by the renderer. */
const textWidth = (s, size) => s.length * size * 0.58;

function chip(label, x, y, color) {
  const padX = 11;
  const fs = 12;
  const w = textWidth(label, fs) + padX * 2 + 16;
  const h = 26;
  return {
    w,
    svg: `<g transform="translate(${x},${y})">
    <rect width="${w.toFixed(1)}" height="${h}" rx="13" fill="#161b22" stroke="#30363d"/>
    <circle cx="${padX + 4}" cy="${h / 2}" r="4.5" fill="${color}"/>
    <text x="${padX + 15}" y="${h / 2 + 4.2}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace"
      font-size="${fs}" fill="#c9d1d9">${xml(label)}</text>
  </g>`
  };
}

async function main() {
  const user = await gh(`/users/${USER}`);

  const repos = [];
  for (let page = 1; page <= 4; page++) {
    const batch = await gh(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const own = repos.filter((r) => !r.fork);

  const stars = own.reduce((n, r) => n + r.stargazers_count, 0);

  const langCount = {};
  own.forEach((r) => {
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  });
  const langs = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);

  /* avatar -> data URI, since an <img>-rendered SVG cannot fetch it */
  const avatarRes = await fetch(`${user.avatar_url}&s=200`.replace('?&', '?'));
  const avatarB64 = Buffer.from(await avatarRes.arrayBuffer()).toString('base64');

  /* chips flow left to right from the name column */
  let cx = 150;
  const chipSvgs = langs
    .map((l) => {
      const c = chip(l, cx, 176, LANG_COLOR[l] || '#8b949e');
      cx += c.w + 8;
      return c.svg;
    })
    .join('\n  ');

  const bio = flattenBio(user.bio);
  const starLabel = stars === 1 ? 'TOTAL STAR' : 'TOTAL STARS';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  role="img" aria-label="${xml(user.name || USER)} — GitHub profile card">
  <title>${xml(user.name || USER)} — ${own.length} repositories, ${stars} stars</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/>
      <stop offset="0.55" stop-color="#0f1620"/>
      <stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.1" r="0.85">
      <stop offset="0" stop-color="#3fb950" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#3fb950" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="avatarClip"><circle cx="78" cy="106" r="46"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" rx="16" fill="url(#glow)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="#21262d"/>

  <circle cx="78" cy="106" r="49" fill="none" stroke="#3fb950" stroke-opacity="0.55" stroke-width="2"/>
  <image x="32" y="60" width="92" height="92" clip-path="url(#avatarClip)"
    href="data:image/jpeg;base64,${avatarB64}"/>

  <text x="150" y="58" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="13"
    fill="#3fb950">@${xml(USER)}</text>

  <text x="150" y="103" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
    font-size="35" font-weight="700" fill="#e6edf3">${xml(user.name || USER)}</text>

  <text x="150" y="134" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
    font-size="13.5" fill="#8b949e">${xml(bio)}</text>

  ${chipSvgs}

  <g transform="translate(${W - 118},0)">
    <text x="46" y="96" text-anchor="middle"
      font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
      font-size="44" font-weight="700" fill="#e6edf3">${stars}</text>
    <text x="46" y="118" text-anchor="middle"
      font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="10"
      letter-spacing="1.6" fill="#6e7681">${starLabel}</text>
    <text x="46" y="150" text-anchor="middle"
      font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
      font-size="22" font-weight="700" fill="#e6edf3">${own.length}</text>
    <text x="46" y="170" text-anchor="middle"
      font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="10"
      letter-spacing="1.6" fill="#6e7681">REPOS</text>
  </g>

  <text x="150" y="222" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="10"
    fill="#484f58">Generated from the GitHub API and published from GitHub Actions</text>
</svg>
`;

  await mkdir(new URL('../assets/', import.meta.url), { recursive: true });
  await writeFile(new URL('../assets/header.svg', import.meta.url), svg);
  console.log(`header.svg written — ${own.length} repos, ${stars} stars, langs: ${langs.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
