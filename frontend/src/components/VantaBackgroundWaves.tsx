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
    // Wait a bit to ensure the DOM is fully loaded
    const timer = setTimeout(() => {
      if (!vantaEffect && vantaRef.current && window.VANTA) {
        setVantaEffect(
          window.VANTA.WAVES({
            el: vantaRef.current,
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.00,
            minWidth: 200.00,
            scale: 2.0,
            scaleMobile: 1.00,
            color: 0x0e001c,
            shininess: 1.00
          })
        );
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (vantaEffect) vantaEffect.destroy();
    };
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
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </>
  );
};

export default VantaBackgroundWaves;