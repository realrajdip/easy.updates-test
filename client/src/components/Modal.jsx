import React, { useEffect, useId, useRef } from 'react';
import ReactDOM from 'react-dom';

/**
 * Modal — accessible dialog primitive.
 *
 * - role="dialog" + aria-modal="true" + aria-labelledby
 * - Escape and outside-click close
 * - Focus trap (Tab cycles within modal)
 * - Restores focus to the previously focused element on unmount
 * - Locks body scroll while open
 *
 * Props:
 *   open          (bool) controls mount; parent owns the state
 *   onClose       () => void
 *   labelledBy    optional id of the heading; auto-generated otherwise
 *   describedBy   optional id of the description
 *   className     extra classes on the panel
 *   panelStyle    inline style on the panel (rare; tokens preferred)
 *   maxWidth      pixel width cap (default 640)
 *   align         'center' | 'bottom-sheet' (default 'center', bottom-sheet on mobile)
 *   initialFocus  ref to focus on open (otherwise focuses the first focusable element in panel)
 */
const Modal = ({
  open,
  onClose,
  labelledBy,
  describedBy,
  className = '',
  panelStyle,
  maxWidth = 640,
  align = 'center',
  initialFocus,
  children,
}) => {
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const autoLabelId = useId();
  const titleId = labelledBy || `dlg-${autoLabelId}`;

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyPR = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Compensate for scrollbar disappearing to avoid layout shift
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.paddingRight = prevBodyPR;
    };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus management
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;

    // After mount, focus either the supplied ref or the first focusable
    const t = setTimeout(() => {
      if (initialFocus?.current) {
        initialFocus.current.focus();
        return;
      }
      const first = panelRef.current?.querySelector(focusableSelector);
      if (first) first.focus();
      else panelRef.current?.focus();
    }, 0);

    return () => {
      clearTimeout(t);
      // Restore focus
      const target = previouslyFocusedRef.current;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    };
  }, [open, initialFocus]);

  // Focus trap (Tab / Shift+Tab)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = panelRef.current?.querySelectorAll(focusableSelector);
      if (!focusables || focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const list = Array.from(focusables).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const node = panelRef.current;
    node?.addEventListener('keydown', onKeyDown);
    return () => node?.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const alignClasses =
    align === 'bottom-sheet'
      ? 'items-end md:items-center p-0 md:p-6'
      : 'items-center p-4';

  return ReactDOM.createPortal(
    <div
      className={`fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex justify-center animate-fade-in ${alignClasses}`}
      onMouseDown={(e) => {
        // Close only when the click *starts* on the backdrop, so a drag-release
        // inside the panel doesn't dismiss the modal.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        style={{ maxWidth, ...(panelStyle || {}) }}
        className={`surface-1 w-full overflow-y-auto no-scrollbar max-h-[92vh] md:max-h-[88vh] outline-none animate-scale-in border border-hairline ${align === 'bottom-sheet' ? 'rounded-t-xxl md:rounded-xxl' : 'rounded-xxl'
          } ${className}`}
      >
        {/* Children render their own header/body/footer; the title must use the `titleId` from context */}
        <ModalTitleContext.Provider value={titleId}>{children}</ModalTitleContext.Provider>
      </div>
    </div>,
    document.body
  );
};

const focusableSelector =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable="true"]';

/* ─── Title id context so consumers can wire aria-labelledby on the heading ── */
const ModalTitleContext = React.createContext(null);
export const useModalTitleId = () => React.useContext(ModalTitleContext);

export default Modal;
