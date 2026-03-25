import { useEffect, useRef, useState } from 'react';

interface AnimatedTextProps {
  text: string;
  className?: string;
  speed?: number; // ms per character (default 80)
}

export function AnimatedText({ text, className = '', speed = 80 }: AnimatedTextProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef(0);

  useEffect(() => {
    const letters = text.split('');
    currentRef.current = 0;
    setVisibleCount(0);

    const scheduleNext = () => {
      const idx = currentRef.current;
      setVisibleCount(idx);

      if (idx === letters.length) {
        // Hold at full text, then restart
        timeoutRef.current = setTimeout(() => {
          currentRef.current = 0;
          scheduleNext();
        }, speed * 4);
      } else {
        // Natural jitter: 60–140% of base speed
        let delay = speed * (0.6 + Math.random() * 0.8);
        // Brief extra pause after spaces (word boundary)
        if (idx > 0 && letters[idx - 1] === ' ') delay *= 1.5;
        // Occasional "thinking" pause (5% chance)
        if (Math.random() < 0.05) delay += speed * 3;
        currentRef.current++;
        timeoutRef.current = setTimeout(scheduleNext, delay);
      }
    };

    scheduleNext();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, speed]);

  const letters = text.split('');
  const colors = [
    'rgba(147, 51, 234, 0.4)',
    'rgba(59, 130, 246, 0.6)',
    'rgba(168, 85, 247, 0.8)',
    'rgba(96, 165, 250, 0.9)',
    'rgba(192, 132, 252, 1)',
  ];

  return (
    <div className={className}>
      {letters.map((letter, index) => {
        if (index >= visibleCount) return null;

        const distance = (visibleCount - 1) - index;
        let color = 'rgba(255, 255, 255, 0.7)';
        let transform = 'translateY(0)';

        if (distance === 0) {
          color = colors[4];
          transform = 'translateY(-3px)';
        } else if (distance === 1) {
          color = colors[3];
          transform = 'translateY(-1px)';
        } else if (distance === 2) {
          color = colors[2];
        } else if (distance === 3) {
          color = colors[1];
        }

        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              color,
              transform,
              transition: 'color 0.08s ease, transform 0.08s ease',
            }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </span>
        );
      })}
    </div>
  );
}
