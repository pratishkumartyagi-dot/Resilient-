---
name: openreview-miner
description: Collects, counts, and inventories papers and peer reviews from venues such as ICLR or NeurIPS. Reports precisely what is and is not accessible.
---

# OpenReview Miner Skill

Collects papers and reviews from open sources that need no account.

## Sources

| Source | Outcomes | Coverage | Method |
|--------|----------|----------|--------|
| NeurIPS Proceedings | Accepted only | 2013-2020 | HTML scraping of review pages |
| SNOR Dataset (Zenodo) | Accepted AND rejected | ICLR 2017, 2019-2025; NeurIPS 2021-2024 | SQLite index (2.2 GB download) |
| eLife | Published only | Older papers, life sciences | API with decision letters |

## Usage

Call when user asks to collect/count/inventory papers and reviews from a venue, or asks how complete a review corpus is.

## API Routes

- `GET /api/researchradar/openreview/sources` - List available sources
- `POST /api/researchradar/openreview/neurips` - Fetch NeurIPS reviews
- `POST /api/researchradar/openreview/elife` - Fetch eLife reviews
- `POST /api/researchradar/openreview/iclr` - Fetch ICLR reviews (requires index)
- `POST /api/researchradar/openreview/iclr-build` - Build ICLR index

## Workflow

1. Check what responds now: `radar.py check`
2. For OpenReview venue details, read public venue data
3. Choose a route using access states
4. Stay bounded - fetch small sample first, get approval before large collections
5. Save results to file and report using summary format

## Output Format

```json
{
  "source": "NeurIPS proceedings",
  "note": "Accepted papers only...",
  "queries": ["graph neural", "gnn"],
  "count": 12,
  "matched_without_reviews": 3,
  "papers": [...]
}
```

## Access States

- **Open**: No account needed (NeurIPS 2013-2020, eLife, SNOR dataset)
- **User Token**: User's own OpenReview token (not yet verified to clear challenge)
- **User File**: File user obtained themselves
- **Blocked**: OpenReview live API (403 ChallengeRequiredError)

Never try to get around the 403 challenge. Report it and use open sources.