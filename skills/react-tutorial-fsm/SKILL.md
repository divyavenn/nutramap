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
npm install "https://api.motion.dev/registry.tgz?package=motion-plus&version=2.8.0&token=YOUR_AUTH_TOKEN"
```

If Motion+ token is unavailable, stop and request one. Do not silently swap to a custom typewriter implementation.

## Core architecture

1. **Global tutorial runtime**
   - Mount one tutorial component/provider near router root so tutorial survives page changes.
   - Store tutorial state in a global store (e.g., Recoil atom, Zustand, Redux).

2. **Pure machine/reducer**
   - No DOM side effects inside reducer.
   - Reducer handles actions only: `START`, `STOP`, `PREV`, `NEXT_MANUAL`, `TARGET_CLICK`, `APP_EVENT`.
   - Do NOT add a `ROUTE_CHANGED` action — route changes do not need to be dispatched into the machine. The DOM adapter re-runs its effects when `location.pathname` changes naturally via React Router.

3. **Step class/model**
   - Use object steps, not tuple arrays.
   - Recommended shape:

```ts
class TutorialStep {
  message: string;
  selector: string | null;
  eventName: string | null;
  highlightOnly: boolean;
  media?: TutorialMedia;
}
```

4. **DOM adapter layer**
   - Resolves current selector element.
   - Positions card near target (Floating UI or equivalent).
   - Applies dim overlay + lifts target above overlay.
   - Installs/removes listeners based on current step.

## File structure

```
src/
  components/
    tutorial_machine.ts      # pure FSM: types, reducer, atom, step helpers
    TryTutorial.tsx          # DOM adapter: effects, applyLift, card render
    TutorialStyles.ts        # all styled-components for the tutorial UI
```

Mount `<TryTutorial />` inside the router but outside all page components — typically at the app root alongside `<Header />`:

```tsx
// App.tsx or router root
<RecoilRoot>
  <BrowserRouter>
    <Header />
    <TryTutorial />   {/* ← always mounted, survives route changes */}
    <Routes>...</Routes>
  </BrowserRouter>
</RecoilRoot>
```

## Starting the tutorial from anywhere

Fire a `start-tutorial` window event from any component to start the tutorial without a direct import:

```ts
window.dispatchEvent(new Event('start-tutorial'));
```

`TryTutorial` listens for this event and calls `dispatchMachine({ type: 'START' })`. Guard against starting when already active:

```ts
useEffect(() => {
  const handler = () => {
    if (machineRef.current.isActive) return;
    dispatchMachine({ type: 'START' });
  };
  window.addEventListener('start-tutorial', handler);
  return () => window.removeEventListener('start-tutorial', handler);
}, [dispatchMachine]);
```

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

**When to use event-only instead of a selector step:** if the target element has a `backdrop-filter` CSS property that cannot be removed, do not add a selector — use `eventName` only. `backdrop-filter` creates a stacking context that breaks the `applyLift` highlighting logic (see Stacking Context Gotchas below).

## Inserting selectors into app components

**Use a dedicated tutorial class, not a generic one.** Generic selectors (`.modal`, `.button`, `.list-item`) will match unintended elements. Prefix with `tutorial-`:

```tsx
// Good
<div className="recipe-detail-modal tutorial-recipe-modal">

// Bad — too generic, may match other modals
<div className="recipe-detail-modal">
```

**Selector type guide:**

| Target | Preferred selector |
|---|---|
| Nav link | `a[href="/myrecipes"]` — no class needed |
| Modal container | `.tutorial-recipe-modal` added to the modal root div |
| Form wrapper | `.tutorial-log-form` added to the `<form>` or its wrapper |
| A specific card in a list | `.tutorial-first-recipe-card` on the intended item only |
| A button inside a modal | `.tutorial-recipe-modal .modal-close-x` — scope with parent |

**For lists/repeated content:** add the tutorial class only to the intended item (e.g., the first recipe card), not to every item in the list. Compute which item gets the class based on index or a flag:

```tsx
{recipes.map((recipe, i) => (
  <RecipeCard
    key={recipe.id}
    className={i === 0 ? 'recipe-card tutorial-first-recipe' : 'recipe-card'}
  />
))}
```

**`getStepElement` implementation — always filter by visibility:**

```ts
const getStepElement = (selector: string | null) => {
  if (!selector) return null;
  const candidates = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
  // Only return elements that are actually rendered (have layout rects)
  return candidates.find(el => el.getClientRects().length > 0) ?? null;
};
```

This prevents matching hidden/unmounted elements that are technically in the DOM.

## Inserting events into app components

**The `tutorialEvent` helper** — call this from app code. It is a no-op when the tutorial is not active:

```ts
const TUTORIAL_ACTIVE_ATTR = 'data-tutorial-active';
const TUTORIAL_APP_EVENT = 'tutorial:app-event';

