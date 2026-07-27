import React, { useState, useEffect } from 'react';

export default function TitleBar({ title }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = window.api.window.platform === 'darwin';

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized);
    const unsubscribe = window.api.window.onMaximizedChange(setIsMaximized);
    return unsubscribe;
  }, []);

  return (
    <div className={`titlebar ${isMac ? 'is-mac' : 'is-win'}`}>
      {isMac && <div className="titlebar-traffic-spacer" />}
      <div className="titlebar-drag-region">
        <span className="titlebar-title">{title}</span>
      </div>
      {!isMac && (
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => window.api.window.minimize()} aria-label="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button className="titlebar-btn" onClick={() => window.api.window.toggleMaximize()} aria-label="Maximize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button className="titlebar-btn close" onClick={() => window.api.window.close()} aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1" /><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
