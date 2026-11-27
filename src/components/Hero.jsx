import { GradedPhoto } from './GradedPhoto.jsx';
import React, { memo, useCallback } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import {
  Camera,
  ChevronRight,
  Film,
  Grid2X2,
  Sparkles,
} from 'lucide-react';
import { CameraOverlay } from './CameraOverlay.jsx';

const PhotoStack = memo(function PhotoStackComponent({ photos, filter }) {
  return (
    <div className="photo-stack">
      {photos.map((photo, index) => (
        <GradedPhoto as={motion.img} filter={filter} key={index} src={photo} alt="" initial={{ opacity: 0, rotate: -5 + index * 4, x: index * 18, y: index * -8 }} animate={{ opacity: 1, rotate: -5 + index * 4, x: index * 18, y: index * -8 }} transition={{ delay: index * 0.08 }} />
      ))}
    </div>
  );
});

const DeviceFrame = memo(function DeviceFrameComponent({ photos, filter, compact, timestamp }) {
  return (
    <div className={`device-frame ${compact ? 'compact' : ''}`}>
      <div className="side-icons">
        <span><Grid2X2 size={16} />2 shots</span>
        <span className="active"><Grid2X2 size={16} />4 shots</span>
        <span><Film size={16} />Film mode</span>
      </div>
      <div className="device-screen">
        <GradedPhoto filter={filter} src={photos[0]} alt="" />
        <CameraOverlay timestamp={timestamp} />
      </div>
      <div className="device-counter">3</div>
    </div>
  );
});

const StickerBubble = memo(function StickerBubbleComponent({ text, className = '', reduced }) {
  if (reduced) return <div className={`sticker-bubble ${className}`}>{text}</div>;
  return <motion.div className={`sticker-bubble ${className}`} animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }} transition={{ duration: 4, repeat: Infinity }}>{text}</motion.div>;
});

function HeroComponent({ onStart, onStudioOpen, photos, filter, timestamp }) {
  const prefersReduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 55, damping: 18 });
  const springY = useSpring(y, { stiffness: 55, damping: 18 });
  const rotate = useTransform(springX, [-80, 80], [-2.4, 2.4]);

  const handleMouseMove = useCallback((event) => {
    if (prefersReduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) / 16);
    y.set((event.clientY - rect.top - rect.height / 2) / 18);
  }, [x, y, prefersReduced]);

  const heroPhotos = photos.slice(0, 3);

  return (
    <section id="top" className="hero" onMouseMove={handleMouseMove}>
      <div className="hero-copy">
        <motion.div className="tag" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>digital memories, made beautiful</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          Make a photo strip<br />
          <span>that feels</span>
          <em> ICONIC</em>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          Capture with your camera or import your favorite shots, then style the strip with filters, templates, stickers, and clean downloads.
        </motion.p>
        <div className="hero-actions">
          <motion.button type="button" className="start-button" whileTap={{ scale: 0.95 }} whileHover={{ y: -3 }} onClick={onStart}>
            Start Booth <ChevronRight size={22} />
          </motion.button>
          {onStudioOpen && <button type="button" className="supporting-action" onClick={onStudioOpen}>Open group studio</button>}
          <a className="supporting-action" href="#templates">Browse templates</a>
        </div>
      </div>

      <motion.div className="hero-camera" style={{ x: springX, y: springY, rotate }} aria-hidden="true">
        <div className="camera-shell">
          <div className="camera-screen">
            <PhotoStack photos={heroPhotos} filter={filter} />
            <CameraOverlay timestamp={timestamp} />
          </div>
          <div className="camera-controls">
            <span className="camera-dot"><Sparkles size={15} /></span>
            <span className="shutter"><Camera size={28} /></span>
            <span>Y2K</span>
          </div>
        </div>
        <div className="tape tape-top" />
        <StickerBubble text="good vibes" className="hero-sticker one" reduced={prefersReduced} />
        <StickerBubble text="collect beautiful memories" className="hero-sticker two" reduced={prefersReduced} />
      </motion.div>

      <motion.div className="hero-side-device" initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.24, type: 'spring' }}>
        <DeviceFrame photos={photos} filter={filter} compact timestamp={timestamp} />
      </motion.div>
    </section>
  );
}

export const Hero = memo(HeroComponent);
