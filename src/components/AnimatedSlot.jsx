/**
 * AnimatedSlot — cycles through a list of image frames at ~12 fps,
 * giving the appearance of a GIF/boomerang within the strip preview.
 */
import React, { memo, useEffect, useRef, useState } from 'react';

function AnimatedSlotComponent({ frames, style, className, alt, index, ...rest }) {
  const [frameIdx, setFrameIdx] = useState(0);
  const rafRef = useRef(null);
  const lastTime = useRef(0);
  const FPS = 12;
  const interval = 1000 / FPS;

  useEffect(() => {
    if (!frames || frames.length <= 1) return;

    const tick = (now) => {
      if (now - lastTime.current >= interval) {
        setFrameIdx(prev => (prev + 1) % frames.length);
        lastTime.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [frames, interval]);

  if (!frames || frames.length === 0) return null;

  return (
    <img
      src={frames[frameIdx]}
      alt={alt || `Animated photo ${(index ?? 0) + 1}`}
      data-photo-index={index}
      className={className}
      style={style}
      {...rest}
    />
  );
}

export const AnimatedSlot = memo(AnimatedSlotComponent);