export function tutorialEvent(name: string) {
  if (document.body.getAttribute(TUTORIAL_ACTIVE_ATTR) !== 'true') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_APP_EVENT, { detail: { name } }));
}
```

`TryTutorial` sets `data-tutorial-active="true"` on `document.body` when active and removes it when inactive. This is the guard that makes `tutorialEvent` safe to call anywhere.

**Where to place event calls:**

| What happened | Where to emit | Why |
|---|---|---|
| Modal opened | `useEffect(() => { tutorialEvent('tutorial:modal-opened'); }, [])` inside the modal component | Fires on mount, not just on the click that opened it |
| Form submitted successfully | After the API `await`, before closing/clearing | Timing: element still in DOM |
| Item saved/updated | After the successful response | Not on button click — request could fail |
| User closed a modal that should show a confirm dialog | After `setShowConfirm(true)` state update — but see timing warning below | |
| Recipe synced/dismissed | After `setShowConfirm(false)` and the close handler | |

**Timing warning — state updates are async:** React batches state updates. If you call `setState(true)` and immediately `tutorialEvent(...)`, the event fires before the re-render that mounts the next step's target. This is fine because `tryFind` polls every 200ms and will find the element after the render. But do NOT emit an event that is supposed to advance past a selector step before that selector's element is in the DOM — the step machine will advance and `tryFind` will start looking for the NEXT step's target, which may never mount.

**Common mistake — emitting before the UI updates:**

```ts
// Wrong: event fires before the confirm modal renders
setShowConfirmModal(true);
tutorialEvent('tutorial:close-pressed');

// Correct: the event fires after mount, inside the confirm modal component
// In ConfirmModal.tsx:
useEffect(() => {
  tutorialEvent('tutorial:confirm-shown');
}, []);
```

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
- Do NOT dispatch `ROUTE_CHANGED` into the machine — it is dead weight. Effects that depend on the current route should simply list `location.pathname` in their dependency array.

## anchorReady — merged effect pattern

Do NOT have two separate effects for "reset anchor on step change" and "recompute card position". Merge them into one. Two separate effects on the same deps produce extra cleanup/setup cycles that wipe highlighting on the first step:

```ts
// Wrong — two effects on same deps cause extra resetLift() cycles
useEffect(() => {
  setAnchorReady(false);
}, [isActive, currentStep]);

useEffect(() => {
  void computeCardPosition();
}, [isActive, currentStep, computeCardPosition]);

