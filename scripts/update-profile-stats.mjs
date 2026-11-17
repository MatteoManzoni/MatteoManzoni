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
    ['PRs merged', stats.counts.merged, 'bd93f9'],
    [`Merged in ${stats.year}`, stats.counts.mergedYear, '50fa7b'],
    ['Merged last 30 days', stats.counts.mergedRecent, '8be9fd'],
    ['PRs reviewed', stats.counts.reviewed, 'ffb86c'],
  ];
}

const number = value => value.toLocaleString('en-US');

export function renderBadges(stats) {
  const badges = metrics(stats).map(([label, count, color]) =>
    `![${label}: ${number(count)}](https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(number(count))}-${color}?style=flat-square&labelColor=282a36)`);
  return `${startMarker}
<!-- Updated ${stats.updated} UTC -->
${badges.join('\n')}
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
  const updatedReadme = readme.slice(0, readme.indexOf(startMarker)) + renderBadges(stats) +
    readme.slice(readme.indexOf(endMarker) + endMarker.length);
  await mkdir(resolve(root, 'assets'), { recursive: true });
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
