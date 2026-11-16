#!/usr/bin/env node
// Request counts only: no PR titles, repository names, or private URLs.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const username = 'MatteoManzoni';
const startMarker = '<!-- profile-stats:start -->';
const endMarker = '<!-- profile-stats:end -->';
const snapshotPath = resolve(root, 'assets/pr-stats.json');
const lifetimeKeys = ['merged', 'created', 'reviewed'];

export function buildQuery(now = new Date()) {
  const updated = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  const start = new Date(`${updated}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const windowStart = start.toISOString().slice(0, 10);
  const authored = `is:pr author:${username}`;
  const searches = {
    merged: `${authored} is:merged`,
    mergedYear: `${authored} is:merged merged:${year}-01-01..${updated}`,
    mergedRecent: `${authored} is:merged merged:${windowStart}..${updated}`,
    reviewed: `is:pr reviewed-by:${username} -author:${username}`,
    created: authored,
    open: `${authored} is:open`,
    privateMerged: `${authored} is:merged is:private`,
  };
  const fields = Object.entries(searches).map(([key, query]) =>
    `${key}: search(query: ${JSON.stringify(query)}, type: ISSUE, first: 1) { issueCount }`);
  return { query: `query { viewer { login } ${fields.join('\n')} }`, updated, year, windowStart };
}

export function validateResponse(response, period, previous) {
  const data = response.data;
  if (response.errors?.length || data?.viewer?.login?.toLowerCase() !== username.toLowerCase()) {
    throw new Error('GitHub did not return a complete response for the expected user.');
  }
  const counts = {};
  for (const key of [...lifetimeKeys, 'mergedYear', 'mergedRecent', 'open', 'privateMerged']) {
    const count = data[key]?.issueCount;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`GitHub returned an invalid ${key} count; preserving the previous snapshot.`);
    }
    counts[key] = count;
  }
  if (counts.privateMerged === 0) {
    throw new Error('No private merged PRs are visible. Check token access; preserving the previous snapshot.');
  }
  if (counts.merged > counts.created || counts.open > counts.created - counts.merged ||
      counts.mergedYear > counts.merged || counts.mergedRecent > counts.merged ||
      counts.privateMerged > counts.merged) {
    throw new Error('GitHub returned inconsistent counts; preserving the previous snapshot.');
  }
  if (previous && lifetimeKeys.some(key => counts[key] < previous.counts[key])) {
    throw new Error('Lifetime totals decreased. Check token coverage before replacing the previous snapshot.');
  }
  delete counts.privateMerged;
  return {
    username, updated: period.updated, year: period.year, windowStart: period.windowStart,
    scope: 'Public and accessible private repositories', counts,
  };
}

function metrics(stats) {
  return [
    ['PRs merged', 'All time', stats.counts.merged],
    [`Merged in ${stats.year}`, 'Year to date', stats.counts.mergedYear],
    ['Merged in the last 30 days', 'Including today · UTC', stats.counts.mergedRecent],
    ['PRs reviewed', 'Distinct PRs · excluding my own', stats.counts.reviewed],
    ['PRs opened', 'All time', stats.counts.created],
    ['Open PRs', 'Currently open', stats.counts.open],
  ];
}

const number = value => value.toLocaleString('en-US');

export function renderCard(stats, dark) {
  const colors = dark
    ? { bg: '#161b22', panel: '#1d2430', line: '#303b4b', text: '#f0f6fc', muted: '#abb8cb', accent: '#9e91ff' }
    : { bg: '#ffffff', panel: '#f6f8fc', line: '#d8e0ec', text: '#182339', muted: '#52627a', accent: '#6550d8' };
  const cells = metrics(stats).map(([label, detail, count], index) => {
    const x = 28 + (index % 2) * 344;
    const y = 106 + Math.floor(index / 2) * 110;
    return `<g transform="translate(${x},${y})">
      <rect width="320" height="96" rx="12" fill="${colors.panel}"/>
      <text x="18" y="24" font-size="16" fill="${colors.muted}">${label}</text>
      <text x="18" y="63" font-size="38" font-weight="700" fill="${index === 0 ? colors.accent : colors.text}">${number(count)}</text>
      <text x="18" y="83" font-size="12" fill="${colors.muted}">${detail}</text>
    </g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="470" viewBox="0 0 720 470" role="img" aria-labelledby="title desc">
  <title id="title">Matteo's pull request activity</title>
  <desc id="desc">${metrics(stats).map(([label, , count]) => `${label}: ${number(count)}`).join('. ')}. Updated ${stats.updated} UTC. Public and accessible private repositories.</desc>
  <rect x="0.5" y="0.5" width="719" height="469" rx="18" fill="${colors.bg}" stroke="${colors.line}"/>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
    <rect x="28" y="29" width="5" height="48" rx="2.5" fill="${colors.accent}"/>
    <text x="48" y="48" font-size="24" font-weight="700" fill="${colors.text}">Pull request activity</text>
    <text x="48" y="72" font-size="14" fill="${colors.muted}">Public + private contributions. Only aggregate counts.</text>
    ${cells}
    <text x="28" y="453" font-size="12" fill="${colors.muted}">Updated ${stats.updated} UTC · Merged PRs authored by @${username}</text>
  </g>
</svg>
`;
}

export function renderDetails(stats) {
  const rows = metrics(stats).map(([label, , count]) => `| ${label} | ${number(count)} |`).join('\n');
  return `${startMarker}
<details>
<summary>Counts, coverage, and definitions · updated ${stats.updated} UTC</summary>

| Metric | Count |
| :--- | ---: |
${rows}

These totals combine public repositories and private repositories accessible to the statistics credential at refresh time. Only aggregate counts are published.

Merged and opened PRs are authored by me. Reviewed PRs count distinct pull requests I reviewed, excluding my own; multiple reviews on the same PR count once. The 30-day window covers ${stats.windowStart} through ${stats.updated}, inclusive, using UTC dates.

Source: [GitHub pull request search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests). [How the refresh works](./docs/profile-stats.md).

</details>
${endMarker}`;
}

async function main() {
  const readmePath = resolve(root, 'README.md');
  const readme = await readFile(readmePath, 'utf8');
  if (readme.split(startMarker).length !== 2 || readme.split(endMarker).length !== 2 ||
      readme.indexOf(endMarker) < readme.indexOf(startMarker)) {
    throw new Error('README must contain exactly one ordered pair of profile statistics markers.');
  }
  let previous;
  try {
    previous = JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const period = buildQuery();
  const output = execFileSync('gh', ['api', 'graphql', '--input', '-'], {
    input: JSON.stringify({ query: period.query }), encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000,
  });
  const stats = validateResponse(JSON.parse(output), period, previous);
  const updatedReadme = readme.slice(0, readme.indexOf(startMarker)) + renderDetails(stats) +
    readme.slice(readme.indexOf(endMarker) + endMarker.length);
  await mkdir(resolve(root, 'assets'), { recursive: true });
  await writeFile(resolve(root, 'assets/pr-stats-dark.svg'), renderCard(stats, true));
  await writeFile(resolve(root, 'assets/pr-stats-light.svg'), renderCard(stats, false));
  await writeFile(snapshotPath, `${JSON.stringify(stats, null, 2)}\n`);
  await writeFile(readmePath, updatedReadme);
  console.log(`Updated aggregate profile statistics for ${stats.updated}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Profile statistics refresh failed. Check token identity, private access, API availability, and lifetime count coverage.');
    process.exitCode = 1;
  });
}
