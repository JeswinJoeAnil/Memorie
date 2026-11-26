import { useEffect, useRef } from 'react';

export function useDialogFocus(open, onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(dialog.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]'
    )).filter(el => el.getClientRects().length);
    (controls()[0] || dialog).focus();
    const keydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      } else if (event.key === 'Tab') {
        const items = controls();
        const next = event.shiftKey ? items.at(-1) : items[0];
        const edge = event.shiftKey ? items[0] : items.at(-1);
        if (!dialog.contains(document.activeElement) || document.activeElement === edge || !items.length) {
          event.preventDefault();
          (next || dialog).focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = overflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
