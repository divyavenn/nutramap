import { Cursor } from 'motion-plus/react';
import styled from 'styled-components';

const Dot = styled.div`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(160, 160, 160, 0.55);
  pointer-events: none;
`;

function AppCursor() {
  return (
    <Cursor
      follow
      spring={{ stiffness: 800, damping: 40, mass: 0.4 }}
      style={{ pointerEvents: 'none', zIndex: 99999 }}
    >
      <Dot />
    </Cursor>
  );
}

export default AppCursor;
