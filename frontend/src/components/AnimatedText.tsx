import { useEffect, useState } from 'react';

interface AnimatedTextProps {
  text: string;
  className?: string;
}

export function AnimatedText({ text, className = '' }: AnimatedTextProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const letters = text.split('');

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % (letters.length + 3)); // +3 for the dots
    }, 150);

    return () => clearInterval(interval);
  }, [letters.length]);

  const getLetterStyle = (index: number): React.CSSProperties => {
    const distance = Math.abs(index - activeIndex);

    // Color shades alternating between bright purple and blue
    const colors = [
      'rgba(147, 51, 234, 0.4)',   // dim purple
      'rgba(59, 130, 246, 0.6)',   // medium blue
      'rgba(168, 85, 247, 0.8)',   // bright purple
      'rgba(96, 165, 250, 0.9)',   // bright blue
      'rgba(192, 132, 252, 1)',    // brightest purple-blue
    ];

    let color = 'rgba(255, 255, 255, 0.7)'; // default
    let transform = 'translateY(0)';

    if (distance === 0) {
      color = colors[4]; // brightest
      transform = 'translateY(-4px)';
    } else if (distance === 1) {
      color = colors[3];
      transform = 'translateY(-2px)';
    } else if (distance === 2) {
      color = colors[2];
    } else if (distance === 3) {
      color = colors[1];
    }

    return {
      display: 'inline-block',
      color,
      transform,
      transition: 'all 0.2s ease',
    };
  };

  const dots = ['·', '·', '·'];

  return (
    <div className={className}>
      {letters.map((letter, index) => (
        <span key={index} style={getLetterStyle(index)}>
          {letter === ' ' ? '\u00A0' : letter}
        </span>
      ))}
      {dots.map((dot, index) => {
        const dotIndex = letters.length + index;
        const isVisible = activeIndex >= dotIndex && activeIndex < dotIndex + 3;

        const dotStyle: React.CSSProperties = {
          ...getLetterStyle(dotIndex),
          color: isVisible ? getLetterStyle(dotIndex).color : 'transparent',
        };

        return (
          <span key={`dot-${index}`} style={dotStyle}>
            {dot}
          </span>
        );
      })}
    </div>
  );
}
