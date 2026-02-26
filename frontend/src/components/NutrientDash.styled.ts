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
  margin-top: 0px;
  margin-bottom: 20px;
  padding-top: 40px;
  padding-bottom: 20px;
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
  background-color: ${({ $foodHovered }) => $foodHovered ? 'rgba(140, 60, 255, 0.55)' : 'var(--purple)'};
  color: white;
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
    background-color: rgba(255, 255, 255, 0.08);
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
  padding-left: -20px;
`;

export const NutrientEditPanelTitle = styled.div`
  font-family: 'Figtree';
  font-size: 25px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
  margin-bottom: 10px;
  margin-top: 8px;
`;

export const NutrientPanelTitle = styled.div`
  font-family: 'Poppins', sans-serif;
  font-size: 20px;
  font-weight: 400;
  color: var(--white);
  margin: 0;
  margin-bottom: 20px;
`;

export const NutrientListWrapper = styled.div`
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  flex-direction: column;
  justify-content: center;
  padding-top: 30px;
  padding-bottom: 20px;
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
    $foodMode ? 'rgba(255, 255, 255, 0.92)' : 'rgb(156, 49, 255)'};
  font-size: var(--inconsolata-font-size);
  font-weight: ${({ $foodMode }) => ($foodMode ? '400' : '300')};
  text-transform: none;
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
  margin-bottom: 10px;
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
  transition: all 0.3s ease;
`;

export const TodayStatsWrapper = styled.div`
  position: relative;
  width: 60%;
  font-family: Poppins;
  font-size: 18px;
  align-self: center;
  font-weight: 300;
  text-align: center;
  text-transform: none;
`;

export const AvgIntake = styled.div`
  font-family: 'Funnel Sans';
  font-size: var(--inconsolata-font-size);
  font-weight: 300;
  cursor: default;
  text-align: center;
  color: white;
  transition: color 0.3s ease;
`;

interface AvgStatsWrapperProps {
  $hidden?: boolean;
}

export const AvgStatsWrapper = styled.div<AvgStatsWrapperProps>`
  position: relative;
  width: 20%;
  align-self: center;
  text-align: center;
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
  font-family: Inconsolata;
  font-size: var(--inconsolata-font-size);
  transition: opacity 0.3s ease, transform 0.3s ease;
  width: 100%;
  text-align: center;
  opacity: ${({ $visible }) => ($visible ? '1' : '0')};
  transform: ${({ $visible }) => ($visible ? 'translateY(0)' : 'translateY(5px)')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
`;

export const DailyIntake = styled.div<VisibilityProps>`
  position: relative;
  height: 13px;
  width: 100%;
  background-color: #12000e42;
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