// Correct — one effect handles both
useEffect(() => {
  if (!isActive) {
    setAnchorReady(false);
    return;
  }
  // Eagerly mark ready if no selector (card can show immediately)
  setAnchorReady(!currentSelector);
  void computeCardPosition();
}, [isActive, currentStep, currentSelector, computeCardPosition]);
```

**`computeCardPosition` implementation:**

```ts
const computeCardPosition = useCallback(async () => {
  const cardEl = cardRef.current;
  if (!cardEl) return;

  if (!currentSelector) {
    setCardStyle({});
    setAnchorReady(true);
    return;
  }

  const targetEl = getStepElement(currentSelector);
  if (!targetEl) {
    setCardStyle({});
    setAnchorReady(false);  // still waiting — keep card hidden
    return;
  }

  const cardWidth = Math.min(360, window.innerWidth * 0.4);
  cardEl.style.width = `${cardWidth}px`;

  const isHeaderLink = currentSelector.startsWith('a[href=');
  const placement = isHeaderLink ? 'bottom-end' : 'right';
  const fallbacks: Placement[] = isHeaderLink
    ? ['bottom', 'left', 'top', 'right']
    : ['bottom', 'top', 'left', 'right'];

  const { x, y } = await computePosition(targetEl, cardEl, {
    strategy: 'fixed',
    placement,
    middleware: [offset(30), flip({ fallbackPlacements: fallbacks }), shift({ padding: 12 })],
  });

  setCardStyle({ width: cardWidth, left: x, top: y, right: 'auto', transform: 'none' });
  setAnchorReady(true);
}, [currentSelector, getStepElement]);
```

**`hideUntilAnchored` and card style:**

```ts
const cardZIndex = dimZIndex + 2;  // always dynamic
const hideUntilAnchored = Boolean(currentSelector) && !anchorReady;
const tutorialCardStyle: CSSProperties = hideUntilAnchored
  ? { ...cardStyle, visibility: 'hidden', zIndex: cardZIndex }
  : { ...cardStyle, zIndex: cardZIndex };
