---
name: react-tutorial-fsm
description: Build a cross-page product tour/tutorial for React apps using a finite-state-machine approach with selector/event-based progression, interactivity locking, highlight-only steps, media support, and robust event handling.
---

# React Tutorial FSM

Use this skill when implementing or refactoring an in-app tutorial/product tour in a React SPA.

## What this skill delivers

- Cross-page tutorial runner mounted at app root.
- Deterministic progression via FSM/reducer.
- Step model with selector/event/highlightOnly semantics.
- Interactivity locking rules (allow only targeted element when required).
- Tooltip/card with Motion+ Typewriter text and optional media.
- Robust behavior during route transitions, modal mount timing, and keyboard events.

## Package requirements (required)

Install these before implementation:

- `react`, `react-dom` (app runtime)
- `react-router-dom` (route-aware progression)
- State store of choice (recommended: `recoil`)
- `@floating-ui/dom` (target-anchored card placement)
- `framer-motion` (overlay/card/button motion)
- `motion-plus` (Typewriter component via `motion-plus/react`, Motion+ membership required)

Install commands:

```bash
npm install recoil @floating-ui/dom framer-motion
npm install \"https://api.motion.dev/registry.tgz?package=motion-plus&version=2.8.0&token=YOUR_AUTH_TOKEN\"
```

If Motion+ token is unavailable, stop and request one. Do not silently swap to a custom typewriter implementation.

## Core architecture

1. **Global tutorial runtime**
   - Mount one tutorial component/provider near router root so tutorial survives page changes.
   - Store tutorial state in a global store (e.g., Recoil atom, Zustand, Redux).

2. **Pure machine/reducer**
   - No DOM side effects inside reducer.
   - Reducer handles actions only: `START`, `STOP`, `PREV`, `NEXT_MANUAL`, `TARGET_CLICK`, `APP_EVENT`, `ROUTE_CHANGED`.

3. **Step class/model**
   - Use object steps, not tuple arrays.
   - Recommended shape:

```ts
class TutorialStep {
  message: string;
  selector: string | null;
  eventName: string | null;
  highlightOnly: boolean;
  // Keep media on each step object.
  media?: TutorialMedia;
}
```

4. **DOM adapter layer**
   - Resolves current selector element.
   - Positions card near target (Floating UI or equivalent).
   - Applies dim overlay + lifts target above overlay.
   - Installs/removes listeners based on current step.

## Step semantics (do not deviate)

Implement these exact rules:

1. `selector=null`, `eventName=null`
   - Manual narrative step.
   - Progress via next button or Enter.

2. `selector!=null`, `eventName=null`, `highlightOnly=false`
   - Click-to-advance target step.
   - Progress only when target is clicked.

3. `selector=null`, `eventName!=null`
   - Event-only step.
   - Progress only when named app event fires.

4. `selector!=null`, `eventName!=null`
   - Locked interaction step.
   - Allow interactions only within selector until event fires.
   - Progress on event only.

5. `selector!=null`, `eventName=null`, `highlightOnly=true`
   - Highlight-only step.
   - Highlight target, but progress manually (next/Enter).

## Event model

- Expose one helper for emitting tutorial events from app code:
  - `tutorialEvent('tutorial:xyz')`.
- Emit a normalized bus event (e.g., `tutorial:app-event` with `{name}`) and optionally the raw named event for compatibility.
- Trigger events from **lifecycle truth points**, not just click handlers:
  - Example: emit `tutorial:recipe-opened` when modal mounts, not only where user clicked.

## Interactivity locking

For `selector + eventName` steps:

- Add capture listeners on `pointerdown`, `click`, `focusin`.
- If event target is outside selector, `preventDefault`, `stopPropagation`, `stopImmediatePropagation`.
- Remove listeners immediately when step changes or event fires.

## Positioning and render timing

- Card must not flash at default position before target exists.
- Maintain `anchorReady` state:
  - hide card while selector step target is unresolved.
  - start typewriter only when anchored.
- Retry selector resolution briefly after route/modal transitions.

