import React, { useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FeedbackOverlay } from './FeedbackOverlay.jsx';
import { Header } from './Header.jsx';
import { MobileMenu } from './MobileMenu.jsx';

export function SiteChrome({
  audioOn,
  toggleAudio,
  nextTrack,
  currentPage,
  capturedCount,
  onGoToEditor,
  onGoHome,
  onStudioOpen,
}) {
  const [isFeedbackOpen, setFeedbackOpen] = useState(false);
  const [isMenuOpen, setMenuOpen] = useState(false);

  const onFeedbackOpen = useCallback(() => setFeedbackOpen(true), []);
  const onMenuOpen = useCallback(() => setMenuOpen(true), []);
  const onFeedbackClose = useCallback(() => setFeedbackOpen(false), []);
  const onMenuClose = useCallback(() => setMenuOpen(false), []);

  const onMobileFeedbackOpen = useCallback(() => {
    setMenuOpen(false);
    setFeedbackOpen(true);
  }, []);

  return (
    <>
      <Header
        onGoHome={onGoHome}
        audioOn={audioOn}
        toggleAudio={toggleAudio}
        nextTrack={nextTrack}
        onFeedbackOpen={onFeedbackOpen}
        onMenuOpen={onMenuOpen}
        onStudioOpen={onStudioOpen}
        currentPage={currentPage}
        capturedCount={capturedCount}
        onGoToEditor={onGoToEditor}
        isMenuOpen={isMenuOpen}
      />
      <AnimatePresence>
        {isFeedbackOpen && (
          <FeedbackOverlay
            onClose={onFeedbackClose}
            ownerEmail="jeswinjoeanil5@gmail.com"
          />
        )}
      </AnimatePresence>
      <MobileMenu
        isOpen={isMenuOpen}
        onClose={onMenuClose}
        onFeedbackOpen={onMobileFeedbackOpen}
        currentPage={currentPage}
        capturedCount={capturedCount}
        onGoToEditor={onGoToEditor}
        onStudioOpen={onStudioOpen}
      />
    </>
  );
}
