let listeners = [];
let idCounter = 0;

export function reportError(message, source) {
    const entry = {
        id: ++idCounter,
        message: String(message || 'Unknown error'),
        source: source || null,
        time: Date.now()
    };
    listeners.forEach((cb) => {
        try {
            cb(entry);
        } catch {
            // ignore listener failures
        }
    });
    return entry;
}

export function subscribeErrors(cb) {
    listeners.push(cb);
    return () => {
        listeners = listeners.filter((l) => l !== cb);
    };
}