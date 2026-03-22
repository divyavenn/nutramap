import styled from 'styled-components';

export const ConfirmSection = styled.div`
  display: flex;
  min-height: calc(100vh - 160px);
  margin-top: 40px;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const ConfirmModal = styled.div`
  display: flex;
  width: min(500px, 92vw);
  min-height: 300px;
  flex-direction: column;
  border-radius: 20px;
  background: linear-gradient(
    160deg,
    oklch(0.222 0.044 295 / 95%) 0%,
    oklch(0.183 0.027 295 / 95%) 100%
  );
  color: oklch(0.924 0.063 295 / 92%);
  font-family: 'Inconsolata', monospace;
  box-shadow:
    inset 0 1px 0 oklch(0.924 0.063 295 / 9%),
    0 40px 96px oklch(0 0 0 / 70%),
    0 8px 28px oklch(0 0 0 / 40%);
`;

export const DialogText = styled.div`
  display: flex;
  min-height: 210px;
  padding: 60px 24px 0;
  max-width: 288px;
  margin: 0 auto;
  justify-content: center;
  align-items: center;
  flex: 1 0 auto;
  white-space: pre-wrap;
  font-size: 25px;
  line-height: 25px;
  text-align: center;
`;

export const OptionsHolder = styled.div`
  display: flex;
  height: 90px;
  justify-content: center;
  align-items: flex-end;
  background: transparent;
  padding-bottom: 30px;
`;

interface OptionButtonProps {
  $side: 'left' | 'right';
}

export const OptionButton = styled.button<OptionButtonProps>`
  flex: 1 0 0;
  height: 90px;
  background: transparent;
  color: oklch(0.637 0.185 295 / 75%);
  border: none;
  cursor: pointer;
  transition: transform 0.16s ease, color 0.16s ease, background-color 0.16s ease;
  border-bottom-left-radius: ${({ $side }) => $side === 'left' ? '20px' : '0'};
  border-bottom-right-radius: ${({ $side }) => $side === 'right' ? '20px' : '0'};

  &:hover, &:focus, &:active {
    transform: translateY(-1px);
    color: oklch(0.637 0.185 295);
    background-color: transparent;
    outline: none;
  }
`;

export const OptionText = styled.div`
  font-size: 25px;
  font-weight: 700;
  color: inherit;
  font-family: 'Inconsolata', monospace;
  text-align: center;
`;
