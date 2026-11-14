---
name: review-intelligence
description: Analyses peer reviews, extracts criticisms/praise, links rebuttals to criticisms, reports what reviewers said.
---

# Review Intelligence Skill

Turns review text into checkable claims. If you cannot quote it, do not extract it.

## Taxonomy of Evidence Items

| Category | Description | Example |
|----------|-------------|---------|
| Criticism | Reviewer identifies a flaw/limitation | "The method fails to handle out-of-distribution samples" |
| Question | Reviewer asks for clarification | "How does this compare to baseline X?" |
| Requested Experiment | Reviewer asks for new experiment | "Please run experiment on dataset Y" |
| Observation | Neutral statement about paper | "The paper uses 5 random seeds" |
| Strength | Reviewer praises an aspect | "The theoretical analysis is thorough" |
| Speculation | Reviewer conjectures | "This might not scale to larger models" |

## Response Status

| Status | Meaning |
|--------|---------|
| addressed | Rebuttal provides evidence resolving the point |
| partially_addressed | Rebuttal makes progress but leaves gaps |
| unaddressed | Rebuttal does not mention the point |
| indeterminate | No rebuttal available, or ambiguous |

## Workflow

1. **Read source** - Save fetched reviews to file for quote verification
2. **Segment & extract** - Follow taxonomy, one claim per item
3. **Quote exactly** - Copy character-for-character, keep short
4. **Link rebuttals** - Many-to-many, response ≠ resolution
5. **Preserve disagreement** - Between reviewers or review/rebuttal
6. **Write items** - In extraction format
7. **Verify quotes** - `radar.py verify reviews.json "exact quote"`
8. **Report per paper** - Keep source quotes separate from interpretation

## Output Format

```json
{
  "paper": "title",
  "url": "review URL",
  "items": [
    {
      "quote": "exact quote from review",
      "category": "criticism",
      "claim": "analyst wording of the claim",
      "confidence": "high/medium/low",
      "response_status": "addressed/partially_addressed/unaddressed/indeterminate",
      "rebuttal_quote": "matching rebuttal text if any"
    }
  ]
}
```

## Rules

- Questions ≠ criticisms automatically
- Preferences ≠ scientific limitations
- Requested experiments ≠ proof of necessity
- Rebuttal claiming resolution ≠ proof without evidence
- Shared keywords may still be separate concerns