```

Use `visibility: hidden` (not `display: none`) so the card is measured by floating-ui but not visible. The Typewriter `play` prop should also be gated on `!hideUntilAnchored`.

## Highlight behavior (applyLift)

Run `applyLift` in a `useEffect` with deps `[currentSelector, isActive, location.pathname]`. It must be a separate effect from the card-positioning effect.

**Full algorithm:**

```ts
useEffect(() => {
  if (!isActive || !currentSelector) return;

  const saved = new Map<HTMLElement, { position: string; zIndex: string; opacity: string; transition: string }>();
  const dimmed = new Set<HTMLElement>();
  const hoverListeners: Array<{ el: HTMLElement; enter: () => void; leave: () => void }> = [];
  let retryTimer: number | null = null;
  let cancelled = false;

  const save = (node: HTMLElement) => {
    if (!saved.has(node)) {
      saved.set(node, {
        position: node.style.position,
        zIndex: node.style.zIndex,
        opacity: node.style.opacity,
        transition: node.style.transition,
      });
    }
  };

  const resetLift = () => {
    for (const [node, s] of saved) {
      node.style.position = s.position;
      node.style.zIndex = s.zIndex;
      node.style.opacity = s.opacity;
      node.style.transition = s.transition;
    }
    saved.clear();
    dimmed.clear();
    for (const { el, enter, leave } of hoverListeners) {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
    }
    hoverListeners.length = 0;
  };

  const createsStackingContext = (node: HTMLElement) => {
    const s = getComputedStyle(node);
    return (
      s.position === 'fixed' ||
      (s.zIndex !== 'auto' && s.position !== 'static') ||
      s.opacity !== '1' ||
      s.transform !== 'none' ||
      s.filter !== 'none' ||
      s.backdropFilter !== 'none' ||
      s.perspective !== 'none' ||
      s.isolation === 'isolate' ||
      s.mixBlendMode !== 'normal'
    );
  };

  const applyLift = () => {
    if (cancelled) return;
    resetLift();

    // All visible targets
    const targets = Array.from(document.querySelectorAll(currentSelector))
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0);

    if (targets.length === 0) {
      retryTimer = window.setTimeout(applyLift, 200);
      return;
    }

    const primary = targets[0];

    // Compute liftZ from highest ancestor z-index
    let maxZ = 0;
    for (let p = primary.parentElement; p && p !== document.body; p = p.parentElement) {
      const z = parseInt(getComputedStyle(p).zIndex, 10);
      if (!isNaN(z)) maxZ = Math.max(maxZ, z);
    }
    const liftZ = Math.max(maxZ + 1, 2);
    setDimZIndex(liftZ - 1);  // dim sits just below the lifted target

    // Find lowest common ancestor of all targets, then nearest stacking-context ancestor
    const getAncestors = (el: HTMLElement): HTMLElement[] => {
      const chain: HTMLElement[] = [];
      for (let p = el as HTMLElement | null; p && p !== document.body; p = p.parentElement) chain.push(p);
      return chain;
    };
    let lca: HTMLElement = primary;
    if (targets.length > 1) {
      for (const ancestor of getAncestors(primary)) {
        if (targets.every(t => ancestor.contains(t))) { lca = ancestor; break; }
      }
    }
    let container: HTMLElement | null = null;
    for (let p = lca as HTMLElement | null; p && p !== document.body; p = p.parentElement) {
      if (createsStackingContext(p)) { container = p; break; }
    }

    if (container) {
      // Lift container and all stacking-context ancestors to liftZ
      for (let p = container as HTMLElement | null; p && p !== document.body; p = p.parentElement) {
        if (p === container || createsStackingContext(p)) {
          save(p);
          if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
          p.style.zIndex = String(liftZ);
        }
      }

      // Build path set: all ancestors from each target up to (not including) container
      const targetSet = new Set(targets);
      const pathSet = new Set<HTMLElement>();
      for (const t of targets) {
        for (let n: HTMLElement | null = t; n && n !== container; n = n.parentElement) {
          pathSet.add(n);
        }
      }

      // Dim everything in container's subtree that is not in the path
      const dimNonPath = (parent: HTMLElement) => {
        for (const child of parent.children) {
          if (!(child instanceof HTMLElement)) continue;
          if (pathSet.has(child)) {
            if (!targetSet.has(child)) dimNonPath(child);  // recurse into path but not into targets
          } else {
            save(child);
            child.style.transition = 'opacity 0.15s ease';
            child.style.opacity = '0.07';
            dimmed.add(child);
          }
        }
      };
      dimNonPath(container);

      // Hover reveal: hovering a target temporarily restores its dimmed siblings
      for (const t of targets) {
        const siblings = Array.from(t.parentElement?.children ?? [])
          .filter((c): c is HTMLElement => c instanceof HTMLElement && c !== t && dimmed.has(c));
        if (siblings.length === 0) continue;
        const enter = () => siblings.forEach(s => { s.style.opacity = '1'; });
        const leave = () => siblings.forEach(s => { s.style.opacity = '0.07'; });
        t.addEventListener('mouseenter', enter);
        t.addEventListener('mouseleave', leave);
        hoverListeners.push({ el: t, enter, leave });
      }
    } else {
      // No stacking context — lift targets directly
      for (const t of targets) {
        save(t);
        if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
        t.style.zIndex = String(liftZ);
      }
    }
  };

  applyLift();

  return () => {
    cancelled = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    resetLift();
  };
}, [currentSelector, isActive, location.pathname]);
```

**Critical z-index rule:** the tutorial card's z-index must always be computed as `dimZIndex + 2`, not a hardcoded constant like `9999`. App modals can have arbitrary z-indexes (e.g., `10000`). A hardcoded card z-index will end up below the dim when a high-z-index modal is the target.

```
dim: dimZIndex
lifted target: dimZIndex + 1  (= liftZ)
tutorial card: dimZIndex + 2
```

## Stacking context gotchas

These CSS properties create a stacking context and will confuse `applyLift`:

- `backdrop-filter` (including `-webkit-backdrop-filter`)
- `transform` (including identity transforms — `translateY(0px)` still counts)
- `opacity < 1`
- `position: fixed` or `position: sticky` with a non-`auto` `z-index`
- `filter`
- `isolation: isolate`
- `mix-blend-mode` (non-normal)
- `perspective`
- `will-change` (some browsers)

**`backdrop-filter` on the target element:** if the target itself has `backdrop-filter`, `createsStackingContext()` returns true for it, causing `applyLift` to identify it as its own container and then walk its subtree — dimming its own children. Fix: remove `backdrop-filter` from tutorial target elements. If you cannot remove it, use an event-only step (no selector).

**framer-motion `motion.div` always has a stacking context:** even after an animation completes with `y: 0, scale: 1`, framer-motion leaves an inline `transform` style (e.g., `translateY(0px) scale(1)`) which is a non-`none` transform and therefore always creates a stacking context. Account for this when tracing the container hierarchy.

**`position: fixed` inside a transformed parent:** CSS traps `position: fixed` elements inside their nearest transformed ancestor's stacking context. Their `z-index` only applies within that ancestor — not relative to the viewport. If a tutorial target's `position: fixed` wrapper is inside a transformed element, the effective z-index seen by the dim overlay may be much lower than the declared value.

## Element finding

**Do not use MutationObserver.** It fires on every React render, framer-motion animation frame, and API-driven DOM update — potentially hundreds of times per second. The overhead is significant during tutorial use.

Instead, poll with `setTimeout`:

```ts
const tryFind = () => {
  if (cancelled) return;
  const el = getStepElement(currentSelector);
  if (el) {
    // scroll into view + compute position
  } else {
    attempts++;
    setTimeout(tryFind, 200);  // retry indefinitely — no cap
  }
};
tryFind();
return () => { cancelled = true; };
```

**No retry cap.** The old pattern `if (attempts < 30)` (6 seconds) misses elements that load from slow API responses. Remove the cap — the cleanup cancellation flag is sufficient to stop retrying when the step changes.

The `applyLift` effect should also retry indefinitely with its own 200ms timer when the target is not yet in the DOM.

## Scroll and resize handling

Throttle the scroll and resize handlers with `requestAnimationFrame`. Calling `computeRect` (which triggers floating-ui layout calculation) on every scroll pixel causes jank:

```ts
let rafId: number | null = null;
const throttled = () => {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => { rafId = null; computeRect(); });
};
window.addEventListener('resize', throttled);
window.addEventListener('scroll', throttled, true);
return () => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  window.removeEventListener('resize', throttled);
  window.removeEventListener('scroll', throttled, true);
};
```

## Keyboard behavior

- Enter performs `NEXT_MANUAL` only on manual/manual-highlight steps.
- **Tab to skip:** check the Tab shortcut BEFORE any early returns for `INPUT`/`TEXTAREA`. If you check for focused form controls first, Tab is silently swallowed when an input has focus:

```ts
const handleKeyDown = (e: KeyboardEvent) => {
  // Tab check MUST come before the input/textarea early return
  if (e.key === 'Tab' && nextTooltipVisible) {
    e.preventDefault();
    dispatchMachine({ type: 'STOP' });
    navigate('/dashboard');
    return;
  }
  if (target?.closest('.tutorial-email-form')) return;
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
  // ... Enter handler
};
```

- Ignore global Enter handler when focus is inside form controls (especially final-step email forms), otherwise submission gets swallowed.

## Data refresh after mutations

When the tutorial triggers a state mutation (edit ingredient, add food, sync recipe), always force-refresh to bypass any client-side cache TTL:

```ts
// Wrong — respects cache, change doesn't appear until TTL expires
refreshLogs();

