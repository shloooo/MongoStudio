const HIDDEN_NAMESPACES = new Set([
    'admin.system.users',
    'admin.system.version',
    'config.system.sessions'
]);

export function isHiddenNamespace(dbName, collection) {
    return HIDDEN_NAMESPACES.has(`${dbName}.${collection}`);
}

export function filterVisibleCollections(dbName, collections) {
    return (collections || []).filter((c) => !isHiddenNamespace(dbName, c.name));
}
