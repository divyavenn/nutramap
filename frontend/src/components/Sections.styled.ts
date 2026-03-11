import styled from 'styled-components';
import { Link } from 'react-router-dom';

export const SvgButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  svg {
    fill: oklch(0.853 0.107 295 / 55%);
    width: 50px;
    height: 50px;
  }

  &:hover svg {
    fill: oklch(0.924 0.063 295);
  }
`;

export const HeaderLinkButton = styled(Link)`
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  margin-right: 4px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  transition: background-color 0.15s ease, opacity 0.15s ease;

  svg {
    fill: oklch(0.924 0.063 295 / 65%);
    height: 28px;
    transition: fill 0.15s ease;
  }

  &:hover {
    background-color: oklch(0.924 0.063 295 / 6%);
  }

  &:hover svg {
    fill: var(--accent-purple);
  }
`;

export const LoginButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;

  svg {
    fill: oklch(0.924 0.063 295 / 66%);
    width: 30px;
    height: 30px;
  }

  &:hover svg {
    fill: oklch(0.924 0.063 295);
  }
`;