// Correct — bypasses cache immediately after write
refreshLogs({ force: true });
```

## Date-range/calendar gotchas

For "change date range" steps:

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

- Modal/portal/async targets must use indefinite retry resolution (not retry-with-timeout).
- Event progression must be emitted from lifecycle truth points (mount/open/saved), not only click paths.
- Route/data fetch transitions must not progress until target is mounted and anchor is ready.

### Event integrity specs

- Deduplicate event listeners per run and remove on step change/unmount.
- Prevent stale listeners from prior tutorial runs via run/session id checks.
- Guard against double progression from duplicate events in the same frame.
- Ensure tutorial-mode layout toggles do not trigger duplicate progression events from remounts/rerenders.

### Interactivity lock specs

- `selector+event` lock must allow only intended target subtree interactions.
- Lock must preserve required interactions inside allowed subtree (inputs, date pickers, focus, keyboard navigation).
- Lock must not trap the user permanently; provide deterministic unlock on event or tutorial stop.

### Positioning and layering specs

- No first-frame tooltip flash at default coordinates; hide until anchored (`anchorReady`).
- Support nested scroll containers (not only window scroll) when auto-scrolling target into view.
- Handle stacking contexts (`transform`, `opacity`, `filter`, `backdrop-filter`, `position: fixed`) so target remains undimmed and visible above overlay.
- Tutorial card `z-index` must be `dimZIndex + 2` — never a hardcoded constant.
- Recompute placement on resize and scroll (RAF-throttled), and on step/route change.

### Sticky layout + dim overlay rule (required)

- Treat `position: sticky` containers as high-risk for tutorial dim behavior.
- If the tutorial uses ancestor-lifting (`z-index` raise) instead of overlay cutouts:
  - Lifting a target inside a sticky column can unintentionally undim the whole sticky pane.
  - Not lifting sticky ancestors can leave the target dimmed and unclickable.
- Recommended contract:
  - Keep sticky layout in normal app mode.
  - Disable sticky only while tutorial is active, using a global flag (for example `body[data-tutorial-active='true']`).
  - Re-enable sticky when tutorial stops.
- Apply the same tutorial-mode sticky override to all relevant sticky regions (left log pane, right dashboard panel), not just one container.

### Input and keyboard specs

- Tab shortcut check must come before `INPUT`/`TEXTAREA` early returns — see Keyboard behavior section.
- Tutorial must not swallow form submit/textarea behavior unexpectedly.
- Mobile keyboard/open viewport changes must not break placement or lock behavior.

### Calendar/date-range specs

- Range-change steps must not advance on first click of a two-click range selection.
- Advance only when range is complete and actually changed.
- Arrow/month navigation changes must also emit progression event where applicable.

## Styling spec (required)

- Define tutorial design tokens (overlay opacity, z-index layers, spacing, radii, font sizes, colors, motion durations/easings).
- Use one layering contract: `overlay` < `lifted target` < `tutorial card` (or documented equivalent). The card z-index must be computed dynamically — not hardcoded.
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

## tutorial_machine.ts — complete reference

```ts
// Step kinds derived from (selector, eventName, highlightOnly)
export type TutorialStepKind =
  | 'manual'            // no selector, no event → next/Enter
  | 'manual_highlight'  // selector, no event, highlightOnly=true → next/Enter
  | 'target_click'      // selector, no event, highlightOnly=false → click target
  | 'event_only'        // no selector, eventName → wait for event
  | 'target_and_event'  // selector + eventName → lock to target, wait for event
  | 'highlight_and_event'; // selector + eventName + highlightOnly → highlight, wait for event

