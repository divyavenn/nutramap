import { atom } from 'recoil';

type TutorialStepParams = {
  message: string;
  selector?: string | null;
  eventName?: string | null;
  highlightOnly?: boolean;
  mediaUrl?: string | null;
};

export class TutorialStep {
  message: string;
  selector: string | null;
  eventName: string | null;
  highlightOnly: boolean;
  mediaUrl: string | null;

  constructor({ message, selector = null, eventName = null, highlightOnly = false, mediaUrl = null }: TutorialStepParams) {
    this.message = message;
    this.selector = selector;
    this.eventName = eventName;
    this.highlightOnly = highlightOnly;
    this.mediaUrl = mediaUrl;
  }
}

export type TutorialStepKind =
  | 'manual'
  | 'manual_highlight'
  | 'target_click'
  | 'event_only'
  | 'target_and_event'
  | 'highlight_and_event';

export interface CompiledTutorialStep {
  message: string;
  selector: string | null;
  eventName: string | null;
  highlightOnly: boolean;
  mediaUrl: string | null;
  kind: TutorialStepKind;
}

export interface TutorialMachineState {
  isActive: boolean;
  stepIndex: number;
  routePath: string;
  runId: number;
}

export type TutorialMachineAction =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'PREV' }
  | { type: 'NEXT_MANUAL' }
  | { type: 'TARGET_CLICK'; matchesCurrentTarget: boolean }
  | { type: 'APP_EVENT'; name: string }
  | { type: 'ROUTE_CHANGED'; path: string };

const INITIAL_STATE: TutorialMachineState = {
  isActive: false,
  stepIndex: 0,
  routePath: '',
  runId: 0,
};

export const tutorialMachineAtom = atom<TutorialMachineState>({
  key: 'tutorialMachineState',
  default: INITIAL_STATE,
});

export function compileTutorialStep(step: TutorialStep): CompiledTutorialStep {
  const { message, selector, eventName, highlightOnly } = step;

  let kind: TutorialStepKind = 'manual';
  if (selector && eventName) {
    kind = highlightOnly ? 'highlight_and_event' : 'target_and_event';
  } else if (selector) {
    kind = highlightOnly ? 'manual_highlight' : 'target_click';
  } else if (eventName) {
    kind = 'event_only';
  }

  const mediaUrl = step.mediaUrl;
  return { message, selector, eventName, highlightOnly, mediaUrl, kind };
}

export function getCompiledStep(steps: TutorialStep[], stepIndex: number): CompiledTutorialStep {
  const safeIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
  return compileTutorialStep(steps[safeIndex]);
}

export function canAdvanceManually(step: CompiledTutorialStep): boolean {
  return step.kind === 'manual' || step.kind === 'manual_highlight';
}

export function canAdvanceOnTargetClick(step: CompiledTutorialStep): boolean {
  return step.kind === 'target_click';
}

export function requiredEventName(step: CompiledTutorialStep): string | null {
  return step.eventName;
}

export function lockedInteractionSelector(step: CompiledTutorialStep): string | null {
  return step.kind === 'target_and_event' ? step.selector : null;
}

function advance(state: TutorialMachineState, totalSteps: number): TutorialMachineState {
  if (totalSteps <= 0) {
    return { ...state, isActive: false, stepIndex: 0 };
  }

  if (state.stepIndex >= totalSteps - 1) {
    return { ...state, isActive: false };
  }

  return { ...state, stepIndex: state.stepIndex + 1 };
}

export function reduceTutorialState(
  state: TutorialMachineState,
  action: TutorialMachineAction,
  steps: TutorialStep[]
): TutorialMachineState {
  if (action.type === 'ROUTE_CHANGED') {
    return { ...state, routePath: action.path };
  }

  if (action.type === 'START') {
    return {
      ...state,
      isActive: true,
      stepIndex: 0,
      runId: state.runId + 1,
    };
  }

  if (action.type === 'STOP') {
    return { ...state, isActive: false };
  }

  if (!state.isActive || steps.length === 0) {
    return state;
  }

  const step = getCompiledStep(steps, state.stepIndex);

  if (action.type === 'PREV') {
    return state.stepIndex > 0
      ? { ...state, stepIndex: state.stepIndex - 1 }
      : state;
  }

  if (action.type === 'NEXT_MANUAL') {
    return canAdvanceManually(step) ? advance(state, steps.length) : state;
  }

  if (action.type === 'TARGET_CLICK') {
    if (!action.matchesCurrentTarget) return state;
    return canAdvanceOnTargetClick(step) ? advance(state, steps.length) : state;
  }

  if (action.type === 'APP_EVENT') {
    return requiredEventName(step) === action.name
      ? advance(state, steps.length)
      : state;
  }

  return state;
}
