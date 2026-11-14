---
name: research-gap-miner
description: Rigorous analysis of limitations recurring across papers. Finds recurring limitations, then tries to explain them away.
---

# Research Gap Miner Skill

Finds recurring limitations across papers, then tests them against counterevidence.

## Inputs

- Precise topic, task, or subfield
- Venue and year scope
- Written inclusion criteria
- Extracted evidence items (from review-intelligence)

## Outputs

- Candidate gaps with supporting/contradicting evidence
- Counts of independent works
- Separately rated strength and importance
- Or reasoned abstention

## Workflow

1. **Define scope in writing** - Include what is excluded
2. **Check coverage** - How many papers in scope, how many have readable reviews? Report numbers. If under ~50% have reviews, flag as weak
3. **Group evidence by underlying limitation** - Read quotes: shared vocabulary ≠ shared limitation, different vocabulary can hide one
4. **Count independent works** - Count different papers, not comments/reviewers. Count preprint + published version once. Note shared authors
5. **Search for counterevidence & later work**
   - `radar.py papers "limitation in other words" --since 2023`
   - `radar.py citing W123 --since 2022`
   - Report which sources answered. Failed search ≠ check
6. **Separate reviewer concern from scientific gap** - Using gap criteria
7. **Write each candidate** in standard format

## Gap Criteria

A reviewer concern becomes a scientific gap when:
- Supported by ≥3 independent papers
- Not explained by reviewing habits/norms
- Later work has not resolved it
- The limitation affects conclusions/methods/decisions

## Output Format

```json
{
  "gap": "specific description",
  "supporting_evidence": [
    {"paper": "title", "quote": "exact quote", "url": "review URL"}
  ],
  "contradicting_evidence": [
    {"paper": "title", "quote": "exact quote", "url": "paper URL"}
  ],
  "independent_papers": 5,
  "shared_authors": ["author1", "author2"],
  "strength": "strong/moderate/weak",
  "importance": "high/medium/low",
  "status": "confirmed/hypothesis/abstained",
  "notes": "reason for status"
}
```

## What Not To Do

- Rank by number of comments
- Treat reviewer consensus as scientific consensus
- Say limitation persists without checking later work
- Hide contradicting papers
- Produce single gap score
- Present gap as established when evidence only supports hypothesis

## Failure & Abstention

Abstain with reasons when:
- Coverage too weak
- Evidence inconsistent
- Fewer than 3 independent works
- Concern looks like reviewing norm

"No solid gap here" is a useful result.