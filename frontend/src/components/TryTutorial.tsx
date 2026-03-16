import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Typewriter } from 'motion-plus/react';
import { computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import { useLocation, useNavigate } from 'react-router-dom';
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
import nutritionLabelUrl from '../assets/images/nutrition_label.png';
import { AnimatePresence } from 'framer-motion';
import {
  TutorialGlobalStyles,
  TutorialDim,
  TutorialText,
  TutorialMessage,
  TutorialNav,
  TutorialMedia,
  TutorialMediaAsset,
  TutorialEmailForm,
  TutorialEmailInput,
  TutorialEmailFeedback,
  TutorialPrevBtn,
  TutorialNextBtn,
  LockedNextWrapper,
  NextLockedOverlay,
  NextLockedCard,
} from './TutorialStyles';
import startClaudeUrl from '../assets/start_claude.png';
import todayProgressUrl from '../assets/today_progress.png';
import improveRecipesUrl from '../assets/improve_recipes_1.png';

const steps: TutorialStep[] = [
  /** 
  new TutorialStep({
    message: 'Nutramap is a one-of-a-kind nutrition tracker designed for ease, accuracy, AND transparency.'
  }),
  new TutorialStep({
    message: 'Other nutrition trackers ask you to enter everything manually...',
    media: { type: 'video', src: '/traditional_trackers.mp4', autoPlay: true, loop: true, muted: true, controls: false },
  }),
  new TutorialStep({
    message: 'Or make a lot of hidden assumptions about how things are made.',
    media: { type: 'video', src: '/cal_ai.mp4', autoPlay: true, loop: true, muted: true, controls: false },
  }),
  new TutorialStep({ message: 'We built a search index over 2.7 million foods whose nutrition info is verified by the USDA...' }),
  new TutorialStep({ 
    message: 'And break your description into recipes with verified ingredients, so we can calculate your intake with unparalleled accuracy.',
    media: { type: 'video', src: '/nutramap_logging.mp4', autoPlay: true, loop: true, muted: true, controls: false }, 
  }),
  new TutorialStep({
    message: 'Nutramap is also the first-ever nutrition tracker to have an agentic interface. Use our binary or MCP server + skills file to turn your go-to LLM into an incredible nutritionist.',
    media: { type: 'image', src: startClaudeUrl },
    link: { label: 'install from our GitHub →', url: 'https://github.com/divyavenn/nutramap' },
  }),
  new TutorialStep({
    message: 'It can log your meals, track your progress, and take the mental load of deciding what to eat off your mind.',
    media: { type: 'image', src: todayProgressUrl },
  }),
  new TutorialStep({
    message: "It'll even tell you how to tweak what you already eat to reach your goals better.",
    media: { type: 'image', src: improveRecipesUrl },
  }),
  new TutorialStep({
    message: "Start by logging a meal. Describe what you ate, like 'matcha latte yesterday' or '500 grams of chocolate and 2 scoops of collagen powder.'",
    selector: '.form-elements-wrapper',
    eventName: 'tutorial:log-created',
  }),
  new TutorialStep({
    message: 'Most people have go-to meals they eat over and over, so every recipe is automatically stored here.',
    selector: 'a[href="/myrecipes"]',
  }),
  new TutorialStep({
    message: 'Recipes are easy to edit. Click on one.',
    selector: '.recipe-card',
    eventName: 'tutorial:recipe-opened',
  }),
  new TutorialStep({
    message: "You can edit or add any ingredient and its amount (in natural language). We'll convert measurements like 1 tsp or 1 pinch to grams, but if you want you can whip out a kitchen scale and edit the exact gram amount as well.",
    selector: '.recipe-detail-modal .ingredients-section',
    eventName: 'tutorial:ingredient-edited',
  }),
  new TutorialStep({
    message: 'Now close to save your changes. Going forward this recipe - the one you checked and edited - is what we use.',
    selector: '.recipe-detail-modal .modal-close-x',
    eventName: 'tutorial:sync-shown',
  }),
  new TutorialStep({
    message: 'Decide if you want to update all previous logs with this recipe as well.',
    selector: '.confirm-modal',
    eventName: 'tutorial:recipe-synced',
  }),
  new TutorialStep({
    message: 'you can also add custom foods by typing in a description or uploading a picture of a nutrition label.',
    selector: 'a[href="/myfoods"]',
  }),
  new TutorialStep({
    message: 'The nutrition label for some cookies is copied to your clipboard. Type in "chocolate chip cookies" + the Paste shortcut.',
    selector: '.form-elements-wrapper',
    eventName: 'tutorial:food-created',
    media: { type: 'image', src: nutritionLabelUrl },
  }),
  new TutorialStep({
    message: 'Now return home.',
    selector: '.tutorial-home-link',
  }),
  new TutorialStep({
    message: "Home cooks usually improvise based on what's available...",
  }),
  new TutorialStep({
    message: 'So you can also change an individual meal without updating the default recipe.',
  }),
  new TutorialStep({
    message: 'click on a meal name to see the linked recipe',
    selector: '.tutorial-recipe-name-link',
    eventName: 'tutorial:recipe-opened',
  }),
  new TutorialStep({
    message: 'And click unlink.',
    selector: '.recipe-detail-modal',
    eventName: 'tutorial:recipe-unlinked',
  }),
  new TutorialStep({
    message: 'Toggle the meal to view and edit its ingredients directly',
    selector: '.tutorial-meal-without-recipe',
    eventName: 'tutorial:meal-expanded',
  }),
  new TutorialStep({
    message: 'Try substituting an ingredient!',
    selector: '.tutorial-meal-components',
    eventName: 'tutorial:component-added',
  }),
  **/
  new TutorialStep({
    message: 'our nutrition dashboard helps you compare your progress towards your nutrition goals today...',
    selector: '.progress-bar-container',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'with your monthly average.',
    selector: '.avg-intake',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'We have 72+ nutrients in our database, everything from protein to PUFAs.',
    selector: '.nutrient-dashboard',
    highlightOnly: true,
  }),
  new TutorialStep({
    message: 'Click on the edit button to track another nutrient',
    selector: '.tutorial-nutrient-edit-button',
    eventName: 'tutorial:editing-panel',
  }),
  new TutorialStep({
    message: 'And add or change a requirement',
    selector: '.nutrient-edit-list-wrapper',
    eventName: 'tutorial:nutrient-added',
  }),
  new TutorialStep({
    message: "Nutramap is currently just a proof of concept. if you'd like to see it on the App Store, enter your email!",
  }),
];

const TUTORIAL_ACTIVE_ATTR = 'data-tutorial-active';
const TUTORIAL_APP_EVENT = 'tutorial:app-event';

// Step index of the clipboard-paste step (used to trigger clipboard copy)
const PASTE_STEP = steps.findIndex((s) => s.message.includes('Paste shortcut'));

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
  const navigate = useNavigate();
  const [machineState, setMachineState] = useRecoilState(tutorialMachineAtom);
  const currentStep = Math.max(0, Math.min(machineState.stepIndex, steps.length - 1));
  const isActive = machineState.isActive;
  const currentCompiledStep = getCompiledStep(steps, currentStep);
  const currentSelector = currentCompiledStep.selector;
  const canAdvanceManually = canAdvanceManuallyForStep(currentCompiledStep);
  const interactionLockSelector = lockedInteractionSelector(currentCompiledStep);
  const currentMedia = currentCompiledStep.media;
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardStyle, setCardStyle] = useState<CSSProperties>({});
  const [anchorReady, setAnchorReady] = useState(false);
  const [mailingEmail, setMailingEmail] = useState('');
  const [mailingStatus, setMailingStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [nextTooltipVisible, setNextTooltipVisible] = useState(false);
  const nextTooltipVisibleRef = useRef(false);
  const canAdvanceManuallyRef = useRef(canAdvanceManually);
  const machineRef = useRef(machineState);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const setDateRange = useSetRecoilState(dateRangeAtom);
  const setRangeType = useSetRecoilState(rangeTypeAtom);
  const wasActiveRef = useRef(false);

  const dispatchMachine = useCallback((action: TutorialMachineAction) => {
    setMachineState((prev) => reduceTutorialState(prev, action, steps));
  }, [setMachineState]);

  // Keep refs in sync with state for event handlers with stable subscriptions.
  useEffect(() => { machineRef.current = machineState; }, [machineState]);
  useEffect(() => { canAdvanceManuallyRef.current = canAdvanceManually; }, [canAdvanceManually]);

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
      : ['bottom', 'top', 'left', 'right'];

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
      if (style.position === 'fixed') return true;
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
        if (attempt < 30) {
          retryTimer = window.setTimeout(() => applyLift(attempt + 1), 200);
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
  useEffect(() => {
    if (!isActive) return;
    if (currentCompiledStep.kind !== 'target_click' || !currentSelector) return;
    const handler = (e: MouseEvent) => {
      const clickTarget = e.target as Element | null;
      if (!clickTarget) return;
      if (!clickTarget.closest(currentSelector)) return;

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

  // Interactivity rule
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

  // Scroll target into view then compute rect
  useEffect(() => {
    if (!isActive) return;
    if (!currentSelector) { computeRect(); return; }

    let cancelled = false;
    let attempts = 0;
    const tryFind = () => {
      if (cancelled) return;
      const el = getStepElement(currentSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!inView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(computeRect, inView ? 0 : 400);
      } else if (attempts < 30) {
        attempts++;
        setTimeout(tryFind, 200);
      }
    };
    tryFind();
    return () => { cancelled = true; };
  }, [computeRect, currentSelector, getStepElement, isActive, location.pathname]);

  // MutationObserver fallback: if the target element appears after the retry
  // window (e.g. data loaded from API), re-trigger positioning immediately.
  useEffect(() => {
    if (!isActive || !currentSelector || anchorReady) return;

    const observer = new MutationObserver(() => {
      const el = getStepElement(currentSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!inView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(computeRect, inView ? 0 : 400);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isActive, currentSelector, anchorReady, getStepElement, computeRect]);

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

  // Pressing Enter advances narrative steps; Tab while locked-next tooltip is open skips tutorial.
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest('.tutorial-email-form')) return;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Tab' && nextTooltipVisibleRef.current) {
        e.preventDefault();
        dispatchMachine({ type: 'STOP' });
        navigate('/dashboard');
      } else if (e.key === 'Enter') {
        if (canAdvanceManuallyRef.current) {
          setNextTooltipVisible(false);
          nextTooltipVisibleRef.current = false;
          dispatchMachine({ type: 'NEXT_MANUAL' });
        } else {
          const next = !nextTooltipVisibleRef.current;
          setNextTooltipVisible(next);
          nextTooltipVisibleRef.current = next;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatchMachine, isActive, navigate]);

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

  return (
    <>
      <TutorialGlobalStyles />
      <TutorialDim />

      {createPortal(
        <TutorialText
          ref={cardRef}
          key={currentStep}
          $centered={!currentSelector}
          $hasMedia={!!currentMedia}
          style={tutorialCardStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <TutorialMessage>
            <Typewriter
              speed={.1}
              variance="natural"
              play={!hideUntilAnchored}
              replace="all"
              cursorClassName="tutorial-typewriter-cursor"
              textClassName="tutorial-typewriter-text"
              aria-label={tutorialMessage}
            >
              {tutorialMessage}
            </Typewriter>
          </TutorialMessage>
          {currentCompiledStep.link && (
            <a
              href={currentCompiledStep.link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 10,
                fontFamily: 'Inconsolata, monospace',
                fontSize: 17,
                color: 'oklch(0.637 0.185 295 / 80%)',
                textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'oklch(0.637 0.185 295)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'oklch(0.637 0.185 295 / 80%)';
              }}
            >
              {currentCompiledStep.link.label}
            </a>
          )}
          {isLastStep && mailingStatus !== 'success' && (
            <TutorialEmailForm className="tutorial-email-form" onSubmit={handleMailingSubmit}>
              <TutorialEmailInput
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
              {mailingStatus === 'error' && (
                <TutorialEmailFeedback $error>could not save email. try again.</TutorialEmailFeedback>
              )}
            </TutorialEmailForm>
          )}
          {currentMedia && (
            <TutorialMedia
              key={currentMedia.src}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.2 }}
            >
              {currentMedia.type === 'image' ? (
                <TutorialMediaAsset
                  src={currentMedia.src}
                  alt={currentMedia.alt}
                />
              ) : (
                <TutorialMediaAsset
                  as="video"
                  src={currentMedia.src}
                  poster={currentMedia.poster}
                  autoPlay={currentMedia.autoPlay ?? true}
                  loop={currentMedia.loop ?? true}
                  muted={currentMedia.muted ?? true}
                  controls={currentMedia.controls ?? false}
                  playsInline
                />
              )}
            </TutorialMedia>
          )}
          <TutorialNav>
            {currentStep > 0 && (
              <TutorialPrevBtn onClick={prev}>
                previous
              </TutorialPrevBtn>
            )}
            {!isLastStep && (
              <LockedNextWrapper
                onMouseEnter={() => { if (!canAdvanceManually) { setNextTooltipVisible(true); nextTooltipVisibleRef.current = true; } }}
                onMouseLeave={() => { setNextTooltipVisible(false); nextTooltipVisibleRef.current = false; }}
              >
                <TutorialNextBtn
                  onClick={canAdvanceManually ? next : undefined}
                  disabled={!canAdvanceManually}
                >
                  next
                </TutorialNextBtn>
                <AnimatePresence>
                  {nextTooltipVisible && !canAdvanceManually && (
                    <NextLockedOverlay
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <NextLockedCard
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 10 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      >
                        Finish the task to continue, or press <strong>Tab</strong> to skip the tutorial and explore on your own.
                      </NextLockedCard>
                    </NextLockedOverlay>
                  )}
                </AnimatePresence>
              </LockedNextWrapper>
            )}
            {isLastStep && canAdvanceManually && (
              <TutorialNextBtn onClick={next}>done</TutorialNextBtn>
            )}
          </TutorialNav>
        </TutorialText>,
        document.body
      )}
    </>
  );
}
