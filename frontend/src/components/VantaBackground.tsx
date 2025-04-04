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

const VantaBackground: React.FC<VantaBackgroundProps> = ({ children }) => {
  const vantaRef = useRef<HTMLDivElement>(null);
  const [vantaEffect, setVantaEffect] = useState<any>(null);

  useEffect(() => {
    // Wait a bit to ensure the DOM is fully loaded
    const timer = setTimeout(() => {
      if (!vantaEffect && vantaRef.current && window.VANTA) {
        setVantaEffect(
          window.VANTA.FOG({
            el: vantaRef.current,
            mouseControls: false, // Disable mouse controls to prevent interaction issues
            touchControls: false, // Disable touch controls to prevent interaction issues
            gyroControls: false,
            minHeight: 200.00,
            minWidth: 200.00,
            highlightColor: 0xa2a1a2,
            midtoneColor: 0xc3bebe,
            lowlightColor: 0x959498,
            baseColor: 0x7d7676,
            blurFactor: 0.6,
            speed: 0.80,
            zoom: 1.80
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

export default VantaBackground;