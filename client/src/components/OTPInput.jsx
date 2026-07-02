import React, { useRef, useEffect } from 'react';

const OTPInput = ({ length = 6, value, onChange, autoFocus = false }) => {
  const inputsRef = useRef([]);

  useEffect(() => {
    if (autoFocus && inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (e, index) => {
    let val = e.target.value.replace(/\D/g, ''); // Only allow digits
    
    // Handle paste of multiple characters into a single input
    if (val.length > 1) {
      const pasteVal = val.slice(0, length);
      onChange(pasteVal);
      // Focus the next empty input, or the last one
      const nextIndex = Math.min(pasteVal.length, length - 1);
      inputsRef.current[nextIndex]?.focus();
      return;
    }

    const newOtp = value.split('');
    newOtp[index] = val;
    const finalOtp = newOtp.join('').slice(0, length);
    onChange(finalOtp);

    // Auto-focus next input
    if (val && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      // If backspace pressed on empty input, focus previous
      inputsRef.current[index - 1]?.focus();
      
      // Also delete the previous character
      const newOtp = value.split('');
      newOtp[index - 1] = '';
      onChange(newOtp.join(''));
    }
    
    if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      const nextIndex = Math.min(pastedData.length, length - 1);
      inputsRef.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="flex justify-between gap-2 sm:gap-3" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={value.length === i ? 6 : 1} 
          // allow paste to capture full string if focused on first input
          value={value[i] || ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onFocus={(e) => e.target.select()}
          className="w-10 h-12 sm:w-12 sm:h-14 bg-surface-1 border border-hairline rounded-lg text-center text-xl font-mono text-ink focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
          required
        />
      ))}
    </div>
  );
};

export default OTPInput;
