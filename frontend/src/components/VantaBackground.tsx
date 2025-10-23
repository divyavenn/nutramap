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
            mouseControls: true, // Disable mouse controls to prevent interaction issues
            touchControls: true, // Disable touch controls to prevent interaction issues
            gyroControls: true,
            minHeight: 200.00,
            minWidth: 200.00,
            highlightColor: 0x100c0b,
            midtoneColor: 0x1f2230,
            lowlightColor: 0x171923,
            baseColor: 0x0a0c14,
            blurFactor: 0.3,
            speed: 1.00,
            zoom: 3.0
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