export function formatResource(resource) {
    if (!resource) return 'unknown';
    if (resource.anyResource) return 'any resource';
    if (resource.cluster) return 'cluster';
    if (resource.system_buckets !== undefined) return `system buckets: ${resource.system_buckets || '*'}`;
    const db = resource.db === '' ? '*' : resource.db;
    const collection = resource.collection === '' ? '*' : resource.collection;
    return `${db}.${collection}`;
}

export function isWildcardResource(resource) {
    if (!resource) return false;
    if (resource.anyResource || resource.cluster) return true;
    return resource.db === '' || resource.collection === '';
}

export function formatRole(role) {
    return `${role.role}@${role.db}`;
}

export function sameRole(a, b) {
    return a.role === b.role && a.db === b.db;
}

export function groupPrivilegesByResource(privileges) {
    const byResource = new Map();
    for (const privilege of privileges || []) {
        const label = formatResource(privilege.resource);
        const existing = byResource.get(label);
        if (existing) {
            for (const action of privilege.actions || []) existing.actions.add(action);
        } else {
            byResource.set(label, {
                label,
                resource: privilege.resource,
                wildcard: isWildcardResource(privilege.resource),
                actions: new Set(privilege.actions || [])
            });
        }
    }
    return Array.from(byResource.values())
        .map((entry) => ({...entry, actions: Array.from(entry.actions).sort()}))
        .sort((a, b) => a.label.localeCompare(b.label));
}
