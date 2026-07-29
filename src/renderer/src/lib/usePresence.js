import {useEffect, useRef, useState} from 'react';

export function usePresence(value, duration = 180) {
    const [state, setState] = useState({value, leaving: false});
    const timeoutRef = useRef(null);

    useEffect(() => {
        if (value) {
            clearTimeout(timeoutRef.current);
            setState({value, leaving: false});
        } else {
            setState((prev) => (prev.value ? {...prev, leaving: true} : prev));
            timeoutRef.current = setTimeout(() => {
                setState({value: null, leaving: false});
            }, duration);
        }
        return () => clearTimeout(timeoutRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return state;
}