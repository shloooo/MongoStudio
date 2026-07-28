import React, {useEffect, useRef, useState} from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [openSubmenu, setOpenSubmenu] = useState(null); // { index, x, y, left }

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
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

  const style = { left: x, top: y };

  function openSubmenuFor(index, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const submenuWidth = 190;
    const overflowsRight = rect.right + submenuWidth > window.innerWidth;
    setOpenSubmenu({
      index,
      top: rect.top,
      left: overflowsRight ? rect.left - submenuWidth : rect.right
    });
  }

  return (
      <div className="context-menu" style={style} ref={ref}>
        {items.map((item, i) =>
            item.hidden ? "" : item.separator ? (
                <div key={i} className="context-menu-sep"/>
            ) : item.submenu ? (
                <div key={i}
                     className="context-menu-item-wrapper"
                     onMouseEnter={(e) => {
                       if (!item.disabled) openSubmenuFor(i, e);
                     }}
                     onMouseLeave={() => setOpenSubmenu((s) => (s && s.index === i ? null : s))}>
                  <button type="button"
                          className={`context-menu-item context-menu-item-parent ${item.danger ? 'danger' : ''}`}
                          disabled={item.disabled}>
                    <span>{item.label}</span>
                    <span className="context-menu-arrow">›</span>
                  </button>
                  {openSubmenu && openSubmenu.index === i && (
                      <div className="context-menu context-submenu"
                           style={{left: openSubmenu.left, top: openSubmenu.top}}>
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
                      </div>
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
      </div>
  );
}