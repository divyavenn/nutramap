import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import Joyride, {
  ACTIONS,
  EVENTS,
  STATUS,
  type CallBackProps,
  type Step,
} from 'react-joyride';
import nutritionLabelUrl from '../assets/images/nutrition_label.png';

type TutorialStep = [ReactNode, string | null, string | null];

const TUTORIAL_ACTIVE_ATTR = 'data-tutorial-active';
const START_TUTORIAL_EVENT = 'start-tutorial';

// [message/content, css selector, event to advance]
// null selector = centered step, null event = advance on target click or next/prev buttons
const steps: TutorialStep[] = [
  ['You can see all your recipes here.', 'a[href="/myrecipes"]', null],
  ['Now go back the main page...', '.tutorial-home-link', null],
  ['type what you ate in natural language. anything from \'I ate goldfish yesterday\' to \'today I ate 500 grams of chocolate and 2 scoops of collagen powder.\'', '.form-elements-wrapper', 'tutorial:log-created'],
  ['most people have go-to meals they eat over and over. we break down what you ate into recipes and automatically store them.', '.log-list', null],
  ['other nutrition trackers ask you to enter everything manually...', null, null],
  ['or make a lot of hidden assumptions about how things are made.', null, null],
  ['click a meal to see the linked recipe card', '.recipe-bubble', null],
  ['every recipe is a combination of food items whose nutrition info is verified by the USDA.', null, null],
  ['You can easily edit ingredients, amounts, even exact weight conversions.', '.recipe-detail-modal', 'tutorial:ingredient-edited'],
  ['Now close the recipe to save your changes.', '.recipe-detail-modal', 'tutorial:sync-shown'],
  ['Either update all previous times you used the recipe or only use the new version going forward.', '.confirm-modal', 'tutorial:recipe-synced'],
  ['You can see all your recipes here.', 'a[href="/myrecipes"]', null],
  ['Now go back the main page...', '.tutorial-home-link', null],
  ['and type in one cup matcha latte.', '.form-elements-wrapper', 'tutorial:log-created'],
  ['You\'ll see it identifies and uses the recipe instantly.', '.log-list', null],
  ['you can also add custom foods by typing in a description or uploading a picture of a nutrition label.', 'a[href="/myfoods"]', null],
  ['try typing in a food name and pressing Command+V.', '.form-elements-wrapper', 'tutorial:food-created'],
  ['this makes it easy to also log any supplements you may take.', 'a[href="/myfoods"]', null],
  ['most nutrition trackers don\'t let you log supplements, but getting too much of a nutrient can be just as damaging as getting not enough.', 'a[href="/myfoods"]', null],
  ['our nutrition dashboard makes it easy to see if you\'re on track with your nutrition goals. it shows what you\'ve eaten today as well as your monthly average.', '.nutrient-dashboard', null],
  ['you can easily see the nutrition data for a different day...', '.dashboard-menu', 'tutorial:day-changed'],
  ['or a specific food.', '.log-list', 'tutorial:log-hovered'],
  ['or change the time period the average is calculated over.', '.dashboard-menu', 'tutorial:range-changed'],
  ['you can adjust your nutritional goals clicking the edit button on the panel.', '.nutrient-dashboard', 'tutorial:editing-panel'],
  ['Try adding a nutrient to track.', '.nutrient-edit-list-wrapper', 'tutorial:nutrient-added'],
  ['we have 72+ nutrients you can track, everything from protein to PUFAs.', '.nutrient-dashboard', null],
  ['foodPanelAI is currently just a proof of concept. if you\'d like to see it on the App Store, enter your email!', null, null],
];

// Step index of the "try pressing Command+V" step
const PASTE_STEP = steps.findIndex(
  ([content]) => typeof content === 'string' && content.includes('Command+V')
);

/** Load the sample nutrition label image and copy it to the clipboard */
async function copyNutritionLabelToClipboard() {
  try {
    const response = await fetch(nutritionLabelUrl);
    const blob = await response.blob();
    const pngBlob = new Blob([blob], { type: 'image/png' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob }),
    ]);
  } catch (err) {
    console.warn('Could not copy nutrition label to clipboard:', err);
  }
}

function TypewriterText({ text }: { text: string }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index += 1;
      } else {
        clearInterval(interval);
      }
    }, 12);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayedText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.7, ease: 'easeInOut' }}
        style={{ color: 'rgba(168, 85, 247, 0.9)' }}
      >
        |
      </motion.span>
    </span>
  );
}

