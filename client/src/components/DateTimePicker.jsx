import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X, ChevronDown } from 'lucide-react';
import Select from './Select';

// Helpers to parse and format local datetime strings in YYYY-MM-DDTHH:mm format
const parseDateTime = (str) => {
  if (!str) return null;
  const [datePart, timePart] = str.split('T');
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
};

const formatDateTime = (date) => {
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const displayFormat = (str) => {
  if (!str) return 'Select date & time';
  const date = parseDateTime(str);
  if (!date) return str;
  const day = String(date.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
};

// Date math helpers
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfWeek = (year, month) => {
  const day = new Date(year, month, 1).getDay();
  // Map Sunday (0) to 6, Monday (1) to 0, Tuesday (2) to 1, etc.
  return day === 0 ? 6 : day - 1;
};

const DateTimePicker = ({ value, onChange, min, optional }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  
  // View state tracks which month/year the calendar grid currently displays
  const [viewDate, setViewDate] = useState(() => {
    const d = parseDateTime(value) || parseDateTime(min) || new Date();
    return { month: d.getMonth(), year: d.getFullYear() };
  });

  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  // Parse active date
  const activeDate = useMemo(() => parseDateTime(value), [value]);

  // Parse min date limit
  const minDateLimit = useMemo(() => parseDateTime(min), [min]);

  // Extract selected hours/minutes
  const hours = activeDate ? activeDate.getHours() : 12;
  const minutes = activeDate ? activeDate.getMinutes() : 0;

  // Handle position computation
  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH = 280; // Highly optimized compact calendar overlay height (~260px)
    const openBelow = spaceBelow >= dropH;
    
    const popoverWidth = 280; // Sleek and compact width
    let leftPos = rect.left;
    if (leftPos + popoverWidth > window.innerWidth) {
      leftPos = Math.max(12, window.innerWidth - popoverWidth - 12);
    }

    setDropdownStyle({
      position: 'fixed',
      left: leftPos,
      width: popoverWidth,
      zIndex: 99999,
      ...(openBelow
        ? { top: rect.bottom + 6 }
        : { bottom: window.innerHeight - rect.top + 6 }),
    });
  }, []);

  const handleToggle = () => {
    if (!isOpen) {
      reposition();
      const initialView = activeDate || minDateLimit || new Date();
      setViewDate({ month: initialView.getMonth(), year: initialView.getFullYear() });
    }
    setIsOpen(!isOpen);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        !e.target.closest('[data-datetime-picker-portal]')
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

  // Change Month handler
  const adjustMonth = (offset) => {
    setViewDate((prev) => {
      let nextMonth = prev.month + offset;
      let nextYear = prev.year;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      } else if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      return { month: nextMonth, year: nextYear };
    });
  };

  // Select a Day
  const handleSelectDay = (day) => {
    const targetDate = new Date(viewDate.year, viewDate.month, day, hours, minutes);
    
    // Double check min date boundary
    if (minDateLimit && targetDate < minDateLimit) {
      // If it falls below min due to hours/minutes, auto-snap to the min limit
      onChange(formatDateTime(minDateLimit));
    } else {
      onChange(formatDateTime(targetDate));
    }
  };

  // Adjust time details
  const handleTimeChange = (newHours, newMinutes) => {
    const baseDate = activeDate || minDateLimit || new Date();
    const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), newHours, newMinutes);
    
    if (minDateLimit && targetDate < minDateLimit) {
      onChange(formatDateTime(minDateLimit));
    } else {
      onChange(formatDateTime(targetDate));
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const now = new Date();
    if (minDateLimit && now < minDateLimit) {
      onChange(formatDateTime(minDateLimit));
    } else {
      onChange(formatDateTime(now));
    }
    setViewDate({ month: now.getMonth(), year: now.getFullYear() });
  };

  // Calendar render math
  const daysInMonth = getDaysInMonth(viewDate.year, viewDate.month);
  const firstDayIndex = getFirstDayOfWeek(viewDate.year, viewDate.month);
  const daysInPrevMonth = getDaysInMonth(viewDate.year, viewDate.month - 1 < 0 ? 11 : viewDate.month - 1);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Build grid items
  const gridItems = [];
  
  // Previous month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    gridItems.push({
      day: daysInPrevMonth - i,
      isCurrentMonth: false,
      disabled: true
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const isSelected = activeDate && 
      activeDate.getDate() === i && 
      activeDate.getMonth() === viewDate.month && 
      activeDate.getFullYear() === viewDate.year;

    // Disabled check (only date bounds, ignores hours)
    let disabled = false;
    if (minDateLimit) {
      const dayCompare = new Date(viewDate.year, viewDate.month, i, 23, 59, 59, 999);
      if (dayCompare < minDateLimit) {
        disabled = true;
      }
    }

    gridItems.push({
      day: i,
      isCurrentMonth: true,
      isSelected,
      disabled
    });
  }

  // Next month padding days (up to fill 42 cells grid size)
  const remainingCells = 42 - gridItems.length;
  for (let i = 1; i <= remainingCells; i++) {
    gridItems.push({
      day: i,
      isCurrentMonth: false,
      disabled: true
    });
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="input flex items-center justify-between text-left cursor-pointer select-none bg-surface-1 border border-hairline rounded-md py-2.5 px-3.5"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarIcon className="h-4 w-4 text-ink-dim shrink-0" />
          <span className={`text-[14.5px] truncate tracking-tight ${value ? 'text-ink' : 'text-ink-dim'}`}>
            {displayFormat(value)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {optional && value && (
            <span
              role="button"
              onClick={handleClear}
              className="p-1 rounded-full text-ink-dim hover:text-ink hover:bg-surface-3 transition-colors"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-ink-dim transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          data-datetime-picker-portal
          style={dropdownStyle}
          className="bg-surface-2 border border-hairline rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.6)] p-3 flex flex-col gap-2.5 animate-scale-in"
        >
          {/* Header navigation */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => adjustMonth(-1)}
              className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors border border-hairline bg-surface-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[12.5px] font-semibold text-ink tracking-tight select-none">
              {monthNames[viewDate.month]} {viewDate.year}
            </span>
            <button
              type="button"
              onClick={() => adjustMonth(1)}
              className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors border border-hairline bg-surface-1"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Calendar Table */}
          <div className="flex flex-col gap-0.5">
            {/* Days header row */}
            <div className="grid grid-cols-7 text-center">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w, idx) => (
                <span key={idx} className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-dim py-0.5">
                  {w}
                </span>
              ))}
            </div>

            {/* Grid days */}
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {gridItems.map((item, idx) => {
                let cellClass = "text-[11.5px] w-[36px] h-[28px] rounded-md select-none transition-colors flex items-center justify-center ";
                
                if (item.disabled) {
                  cellClass += "text-ink-muted/15 cursor-not-allowed";
                } else if (!item.isCurrentMonth) {
                  cellClass += "text-ink-muted/30 cursor-default";
                } else if (item.isSelected) {
                  cellClass += "bg-accent text-white font-semibold";
                } else {
                  cellClass += "text-ink hover:bg-surface-3 cursor-pointer";
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => item.isCurrentMonth && handleSelectDay(item.day)}
                    className={cellClass}
                  >
                    {item.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Unified Compact Time Selector and Action Footer */}
          <div className="border-t border-hairline-soft pt-2.5 flex items-center justify-between gap-1.5 px-0.5">
            {/* Time select dropdowns */}
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-ink-dim shrink-0" />
              <Select
                value={hours}
                disabled={!activeDate}
                onChange={(val) => handleTimeChange(Number(val), minutes)}
                hideChevron
                className="bg-surface-1 text-ink border border-hairline rounded-md text-center py-0.5 px-1 text-[12px] outline-none cursor-pointer focus:border-accent disabled:opacity-40 disabled:cursor-not-allowed appearance-none font-medium text-center flex items-center justify-center"
                style={{ width: '38px', flex: 'none' }}
                options={Array.from({ length: 24 }).map((_, i) => ({
                  value: i,
                  label: String(i).padStart(2, '0')
                }))}
              />
              <span className="text-ink-dim font-bold text-[11px]">:</span>
              <Select
                value={minutes}
                disabled={!activeDate}
                onChange={(val) => handleTimeChange(hours, Number(val))}
                hideChevron
                className="bg-surface-1 text-ink border border-hairline rounded-md text-center py-0.5 px-1 text-[12px] outline-none cursor-pointer focus:border-accent disabled:opacity-40 disabled:cursor-not-allowed appearance-none font-medium text-center flex items-center justify-center"
                style={{ width: '38px', flex: 'none' }}
                options={Array.from({ length: 60 }).map((_, i) => ({
                  value: i,
                  label: String(i).padStart(2, '0')
                }))}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSelectToday}
                className="text-[12px] text-accent font-medium hover:underline py-1 px-0.5"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="bg-white text-black text-[11.5px] font-semibold rounded-pill px-3 py-1 hover:bg-white/90 active:scale-95 transition-transform"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DateTimePicker;
