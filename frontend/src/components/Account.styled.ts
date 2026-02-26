import styled, { createGlobalStyle, keyframes, css } from 'styled-components';
import { SvgButton } from './Sections.styled';

const jiggleAnim = keyframes`
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  50% { transform: translateX(5px); }
  75% { transform: translateX(-5px); }
`;

export const AccountInfoList = styled.div`
  display: flex;
  margin-top: 28px;
  flex-direction: column;
  width: min(600px, 92vw);
  align-items: flex-start;
  flex-grow: 1;
  gap: 24px;
`;

interface AccountInfoFormProps {
  $jiggle?: boolean;
}

export const AccountInfoForm = styled.form<AccountInfoFormProps>`
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
  ${({ $jiggle }) => $jiggle && css`
    animation: ${jiggleAnim} 0.3s ease-in-out;
  `}
`;

export const AccountInfoRow = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
`;

export const AccountInfoTag = styled.div`
  width: 120px;
  flex-shrink: 0;
  font-family: Inconsolata, monospace;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.35);
`;

export const AccountInfoInput = styled.input`
  flex: 1;
  min-width: 0;
  font-family: Inconsolata, monospace;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.35);
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  padding: 4px 0;
  transition: color 0.2s, border-color 0.2s;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  &:focus {
    color: rgba(255, 255, 255, 0.75);
    border-bottom-color: rgba(255, 255, 255, 0.2);
    outline: none;
  }

  @media (max-width: 860px) {
    font-size: 20px;
  }
`;

export const SubmitInfoUpdateButtonContainer = styled.div`
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
  padding: 0;

  ${AccountInfoForm}:focus-within &,
  ${AccountInfoRow}:focus-within & {
    opacity: 1;
  }

  svg {
    display: flex;
    align-items: center;
  }
`;

export const SubmitInfoUpdateButton = styled(SvgButton)`
  align-items: center;
  margin-right: 0;
  order: 1;

  svg {
    fill: rgba(171, 82, 255, 0.95);
    height: 20px;
    width: auto;
  }

  &:hover svg {
    fill: rgba(192, 132, 252, 1);
  }
`;

export const AccountActionsRow = styled.div`
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  margin-top: 48px;
`;

export const ChangePasswordContainer = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
`;

interface AccountActionsButtonProps {
  $variant?: 'purple' | 'delete';
}

export const AccountActionsButton = styled.div<AccountActionsButtonProps>`
  font-family: Inconsolata, monospace;
  font-size: 24px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: ${({ $variant }) =>
    $variant === 'purple' ? 'rgba(160, 90, 240, 0.9)' :
    $variant === 'delete' ? 'rgba(195, 72, 52, 0.85)' :
    'rgba(255, 255, 255, 0.85)'
  };

  @media (max-width: 860px) {
    font-size: 20px;
  }
`;

export const LetsGoButton = styled.button`
  font-family: Inconsolata, monospace;
  font-size: 24px;
  background: none;
  border: none;
  padding: 0;
  margin-top: 32px;
  cursor: pointer;
  color: rgba(160, 90, 240, 0.9);
  align-self: center;
`;
