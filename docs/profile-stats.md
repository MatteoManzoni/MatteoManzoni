# Profile statistics

The profile shows the classic Dracula GitHub stats/rating, language, and trophy cards, followed by compact PR badges. Definitions and implementation details stay in this document.

The classic cards use public statistics. Their SVGs are downloaded into this repository from [GitHub Stats Extended](https://github.com/stats-organization/github-stats-extended) and a [documented GitHub Profile Trophy mirror](https://github.com/ryo-ma/github-profile-trophy#load-balancing-endpoints). The original providers are fallbacks. If both providers are unavailable, the previous image is retained. No credentials are sent to these services. The stats card hides its public-only PR row because the badges provide the combined PR totals.

The PR badges include public and accessible private work. The script requests only aggregate counts from GitHub GraphQL search: no pull request titles, repository names, or private links. Only the resulting badge labels and counts are sent to Shields.io.

## Refreshing

Run `node scripts/update-profile-stats.mjs` with Node.js 22 or newer and GitHub CLI authenticated as `MatteoManzoni`. Run `node scripts/update-profile-cards.mjs` to refresh the public card images. Alternatively, run **Refresh profile statistics** from the repository's Actions tab.

The workflow runs daily at 06:23 UTC. It reads PR statistics using `PROFILE_STATS_TOKEN` and publishes changes using the separate, repository-scoped `GITHUB_TOKEN`. It commits only the README badge block, three classic cards, and the aggregate JSON snapshot.

## Private repository access

Add an Actions repository secret named `PROFILE_STATS_TOKEN` for this repository. Use a dedicated credential for `MatteoManzoni` with read access to the pull requests to include, including the relevant private repositories. Do not paste the token into the README, source code, or chat.

Prefer a fine-grained token with **Pull requests: Read-only** for the necessary repositories. A fine-grained token is limited to one resource owner, so its private totals cover only that owner. Covering multiple owners requires an appropriately authorized credential; do not broaden access just for this profile. Organization approval or SSO authorization may also be required. See [GitHub's token documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

The automatic `GITHUB_TOKEN` cannot provide access to other private repositories. It is used only to publish the generated files here.

## Definitions and coverage

- **PRs merged:** PRs authored by `MatteoManzoni` and merged into their target branch.
- **Merged this year:** those PRs merged between January 1 and the refresh date, inclusive.
- **Merged in the last 30 days:** those PRs merged in the 30 UTC calendar dates ending on the refresh date.
- **PRs reviewed:** distinct PRs reviewed by `MatteoManzoni`, excluding self-authored PRs. Repeated reviews on one PR count once.
- **PRs opened:** all PRs authored by `MatteoManzoni`, in any state.
- **Open PRs:** authored PRs currently open, including drafts.

Counts cover only repositories visible to the credential at refresh time. They can change as GitHub's search index updates or access changes. The date remains visible so the snapshot's age is clear.

Missing private access, an unexpected credential identity, API errors, inconsistent counts, or decreasing lifetime totals stop the refresh before generated files are written. If repositories are intentionally removed from coverage or PRs are deleted, review the change before removing `assets/pr-stats.json` locally and generating a new baseline.

The initial snapshot was generated locally. At the owner's request, the existing GitHub CLI credential was then copied directly into the Actions secret to enable automatic refreshes, without printing it or saving it in a local file. This credential retains its existing permissions. It can be replaced with a dedicated read-only credential if one covers the required repositories.
