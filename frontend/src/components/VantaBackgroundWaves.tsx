import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    VANTA: any;
    THREE: any;
  }
}

interface VantaBackgroundProps {
  children: React.ReactNode;
}

const VantaBackgroundWaves: React.FC<VantaBackgroundProps> = ({ children }) => {
  const vantaRef = useRef<HTMLDivElement>(null);
  const [vantaEffect, setVantaEffect] = useState<any>(null);

  useEffect(() => {
    if (vantaEffect) return;

    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const tryInit = () => {
      if (vantaRef.current && window.VANTA?.WAVES) {
        setVantaEffect(
          window.VANTA.WAVES({
            el: vantaRef.current,
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.00,
            minWidth: 200.00,
            scale: 4.0,
            scaleMobile: 1.00,
            color: 0x08060f,
            shininess: 0
          })
        );
      } else if (attempts < 40) {
        attempts++;
        timer = setTimeout(tryInit, 150);
      }
    };

    timer = setTimeout(tryInit, 100);

    return () => clearTimeout(timer);
  }, [vantaEffect]);

  return (
    <>
      {/* Background effect div - completely separate from content */}
      <div 
        ref={vantaRef} 
        style={{ 
          position: 'fixed', 
          width: '100%', 
          height: '100%', 
          top: 0, 
          left: 0, 
          zIndex: -1,
          pointerEvents: 'none' // This is crucial - prevents the div from capturing clicks
        }}
      />
      
      {/* Content rendered separately from the background */}
      <div style={{ position: 'relative' }}>
        {children}
      </div>
    </>
  );
};

export default VantaBackgroundWaves;