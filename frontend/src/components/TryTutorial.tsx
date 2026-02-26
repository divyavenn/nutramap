import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Typewriter } from 'motion-plus/react';
import { computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import { useLocation } from 'react-router-dom';
import { useRecoilState, useSetRecoilState } from 'recoil';
import {
  TutorialStep,
  canAdvanceManually as canAdvanceManuallyForStep,
  getCompiledStep,
  lockedInteractionSelector,
  reduceTutorialState,
  tutorialMachineAtom,
  type TutorialMachineAction,
} from './tutorial_machine';
import { dateRangeAtom, rangeTypeAtom } from './dashboard_states';
import { getCurrentPeriod, RangeType } from './structures';
import { request } from './endpoints';
import '../assets/css/tutorial.css';
import nutritionLabelUrl from '../assets/images/nutrition_label.png';

const steps: TutorialStep[] = [
  /** 
new TutorialStep({
    message: 'start by logging a meal. describe what you ate, like \'matcha latte yesterday\' or \'500 grams of chocolate and 2 scoops of collagen powder.\'',
    selector: '.form-elements-wrapper',
    eventName: 'tutorial:log-created',
  }),
  new TutorialStep({ message: 'other nutrition trackers ask you to enter everything manually...', selector: '.log-list', highlightOnly: true }),
  new TutorialStep({ message: 'or make a lot of hidden assumptions about how things are made.', selector: '.log-list', highlightOnly: true }),
  new TutorialStep({ message: 'we store your meals as recipes. each recipe consists of ingredients whose nutrition info is verified by the USDA.', selector: '.log-list', highlightOnly: true }),
  **/
  new TutorialStep({
    message: 'click on the meal to edit it.',
    selector: '.tutorial-meal-header',
    eventName: 'tutorial:log-clicked',
  }), 
  new TutorialStep({
    message: 'click the name of meal to see the linked recipe card',
    selector: '.tutorial-recipe-name-link',
    eventName: 'tutorial:recipe-opened',
  }),
  new TutorialStep({
    message: 'Recipes are easy to edit. Try tweaking the ingredients, amounts....even the exact weight conversions (for people who like exact metrics and own kitchen scales)',
    selector: '.recipe-detail-modal .ingredients-section',
    eventName: 'tutorial:ingredient-edited',
  }),
  new TutorialStep({
    message: 'Home cooks usually improvise based on what\'s available. To change the components for this meal without changing the original recipe, simply unlink the recipe using this button.',
    selector: '.confirm-modal',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'Now close the recipe or click anywhere outside it to save your changes.',
    selector: '.recipe-detail-modal .modal-close-x',
    eventName: 'tutorial:sync-shown',
  }),
  new TutorialStep({
    message: 'Decide if you want to update all previous entries for this recipe or only use the new version going forward.',
    selector: '.confirm-modal',
    eventName: 'tutorial:recipe-synced',
  }),
  new TutorialStep({
    message: 'most people have go-to meals they eat over and over, so all recipes are automatically stored here',
    selector: 'a[href="/myrecipes"]',
  }),
  new TutorialStep({
    message: 'you can also add custom foods by typing in a description or uploading a picture of a nutrition label.',
    selector: 'a[href="/myfoods"]',
  }),
  new TutorialStep({
    message: 'The nutrition label for some cookies is copied to your clipboard. Type in "chocolate chip cookies" + the Paste shortcut.',
    selector: '.form-elements-wrapper',
    eventName: 'tutorial:food-created',
  }),
  new TutorialStep({
    message: 'Your new food item will now be used in recipes and meals!',
    selector: '.food-tag',
    eventName: 'tutorial:food-tag-clicked',
  }),
  new TutorialStep({
    message: 'The custom food feature lets you log any vitamins you take, unlike most tracking apps. After all, too much of a nutrient can be as bad as too little.',
    selector: '.tutorial-food-detail-modal',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'Now return home.',
    selector: '.tutorial-home-link',
  }),
  new TutorialStep({
    message: 'our nutrition dashboard compares your progress towards your nutrition goals today..',
    selector: '.today-stats-wrapper .progress-bar-container',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'with your monthly average.',
    selector: '.avg-stats-wrapper .avg-intake',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'Click on the date divider to see a different day\'s stats...',
    selector: '.tutorial-day-button',
    eventName: 'tutorial:day-changed',
  }),
  new TutorialStep({
    message: 'and hover to see the stats for a specific food.',
    selector: '.log-list',
    eventName: 'tutorial:log-hovered',
  }),
  new TutorialStep({
    message: 'Click the arrows or the date to see your average intake for a different time period',
    selector: '.dashboard-menu',
    eventName: 'tutorial:range-changed',
  }),
  new TutorialStep({
    message: 'Click the edit button on the panel to change the dashboard settings',
    selector: '.tutorial-nutrient-edit-button',
    eventName: 'tutorial:editing-panel',
  }),
  new TutorialStep({
    message: 'Try adding a nutrient to track.',
    selector: '.nutrient-edit-list-wrapper',
    eventName: 'tutorial:nutrient-added',
  }),
  new TutorialStep({
    message: 'We have 72+ nutrients in our database, everything from protein to PUFAs.',
    selector: '.nutrient-dashboard',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'foodPanelAI is currently just a proof of concept. if you\'d like to see it on the App Store, enter your email!',
  }),
];

const TUTORIAL_ACTIVE_ATTR = 'data-tutorial-active';
const TUTORIAL_APP_EVENT = 'tutorial:app-event';

// Step index of the "try pressing Command+V" step
const PASTE_STEP = steps.findIndex((s) => s.message.includes('Command+V'));

type TutorialMediaAsset =
  | { type: 'image'; src: string; alt: string }
  | {
      type: 'video';
      src: string;
      poster?: string;
      autoPlay?: boolean;
      loop?: boolean;
      muted?: boolean;
      controls?: boolean;
    };

const tutorialMediaByStep: Record<number, TutorialMediaAsset> = {};
if (PASTE_STEP >= 0) {
  tutorialMediaByStep[PASTE_STEP] = {
    type: 'image',
    src: nutritionLabelUrl,
    alt: 'Sample nutrition label',
  };
}

/** Load the sample nutrition label image and copy it to the clipboard */
async function copyNutritionLabelToClipboard() {
  try {
    const response = await fetch(nutritionLabelUrl);
    const blob = await response.blob();
    // Ensure it's typed as image/png for the Clipboard API
    const pngBlob = new Blob([blob], { type: 'image/png' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ]);
  } catch (err) {
    console.warn('Could not copy nutrition label to clipboard:', err);
  }
}

/** Dispatch a tutorial event only if the tutorial is currently active */
export function tutorialEvent(name: string) {
  if (document.body.getAttribute(TUTORIAL_ACTIVE_ATTR) === 'true') {
    window.dispatchEvent(new CustomEvent(TUTORIAL_APP_EVENT, { detail: { name } }));
    window.dispatchEvent(new Event(name));
  }
}

export default function TryTutorial() {
  const location = useLocation();
  const [machineState, setMachineState] = useRecoilState(tutorialMachineAtom);
  const currentStep = Math.max(0, Math.min(machineState.stepIndex, steps.length - 1));
  const isActive = machineState.isActive;
  const currentCompiledStep = getCompiledStep(steps, currentStep);
  const currentSelector = currentCompiledStep.selector;
  const canAdvanceManually = canAdvanceManuallyForStep(currentCompiledStep);
  const interactionLockSelector = lockedInteractionSelector(currentCompiledStep);
  const currentMedia = tutorialMediaByStep[currentStep] ?? null;
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardStyle, setCardStyle] = useState<CSSProperties>({});
  const [anchorReady, setAnchorReady] = useState(false);
  const [mailingEmail, setMailingEmail] = useState('');
  const [mailingStatus, setMailingStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const machineRef = useRef(machineState);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const setDateRange = useSetRecoilState(dateRangeAtom);
  const setRangeType = useSetRecoilState(rangeTypeAtom);
  const wasActiveRef = useRef(false);

  const dispatchMachine = useCallback((action: TutorialMachineAction) => {
    setMachineState((prev) => reduceTutorialState(prev, action, steps));
  }, [setMachineState]);

  // Keep ref in sync with state for event handlers with stable subscriptions.
  useEffect(() => { machineRef.current = machineState; }, [machineState]);

  // Reset date range back to current period when the tutorial ends.
  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      setDateRange(getCurrentPeriod());
      setRangeType(RangeType.default);
    }
    wasActiveRef.current = isActive;
  }, [isActive, setDateRange, setRangeType]);

  useEffect(() => {
    dispatchMachine({ type: 'ROUTE_CHANGED', path: location.pathname });
  }, [dispatchMachine, location.pathname]);

  useEffect(() => {
    if (isActive) {
      document.body.setAttribute(TUTORIAL_ACTIVE_ATTR, 'true');
    } else {
      document.body.removeAttribute(TUTORIAL_ACTIVE_ATTR);
    }

    return () => {
      document.body.removeAttribute(TUTORIAL_ACTIVE_ATTR);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      setAnchorReady(false);
      return;
    }
    setAnchorReady(!currentSelector);
  }, [isActive, currentStep, currentSelector]);

  const getStepElement = useCallback((selector: string | null) => {
    if (!selector) return null;
    const candidates = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    return candidates.find((el) => el.getClientRects().length > 0) ?? null;
  }, []);

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
      setAnchorReady(false);
      return;
    }

    const cardWidth = Math.min(360, window.innerWidth * 0.4);
    cardEl.style.width = `${cardWidth}px`;

    const isHeaderIcon = currentSelector.includes('.tutorial-home-link') || currentSelector.includes('a[href="/');
    const placement = isHeaderIcon ? 'bottom-end' : 'right';
    const fallbackPlacements: Placement[] = isHeaderIcon
      ? ['bottom', 'left', 'top', 'right']
      : ['left', 'bottom', 'top', 'right'];

    const { x, y } = await computePosition(targetEl, cardEl, {
      strategy: 'fixed',
      placement,
      middleware: [
        offset(30),
        flip({ fallbackPlacements }),
        shift({ padding: 12 }),
      ],
    });

    setCardStyle({
      width: cardWidth,
      left: x,
      top: y,
      right: 'auto',
      transform: 'none',
    });
    setAnchorReady(true);
  }, [currentSelector, getStepElement]);

  const computeRect = useCallback(() => {
    if (!currentSelector) {
      setTargetRect(null);
      void computeCardPosition();
      return;
    }
    const el = getStepElement(currentSelector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
    void computeCardPosition();
  }, [computeCardPosition, currentSelector, getStepElement]);

  // Listen for 'start-tutorial' event from anywhere in the app
  useEffect(() => {
    const handler = () => {
      if (machineRef.current.isActive) return;
      dispatchMachine({ type: 'START' });
    };
    window.addEventListener('start-tutorial', handler);
    return () => window.removeEventListener('start-tutorial', handler);
  }, [dispatchMachine]);

  // Copy a sample nutrition label to clipboard at the paste step
  useEffect(() => {
    if (isActive && currentStep === PASTE_STEP && PASTE_STEP >= 0) {
      copyNutritionLabelToClipboard();
    }
  }, [isActive, currentStep]);

  // Recompute tooltip placement after each step render.
  useEffect(() => {
    if (!isActive) return;
    void computeCardPosition();
  }, [isActive, currentStep, computeCardPosition]);


  // Keep the active target above the dim overlay.
  // The dim is rendered inline (inside VantaBackground's stacking context), so lifting
  // stacking-context ancestors within that same context makes the target pop above the dim.
  useEffect(() => {
    if (!isActive) return;
    if (!currentSelector) return;

    const lifted: Array<{ node: HTMLElement; position: string; zIndex: string }> = [];
    const overlayZ = 2000;
    let retryTimer: number | null = null;

    const resetLift = () => {
      for (const item of lifted) {
        item.node.style.position = item.position;
        item.node.style.zIndex = item.zIndex;
      }
      lifted.length = 0;
    };

    const lift = (node: HTMLElement, ensurePosition: boolean) => {
      lifted.push({ node, position: node.style.position, zIndex: node.style.zIndex });
      const computed = getComputedStyle(node);
      if (ensurePosition && computed.position === 'static') {
        node.style.position = 'relative';
      }
      node.style.zIndex = String(overlayZ + 1);
    };

    const createsStackingContext = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      if (style.position === 'fixed' || style.position === 'sticky') return true;
      if (style.zIndex !== 'auto' && style.position !== 'static') return true;
      if (style.opacity !== '1') return true;
      if (style.transform !== 'none') return true;
      if (style.filter !== 'none') return true;
      if (style.perspective !== 'none') return true;
      if (style.isolation === 'isolate') return true;
      if (style.mixBlendMode !== 'normal') return true;
      return false;
    };

    const applyLift = (attempt = 0) => {
      resetLift();
      const el = getStepElement(currentSelector);
      if (!el) {
        if (attempt < 12) {
          retryTimer = window.setTimeout(() => applyLift(attempt + 1), 120);
        }
        return;
      }
      lift(el, true);
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (createsStackingContext(parent)) lift(parent, false);
        parent = parent.parentElement;
      }
    };

    applyLift();

    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      resetLift();
    };
  }, [currentSelector, getStepElement, isActive, location.pathname, targetRect]);

  // Advance on click when step has a selector but no event.
  // Defer step changes so route-changing link handlers run first.
  useEffect(() => {
    if (!isActive) return;
    if (currentCompiledStep.kind !== 'target_click' || !currentSelector) return;
    const handler = (e: MouseEvent) => {
      const clickTarget = e.target as Element | null;
      if (!clickTarget) return;
      if (!clickTarget.closest(currentSelector)) return;

      // Let link/navigation handlers run first so route-changing steps still navigate.
      window.setTimeout(() => {
        dispatchMachine({ type: 'TARGET_CLICK', matchesCurrentTarget: true });
      }, 0);
    };

    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [currentCompiledStep.kind, currentSelector, dispatchMachine, isActive]);

  // Advance when the app emits tutorial events.
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ name?: string }>;
      const eventName = custom.detail?.name;
      if (!eventName) return;
      dispatchMachine({ type: 'APP_EVENT', name: eventName });
    };
    window.addEventListener(TUTORIAL_APP_EVENT, handler as EventListener);
    return () => window.removeEventListener(TUTORIAL_APP_EVENT, handler as EventListener);
  }, [dispatchMachine, isActive]);

  // Interactivity rule: if a step has both selector + event, only the selected
  // element can be interacted with until the event is emitted.
  useEffect(() => {
    if (!isActive) return;
    if (!interactionLockSelector) return;

    const block = (e: Event) => {
      const target = e.target as Element | null;
      if (target && target.closest(interactionLockSelector)) return;
      e.preventDefault();
      e.stopPropagation();
      if ('stopImmediatePropagation' in e && typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener('pointerdown', block, true);
    document.addEventListener('click', block, true);
    document.addEventListener('focusin', block, true);

    return () => {
      document.removeEventListener('pointerdown', block, true);
      document.removeEventListener('click', block, true);
      document.removeEventListener('focusin', block, true);
    };
  }, [interactionLockSelector, isActive]);

  // Scroll target into view then compute rect (retry if element not yet mounted)
  useEffect(() => {
    if (!isActive) return;
    if (!currentSelector) { computeRect(); return; }

    let cancelled = false;
    let attempts = 0;
    const tryFind = () => {
      if (cancelled) return;
      const el = getStepElement(currentSelector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(computeRect, 400);
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryFind, 200);
      }
    };
    tryFind();
    return () => { cancelled = true; };
  }, [computeRect, currentSelector, getStepElement, isActive, location.pathname]);

  // Recalculate on resize/scroll
  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('resize', computeRect);
    window.addEventListener('scroll', computeRect, true);
    return () => {
      window.removeEventListener('resize', computeRect);
      window.removeEventListener('scroll', computeRect, true);
    };
  }, [isActive, computeRect]);

  // Pressing Enter attempts manual progression for narrative steps.
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest('.tutorial-email-form')) return;
      if (e.key === 'Enter') {
        dispatchMachine({ type: 'NEXT_MANUAL' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatchMachine, isActive]);

  const prev = () => {
    dispatchMachine({ type: 'PREV' });
  };

  const next = () => {
    if (
      isLastStep &&
      mailingEmail.trim() &&
      mailingStatus !== 'success' &&
      mailingStatus !== 'submitting'
    ) {
      void submitMailingEmail();
      return;
    }
    dispatchMachine({ type: 'NEXT_MANUAL' });
  };

  const submitMailingEmail = async () => {
    if (!mailingEmail.trim() || mailingStatus === 'submitting') return;
    setMailingStatus('submitting');
    try {
      const response = await request(
        '/user/mailing-list/subscribe',
        'POST',
        { email: mailingEmail.trim() },
        'JSON',
        false
      );
      if (response.status >= 200 && response.status < 300) {
        setMailingStatus('success');
      } else {
        setMailingStatus('error');
      }
    } catch (error) {
      setMailingStatus('error');
    }
  };

  const handleMailingSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submitMailingEmail();
  };

  if (!isActive) return null;

  const isLastStep = currentStep === steps.length - 1;
  const isFinalEmailSubmitted = isLastStep && mailingStatus === 'success';
  const hideUntilAnchored = Boolean(currentSelector) && !anchorReady;
  const tutorialMessage = isFinalEmailSubmitted
    ? 'thank you, stay tuned'
    : (hideUntilAnchored ? '' : currentCompiledStep.message);
  const tutorialCardStyle: CSSProperties = hideUntilAnchored
    ? { ...cardStyle, visibility: 'hidden' }
    : cardStyle;

  // The dim is rendered inline (not portaled) so it sits inside VantaBackground's
  // stacking context, where the lift effect can raise the target element above it.
  // Only the card is portaled to document.body so it appears above modals.
  return (
    <>
      <div className="tutorial-dim" />

      {createPortal(<motion.div
        ref={cardRef}
        key={currentStep}
        className={`tutorial-text${currentSelector ? '' : ' centered'}`}
        style={tutorialCardStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="tutorial-message">
          <Typewriter
            speed={15}
            variance="natural"
            play={!hideUntilAnchored}
            replace="all"
            cursorClassName="tutorial-typewriter-cursor"
            textClassName="tutorial-typewriter-text"
            aria-label={tutorialMessage}
          >
            {tutorialMessage}
          </Typewriter>
        </div>
        {isLastStep && mailingStatus !== 'success' && (
          <form className="tutorial-email-form" onSubmit={handleMailingSubmit}>
            <input
              className="tutorial-email-input"
              type="email"
              placeholder="you@example.com"
              value={mailingEmail}
              onChange={(e) => {
                setMailingEmail(e.target.value);
                if (mailingStatus !== 'idle') setMailingStatus('idle');
              }}
              required
            />
            <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            {mailingStatus === 'error' && <div className="tutorial-email-feedback error">could not save email. try again.</div>}
          </form>
        )}
        {currentMedia && (
          <div className="tutorial-media">
            {currentMedia.type === 'image' ? (
              <img
                src={currentMedia.src}
                alt={currentMedia.alt}
                className="tutorial-media-asset"
              />
            ) : (
              <video
                src={currentMedia.src}
                poster={currentMedia.poster}
                autoPlay={currentMedia.autoPlay ?? true}
                loop={currentMedia.loop ?? true}
                muted={currentMedia.muted ?? true}
                controls={currentMedia.controls ?? false}
                playsInline
                className="tutorial-media-asset"
              />
            )}
          </div>
        )}
        <div className="tutorial-nav">
          {currentStep > 0 && (
            <button className="tutorial-prev-btn" onClick={prev}>
              previous
            </button>
          )}
          {canAdvanceManually && (
            <button className="tutorial-next-btn" onClick={next}>
              {isLastStep ? 'done' : 'next'}
            </button>
          )}
        </div>
      </motion.div>,
      document.body
    )}
    </>
  );
}
