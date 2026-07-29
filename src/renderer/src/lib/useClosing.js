import {useCallback, useEffect, useRef, useState} from 'react';

export function useClosing(onClose, duration = 160) {
    const [closing, setClosing] = useState(false);
    const timeoutRef = useRef(null);

    useEffect(() => () => clearTimeout(timeoutRef.current), []);

    const requestClose = useCallback((after) => {
        if (timeoutRef.current) return;
        setClosing(true);
        timeoutRef.current = setTimeout(() => {
            (after || onClose)();
        }, duration);
    }, [onClose, duration]);

    return {closing, requestClose};
}