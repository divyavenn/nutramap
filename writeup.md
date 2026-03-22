# How I Built the World's First Agent-Friendly Nutrition Tracker

## Overview

"Today I ate 1 bowl of beef pho, 2 cups of cereal, half a cup of ice cream, and some olives. Did I get enough protein?"

This is a shockingly difficult question to give a good answer to, whether you're a human or an LLM. It's even harder to convey enough of your reasoning that the person asking can sanity-check you without getting totally overwhelmed. 

`Nutramap` is the first-ever nutrition tracker designed to be both human and agent friendly. A person can use it through a web app, but an agent can also operate it through CLI, MCP, and explicit skills. This lets users turn their LLM of choice into a nutrition assistant that knows what they eat, can track progress, deduce preferences, and suggest concrete next steps.

The project was an extremely interesting challenge for three reasons:
1) the UX is a proof of concept for good human-AI interfaces. AI makes it easy to use (natural language input, one-click entry for all major actions) but the interface still exposes all the assumptions the LLM makes in the complicated underlying workflow.

2) it surfaced a bunch of the same problems AI teams run into every day: keeping the interactive request path short, making retrieval trustworthy under live writes, preserving structured state around unreliable model outputs, and designing for partial failure instead of assuming the entire enrichment pipeline succeeds every time.

3) Exposing the functionalities to agents in a way that would make them maximally useful

Models are very, very good (and only getting better!) but they are most useful when you are specific. When you ask a model to one-shot a super complex, multi-step task, you end up exposed to a lot of invisible hallucinations and bad inductive leaps. In nutrition that matters. A mere 200 extra calories a day makes you gain roughly 15 pounds in 3 months. A chronic iron deficiency can build up into debilitating symptoms that cost thousands of dollars to diagnose.


## Product Thesis

Existing health tracking software has three main problems:
1) Require exhaustive manual entry of all foods (MyFitnessPal, Cronometer)
2) Use AI to process meals, but system is low-trust and a black box (CalAI). You have no idea how it's coming up with its numbers and no way to double check or edit them.
3) Cannot be integrated with agentic workflows. People are already starting to heavily use LLMs as catchall personal assistants - my opinion is that a plug-and-play agentic interface is going to be as important to people actually using your product as having a mobile app was in the 2010s. 

Health tracking is one thing agents currently do *very* poorly out of the box. I know because I tried to use ChatGPT as my meal tracker for 3 months simply because it was convenient. It hallucinated information, forgot things, and mixed meals up all the time. 


## The Data Pipeline
The ground truth of Nutramap was the USDA’s massive food database. It had nutrient info per 100 grams for 2.7 million foods, with up to 72 nutrient records for each one. We needed a pipeline where messy natural-language input resolved cleanly into structured state. 

- descriptions get broken down into meals ("matcha latte, one apple, 2 bagels" -> matcha latte (1 latte, 250 g), everything bagel (2 bagels, 400 g))
- each meal has a recipe id (either an existing one or, if the user has never eaten this before, a new one is created) with a name, serving label, the weight of one serving, and a list of components
- each component has a food_id and estimated weight in grams
- the nutrients of a component are calculated by querying the nutrients of that food_id, prorated by gram weight
- daily intake is compared to explicit user requirements
- people tend to have a list of foods they eat often, so recipes are treated as reusable, editable objects instead of one-off text blobs

Not only does this structure make the system very transparent - the user can sanity check every assumption the LLM makes - but it exposes composable objects for an agent to reason and operate on. 

A user can ask how much protein was in their latte, the system answers from component-level data ("The only ingredient with protein in your latte is 1 cup of whole milk, about 259 grams. Milk has 3 grams of protein per 100 grams, meaning there are about 8 grams of protein in your latte"). 

If they ask how they are doing today, the agent can fetch goals, compare them against actual intake, identify active constraints like sodium, calories, or dietary preferences, and suggest a specific recipe or food to close the gap. The intelligence lives in the workflow and the data model, not just in the prose.


## 2. Building a Search Index That Was Fast and Accurate

Doing this well made a *huge* difference in how useable the app actually ended up. It was the classic AI-product problem of balancing latency, recall, precision, and trust in the middle of an interactive workflow. 


Search in Nutramap had to do three very different jobs at once:
- autocomplete while someone is typing
- precise lookup when they know exactly what they ate
- semantic matching when they describe something vaguely

Those are not the same problem. Someone typing `chobani greek yogurt` wants a very different kind of result than someone typing `milk` or `cookie`.


I realized pretty quickly that a single retrieval strategy was going to be bad at at least one of those. Keyword search works well if you know exactly what you're looking for. Pure embedding search works really well when you're verbose but it's bad for short queries, even exact phrases. 

Retrieval in Nutramap evolved broadly like this:
- ran sparse search (Typesense) and dense search (FAISS) in parallel, and combined them with a reciprocal rank fusion algorithm
- tightened the ranker to handle ties correctly and use both score and position.
- cached the index artifacts in binary and pickle formats so rebuild work was not happening over and over.
- added GPU acceleration for embedding generation and fixed bugs in the incremental FAISS update path. T

