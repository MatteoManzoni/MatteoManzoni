#!/usr/bin/env node
// Cache public card images so a provider outage does not break the profile.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = 'username=MatteoManzoni&theme=dracula&disable_animations=true';
const cards = [
  {
    path: 'assets/github-stats.svg',
    sources: [
      `https://github-stats-extended.vercel.app/api?${options}&show_icons=true&hide=prs`,
      `https://github-readme-stats.vercel.app/api?${options}&show_icons=true&hide=prs`,
    ],
  },
  {
    path: 'assets/top-languages.svg',
    sources: [
      `https://github-stats-extended.vercel.app/api/top-langs/?${options}&hide=html,less,css,c&langs_count=10&layout=compact`,
      `https://github-readme-stats.vercel.app/api/top-langs/?${options}&hide=html,less,css,c&langs_count=10&layout=compact`,
    ],
  },
  {
    path: 'assets/trophies.svg',
    sources: [
      `https://trophy.ryglcloud.net/?${options}&column=6&margin-w=8&margin-h=8`,
      `https://github-profile-trophy.vercel.app/?${options}&column=6&margin-w=8&margin-h=8`,
    ],
  },
];

export function freezeAnimations(svg) {
  const ringOffset = svg.match(/@keyframes rankAnimation[\s\S]*?to\s*{\s*stroke-dashoffset:\s*([\d.]+)/)?.[1];
  return svg.replace('</style>', `
    * { animation: none !important; }
    .stagger { opacity: 1 !important; }
    .rank-text { transform: translate(-5px, 5px) scale(1); }
    ${ringOffset ? `.rank-circle { stroke-dashoffset: ${ringOffset}; }` : ''}
  </style>`).replace(/[ \t]+$/gm, '').trim() + '\n';
}

async function main() {
  await mkdir(resolve(root, 'assets'), { recursive: true });
  const results = await Promise.allSettled(cards.map(async card => {
    for (const url of card.sources) {
      try {
        // No credentials are sent to card providers.
        const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
        if (!response.ok) continue;
        const svg = await response.text();
        if (!/<svg\b/.test(svg) || !svg.includes('</svg>') ||
            /Something went wrong|Error fetching resource|<script\b|<foreignObject\b/i.test(svg)) continue;
        await writeFile(resolve(root, card.path), freezeAnimations(svg));
        console.log(`Updated ${card.path}.`);
        return;
      } catch {
        // Try the next provider; retain the previous image if all are unavailable.
      }
    }
    await access(resolve(root, card.path));
    console.warn(`Card providers unavailable; keeping the existing ${card.path}.`);
  }));
  if (results.some(result => result.status === 'rejected')) {
    console.error('Could not generate all profile cards and no previous image is available.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Profile card refresh failed.');
    process.exitCode = 1;
  });
}
