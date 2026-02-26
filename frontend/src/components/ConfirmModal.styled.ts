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
  border-radius: 30px;
  background-color: #0e003d;
  color: rgba(255, 255, 255, 0.92);
  font-family: 'Inconsolata', monospace;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
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
  color: rgba(171, 82, 255, 0.92);
  border: none;
  cursor: pointer;
  transition: transform 0.16s ease, color 0.16s ease;
  border-bottom-left-radius: ${({ $side }) => $side === 'left' ? '30px' : '0'};
  border-bottom-right-radius: ${({ $side }) => $side === 'right' ? '30px' : '0'};

  &:hover {
    transform: translateY(-1px);
    color: rgba(192, 132, 252, 1);
  }
`;

export const OptionText = styled.div`
  font-size: 25px;
  font-weight: 700;
  color: inherit;
  font-family: 'Inconsolata', monospace;
  text-align: center;
`;
