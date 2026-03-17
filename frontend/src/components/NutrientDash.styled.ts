import styled, { keyframes } from 'styled-components';
import { SvgButton } from './Sections.styled';

const nutrientEditIdle = keyframes`
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-3deg); }
`;

const nutrientEditHover = keyframes`
  0% { transform: rotate(-4deg) scale(1); }
  60% { transform: rotate(7deg) scale(1.08); }
  100% { transform: rotate(0deg) scale(1.03); }
`;

interface NutrientDashboardContainerProps {
  $foodHovered?: boolean;
}

export const NutrientDashboardContainer = styled.div<NutrientDashboardContainerProps>`
  display: flex;
  width: var(--dashboard-width);
  margin-top: 30px;
  margin-bottom: 20px;
  padding-top: 40px;
  padding-bottom: 50px;
  padding-right: 40px;
  padding-left: 40px;
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
  transition: background-color 0.3s ease, transform 0.3s ease;
`;

export const NutrientEditButton = styled(SvgButton)`
  border-radius: 10px;
  padding: 6px;
  cursor: pointer;
  transition: transform 0.18s ease, background-color 0.18s ease;

  & img {
    width: 34px;
    height: 34px;
    display: block;
    opacity: 0.9;
    animation: ${nutrientEditIdle} 2.6s ease-in-out infinite;
  }

  &:hover {
    background-color: oklch(0.924 0.063 295 / 8%);
    transform: translateY(-1px);
  }

  &:hover img {
    opacity: 1;
    animation: ${nutrientEditHover} 0.22s ease-out forwards;
  }

  &:active {
    transform: translateY(0) scale(0.96);
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
  padding-left: 0;
`;

export const NutrientEditPanelTitle = styled.div`
  font-family: 'Funnel Sans', sans-serif;
  font-size: 28px;
  font-weight: 400;
  color: oklch(0.924 0.063 295 / 92%);
  text-align: left;
  margin-bottom: 4px;
  margin-top: 8px;
  padding-left: 14px;
`;

export const NutrientEditSubtitle = styled.div`
  font-family: 'Funnel Sans', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: oklch(0.924 0.063 295 / 38%);
  text-align: left;
  margin-bottom: 14px;
  padding-left: 14px;
`;

export const NutrientPanelTitle = styled.div`
  font-family: 'Poppins', sans-serif;
  font-size: 20px;
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
  font-family: Inconsolata;
  font-style: italic;
  color: var(--transparent-white);
  font-size: var(--inconsolata-font-size);
  text-align: center;
  font-weight: 300;
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
      : "'Funnel Sans'"};
  color: ${({ $foodMode }) =>
    $foodMode ? 'oklch(0.924 0.063 295 / 92%)' : 'oklch(0.924 0.063 295 / 32%)'};
  font-size: ${({ $foodMode }) => ($foodMode ? 'var(--inconsolata-font-size)' : '11px')};
  font-weight: ${({ $foodMode }) => ($foodMode ? '400' : '500')};
  letter-spacing: ${({ $foodMode }) => ($foodMode ? 'normal' : '0.08em')};
  text-transform: ${({ $foodMode }) => ($foodMode ? 'none' : 'uppercase')};
  overflow: hidden;
  white-space: nowrap;
  text-align: center;
  transition: font-family 0.2s ease, color 0.2s ease;
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
  text-align: left;
  align-self: center;
  flex-grow: 0;
  flex-shrink: 0;
  flex-basis: auto;
  opacity: ${({ $hidden }) => ($hidden ? '0' : '1')};
  pointer-events: ${({ $hidden }) => ($hidden ? 'none' : 'auto')};
  transition: opacity 0.3s ease;
`;

export const NutrientName = styled.div`
  cursor: pointer;
  font-family: 'Funnel Sans';
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  transition: all 0.3s ease;
`;

export const TodayStatsWrapper = styled.div`
  position: relative;
  width: 60%;
  padding-left: 16px;
  padding-right: 16px;
  box-sizing: border-box;
  font-family: Poppins;
  font-size: 18px;
  align-self: center;
  font-weight: 300;
  text-align: center;
  text-transform: none;
`;

export const AvgIntake = styled.div`
  font-family: 'Funnel Sans';
  font-size: 15px;
  font-weight: 300;
  cursor: default;
  text-align: right;
  color: oklch(0.924 0.063 295 / 55%);
  font-variant-numeric: tabular-nums;
  transition: color 0.3s ease;
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
  transition: opacity 0.3s ease;

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

export const GoalMessage = styled.div<VisibilityProps>`
  position: absolute;
  font-family: 'Funnel Sans';
  font-size: var(--inconsolata-font-size);
  transition: opacity 0.3s ease, transform 0.3s ease;
  width: 100%;
  text-align: center;
  font-variant-numeric: tabular-nums;
  opacity: ${({ $visible }) => ($visible ? '1' : '0')};
  transform: ${({ $visible }) => ($visible ? 'translateY(0)' : 'translateY(5px)')};
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
  transition: opacity 0.3s ease, transform 0.3s ease;
  opacity: ${({ $visible }) => ($visible ? '1' : '0')};
  transform: ${({ $visible }) => ($visible ? 'translateY(0)' : 'translateY(5px)')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
`;

export const ProgressBarContainer = styled.div`
  height: 100%;
  width: 100%;
  border-radius: 100px;
  overflow: hidden;
  position: relative;
`;

export const ProgressBar = styled.div`
  height: 100%;
  width: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  border-radius: 100px;
  position: absolute;
  left: 0;
  top: 0;
`;