// Derived helpers used in TryTutorial.tsx
export function canAdvanceManually(step: CompiledStep): boolean {
  return step.kind === 'manual' || step.kind === 'manual_highlight';
}
export function canAdvanceOnTargetClick(step: CompiledStep): boolean {
  return step.kind === 'target_click';
}
export function requiredEventName(step: CompiledStep): string | null {
  return step.eventName;
}
// Returns selector to lock interactions to, or null if no locking needed
export function lockedInteractionSelector(step: CompiledStep): string | null {
  return step.kind === 'target_and_event' ? step.selector : null;
}

// Machine state — keep minimal
export interface TutorialMachineState {
  isActive: boolean;
  stepIndex: number;
  runId: number;  // incremented on START, used to detect stale listeners
}

// Actions — no ROUTE_CHANGED
export type TutorialMachineAction =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'PREV' }
  | { type: 'NEXT_MANUAL' }
  | { type: 'TARGET_CLICK'; matchesCurrentTarget: boolean }
  | { type: 'APP_EVENT'; name: string };
```

## TutorialStyles.ts — UI component checklist

Create styled-components (or CSS modules) for each of these. Keep z-index out of the styled definitions — set it via `style` prop at render time:

| Component | Purpose |
|---|---|
| `TutorialDim` | `position: fixed; inset: 0; background: rgba(0,0,0,0.82); pointer-events: none; z-index: {dynamic}` |
| `TutorialText` | `position: fixed; max-width: 420px; backdrop-filter: blur(14px)` — NO hardcoded z-index |
| `TutorialMessage` | Typewriter text container — font, color, line-height |
| `TutorialNav` | `display: flex; justify-content: space-between` |
| `TutorialPrevBtn` | Ghost button, muted color |
| `TutorialNextBtn` | Ghost button, accent color, disabled state |
| `TutorialSkipBtn` | `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 2147483647` — max int, always on top |
| `LockedNextWrapper` | `position: relative; display: inline-flex` — wraps next button for tooltip positioning |
| `NextLockedOverlay` | `position: fixed; inset: 0; backdrop-filter: blur(6px); pointer-events: none` — shown on hover of disabled next |
| `NextLockedCard` | The "finish this step or press Tab to skip" message card |
| `TutorialMedia` | Container for step image/video |
| `TutorialMediaAsset` | `styled.img` with `as="video"` override — `width: 100%; object-fit: contain` |
| `TutorialEmailForm` | Final-step email capture form |
| `TutorialEmailInput` | Styled email input |

**`TutorialSkipBtn` z-index must be `2147483647`** (max 32-bit int). It must never be buried by any app modal.

## TryTutorial.tsx — render section reference

```tsx
if (!isActive) return null;

