import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

export default function Select({value, onChange, options, placeholder, disabled, className}) {
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({left: 0, top: 0, width: 0});
    const [highlighted, setHighlighted] = useState(-1);

    const selectedOption = options.find((o) => o.value === value) || null;

    function openMenu() {
        if (disabled) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const margin = 8;
        const menuHeight = Math.min(options.length * 30 + 10, 260);
        const overflowsBottom = rect.bottom + menuHeight > window.innerHeight - margin;
        setPosition({
            left: rect.left,
            top: overflowsBottom ? Math.max(margin, rect.top - menuHeight) : rect.bottom + 4,
            width: rect.width
        });
        setHighlighted(Math.max(0, options.findIndex((o) => o.value === value)));
        setOpen(true);
    }

    useEffect(() => {
        if (!open) return undefined;

        function handleClick(e) {
            const insideTrigger = triggerRef.current && triggerRef.current.contains(e.target);
            const insideMenu = menuRef.current && menuRef.current.contains(e.target);
            if (!insideTrigger && !insideMenu) setOpen(false);
        }

        function handleKey(e) {
            if (e.key === 'Escape') {
                setOpen(false);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlighted((h) => Math.min(options.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlighted((h) => Math.max(0, h - 1));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (highlighted >= 0 && options[highlighted]) {
                    onChange(options[highlighted].value);
                    setOpen(false);
                }
            }
        }

        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open, options, highlighted, onChange]);

    return (
        <>
            <button type="button"
                    ref={triggerRef}
                    className={`custom-select-trigger ${className || ''} ${open ? 'is-open' : ''}`}
                    disabled={disabled}
                    onClick={() => (open ? setOpen(false) : openMenu())}>
                <span className={`custom-select-value ${!selectedOption ? 'is-placeholder' : ''}`}>
                    {selectedOption ? selectedOption.label : (placeholder || '')}
                </span>
                <i className="fa-solid fa-chevron-down custom-select-chevron"/>
            </button>
            {open && createPortal(
                <div className="context-menu custom-select-menu" ref={menuRef}
                     style={{left: position.left, top: position.top, width: position.width}}>
                    {options.length === 0 && <div className="custom-select-empty">—</div>}
                    {options.map((o, i) => (
                        <button type="button"
                                key={o.value}
                                className={`context-menu-item custom-select-option ${o.value === value ? 'is-selected' : ''} ${i === highlighted ? 'is-highlighted' : ''}`}
                                onMouseEnter={() => setHighlighted(i)}
                                onClick={() => {
                                    onChange(o.value);
                                    setOpen(false);
                                }}>
                            <span className="custom-select-option-label">{o.label}</span>
                            {o.value === value && <i className="fa-solid fa-check"/>}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}