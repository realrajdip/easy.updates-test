import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

const Select = ({
  value,
  onChange,
  options = [],
  className = 'input flex items-center justify-between text-left cursor-pointer',
  activeClassName = 'border-accent shadow-[0_0_0_3px_rgba(0,153,255,0.15)]',
  disabled = false,
  style = {},
  hideChevron = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  // Find label of active option
  const activeOption = options.find((opt) => opt.value === value) || options[0];
  const activeLabel = activeOption ? activeOption.label : '';

  // Reposition dropdown to match trigger size and location
  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    
    // Approximate maximum height of options dropdown
    const dropH = Math.min(options.length * 36 + 12, 220);
    const openBelow = spaceBelow >= dropH || spaceBelow >= 120;

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      minWidth: Math.max(rect.width, 130),
      width: 'max-content',
      zIndex: 99999,
      ...(openBelow
        ? { top: rect.bottom + 4 }
        : { bottom: window.innerHeight - rect.top + 4 }),
    });
  }, [options.length]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) reposition();
    setIsOpen(!isOpen);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        !e.target.closest('[data-select-portal]')
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Handle scroll/resize updates
  useEffect(() => {
    if (!isOpen) return;
    const handle = () => reposition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [isOpen, reposition]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className="relative flex-1" ref={containerRef} style={style}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`${className} select-none transition-colors ${
          isOpen ? activeClassName : ''
        }`}
      >
        <span className="truncate">{activeLabel}</span>
        {!hideChevron && (
          <ChevronDown className={`h-3.5 w-3.5 text-ink-dim transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          data-select-portal
          style={dropdownStyle}
          className="bg-surface-2 border border-hairline rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.6)] py-1 overflow-y-auto max-h-[220px] no-scrollbar animate-scale-in"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center justify-between px-3 py-2 text-[13px] text-left transition-colors font-body ${
                  isSelected
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-ink hover:bg-surface-3'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

export default Select;
