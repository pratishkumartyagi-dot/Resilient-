---
name: problem-statement-finder
description: Turns a research topic into solid problem statements by mining real peer reviews of accepted and rejected papers, what authors admit they could not do, and later literature.
---

# Problem Statement Finder Skill

This skill implements the complete ResearchRadar problem-statement-finder workflow. It transforms a research topic into 1-3 evidence-backed problem statements.

## Usage

Call this skill when a user provides a research topic and wants problem statements, research gaps, open problems, thesis/dissertation topics, or paper ideas.

## Workflow

1. **Gather** - Find papers on arXiv and OpenAlex using 3-5 wordings of 2-4 words each, then extract limitations from the 5-10 closest papers
2. **Read Reviews** - Collect real peer reviews from NeurIPS (2013-2020), eLife, and SNOR dataset (ICLR 2017, 2019-2025; NeurIPS 2021-2024)
3. **Extract** - Pull specific criticisms with exact quotes from reviews, separating criticism from questions, preferences, and praise
4. **Mine** - Apply six lenses to find candidate gaps (counting different papers, not comments)
5. **Kill** - Try to prove each candidate is already solved or not worth solving
6. **Craft** - Write survivors in the standard format with evidence, research question, first experiment, kill criteria, and confidence rating

## Implementation

The skill uses the `radar.py` script from ResearchRadar which provides:
- Paper search via arXiv and OpenAlex
- Review collection from NeurIPS, eLife, and SNOR
- Limitation extraction from papers
- Citation tracking via OpenAlex
- Quote verification

## Integration Points

- Step 1 (Search): Enhanced paper discovery with review-aware search
- Step 3 (Synthesis): Review intelligence integration
- Step 5 (Themes): Research gap mining from reviews
- Step 6 (Research Questions): Research idea lab for question formulation
- Step 7 (Titles): Novelty auditing of proposed directions

## API Routes

- `/api/researchradar/papers` - Search papers
- `/api/researchradar/reviews` - Fetch reviews
- `/api/researchradar/limits` - Extract limitations
- `/api/researchradar/citing` - Find citing papers
- `/api/researchradar/verify` - Verify quotes
- `/api/researchradar/check` - Check source status
- `/api/researchradar/iclr-build` - Build ICLR index
- `/api/researchradar/iclr` - Query ICLR reviews