export const ROOT_METHOD_NAMES = [
    'find', 'findOne', 'insertOne', 'insertMany',
    'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
    'countDocuments', 'aggregate', 'createIndex', 'getIndexes',
    'drop', 'distinct'
];

export const DB_LEVEL_METHOD_NAMES = ['getCollectionNames', 'stats'];

export const CHAIN_METHOD_NAMES = ['sort', 'limit', 'skip', 'projection'];

export const QUERY_OPERATORS = [
    '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
    '$and', '$or', '$nor', '$not',
    '$exists', '$type', '$regex', '$expr', '$mod', '$text', '$where',
    '$all', '$elemMatch', '$size',
    '$set', '$unset', '$inc', '$mul', '$rename', '$min', '$max', '$currentDate',
    '$push', '$pull', '$pullAll', '$addToSet', '$pop', '$each', '$slice', '$sort',
    '$match', '$group', '$project', '$sort', '$limit', '$skip', '$unwind',
    '$lookup', '$count', '$facet', '$bucket', '$sample', '$replaceRoot',
    '$sum', '$avg', '$first', '$last', '$push', '$addFields', '$out', '$merge'
];

export function getSuggestions(textBeforeCursor, collectionNames) {
    const afterDb = /db\.([A-Za-z0-9_$]*)$/.exec(textBeforeCursor);
    if (afterDb) {
        const prefix = afterDb[1];
        const candidates = [...collectionNames, ...DB_LEVEL_METHOD_NAMES];
        const matches = candidates.filter((c) => c.startsWith(prefix) && c !== prefix);
        if (matches.length === 0) return null;
        return {prefix, replaceFrom: textBeforeCursor.length - prefix.length, options: matches.sort()};
    }

    const afterCollection = /db\.[A-Za-z0-9_$]+\.([A-Za-z0-9_$]*)$/.exec(textBeforeCursor);
    if (afterCollection) {
        const prefix = afterCollection[1];
        const matches = ROOT_METHOD_NAMES.filter((m) => m.startsWith(prefix) && m !== prefix);
        if (matches.length === 0) return null;
        return {prefix, replaceFrom: textBeforeCursor.length - prefix.length, options: matches.sort()};
    }

    const afterChainDot = /\)\.([A-Za-z0-9_$]*)$/.exec(textBeforeCursor);
    if (afterChainDot) {
        const prefix = afterChainDot[1];
        const matches = CHAIN_METHOD_NAMES.filter((m) => m.startsWith(prefix) && m !== prefix);
        if (matches.length === 0) return null;
        return {prefix, replaceFrom: textBeforeCursor.length - prefix.length, options: matches.sort()};
    }

    const dollarKey = /[{,]\s*"?(\$[A-Za-z]*)"?$/.exec(textBeforeCursor);
    if (dollarKey) {
        const prefix = dollarKey[1];
        const matches = Array.from(new Set(QUERY_OPERATORS)).filter((op) => op.startsWith(prefix) && op !== prefix);
        if (matches.length === 0) return null;
        return {prefix, replaceFrom: textBeforeCursor.length - prefix.length, options: matches.sort()};
    }
    return null;
}