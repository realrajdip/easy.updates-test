import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const ConfirmModal = ({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDanger = false
}) => {
  const panelRef = useRef(null);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  // Escape key close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        ref={panelRef}
        style={{ background: '#121212', border: '1px solid rgba(255,255,255,0.06)' }}
        className="w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-scale-in flex flex-col gap-5"
      >
        <div>
          <h3 className="text-[17px] font-bold text-white tracking-tight">{title}</h3>
          <p className="text-[13.5px] text-[#8e8e93] mt-2 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex items-center gap-2.5 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-full bg-[#1c1c1e] text-white hover:bg-[#2c2c2e] transition-colors text-[13px] font-bold tracking-tight"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-full font-bold text-[13px] tracking-tight transition-colors ${
              isDanger
                ? 'bg-danger hover:bg-danger/80 text-white'
                : 'bg-white text-black hover:bg-zinc-200'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;
