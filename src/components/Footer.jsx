import React, { memo, useState, useCallback } from 'react';
import { asset } from '../constants/assets.js';

function FooterComponent() {
  const [email, setEmail] = useState('');
  const [submitStatus, setSubmitStatus] = useState('');

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setSubmitStatus('Please enter a valid email.');
      setTimeout(() => setSubmitStatus(''), 3000);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem('memorie-newsletter') || '[]');
      saved.push({ email, at: new Date().toISOString() });
      localStorage.setItem('memorie-newsletter', JSON.stringify(saved));
    } catch { /* storage full/blocked — still confirm honestly */ }
    setSubmitStatus("Thanks! Saved on this device (demo list — no emails sent yet).");
    setEmail('');
    setTimeout(() => setSubmitStatus(''), 4000);
  }, [email]);

  return (
    <footer className="site-footer">
      <img src={asset('sticker2_34.png')} alt="" className="f-sticker corner-l" aria-hidden="true" onError={(e) => { e.target.style.display = 'none'; }} />
      <img src={asset('stickers3_35.png')} alt="" className="f-sticker corner-r" aria-hidden="true" onError={(e) => { e.target.style.display = 'none'; }} />

      <div className="footer-marquee" aria-hidden="true">
        <div className="marquee-content">
          <span>✦ CAPTURE THE CHAOS ✦ NOSTALGIA FOREVER ✦ PRINT YOUR VIBE ✦ Y2K AESTHETIC </span>
          <span>✦ CAPTURE THE CHAOS ✦ NOSTALGIA FOREVER ✦ PRINT YOUR VIBE ✦ Y2K AESTHETIC </span>
        </div>
      </div>

      <div className="footer-content">
        <div className="footer-brand">
          <span className="f-typo">Sweetest Memories</span>
          <span className="f-tagline">keeping moments a little longer, one flash at a time ✦</span>
        </div>

        <form className="footer-newsletter" onSubmit={handleSubmit}>
          <label htmlFor="footer-email-input" className="footer-newsletter-label">Stay in the loop</label>
          <div className="footer-input-group">
            <input
              id="footer-email-input"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address for newsletter"
              required
            />
            <button type="submit">Join</button>
          </div>
          {submitStatus && <span className="footer-form-status" role="status">{submitStatus}</span>}
        </form>
      </div>

      <p className="footer-copyright">© 2026 Jeswin Joe Anil</p>
    </footer>
  );
}

export const Footer = memo(FooterComponent);
