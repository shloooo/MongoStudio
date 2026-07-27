import { ObjectId, DBRef, UUID, Long, Decimal128, Binary, Timestamp, MinKey, MaxKey } from 'bson';

export const FIELD_TYPES = [
  'String', 'Int32', 'Long', 'Double', 'Decimal128', 'Boolean',
  'Date', 'ObjectId', 'UUID', 'Null', 'Array', 'Object', 'DBRef', 'Binary'
];

export function bsonTypeOf(value) {
  if (value === null) return 'Null';
  if (value === undefined) return 'Undefined';
  if (value instanceof ObjectId) return 'ObjectId';
  if (value instanceof UUID) return 'UUID';
  if (value instanceof DBRef) return 'DBRef';
  if (value instanceof Date) return 'Date';
  if (value instanceof Long) return 'Long';
  if (value instanceof Decimal128) return 'Decimal128';
  if (value instanceof Binary) return 'Binary';
  if (value instanceof Timestamp) return 'Timestamp';
  if (value instanceof MinKey) return 'MinKey';
  if (value instanceof MaxKey) return 'MaxKey';
  if (Array.isArray(value)) return 'Array';
  if (typeof value === 'object') return 'Object';
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') return Number.isInteger(value) ? 'Int32' : 'Double';
  return 'Unknown';
}

/** Short, human label shown in table cells / tree rows for a value. */
export function shortLabel(value) {
  const type = bsonTypeOf(value);
  switch (type) {
    case 'Null': return 'null';
    case 'Undefined': return 'undefined';
    case 'ObjectId': return `ObjectId("${value.toHexString()}")`;
    case 'UUID': return `UUID("${value.toString()}")`;
    case 'DBRef': {
      const ns = value.db ? `${value.db}.${value.collection}` : value.collection;
      return `${idToString(value.oid)} @ ${ns}`;
    }
    case 'Date': return value.toISOString();
    case 'Long': return value.toString();
    case 'Decimal128': return value.toString();
    case 'Binary': return `Binary(${value.sub_type})`;
    case 'Timestamp': return `Timestamp(${value.t}, ${value.i})`;
    case 'MinKey': return 'MinKey()';
    case 'MaxKey': return 'MaxKey()';
    case 'Boolean': return String(value);
    case 'String': return value;
    case 'Int32': return String(value);
    case 'Double': return String(value);
    case 'Array': return `${value.length} ${value.length === 1 ? 'entry' : 'entries'} [array]`;
    case 'Object': return `${Object.keys(value).length} ${Object.keys(value).length === 1 ? 'entry' : 'entries'} [object]`;
    default: return String(value);
  }
}

export function idToString(oid) {
  if (oid instanceof ObjectId) return oid.toHexString();
  if (oid instanceof UUID) return oid.toString();
  return String(oid);
}

/** Coerces a raw editor input string into the target BSON type. Throws on invalid input. */
export function coerceToType(rawText, targetType) {
  switch (targetType) {
    case 'String': return rawText;
    case 'Int32': {
      const n = Number.parseInt(rawText, 10);
      if (!Number.isFinite(n)) throw new Error('Not a valid integer');
      return n;
    }
    case 'Double': {
      const n = Number.parseFloat(rawText);
      if (!Number.isFinite(n)) throw new Error('Not a valid number');
      return n;
    }
    case 'Long': return Long.fromString(rawText);
    case 'Decimal128': return Decimal128.fromString(rawText);
    case 'Boolean': return rawText === 'true' || rawText === '1';
    case 'Date': {
      const d = new Date(rawText);
      if (Number.isNaN(d.getTime())) throw new Error('Not a valid date');
      return d;
    }
    case 'ObjectId': return new ObjectId(rawText);
    case 'UUID': return new UUID(rawText);
    case 'Null': return null;
    default: return rawText;
  }
}

/** For a given value, what raw text should populate an edit box (before type coercion). */
export function toEditableRaw(value) {
  const type = bsonTypeOf(value);
  switch (type) {
    case 'Null': return '';
    case 'ObjectId': return value.toHexString();
    case 'UUID': return value.toString();
    case 'Date': return value.toISOString();
    case 'Long': return value.toString();
    case 'Decimal128': return value.toString();
    case 'Boolean': return String(value);
    default: return String(value ?? '');
  }
}
