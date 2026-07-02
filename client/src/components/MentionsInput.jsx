import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

const MentionsInput = forwardRef(function MentionsInput({
  value,
  onChange,
  onSubmit,
  onTyping,
  users = [],
  placeholder = 'Write a comment…',
}, ref) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const handleScroll = (e) => {
    if (highlightRef.current) highlightRef.current.scrollTop = e.target.scrollTop;
  };

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    const newHeight = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    textareaRef.current.style.height = newHeight;
    if (highlightRef.current) highlightRef.current.style.height = newHeight;
  }, [value]);

  const allTargetUsers = [
    { _id: 'everyone', username: 'everyone', avatarColor: '#6a4cf5' },
    ...users,
  ];

  const handleKeyDown = (e) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectUser(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  };

  const handleInputChange = (e) => {
    const text = e.target.value;
    onChange(text);
    if (onTyping) onTyping();

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, selectionStart);
    const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbolIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtSymbolIndex + 1);
      const hasSpace = /\s/.test(textAfterAt);
      if (!hasSpace) {
        setMentionTriggerIndex(lastAtSymbolIndex);
        setSearchQuery(textAfterAt.toLowerCase());
        setShowSuggestions(true);
        setActiveIndex(0);
        return;
      }
    }
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (!showSuggestions) return;
    const filtered = allTargetUsers.filter((u) =>
      u.username.toLowerCase().includes(searchQuery)
    );
    setSuggestions(filtered);
    if (filtered.length === 0) setShowSuggestions(false);
  }, [searchQuery, showSuggestions]); // eslint-disable-line

  const selectUser = (selectedUser) => {
    if (!selectedUser) return;
    const text = textareaRef.current.value;
    const selectionStart = textareaRef.current.selectionStart;
    const beforeMention = text.slice(0, mentionTriggerIndex);
    const afterMention = text.slice(selectionStart);
    const insertedMention = `@${selectedUser.username} `;
    const newText = beforeMention + insertedMention + afterMention;
    onChange(newText);
    setShowSuggestions(false);
    setTimeout(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const cursorPosition = mentionTriggerIndex + insertedMention.length;
      textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
    }, 10);
  };

  const isValidMention = (word) => {
    if (!word.startsWith('@')) return false;
    const cleanUsername = word.slice(1).replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').toLowerCase();
    if (cleanUsername === 'everyone') return true;
    return users.some((u) => u.username.toLowerCase() === cleanUsername);
  };

  return (
    <div className="mentions-container flex flex-col gap-2 w-full">
      <div className="relative w-full">
        {/* Highlight mirror layer (rendered behind the textarea) */}
        <div
          ref={highlightRef}
          className="absolute inset-0 pointer-events-none z-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 leading-relaxed"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            letterSpacing: '-0.01em',
            lineHeight: '1.625',
            color: 'transparent',
          }}
        >
          {value.split(/(\s+)/).map((part, i) =>
            isValidMention(part) ? (
              <span
                key={i}
                className="rounded-sm"
                style={{ background: 'rgba(59, 130, 246, 0.38)', borderRadius: '3px', boxShadow: '4px 0 0 rgba(59, 130, 246, 0.38), -4px 0 0 rgba(59, 130, 246, 0.38)' }}
              >
                {part}
              </span>
            ) : (
              part
            )
          )}
        </div>

        {/* Textarea (sits on top, transparent background) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder={placeholder}
          style={{ height: '28px', background: 'transparent' }}
          className="w-full min-h-[28px] max-h-[120px] resize-none py-2 px-3 overflow-y-auto leading-relaxed relative z-10 bg-transparent border-none outline-none focus:ring-0 text-[14px] text-ink shadow-none placeholder:text-ink-dim/50"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="mentions-dropdown">
          {suggestions.map((item, index) => (
            <div
              key={item._id}
              onMouseDown={(e) => {
                e.preventDefault();
                selectUser(item);
              }}
              className={`mentions-item ${index === activeIndex ? 'active' : ''}`}
            >
              <div
                style={{ backgroundColor: item.avatarColor }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
              >
                {item.username.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-[13px] tracking-tight text-ink">@{item.username}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default MentionsInput;