I experimented with product quantization, but A/B testing revealed that for our corpus it reduced accuracy without significantly improving speed.
The serving side mattered just as much as the ranking side. Some optimization techniques:
- warmed the FAISS index into memory at startup
- cache autocomplete in an in-memory LRU. That cache alone took repeated-query latency from roughly `650-1400ms` down to under `50ms` on cache hits.

The hot path for autocomplete was cache-first, while the cold path used hybrid retrieval over Typesense and FAISS. I also patched the autocomplete cache when custom foods were added or deleted, so newly created foods could show up immediately instead of waiting for cache expiry. The final result was flexible retrieval that felt fast enough for interactive use!

## 3. Keeping Live Indexes in Sync With Product State

Nutramap has a lot of moving pieces that all have to agree with each other: MongoDB as the source of truth, the sparse index, the dense index, and several client- and server-side caches. If those drift apart, the system gets weird fast. 

A food exists in one place but not another. Autocomplete shows something the dense matcher cannot find. A deleted custom food keeps showing up in results. Those are exactly the kinds of issues that make a product feel low-trust.

One thing I learned pretty fast is that search quality is easy to fake if your corpus is static. It gets much harder when users are creating custom foods, deleting them, renaming things, editing recipes, and expecting all of it to be searchable immediately. 

When a custom food is added, the system inserts it into MongoDB, adds it to the sparse index, adds it to FAISS when an embedding is available, updates the ID-to-name cache, and patches the autocomplete cache so it can show up right away. 

If embedding generation fails, the write still succeeds, the failure is logged, and there is a repair path to backfill the vector later. I also added direct MongoDB fallback search for a user's custom foods so autocomplete still works even if an external index is stale. 

## 4. Hardening the System for Latency, Failure, and Real Use

It is easy to build an app that looks impressive in the happy-path demo. It is much harder to build one that still feels good when the model is slow, the matching path gets expensive, an embedding job fails, or the first request on a cold server has to load a bunch of heavy assets. Nutramap had all of those problems.

To borrow a term from @cfregly's AI Systems Performance Engineering, I cared a lot about **goodput**: not just whether the system was busy, but whether it was doing useful work from the user's point of view.

So I ended up designing around a few pretty simple rules.

### Keep the request path short

The first rule was: do not make the user wait on work they do not need to wait on.

Early on, too much happened synchronously. That is fine until the product starts doing real work. As soon as log creation involved recipe decomposition, ingredient matching, retrieval, and indexing, it became obvious that the request path had to stay much shorter. Otherwise every useful feature made the product feel slower.

So I moved the heavier parts into background tasks. The product can acknowledge the action quickly, then finish the more expensive matching and indexing work off the critical path. This is a very common AI engineering problem: one request quietly turns into a whole pipeline of model calls, retrieval, canonicalization, and writes. If all of that stays in-band, the UX gets bad fast.

### Warm the expensive stuff before users hit it

The second rule was: if something is expensive and predictable, load it before the user asks for it.

The system now preloads the FAISS index and embedding model at startup, caches retrieval artifacts to disk and memory, and batches embedding work where it can. That helped with one of the most common AI-product issues, which is that the first request is dramatically slower than the rest because it is secretly doing initialization work the user never asked for.

I also chose not to rely entirely on remote model APIs for embeddings. I added a local GPU sentence-transformer path with an OpenAI fallback because it gave me better throughput, lower cost, and a cleaner degraded mode when external calls were slow or unreliable.

### Assume part of the pipeline will fail

The third rule was: never assume the whole enrichment path will succeed every time.

In a product like this, there are a lot of secondary jobs that can fail independently: embedding generation, index updates, retrieval repair, even external API calls. If every one of those can block the primary user action, the system becomes fragile. This is one of the most universal AI engineering problems right now: the "smart" parts of the pipeline are often the least reliable, so the surrounding system has to absorb that unreliability instead of exposing it directly to the user.

### Make slow work feel intentional

The last rule was about the frontend: if something is going to take time, make that feel like progress, not failure.

Once the heavier matching path moved into the background, I added optimistic updates, loading states, and motion in the UI so the product did not look frozen while the system was still working. The app's UI updates optimistically to acknowledge the action, shows through suble animations that processing is happening, and then resolves into the final structured result. That sounds small, but it matters a lot in AI products. A 2-second wait with a clear intermediate state feels very different from a 2-second wait where the interface looks dead.



## 5. Designing The Agent Surface

If a model is going to operate a system over and over again, the system needs clear capabilities, predictable state, and explicit rules. It's surprisingly hard to ensure that an agent actually uses the tools as intended; you can't just give it access to your backend APIs and expect it to call them intelligently (I tried). I also considered building a separate set of agent-only APIs, but rejected that because they would have drifted from the human product surface almost immediately.

I started by listing the smallest useful actions an agent would need to take: log a meal, fetch a day's logs, read intake, load requirements, and retrieve top foods. I then pulled those operations behind a shared interface, FoodpanelClient, so both agent surfaces (CLI and MCP) were using the same capability layer. It also handled the annoying edge cases that make agents flaky if you leave them scattered around the codebase: auth, session persistence, trial-user fallback, request shaping, and normalizing backend responses into something more usable. 

