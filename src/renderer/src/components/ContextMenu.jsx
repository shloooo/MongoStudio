import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const submenuRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [openSubmenu, setOpenSubmenu] = useState(null); // { index, x, y, left }
  const [position, setPosition] = useState({ left: x, top: y, ready: false });

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  function cancelSubmenuClose() {
    clearTimeout(closeTimerRef.current);
  }

  function scheduleSubmenuClose(index) {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setOpenSubmenu((s) => (s && s.index === index ? null : s));
    }, 150);
  }

  useEffect(() => {
    function handleClick(e) {
      const insideMain = ref.current && ref.current.contains(e.target);
      const insideSubmenu = submenuRef.current && submenuRef.current.contains(e.target);
      if (!insideMain && !insideSubmenu) onClose();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    setPosition({ left, top, ready: true });
  }, [x, y, items]);

  const style = { left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' };

  function openSubmenuFor(index, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const submenuWidth = 190;
    const submenuHeight = item_submenuHeight(items[index]);
    const margin = 8;
    const overflowsRight = rect.right + submenuWidth > window.innerWidth - margin;
    const overflowsBottom = rect.top + submenuHeight > window.innerHeight - margin;
    setOpenSubmenu({
      index,
      top: overflowsBottom ? Math.max(margin, window.innerHeight - submenuHeight - margin) : rect.top,
      left: overflowsRight ? rect.left - submenuWidth : rect.right
    });
  }

  function item_submenuHeight(item) {
    if (!item || !item.submenu) return 0;
    const rowHeight = 30;
    const sepHeight = 9;
    return item.submenu.reduce((sum, sub) => sum + (sub.separator ? sepHeight : rowHeight), 10);
  }

  return createPortal(
      <div className="context-menu" style={style} ref={ref}>
        {items.map((item, i) =>
            item.hidden ? "" : item.separator ? (
                <div key={i} className="context-menu-sep"/>
            ) : item.submenu ? (
                <div key={i}
                     className="context-menu-item-wrapper"
                     onMouseEnter={(e) => {
                       cancelSubmenuClose();
                       if (!item.disabled) openSubmenuFor(i, e);
                     }}
                     onMouseLeave={() => scheduleSubmenuClose(i)}>
                  <button type="button"
                          className={`context-menu-item context-menu-item-parent ${item.danger ? 'danger' : ''}`}
                          disabled={item.disabled}>
                    <span>{item.label}</span>
                    <span className="context-menu-arrow">›</span>
                  </button>
                  {openSubmenu && openSubmenu.index === i && createPortal(
                      <div className="context-menu context-submenu"
                           ref={submenuRef}
                           style={{left: openSubmenu.left, top: openSubmenu.top}}
                           onMouseEnter={cancelSubmenuClose}
                           onMouseLeave={() => scheduleSubmenuClose(i)}>
                        {item.submenu.map((sub, j) =>
                            sub.separator ? (
                                <div key={j} className="context-menu-sep"/>
                            ) : (
                                <button key={j}
                                        className={`context-menu-item ${sub.danger ? 'danger' : ''}`}
                                        disabled={sub.disabled}
                                        onClick={() => {
                                          sub.onClick();
                                          onClose();
                                        }}>
                                  {sub.label}
                                </button>
                            )
                        )}
                      </div>,
                      document.body
                  )}
                </div>
            ) : (
                <button key={i}
                        className={`context-menu-item ${item.danger ? 'danger' : ''}`}
                        disabled={item.disabled}
                        onClick={() => {
                          item.onClick();
                          onClose();
                        }}>
                  {item.label}
                </button>
            )
        )}
      </div>,
      document.body
  );
}