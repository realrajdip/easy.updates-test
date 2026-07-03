import React, { useState, useEffect } from 'react';

const GlobalLoader = () => {
  const [activeRequests, setActiveRequests] = useState(0);

  useEffect(() => {
    let lastInteractionBtn = null;
    let lastInteractionTime = 0;

    const recordInteraction = (e) => {
      const btn = e.target.closest('button');
      if (btn) {
        // Exclude sidebar (aside), mobile nav (nav), or explicitly opted-out buttons
        const isExcluded = btn.closest('aside') || btn.closest('nav') || btn.getAttribute('data-no-loader') === 'true';
        if (!isExcluded) {
          lastInteractionBtn = btn;
          lastInteractionTime = Date.now();
        }
      }
    };

    // Capture clicks and keyboard activations
    document.addEventListener('click', recordInteraction, true);
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') recordInteraction(e);
    };
    document.addEventListener('keydown', handleKeyDown, true);

    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const input = args[0];
      const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
      const isBackground =
        urlStr.includes('/comments') ||
        urlStr.includes('/read') ||
        urlStr.includes('/status-override') ||
        urlStr.includes('/notifications') ||
        urlStr.includes('/presence') ||
        urlStr.includes('/typing');

      if (isBackground) {
        return originalFetch(...args);
      }

      setActiveRequests((prev) => prev + 1);

      let targetBtn = null;
      // If a fetch starts within 50ms of a button interaction, attach loader to that button
      if (lastInteractionBtn && Date.now() - lastInteractionTime < 50) {
        targetBtn = lastInteractionBtn;
      } else if (document.activeElement && document.activeElement.closest('button') && Date.now() - lastInteractionTime < 50) {
        const activeBtn = document.activeElement.closest('button');
        if (activeBtn) {
          const isExcluded = activeBtn.closest('aside') || activeBtn.closest('nav') || activeBtn.getAttribute('data-no-loader') === 'true';
          if (!isExcluded) {
            targetBtn = activeBtn;
          }
        }
      }

      if (targetBtn) {
        const currentCount = parseInt(targetBtn.getAttribute('data-fetch-count') || '0', 10);
        targetBtn.setAttribute('data-fetch-count', currentCount + 1);
        targetBtn.setAttribute('data-loading', 'true');
      }

      try {
        const response = await originalFetch(...args);
        return response;
      } finally {
        setActiveRequests((prev) => Math.max(0, prev - 1));
        if (targetBtn) {
          const newCount = parseInt(targetBtn.getAttribute('data-fetch-count') || '0', 10) - 1;
          if (newCount <= 0) {
            targetBtn.removeAttribute('data-fetch-count');
            targetBtn.removeAttribute('data-loading');
          } else {
            targetBtn.setAttribute('data-fetch-count', newCount);
          }
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener('click', recordInteraction, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  if (activeRequests === 0) return null;

  return (
    <div className="fixed top-0 left-0 w-full h-[3px] z-[999999] overflow-hidden bg-transparent pointer-events-none">
      <div className="h-full bg-accent animate-progress-indeterminate" />
    </div>
  );
};

export default GlobalLoader;