function renderStepContent(content: ReactNode) {
  if (typeof content === 'string') {
    return <TypewriterText text={content} />;
  }
  if (typeof content === 'number') {
    return <TypewriterText text={String(content)} />;
  }
  return content;
}

/** Dispatch a tutorial event only if the tutorial is currently active */
export function tutorialEvent(name: string) {
  if (document.body.getAttribute(TUTORIAL_ACTIVE_ATTR) === 'true') {
    window.dispatchEvent(new Event(name));
  }
}

export default function TryTutorial() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const isActiveRef = useRef(false);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const finish = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
  }, []);

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= steps.length - 1) {
        setIsActive(false);
        return prev;
      }
      return prev + 1;
    });
  }, []);

  const joyrideSteps = useMemo<Step[]>(
    () =>
      steps.map(([content, selector]) => ({
        target: selector ?? 'body',
        content: renderStepContent(content),
        disableBeacon: true,
        ...(selector ? {} : { placement: 'center' as const }),
      })),
    []
  );

  // Keep a stable DOM flag so non-tutorial components can emit progression events safely.
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

  // Listen for 'start-tutorial' event from anywhere in the app.
  useEffect(() => {
    const handler = () => {
      if (isActiveRef.current) {
        return;
      }
      setCurrentStep(0);
      setIsActive(true);
    };
    window.addEventListener(START_TUTORIAL_EVENT, handler);
    return () => window.removeEventListener(START_TUTORIAL_EVENT, handler);
  }, []);

  // Copy a sample nutrition label to clipboard at the paste step.
  useEffect(() => {
    if (isActive && currentStep === PASTE_STEP && PASTE_STEP >= 0) {
      copyNutritionLabelToClipboard();
    }
  }, [isActive, currentStep]);

  const activeStep = steps[currentStep];
  const currentSelector = activeStep?.[1] ?? null;
  const currentEvent = activeStep?.[2] ?? null;

  // Advance when a target is clicked on click-driven steps.
  useEffect(() => {
    if (!isActive || !currentSelector || currentEvent) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }
      let matched: Element | null = null;
      try {
        matched = target.closest(currentSelector);
      } catch {
        return;
      }
      if (matched) {
        next();
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [isActive, currentSelector, currentEvent, next]);

  // Advance when a step-specific tutorial event fires.
  useEffect(() => {
    if (!isActive || !currentEvent) {
      return;
    }
    const handler = () => next();
    window.addEventListener(currentEvent, handler);
    return () => window.removeEventListener(currentEvent, handler);
  }, [isActive, currentEvent, next]);

  // Keep Enter-to-advance behavior from the previous tutorial implementation.
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        next();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, next]);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index, status, type } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        finish();
        return;
      }

      if (type !== EVENTS.STEP_AFTER) {
        return;
      }

      if (action === ACTIONS.PREV) {
        setCurrentStep(Math.max(index - 1, 0));
      }

      if (action === ACTIONS.NEXT) {
        setCurrentStep(Math.min(index + 1, steps.length - 1));
      }
    },
    [finish]
  );

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      disableOverlayClose
      hideCloseButton
      locale={{
        back: 'previous',
        close: 'done',
        last: 'done',
        next: 'next',
      }}
      run={isActive}
      scrollToFirstStep
      showBackButton
      showSkipButton={false}
      spotlightClicks
      stepIndex={currentStep}
      steps={joyrideSteps}
      styles={{
        options: {
          arrowColor: 'transparent',
          backgroundColor: 'transparent',
          overlayColor: 'rgba(0, 0, 0, 0.65)',
          primaryColor: 'rgba(168, 85, 247, 0.9)',
          textColor: 'rgba(255, 255, 255, 0.9)',
          width: 420,
          zIndex: 2001,
        },
        buttonBack: {
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.4)',
          fontFamily: 'Ubuntu, sans-serif',
          fontSize: '13px',
          padding: '6px 12px',
        },
        buttonNext: {
          background: 'none',
          border: 'none',
          color: 'rgba(168, 85, 247, 0.9)',
          fontFamily: 'Ubuntu, sans-serif',
          fontSize: '13px',
          padding: '6px 12px',
        },
        tooltip: {
          backgroundColor: 'transparent',
          borderRadius: 0,
          boxShadow: 'none',
        },
        tooltipContainer: {
          fontFamily: 'Inconsolata, monospace',
          fontSize: '20px',
          lineHeight: 1.5,
          padding: '16px 16px 8px',
          textAlign: 'left',
        },
      }}
    />
  );
}
