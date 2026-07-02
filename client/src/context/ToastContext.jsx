import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let idSeed = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind, message, opts = {}) => {
      const id = ++idSeed;
      const ttl = opts.ttl ?? (kind === 'error' ? 6000 : 4000);
      setToasts((prev) => [...prev, { id, kind, message }]);
      if (ttl > 0) setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  const api = {
    error: (m, o) => push('error', m, o),
    success: (m, o) => push('success', m, o),
    info: (m, o) => push('info', m, o),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};

const KIND_META = {
  error:   { Icon: AlertTriangle, tone: 'border-danger/40 text-danger',   dot: 'bg-danger'  },
  success: { Icon: CheckCircle2,  tone: 'border-success/40 text-success', dot: 'bg-success' },
  info:    { Icon: Info,          tone: 'border-accent/40 text-accent',   dot: 'bg-accent'  },
};

const ToastViewport = ({ toasts, onDismiss }) => {
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 max-w-[360px] w-[calc(100vw-2rem)] pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
};

const ToastCard = ({ toast, onDismiss }) => {
  const { Icon, tone, dot } = KIND_META[toast.kind] || KIND_META.info;
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      style={{
        transform: enter ? 'translateY(0)' : 'translateY(-6px)',
        opacity: enter ? 1 : 0,
        transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease-out',
      }}
      className={`pointer-events-auto flex items-start gap-3 bg-surface-2 rounded-md px-3.5 py-3 border shadow-[0_10px_30px_rgba(0,0,0,0.4)] ${tone}`}
    >
      <Icon className="h-4 w-4 mt-[2px] shrink-0" />
      <p className="flex-1 text-[13px] leading-snug text-ink tracking-tight">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="text-ink-dim hover:text-ink transition-colors -mr-1 -mt-1 p-1"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default ToastProvider;
