declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
} 

declare module 'react-date-range'

declare module '*.svg?react' {
  import React = require('react');
  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}
declare module 'lodash'

declare module '*.svg' {
  const value: string;
  export default value;
}

// custom-elements.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'dotlottie-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      background?: string;
      speed?: string | number;
      style?: React.CSSProperties;
      loop?: boolean;
      autoplay?: boolean;
    };
  }
}