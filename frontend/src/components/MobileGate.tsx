import React from 'react';
import styled from 'styled-components';

const Overlay = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #0d0017;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    text-align: center;
    gap: 20px;
  }
`;

const Message = styled.p`
  color: var(--white, #fff);
  font-size: 1.1rem;
  line-height: 1.6;
  max-width: 320px;
  margin: 0;
`;

const DemoLink = styled.a`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.95rem;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover {
    color: #fff;
  }
`;

export default function MobileGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Overlay>
        <Message>
          nutramap is not mobile-optimized yet — open it on your laptop!
        </Message>
        <DemoLink href="/nutramap.mp4" target="_blank" rel="noopener noreferrer">
          or watch our demo
        </DemoLink>
      </Overlay>
      {children}
    </>
  );
}