## Route/navigation stability

- For click-to-advance links, defer progression (`setTimeout(...,0)`) so route navigation runs first.
- Keep tutorial mounted globally, not per-page.
- Dispatch `ROUTE_CHANGED` from location changes.

## Highlight behavior

- If using dim overlay without cutout:
  - keep overlay `pointer-events:none`.
  - raise selected element (and stacking-context ancestors) above overlay via `z-index` + temporary `position` fix.
- For list-specific targets (e.g., “second day divider”), assign dedicated tutorial classes to the intended row/element.

## Media support

Support optional step media under text:

```ts
type TutorialMedia =
  | { type: 'image'; src: string; alt: string }
  | { type: 'video'; src: string; poster?: string; autoPlay?: boolean; loop?: boolean; muted?: boolean; controls?: boolean };
```

Use `media?` directly on `TutorialStep` as the default approach.
Do not use a separate `stepIndex -> media` map unless there is a hard external-content requirement.
If media URLs differ by deployment, resolve `src` from deployment-specific env vars at build/runtime.

Example:

```ts
new TutorialStep({
  message: "Watch how to edit a nutrient",
  selector: ".nutrient-edit-panel",
  eventName: null,
  highlightOnly: true,
  media: {
    type: "video",
    src: import.meta.env.VITE_TUTORIAL_EDIT_NUTRIENT_VIDEO,
    poster: import.meta.env.VITE_TUTORIAL_EDIT_NUTRIENT_POSTER,
    muted: true,
    autoPlay: true,
    loop: true,
    controls: false,
  },
})
```

## Typewriter spec (required)

Use Motion+ `Typewriter` from `motion-plus/react` for tutorial copy animation.

```tsx
import { Typewriter } from "motion-plus/react"
```

Required behavior:

- Render step message using `<Typewriter>` (not a custom interval-based typewriter).
- Use `play` control when needed (for viewport/anchor gating).
- Keep cursor styling consistent via `cursorClassName`/`cursorStyle`.
- Respect accessibility with proper text semantics and avoid hiding content from screen readers.

## Keyboard behavior

- Enter should perform `NEXT_MANUAL` only on manual/manual-highlight steps.
- Ignore global Enter handler when focus is inside form controls (especially final-step email forms), otherwise submission gets swallowed.

## Date-range/calendar gotchas

For “change date range” steps:

- Do **not** emit progress event on first date click if range selection requires two clicks.
- Emit when range actually changed and is complete (e.g., `startDate != endDate`), or when arrow/month navigation changes range.
- Guard against firing when selected range is unchanged.

## Final CTA/email capture pattern

- Add final-step email form in tutorial card.
- API endpoint: `POST /user/mailing-list/subscribe` with `{email}`.
- Persist to dedicated collection/table named exactly as requested by product (e.g., `mailing list`).
- Add unique index on email.
- Optional admin endpoint: `GET /user/mailing-list?limit=...` (admin-only).

## Failure-mode specs (required)

Treat these as shipping blockers. The implementation is incomplete unless each is explicitly handled.

### Selector and targeting specs

- Step selectors must resolve to exactly one intended target for each route/state; avoid generic selectors for repeated rows/cards.
- For repeated content (lists/log groups), add dedicated tutorial classes for the intended item (e.g., second date divider), not positional query hacks in generic selectors.
- If selector resolves to zero/multiple candidates, keep step active and log a structured warning with step index + selector + route.

### Mounting and async rendering specs

- Modal/portal/async targets must use retry-with-timeout resolution before failing placement.
- Event progression must be emitted from lifecycle truth points (mount/open/saved), not only click paths.
- Route/data fetch transitions must not progress until target is mounted and anchor is ready.

### Event integrity specs

- Deduplicate event listeners per run and remove on step change/unmount.
- Prevent stale listeners from prior tutorial runs via run/session id checks.
- Guard against double progression from duplicate events in the same frame.

### Interactivity lock specs

