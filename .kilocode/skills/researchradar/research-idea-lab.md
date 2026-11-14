---
name: research-idea-lab
description: Turns a research gap/problem into a research question, hypotheses, experiment plan, and falsification criteria.
---

# Research Idea Lab Skill

Develops a clear, testable research idea from a gap. Prefers one clear question an experiment could prove wrong.

## Inputs

- Candidate gap or problem statement
- Constraints on data, compute, time

## Outputs

- Written research programme with experiment plan and falsification criteria
- Novelty stays provisional (hand off to novelty-auditor)

## Workflow

1. **Check rejected ideas** - Don't re-propose without saying why it deserves another look
2. **State problem & why it matters** - Cite evidence
3. **Formulate ONE precise research question** - If two, you have two ideas
4. **Define competing hypotheses** - Including null/conservative alternative
5. **State assumptions & scope**
6. **Describe mechanism** - Why it could work; math only where it clarifies
7. **List closest prior work** - Separate verified from "to verify"
8. **Plan experiments** - Using experiment checklist:
   - Datasets, baselines, metrics, ablations, controls
   - Compute, minimum viable experiments, staged plan
9. **Say what each hypothesis predicts** - Before running anything
10. **Write falsification criteria & stop conditions** - Use numbers where possible
11. **Assess risks** - Implementation, data, compute, evaluation
12. **Separate known from hoped** - Established evidence, inference, hypothesis, speculative, unknowns
13. **Write up** using template
14. **Hand off to novelty-auditor** before calling it new

## Experiment Checklist

- Datasets (public/private, splits, preprocessing)
- Baselines (strong, recent, appropriate)
- Metrics (primary, secondary, why they matter)
- Ablations (which components, why)
- Controls (negative, positive, confounders)
- Compute estimate (GPU-hours, memory)
- Minimum viable experiment (what proves the core idea)
- Staged plan (quick win → full validation)

## Falsification Criteria Template

| Hypothesis | Prediction | Falsified If | Stop Condition |
|------------|------------|--------------|----------------|
| H1: ... | Metric X > Y on Dataset Z | Metric X ≤ Y ± CI | No improvement after N ablations |
| H0: ... | No difference | Significant difference | Effect size > threshold |

## Output Template

```markdown
# Research Idea: [Title]

## Problem & Evidence
[What the gap is, why it matters, supporting quotes]

## Research Question
[One precise question]

## Hypotheses
- H1 (primary): ...
- H0 (null): ...
- H2 (alternative): ...

## Assumptions & Scope
[What is assumed, what is in/out of scope]

## Mechanism
[Why it could work, math where clarifying]

## Closest Prior Work (Verified)
1. [Paper] - [What it does] - [Difference]
2. ...

## To Verify
- [Paper from memory, needs search]

## Experiment Plan
### Minimum Viable Experiment
[What proves the core idea]

### Full Validation
[Staged plan]

### Datasets & Baselines
[Details]

### Metrics & Ablations
[Details]

### Compute Estimate
[GPU-hours, memory]

## Falsification Criteria
| Hypothesis | Prediction | Falsified If | Stop Condition |
|------------|------------|--------------|----------------|

## Risks
- Implementation: ...
- Data: ...
- Compute: ...
- Evaluation: ...

## Evidence Categories
- Established: ...
- Inference: ...
- Hypothesis: ...
- Speculative: ...
- Unknown: ...
```

## What Not To Do

- Combine fashionable architectures / swap modules → ask what scientific question it answers
- Claim novelty because exact phrase not found
- Write unfalsifiable criteria
- Leave out null hypothesis