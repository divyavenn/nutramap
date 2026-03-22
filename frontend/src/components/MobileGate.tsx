import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import foodPanelLogo from '../assets/images/nutramap_logo.png';
import { motion } from 'framer-motion';

const Overlay = styled.div`
  display: flex;
  position: fixed;
  inset: 0;
  z-index: 9999;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
  gap: 24px;
`;

const Logo = styled(motion.img)`
  width: 80px;
  height: auto;
  filter: invert(1) brightness(1.8);
`;

const Message = styled(motion.p)`
  color: var(--white, #fff);
  font-size: 1.15rem;
  line-height: 1.6;
  max-width: 300px;
  margin: 0;
  font-family: 'Public Sans', system-ui, sans-serif;
`;

const DemoLink = styled(motion.a)`
  color: oklch(0.637 0.185 295 / 80%);
  font-size: 1rem;
  text-decoration: none;
  font-family: 'Public Sans', system-ui, sans-serif;

  &:hover {
    color: oklch(0.637 0.185 295);
  }
`;

export default function MobileGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (isMobile) {
    return (
      <Overlay>
        <Logo
          src={foodPanelLogo}
          alt="nutramap logo"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        />
        <Message
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          nutramap is not mobile-optimized yet — open it on your laptop!
        </Message>
        <DemoLink
          href="https://1twvpkzw6c4k5zng.public.blob.vercel-storage.com/nutramap_demo.mp4"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          or watch our demo
        </DemoLink>
      </Overlay>
    );
  }

  return <>{children}</>;
}