- `selector+event` lock must allow only intended target subtree interactions.
- Lock must preserve required interactions inside allowed subtree (inputs, date pickers, focus, keyboard navigation).
- Lock must not trap the user permanently; provide deterministic unlock on event or tutorial stop.

### Positioning and layering specs

- No first-frame tooltip flash at default coordinates; hide until anchored.
- Support nested scroll containers (not only window scroll) when auto-scrolling target into view.
- Handle stacking contexts (`transform`, `opacity`, `filter`, `position: fixed`) so target remains undimmed and visible above overlay.
- Recompute placement on resize, scroll, content expansion, and route change.

### Input and keyboard specs

- Global Enter handler must ignore focused form controls within tutorial card.
- Tutorial must not swallow form submit/textarea behavior unexpectedly.
- Mobile keyboard/open viewport changes must not break placement or lock behavior.

### Calendar/date-range specs

- Range-change steps must not advance on first click of a two-click range selection.
- Advance only when range is complete and actually changed.
- Arrow/month navigation changes must also emit progression event where applicable.

## Styling spec (required)

- Define tutorial design tokens (overlay opacity, z-index layers, spacing, radii, font sizes, colors, motion durations/easings).
- Use one layering contract: `overlay` < `lifted target` < `tutorial card` (or documented equivalent).
- Preserve accessibility:
  - contrast-compliant text/actions,
  - visible focus styles,
  - `prefers-reduced-motion` fallback (disable typewriter/looping animations).
- Responsive behavior must be explicitly handled for mobile/tablet/desktop breakpoints.
- Keep tutorial controls visually consistent with product style, but deterministic across pages.

## Media spec for steps (required)

- Keep media config on each step (`TutorialStep.media`), unless there is a clear platform/CMS requirement to externalize it.
- If media is environment-dependent, set per-step `src` from deployment `.env` values (`import.meta.env` or equivalent).
- Image steps:
  - require `alt`,
  - use constrained size (`max-height`) and stable layout (`object-fit`).
- Video steps:
  - default to `muted`, `playsInline`, and optional `poster`,
  - pause/unmount media on step exit,
  - avoid background playback across step transitions.
- Add load/error states so media failure never blocks tutorial progression.
- Prefetch next-step media when feasible to reduce flicker/jank.
- For instructional video, support captions/transcript path when product requires accessibility parity.

## Preflight validator spec (recommended)

Implement a validation pass before marking tutorial complete:

- Check each step can resolve target selector on expected route/state.
- Check each `eventName` has at least one emitter in app code.
- Check no duplicate progression events fire for one user action.
- Check lock/unlock behavior for all `selector+event` steps.
- Check final-step form calls backend and handles success/error idempotently.
- Emit a machine-readable report (JSON) for CI/manual QA review.

Use the companion script:

```bash
python skills/react-tutorial-fsm/scripts/validate_tutorial.py \
  --root . \
  --steps-file frontend/src/components/TryTutorial.tsx \
  --report tutorial-preflight.json
```

The validator checks package prerequisites and flags non-Motion+ typewriter implementations.

## Implementation sequence

1. Define `TutorialStep` model + machine reducer.
2. Migrate current steps to object/class form.
3. Integrate machine into global tutorial runner.
4. Add event bus + lifecycle emitters in UI components.
5. Add interactivity lock and target lifting.
6. Add anchorReady gating to prevent position flash.
7. Add highlightOnly support.
8. Add media slot support.
9. Add final-step email form + backend persistence.
10. Validate all tutorial paths with manual QA + build/tests.

## Required QA checklist

- Tutorial continues across route changes.
- Selector+event steps block all non-target interactions.
- Highlight-only steps do not auto-advance on click.
- Modal-open steps progress on modal mount event.
- Range-change step does not progress on incomplete selection.
- Enter in email input submits form (does not skip step).
- Target element remains undimmed while rest is dimmed.

## Minimal backend checks

- Confirm index exists on mailing list email.
- Confirm duplicate email returns idempotent success (`Already subscribed` or equivalent).
- Confirm admin listing endpoint is authorization-protected.
