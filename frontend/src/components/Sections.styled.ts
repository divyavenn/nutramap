import styled from 'styled-components';
import { Link } from 'react-router-dom';

export const SvgButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  svg {
    fill: #b9b0b0;
    width: 50px;
    height: 50px;
  }

  &:hover svg {
    fill: #ffffff;
  }
`;

export const HeaderLinkButton = styled(Link)`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  margin-right: 20px;
  display: flex;
  align-items: center;

  svg {
    fill: #ffffff;
    height: 30px;
  }

  &:hover svg {
    fill: #a855f7;
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
    fill: #ffffffa8;
    width: 30px;
    height: 30px;
  }

  &:hover svg {
    fill: #ffffff;
  }
`;