his gave agents a stable tool surface over the software's existing functions. In many ways, the agent actually extends the existing functions. The web interface will show you your nutritional deficiences, but the agent can additionally look up food in the database that have high amounts of missing nutrients and recommend them directly to you. 

Both the CLI and MCP were built directly on top of that client. The binary is not a separate implementation, but rather the same package installed as local commands, with both human-friendly output and a `--json` mode for agents. The MCP supports both local stateful sessions and stateless HTTP sessions, because assistants running over stdio and assistants calling a remote server have very different constraints. 

The last piece was the skills files. The tool interface told the model what it could do. The skills told it how to do it well. In `skills/foodpanel-agent/SKILL.md` and `skills/foodpanel-cli/SKILL.md`, I encoded concrete operating procedures: fetch requirements before showing progress, get the day's logs before reasoning about a meal, prioritize saved recipes over generic advice, quantify suggestions, and avoid vague nutrition language. That sounds simple, but it solves a very common agent problem: giving a model tools without giving it a reliable workflow. 

Most bad agent behavior is not "the tool failed." It is "the model took a shortcut that should not be allowed." That is what I mean by a software being agent-friendly: it exposes its capabilities in a way that actually lets an agent extend them. 


## Things you might be wondering

**Why is a nutrition tracker a good experimental project for agent systems?**

Because it combines ambiguous natural-language input with real value from structured reasoning. Users want to speak naturally, but the system has to resolve that into canonical state before it can do anything useful. The domain is rich in retrieval, follow-up questions, constraints, memory, and recommendations, which are exactly the things agent systems are supposed to be good at. At the same time, nutrition is unforgiving enough that a hand-wavy chatbot experience is obviously not sufficient.

**How do you use LLMs in this?**
In Nutramap, LLMs break down vague descriptions into meals and dates, estimate recipes and weights of foods, and extract nutrient data from labels. But if the model misreads a label, invents a nutrient name, or leaves an ambiguous quantity unresolved, the product breaks quickly.

Instead of endlessly refining my prompts, I exposed all the assumptions the LLM made for the user to audit and created guarantees using canonicalization, validation, and tests.

**What did you personally build versus reuse from libraries and protocols?**

I reused the right infrastructure pieces: FastAPI, FAISS, Typesense, MCP, and model APIs or local sentence-transformers. The work I built was the system around them: the domain model, shared client, CLI, MCP tool surface, retrieval architecture, ranking strategy, index lifecycle, live-write synchronization, repair flows, canonicalization logic, and the agent behavior layer encoded in skills and workflows.


**Why did you choose FAISS + Typesense + RRF instead of a single retrieval system like pgvector, Elastic, or a vector DB?**

Because the workload was mixed. I needed strong lexical behavior for autocomplete, prefixes, exact names, and brand-like queries, and I also needed semantic recall for fuzzy food descriptions and nutrient concepts. A single stack can do both, but usually not equally well. FAISS gave me a simple dense-serving path, Typesense gave me predictable lexical search, and RRF gave me a clean way to combine them.

**How did you measure search quality? What got better after hybrid retrieval?**

The main improvement from hybrid retrieval was that sparse-only search struggled with semantic queries and nutrient aliases, while dense-only retrieval was weaker on exact names, prefixes, and deterministic autocomplete. I manually wrote a bunch of test cases and fiddled with the RRF algo parameters till I had good results from the hybrid retrieval. 

**How do you keep the dense index, sparse index, cache, and database from drifting apart under live writes?**

The database is the source of truth and the indexes are serving representations that need explicit synchronization. On writes, the system persists the record first, then updates sparse retrieval, dense retrieval when an embedding exists, and the fast-read caches. If enrichment fails, the user-facing write still succeeds and the system records enough information to repair the retrieval state later. I also kept both incremental update paths and full rebuild paths because they solve different failure modes.

**How do you evaluate meal parsing and nutrient extraction accuracy?**

I treat those paths as canonicalization problems rather than pure model-output problems. The model is responsible for perception and extraction, but the backend is responsible for mapping outputs onto canonical food and nutrient state. I wrote exhuastive test scripts with various adversarial inputs and fiddled with things until they all came out the way I wanted. 

**What are the main failure modes today, and how does the system degrade?**

The main failure modes are retrieval drift, embedding generation failures, ambiguous meal descriptions, and model extraction mistakes on noisy inputs like bad food photos or low-quality labels. The system is designed to degrade by preserving the canonical write whenever possible, then repairing or enriching asynchronously. If an embedding fails, the food can still exist and be searchable lexically. If an index is stale, there are fallback paths for custom-food lookup.


**If usage increased 10x, what would break first?**

The first pressure point would probably be the write and enrichment path rather than the basic read path. At 10x usage, I would expect pressure around background job throughput, embedding generation capacity, cross-process cache coherence, and the operational complexity of keeping multiple serving representations fresh. The next step would be to make enrichment fully queue-backed and observable, move more cache and index coordination into durable infrastructure, and tighten the rebuild and retry flows.
