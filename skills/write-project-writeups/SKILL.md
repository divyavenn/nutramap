---
name: write-project-writeups
description: Write hiring-caliber engineering writeups about software projects, case studies, portfolio essays, and architecture narratives. Use when drafting, rewriting, tightening, or reviewing a coding-project writeup for hiring, portfolio, personal site, blog, or interview storytelling, especially when the goal is to sound like a clear, casual, staff-level engineer rather than a marketer.
---

# Write Project Writeups

Use this skill when the user wants a writeup, case study, portfolio piece, architecture narrative, FAQ, or "how I built X" story about a coding project.

## Default Target

Write as if one staff engineer is explaining the project to another over lunch.

- casual, clear, concrete
- high-signal, not hypey
- intuitive before jargony
- short paragraphs, skimmable sections
- explicit tradeoffs and real numbers where possible

## What This User Usually Wants

- a writeup that makes strong product and AI engineering teams want to hire them
- sections built around real engineering problems, not feature lists
- clear explanations of why a problem was hard, how it was decomposed, and what was built
- concrete numbers: latency, corpus size, cache size, tool counts, embedding dimensions, throughput
- explicit non-choices: "I considered X, but rejected it because Y"
- an FAQ at the end that answers skeptical hiring-manager questions
- a clear distinction between "there is a chatbot in the product" and "the product is actually usable by agents"

## Avoid

- unsubstantiated "world's first" or "best in the world" claims unless the user explicitly wants them
- generic AI hype
- long setup before stating the real problem
- repeating the same point in multiple sections
- phrases like "fiddled with" or "just used" when describing engineering decisions
- talking about tools without talking about constraints, failure modes, and tradeoffs
- jargon-heavy prose that makes the section harder to skim

## Start Here

If the codebase is available, inspect the repo first. When relevant, inspect the git history too.

Pull these facts before drafting:

1. What was the user problem?
2. What invariant or design rule guided the system?
3. What were the `3-5` highest-signal engineering problems?
4. What concrete tradeoffs or rejected paths mattered?
5. What hard numbers are available?
6. What failure modes mattered, and how did the system degrade?
7. What did the author personally build versus reuse?

## Preferred Structure

For hiring-oriented writeups, default to:

1. **Overview**
   Get to the core problem fast. Usually `1-2` short paragraphs.
2. **Product Thesis**
   Explain why existing workflows or products fail.
3. **Engineering Sections**
   Usually `3-5` sections. Each should usually cover:
   - the problem
   - why it was hard
   - how it was decomposed
   - what was built
   - one explicit tradeoff
   - concrete numbers if available
4. **FAQ**
   Answer the obvious skeptical questions a hiring manager will have after skimming.

If the user wants something shorter, collapse this to an overview plus `2-3` high-signal sections.

## Section Heuristics

### Search / Retrieval

This is usually the centerpiece when the project has search, ranking, embeddings, or retrieval.

Make sure the section explains:

- why the workload was mixed
- why one retrieval strategy was not enough
- how autocomplete was made fast
- how quality was evaluated
- how live writes stayed consistent
- one explicit non-choice

Useful framing:

- retrieval stopped being a ranking problem and became a consistency problem
- the hot path was cache-first; the cold path was hybrid
- wrong-fast is worse than slightly less fancy

### Agent Surface

When relevant, explain:

- the shared capability layer or client
- the execution surfaces: CLI, MCP, UI, API
- the behavior layer: skills, workflows, prompts, or operating procedures
- why this is more than "chatbot + MCP"

### LLM / Canonicalization

Treat models as perception or extraction, not truth.

Prefer framing like:

- free-form input becomes structured, auditable state before downstream reasoning depends on it
- the backend maps model output onto canonical product state

### Hardening / Reliability

Tie the section to common AI-product problems:

- keeping the request path short
- warming expensive assets
- partial failure
- background enrichment
- degraded modes
- UI that makes slow work feel intentional

## Writing Style

- Prefer short paragraphs over list-heavy prose.
- Open sections with the engineering problem, not the solution.
- Explain intuitively first, then add technical detail.
- Use the actual component name when possible instead of vague words like "the system."
- Include exact numbers when you have them.
- If a number is approximate, say "roughly" or "about."
- End sections with why the choice mattered for trust, latency, usability, or reliability.

## Tightening Pass

Before finishing, cut:

- repeated transitions
- repeated claims about trust, latency, or reliability unless each one adds something new
- extra adjectives
- inflated framing
- duplicate explanations of the same architecture

A good test: each paragraph should add a new fact, tradeoff, number, or framing move.

## FAQ Prompts

Consider including:

- What makes this agent-friendly instead of just chatbot + MCP?
- Why this retrieval stack?
- How was search quality measured?
- How was autocomplete made fast?
- How did indexes stay in sync under live writes?
- How are parsing or extraction errors evaluated?
- What fails today, and how does the system degrade?
- What did you personally build?
- What breaks at `10x` scale?
- Why is this domain a good proving ground?

## Final Check

The writeup should leave a strong technical reader thinking:

- this person can decompose messy product problems
- this person understands latency, retrieval, and reliability
- this person can encode product behavior into systems, not just prompts
- this person knows when not to use a fancier technique
- this person communicates clearly without sounding like marketing
