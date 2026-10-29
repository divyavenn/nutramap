import styled from 'styled-components';
import { motion } from 'framer-motion';
import { SvgButton } from './Sections.styled';

interface NutrientDashboardContainerProps {
  $foodHovered?: boolean;
}

// motion.div so the panel itself is the layout element: framer corrects border-radius
// during layout animations instead of stretching a wrapper's corners and shadow.
export const NutrientDashboardContainer = styled(motion.div)<NutrientDashboardContainerProps>`
  display: flex;
  /* Shrink with its column instead of overflowing it (clipped at ~1300–1440px wide) */
  width: 100%;
  max-width: var(--dashboard-width);
  margin-top: 30px;
  margin-bottom: 20px;
  padding-top: 40px;
  padding-bottom: 50px;
  padding-inline: 40px;
  flex-direction: column;
  justify-content: flex-start;
  flex-wrap: nowrap;
  align-items: center;
  flex-grow: 0;
  flex-shrink: 0;
  flex-basis: auto;
  border-radius: 14px;
  background-color: ${({ $foodHovered }) =>
    $foodHovered
      ? 'oklch(0.279 0.075 295 / 95%)'
      : 'oklch(0.214 0.038 295 / 95%)'};
  color: oklch(0.924 0.063 295);
  border: none;
  box-shadow:
    0 8px 32px oklch(0 0 0 / 45%),
    inset 0 1px 0 oklch(0.924 0.063 295 / 4%);
  transition: background-color 150ms ease-out;
`;

export const NutrientEditButton = styled(SvgButton)`
  border-radius: 10px;
  padding: 6px;
  cursor: pointer;
  transition: transform 0.18s ease, background-color 0.18s ease, scale 150ms ease-out;

  & svg {
    width: 34px;
    height: 34px;
    display: block;
    fill: var(--hover-white);
    opacity: 0.9;
    transition: rotate 150ms ease-out, opacity 150ms ease-out, fill 150ms ease-out;
  }

  /* add.svg ships with hardcoded path fills; let the CSS fill win */
  & svg path {
    fill: inherit;
    fill-opacity: inherit;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: oklch(0.924 0.063 295 / 8%);
      transform: translateY(-1px);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      rotate: 7deg;
      opacity: 1;
      fill: var(--accent-purple);
    }
  }
`;

export const RequirementEditWrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
`;

export const NutrientEditListWrapper = styled.div`
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  flex-direction: column;
  justify-content: center;
  padding-inline-start: 0;
`;

export const NutrientEditPanelTitle = styled.div`
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: 400;
  color: oklch(0.924 0.063 295 / 92%);
  text-align: start;
  margin-bottom: 4px;
  margin-top: 8px;
  padding-inline-start: 14px;
`;

export const NutrientEditSubtitle = styled.div`
  font-family: var(--font-ui);
  font-size: var(--text-small);
  font-weight: 400;
  color: var(--color-text-secondary);
  text-align: start;
  margin-bottom: 14px;
  padding-inline-start: 14px;
`;

export const NutrientPanelTitle = styled.div`
  font-family: Poppins, sans-serif;
  font-size: var(--text-large);
  font-weight: 400;
  color: var(--white);
  margin: 0;
  margin-bottom: 20px;
  text-wrap: balance;
`;

export const NutrientListWrapper = styled.div`
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  flex-direction: column;
  justify-content: center;
  padding-top: 20px;
  padding-bottom: 12px;
`;

export const NoReqMessage = styled.div`
  position: relative;
  width: 100%;
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
  font-size: var(--inconsolata-font-size);
  text-align: center;
  font-weight: 400;
  text-transform: none;
  margin-top: 40px;
  margin-bottom: 40px;
`;

interface NutrientDashTitleProps {
  $foodMode?: boolean;
}

export const NutrientDashTitle = styled.div<NutrientDashTitleProps>`
  position: relative;
  width: 100%;
  font-family: ${({ $foodMode }) =>
    $foodMode
      ? "'Abyssinica SIL', Georgia, 'Times New Roman', serif"
      : 'var(--font-ui)'};
  color: ${({ $foodMode }) =>
    $foodMode ? 'oklch(0.924 0.063 295 / 92%)' : 'var(--color-text-secondary)'};
  font-size: ${({ $foodMode }) => ($foodMode ? 'var(--inconsolata-font-size)' : 'var(--text-label)')};
  font-weight: ${({ $foodMode }) => ($foodMode ? '400' : '500')};
  letter-spacing: ${({ $foodMode }) => ($foodMode ? 'normal' : '0.08em')};
  text-transform: ${({ $foodMode }) => ($foodMode ? 'none' : 'uppercase')};
  overflow: hidden;
  white-space: nowrap;
  text-align: center;
  transition: color 0.2s ease;
