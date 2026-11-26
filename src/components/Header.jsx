import React, { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CassetteTape,
  Menu,
  MessageSquare,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';

function HeaderComponent({
  audioOn,
  toggleAudio,
  nextTrack,
  onFeedbackOpen,
  onMenuOpen,
  onGoHome,
  onStudioOpen,
  currentPage = 'capture',
  capturedCount = 0,
  onGoToEditor,
  isMenuOpen = false,
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let ticking = false;
    let accumulatedDelta = 0;

    const updateScroll = () => {
      // Clamp scrollY to 0 to eliminate mobile bounce/rubber-banding jitter
      const currentScrollY = Math.max(0, window.scrollY);

      setIsScrolled(currentScrollY > 20);

      if (isMenuOpen || currentScrollY <= 60) {
        setIsVisible(true);
        accumulatedDelta = 0;
      } else {
        const diff = currentScrollY - lastScrollY.current;

        // Reset accumulator if scrolling direction changes
        if ((diff > 0 && accumulatedDelta < 0) || (diff < 0 && accumulatedDelta > 0)) {
          accumulatedDelta = 0;
        }

        accumulatedDelta += diff;

        // Hide smoothly when committed scroll down >= 24px
        if (accumulatedDelta > 24) {
          setIsVisible(false);
        }
        // Reveal smoothly when committed scroll up <= -18px
        else if (accumulatedDelta < -18) {
          setIsVisible(true);
        }
      }

      lastScrollY.current = currentScrollY;
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScroll);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMenuOpen]);

  const links = currentPage === '404' || (currentPage === 'editor' && !capturedCount) ? [] : currentPage === 'editor'
    ? [
      { label: 'Templates', href: '#templates' },
      { label: 'Editor', href: '#strip-preview' },
      { label: 'Export', href: '#downloads' },
    ]
    : [
      { label: 'Booth', href: '#booth' },
      { label: 'Templates', href: '#templates' },
    ];

  return (
    <motion.header
      className={`site-header ${isVisible ? 'header-visible' : 'header-hidden'} ${isScrolled ? 'scrolled' : ''}`}
      initial={{ y: -40, opacity: 0, scale: 0.98 }}
      animate={{
        y: isVisible ? 0 : -84,
        opacity: isVisible ? 1 : 0,
        scale: isVisible ? 1 : 0.98,
      }}
      transition={{
        type: 'spring',
        stiffness: 130,
        damping: 21,
        mass: 0.8,
      }}
      style={{
        pointerEvents: isVisible ? 'auto' : 'none',
        willChange: 'transform, opacity',
      }}
    >
      <button type="button" className="brand" onClick={onGoHome}>memorie<span>+</span></button>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {links.map((link) => (
          <a key={link.href} href={link.href}>{link.label}</a>
        ))}
        {currentPage === 'capture' && capturedCount > 0 && (
          <button type="button" className="nav-action-btn" onClick={onGoToEditor}>
            Edit strip
          </button>
        )}
        {onStudioOpen && <button type="button" className="studio-nav-btn" onClick={onStudioOpen}>
          <Sparkles size={13} className="studio-sparkle-icon" />
          <span className="studio-text">STUDIO</span>
          <span className="studio-nav-star">✦</span>
        </button>}
        <button type="button" className="feedback-link-btn" onClick={onFeedbackOpen}>
          <MessageSquare size={14} /> Feedback
        </button>
      </nav>
      <div className="header-actions">
        <div className="audio-controls-group">
          <button type="button" className="pill-button audio-toggle" onClick={toggleAudio} aria-pressed={audioOn}>
            <CassetteTape size={16} />
            <span className="audio-label">{audioOn ? 'Sound On' : 'Sound Off'}</span>
            <Sparkles size={14} />
          </button>
          {audioOn && (
            <button type="button" className="icon-button skip-button" onClick={nextTrack} aria-label="Play next track" title="Next track">
              <RefreshCcw size={16} />
            </button>
          )}
        </div>
        <button type="button" className="icon-button feedback-mobile-btn" onClick={onFeedbackOpen} aria-label="Feedback">
          <MessageSquare size={20} />
        </button>
        <button type="button" className="icon-button menu-btn" onClick={onMenuOpen} aria-label="Open menu" aria-expanded={isMenuOpen} aria-haspopup="true"><Menu size={20} /></button>
      </div>
    </motion.header>
  );
}

export const Header = memo(HeaderComponent);

