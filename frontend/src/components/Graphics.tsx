import React, { useEffect } from 'react';


interface LottieAnimationProps {
  url: string;
  width: string | number;
  height: string | number;
  speed?: string;
}

function LottieAnimation({url, width, height, speed = "1"} : LottieAnimationProps) {
  useEffect(() => {
    const dotLottieScript = 'https://unpkg.com/@dotlottie/player-component@latest/dist/dotlottie-player.mjs';
    // Check if the script is already added to avoid re-adding it
    if (!(document.querySelector('script[src=\"' + dotLottieScript + '\"]')))
    {
      // Dynamically inject the script for the Lottie player
      const script = document.createElement('script');
      script.src = dotLottieScript;
      script.type = 'module';
      document.body.appendChild(script);
    }}, []); // The empty array ensures this effect only runs once (on mount)

  return (
    <div className="w-embed w-script">
      <dotlottie-player
        src={url}
        background="transparent"
        speed={speed}
        style={{ width: width, height: height }}
        loop
        autoplay
      />
    </div>
  );
}

interface GraphicsProps {
  src: string;
  width?: string | number;
  height?: string | number;
  loading?: "lazy" | "eager" | undefined;
  className? : string | undefined
}

function Graphic({src, width = 'auto', height = "auto", loading = "lazy", className = undefined}: GraphicsProps){ 
  return (
    <img
      src = {src}
      loading = {loading}
      className= {className}
      style={{ width: width, height: height}}  // Inline styles
    />
  )
}
export {LottieAnimation, Graphic};