`;

export const DashboardRow = styled.div`
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 16px;
  justify-content: center;
  align-items: flex-start;
  align-self: center;
  order: -1;
  flex-grow: 0;
  flex-shrink: 0;
  flex-basis: auto;
`;

interface NutrientNameWrapperProps {
  $hidden?: boolean;
}

export const NutrientNameWrapper = styled.div<NutrientNameWrapperProps>`
  position: relative;
  display: block;
  width: 20%;
  height: auto;
  text-align: start;
  align-self: center;
  flex-grow: 0;
  flex-shrink: 0;
  flex-basis: auto;
  opacity: ${({ $hidden }) => ($hidden ? '0' : '1')};
  pointer-events: ${({ $hidden }) => ($hidden ? 'none' : 'auto')};
  transition: opacity 150ms ease;
`;

export const NutrientName = styled.button`
  display: block;
  width: 100%;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: inherit;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-large);
  font-variant-numeric: tabular-nums;
  transition: color 150ms ease, scale 150ms ease-out;
`;

export const StatusCue = styled.span`
  margin-inline-start: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
`;

export const TodayStatsWrapper = styled.div`
  position: relative;
  width: 60%;
  padding-inline: 16px;
  box-sizing: border-box;
  font-family: Poppins, sans-serif;
  font-size: var(--text-medium);
  align-self: center;
  font-weight: 400;
  text-align: center;
  text-transform: none;
`;

export const AvgIntake = styled.div`
  font-family: var(--font-ui);
  font-size: var(--text-caption);
  font-weight: 400;
  cursor: default;
  text-align: right;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  transition: color 150ms ease;
`;

interface AvgStatsWrapperProps {
  $hidden?: boolean;
}

export const AvgStatsWrapper = styled.div<AvgStatsWrapperProps>`
  position: relative;
  width: 20%;
  align-self: center;
  text-align: right;
  opacity: ${({ $hidden }) => ($hidden ? '0' : '1')};
  pointer-events: ${({ $hidden }) => ($hidden ? 'none' : 'auto')};
  transition: opacity 150ms ease;

  &:hover ${AvgIntake} {
    color: var(--avg-color);
  }
`;

export const HoverTransitionContainer = styled.div`
  position: relative;
  width: 100%;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

interface VisibilityProps {
  $visible?: boolean;
}

export const GoalMessage = styled.button<VisibilityProps>`
  position: absolute;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: inherit;
  font-family: var(--font-ui);
  font-size: var(--inconsolata-font-size);
  transition: opacity 150ms ease-out, scale 150ms ease-out;
  width: 100%;
  text-align: center;
  font-variant-numeric: tabular-nums;
  opacity: ${({ $visible }) => ($visible ? '1' : '0')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
`;

export const DailyIntake = styled.div<VisibilityProps>`
  position: relative;
  height: 13px;
  width: 100%;
  background-color: oklch(0.924 0.063 295 / 8%);
  border-radius: 100px;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-self: center;
  align-items: center;
  justify-content: start;
  justify-self: center;
  transition: opacity 150ms ease-out;
  opacity: ${({ $visible }) => ($visible ? '1' : '0')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
`;

export const ProgressBarContainer = styled.div`
  height: 100%;
  width: 100%;
  border-radius: 100px;
  overflow: hidden;
  position: relative;
`;

// Fill amount is set as an inline scaleX (0..1) so it animates on the compositor
// instead of re-laying out `width`; the container's overflow: hidden clips the ends.
export const ProgressBar = styled.div`
  height: 100%;
  width: 100%;
  transform-origin: left;
  transition: transform 300ms ease-out, background-color 0.3s ease;
  border-radius: 100px;
  position: absolute;
  left: 0;
  top: 0;
`;
