import { useCallback, useEffect } from 'react';
import { atom, useRecoilState, useSetRecoilState } from 'recoil';
import { AnimatePresence, motion } from 'framer-motion';
import styled from 'styled-components';

interface Status {
  id: number;
  text: string;
}

const statusMessageAtom = atom<Status | null>({
  key: 'statusMessage',
  default: null,
});

const MESSAGE_DURATION_MS = 6000;

/** Show a short message to the user (e.g. "changes not saved. try again."). */
export function useNotify() {
  const setStatus = useSetRecoilState(statusMessageAtom);
  return useCallback((text: string) => setStatus({ id: Date.now(), text }), [setStatus]);
}

const Region = styled.div`
  position: fixed;
  inset-inline: 0;
  bottom: 24px;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 1000;
`;

const Bubble = styled(motion.div)`
  max-width: min(90vw, 480px);
  padding: 12px 18px;
  border-radius: 12px;
  background-color: var(--color-3);
  color: var(--white);
  box-shadow: 0 8px 32px oklch(0 0 0 / 45%);
  font-family: 'Funnel Sans', system-ui, sans-serif;
  font-size: 15px;
  pointer-events: auto;
`;

/**
 * One persistent live region for the app, so screen readers announce messages and
 * failures are never silent. Mount once.
 */
export function StatusMessage() {
  const [status, setStatus] = useRecoilState(statusMessageAtom);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), MESSAGE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [status, setStatus]);

  return (
    <Region role="status" aria-live="polite">
      <AnimatePresence>
        {status && (
          <Bubble
            key={status.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            {status.text}
          </Bubble>
        )}
      </AnimatePresence>
    </Region>
  );
}
