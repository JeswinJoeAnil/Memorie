import React from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus.js';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, Sparkles, X } from 'lucide-react';

export function MobileMenu({ isOpen, onClose, onFeedbackOpen, onStudioOpen, currentPage = 'capture', capturedCount = 0, onGoToEditor }) {
  const dialog = useDialogFocus(isOpen, onClose);
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="mobile-menu-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ zIndex: 3000 }}
        >
          <div className="menu-backdrop" onClick={onClose} role="presentation" />
          <motion.div
            ref={dialog}
            className="menu-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <button type="button" className="close-menu" onClick={onClose} aria-label="Close menu">
              <X size={24} />
            </button>
            <h2 id="mobile-menu-title" className="sr-only">Menu</h2>
            <div className="menu-links">
              {links.map((link, idx) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + idx * 0.05 }}
                  whileHover={{ x: 10, color: '#ff4090' }}
                >
                  {link.label}
                </motion.a>
              ))}
              {currentPage === 'capture' && capturedCount > 0 && (
                <motion.button
                  type="button"
                  className="menu-feedback-btn menu-edit-btn"
                  onClick={() => { onClose(); onGoToEditor?.(); }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.28 }}
                  whileHover={{ scale: 1.05, x: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Edit strip
                </motion.button>
              )}
              {onStudioOpen && <motion.button
                type="button"
                className="menu-feedback-btn menu-studio-btn"
                onClick={() => { onClose(); onStudioOpen?.(); }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.32 }}
                whileHover={{ scale: 1.05, x: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles size={18} /> STUDIO ✦
              </motion.button>}
              <motion.button
                type="button"
                className="menu-feedback-btn"
                onClick={() => { onClose(); onFeedbackOpen(); }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ scale: 1.05, x: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <MessageSquare size={18} /> Give Feedback
              </motion.button>
            </div>
            <div className="menu-footer">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                ✦ memorie+ photobooth ✦
              </motion.span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
