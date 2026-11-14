---
name: novelty-auditor
description: Checks whether an idea is novel by searching for prior work, comparing closest papers in detail, treating missing search results as no evidence.
---

# Novelty Auditor Skill

Finds the paper that kills the idea. If you fail, report what you tried, not that the idea is new.

## Inputs

- Written proposal or idea

## Outputs

- Audit with closest-work comparisons
- Verdict
- Recommendation
- Search coverage
- Unresolved uncertainties

## Verdicts

| Verdict | Requirements |
|---------|--------------|
| `already_explored` | Named paper solves same problem under equivalent assumptions |
| `partially_explored` | Close work exists; difference is minor variation |
| `potentially_underexplored` | Meaningful whitespace; difference matters scientifically |
| `insufficient_evidence` | Sources failed, coverage thin, or cannot tell |

## Workflow

1. **Rewrite contribution** as atomic, searchable claims (problem, mechanism, assumptions, claimed result)
2. **Plan queries** using search playbook:
   - Synonyms
   - Mechanism-level descriptions
   - Task variants
   - Adjacent fields
   - Foundational/older work
   - Queries designed to disprove the claim
3. **Run queries** with `radar.py`, keep to 2-4 words, save results
4. **Keep search log** - Each query, kind, date, which sources answered. Failed/rate-limited = NOT searched
5. **Pick closest works** - Not merely related ones
6. **Compare on 9 dimensions**:
   - Problem framing
   - Mechanism/approach
   - Assumptions
   - Dataset/domain
   - Evaluation
   - Results
   - Scope/limitations
   - Follow-up work
   - Reproducibility
7. **Classify** each as direct/partial/adjacent precedent or counterexample
8. **State what's genuinely different** - If minor variation, say so plainly
9. **Reach verdict & recommendation** following rules

## Search Playbook

```bash
# Core problem
radar.py papers "problem term" --since 2022

# Mechanism
radar.py papers "mechanism term" --since 2022

# Adjacent fields
radar.py papers "adjacent field term" --since 2022

# Later work citing key paper
radar.py citing W123 --since 2022

# Older foundational work
radar.py papers "foundational term" --since 2015
```

## Comparison Dimensions

| Dimension | What to Compare |
|-----------|-----------------|
| Problem | Is it the same question? |
| Mechanism | Same approach/algorithm? |
| Assumptions | Same constraints/conditions? |
| Dataset | Same or equivalent data? |
| Evaluation | Same metrics/benchmarks? |
| Results | Same conclusions? |
| Scope | Same breadth/narrowness? |
| Follow-up | Has it been extended? |
| Reproducibility | Code/data available? |

## Rules

- Try to DISPROVE novelty, don't advocate for the idea
- Absence of search results ≠ evidence of novelty
- Never claim exhaustive search unless exhaustive in defined corpus
- Say "I did not find it", never "it does not exist"
- No numeric novelty score
- If close work solves same problem under equivalent assumptions → say so directly

## Output Format

```json
{
  "proposal": "summary of idea",
  "search_log": [
    {"query": "...", "kind": "core/adjacent/disprove/older", "date": "...", "sources": ["arxiv", "openalex"], "status": "ok/failed/rate_limited"}
  ],
  "closest_works": [
    {
      "paper": "title",
      "year": 2024,
      "venue": "...",
      "url": "...",
      "classification": "direct/partial/adjacent/counterexample",
      "comparison": {
        "problem": "...",
        "mechanism": "...",
        "assumptions": "...",
        "dataset": "...",
        "evaluation": "...",
        "results": "...",
        "scope": "...",
        "followup": "...",
        "reproducibility": "..."
      },
      "difference": "one checkable sentence",
      "difference_matters": "yes/no with reason"
    }
  ],
  "verdict": "already_explored/partially_explored/potentially_underexplored/insufficient_evidence",
  "recommendation": "proceed/narrow/abandon/investigate_further",
  "coverage": "which sources answered, which failed",
  "uncertainties": ["list of unresolved items"]
}
```