const cardZIndex = dimZIndex + 2;
const hideUntilAnchored = Boolean(currentSelector) && !anchorReady;
const tutorialCardStyle = hideUntilAnchored
  ? { ...cardStyle, visibility: 'hidden' as const, zIndex: cardZIndex }
  : { ...cardStyle, zIndex: cardZIndex };

return (
  <>
    <TutorialGlobalStyles />
    <TutorialSkipBtn onClick={skipTutorial}>skip tutorial →</TutorialSkipBtn>
    <TutorialDim style={{ zIndex: dimZIndex }} />

    {createPortal(
      <TutorialText
        ref={cardRef}
        key={currentStep}           // remount card on step change → resets typewriter
        $centered={!currentSelector}
        $hasMedia={!!currentMedia}
        style={tutorialCardStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <TutorialMessage>
          <Typewriter
            speed={0.1}
            variance="natural"
            play={!hideUntilAnchored}   // don't type while card is hidden
            replace="all"
          >
            {tutorialMessage}
          </Typewriter>
        </TutorialMessage>

        {/* Optional media */}
        {currentMedia && <TutorialMedia>...</TutorialMedia>}

        <TutorialNav>
          {currentStep > 0 && <TutorialPrevBtn onClick={prev}>previous</TutorialPrevBtn>}
          {!isLastStep && (
            <LockedNextWrapper
              onMouseEnter={() => { if (!canAdvanceManually) showNextTooltip(); }}
              onMouseLeave={hideNextTooltip}
            >
              <TutorialNextBtn onClick={canAdvanceManually ? next : undefined} disabled={!canAdvanceManually}>
                next
              </TutorialNextBtn>
              <AnimatePresence>
                {nextTooltipVisible && !canAdvanceManually && (
                  <NextLockedOverlay>
                    <NextLockedCard>
                      Finish the task to continue, or press <strong>Tab</strong> to skip.
                    </NextLockedCard>
                  </NextLockedOverlay>
                )}
              </AnimatePresence>
            </LockedNextWrapper>
          )}
          {isLastStep && <TutorialNextBtn onClick={next}>done</TutorialNextBtn>}
        </TutorialNav>
      </TutorialText>,
      document.body
    )}
  </>
);
```

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

1. Define `TutorialStep` model + machine reducer (no `ROUTE_CHANGED`).
2. Migrate current steps to object/class form.
3. Integrate machine into global tutorial runner.
4. Add event bus + lifecycle emitters in UI components.
5. Add interactivity lock and target lifting (`applyLift`).
6. Add `anchorReady` gating to prevent position flash.
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
- Tutorial card is visible above any app modal (z-index is `dimZIndex + 2`).
- Tab to skip works even when an input has focus.
- Data mutations during the tutorial immediately reflect in the UI (force-refresh cache).
- Target elements with `backdrop-filter` either have it removed or use event-only steps.
- In desktop split-pane layouts, tutorial keeps only intended target(s) undimmed, not an entire sticky pane.
- Sticky behavior returns to normal when tutorial ends.

## Minimal backend checks

- Confirm index exists on mailing list email.
- Confirm duplicate email returns idempotent success (`Already subscribed` or equivalent).
- Confirm admin listing endpoint is authorization-protected.
