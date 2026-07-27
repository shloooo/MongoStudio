const { ObjectId, DBRef, UUID, Long, Decimal128, Binary, Timestamp, MinKey, MaxKey } = require('bson');

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const PUNCT = new Set(['{', '}', '[', ']', '(', ')', ':', ',']);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  function error(msg) {
    const line = src.slice(0, i).split('\n').length;
    throw new Error(`${msg} (position ${i}, line ${line})`);
  }

  while (i < n) {
    const ch = src[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }

    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (PUNCT.has(ch)) { tokens.push({ type: 'punct', value: ch, pos: i }); i++; continue; }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      const start = i;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          const next = src[i + 1];
          const map = { n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\', '/': '/', b: '\b', f: '\f' };
          if (next === 'u') {
            const hex = src.slice(i + 2, i + 6);
            str += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          str += map[next] !== undefined ? map[next] : next;
          i += 2;
          continue;
        }
        str += src[i];
        i++;
      }
      if (i >= n) error('Unterminated string');
      i++;
      tokens.push({ type: 'string', value: str, pos: start });
      continue;
    }

    if (/[0-9-]/.test(ch) && (ch !== '-' || /[0-9]/.test(src[i + 1] || ''))) {
      const start = i;
      let numStr = '';
      if (src[i] === '-') { numStr += '-'; i++; }
      while (i < n && /[0-9]/.test(src[i])) { numStr += src[i]; i++; }
      let isFloat = false;
      if (src[i] === '.') {
        isFloat = true;
        numStr += '.';
        i++;
        while (i < n && /[0-9]/.test(src[i])) { numStr += src[i]; i++; }
      }
      if (src[i] === 'e' || src[i] === 'E') {
        isFloat = true;
        numStr += src[i];
        i++;
        if (src[i] === '+' || src[i] === '-') { numStr += src[i]; i++; }
        while (i < n && /[0-9]/.test(src[i])) { numStr += src[i]; i++; }
      }
      tokens.push({ type: 'number', value: numStr, isFloat, pos: start });
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      let word = '';
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { word += src[i]; i++; }
      tokens.push({ type: 'ident', value: word, pos: start });
      continue;
    }

    error(`Unexpected character "${ch}"`);
  }

  tokens.push({ type: 'eof', value: null, pos: n });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const CONSTRUCTORS = {
  ObjectId: (args) => new ObjectId(args[0]),
  ObjectID: (args) => new ObjectId(args[0]),
  UUID: (args) => new UUID(args[0]),
  ISODate: (args) => new Date(args[0]),
  Date: (args) => (args.length ? new Date(args[0]) : new Date()),
  NumberLong: (args) => Long.fromString(String(args[0])),
  NumberInt: (args) => Number.parseInt(args[0], 10),
  NumberDecimal: (args) => Decimal128.fromString(String(args[0])),
  Timestamp: (args) => new Timestamp({ t: Number(args[0]) || 0, i: Number(args[1]) || 0 }),
  BinData: (args) => new Binary(Buffer.from(String(args[1] ?? ''), 'base64'), Number(args[0]) || 0),
  DBRef: (args) => {
    const [namespace, oid, db] = args;
    if (typeof namespace === 'string' && namespace.includes('.') && db === undefined) {
      const [dbName, ...rest] = namespace.split('.');
      return new DBRef(rest.join('.'), oid, dbName);
    }
    return new DBRef(namespace, oid, db);
  },
  MinKey: () => new MinKey(),
  MaxKey: () => new MaxKey(),
  undefined: () => undefined
};

const SUPPORTED_CONSTRUCTORS = Object.keys(CONSTRUCTORS);

function parseShellSyntax(src) {
  const tokens = tokenize(src);
  let pos = 0;

  function peek() { return tokens[pos]; }
  function advance() { return tokens[pos++]; }
  function expect(type, value) {
    const tok = peek();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(`Expected ${value || type} but got "${tok.value}" (position ${tok.pos})`);
    }
    return advance();
  }

  function parseValue() {
    const tok = peek();

    if (tok.type === 'punct' && tok.value === '{') return parseObject();
    if (tok.type === 'punct' && tok.value === '[') return parseArray();
    if (tok.type === 'string') { advance(); return tok.value; }
    if (tok.type === 'number') {
      advance();
      const n = Number(tok.value);
      return tok.isFloat ? n : (Number.isSafeInteger(n) ? n : Long.fromString(tok.value));
    }
    if (tok.type === 'ident') {
      if (tok.value === 'true') { advance(); return true; }
      if (tok.value === 'false') { advance(); return false; }
      if (tok.value === 'null') { advance(); return null; }
      if (tok.value === 'undefined') { advance(); return undefined; }
      if (tok.value === 'NaN') { advance(); return NaN; }
      if (tok.value === 'Infinity') { advance(); return Infinity; }
      return parseConstructorCall();
    }
    throw new Error(`Unexpected token "${tok.value}" (position ${tok.pos})`);
  }

  function parseConstructorCall() {
    const nameTok = advance();
    const name = nameTok.value;
    let args = [];
    if (peek().type === 'punct' && peek().value === '(') {
      advance();
      if (!(peek().type === 'punct' && peek().value === ')')) {
        args.push(parseValue());
        while (peek().type === 'punct' && peek().value === ',') {
          advance();
          args.push(parseValue());
        }
      }
      expect('punct', ')');
    } else {
      throw new Error(`Unknown identifier "${name}" (position ${nameTok.pos}) - expected a value, string, number, or a supported constructor like ObjectId(...)`);
    }
    const ctor = CONSTRUCTORS[name];
    if (!ctor) {
      throw new Error(`Unsupported constructor "${name}"(...) (position ${nameTok.pos}). Supported: ${SUPPORTED_CONSTRUCTORS.join(', ')}`);
    }
    return ctor(args);
  }

  function parseObject() {
    expect('punct', '{');
    const obj = {};
    if (peek().type === 'punct' && peek().value === '}') { advance(); return obj; }
    for (;;) {
      const keyTok = peek();
      let key;
      if (keyTok.type === 'string') { key = advance().value; }
      else if (keyTok.type === 'ident') { key = advance().value; }
      else throw new Error(`Expected object key (position ${keyTok.pos})`);
      expect('punct', ':');
      obj[key] = parseValue();
      if (peek().type === 'punct' && peek().value === ',') { advance(); continue; }
      break;
    }
    expect('punct', '}');
    return obj;
  }

  function parseArray() {
    expect('punct', '[');
    const arr = [];
    if (peek().type === 'punct' && peek().value === ']') { advance(); return arr; }
    for (;;) {
      arr.push(parseValue());
      if (peek().type === 'punct' && peek().value === ',') { advance(); continue; }
      break;
    }
    expect('punct', ']');
    return arr;
  }

  const result = parseValue();
  if (peek().type !== 'eof') {
    throw new Error(`Unexpected trailing content at position ${peek().pos}`);
  }
  return result;
}

/**
 * Parses a shell-syntax document/value into real JS/BSON values.
 * Accepts plain JSON as a subset, plus ObjectId(...), DBRef(...), UUID(...),
 * ISODate(...), NumberLong(...), NumberInt(...), NumberDecimal(...),
 * Timestamp(...), BinData(...), MinKey(), MaxKey().
 */
function parseShell(text) {
  return parseShellSyntax(text);
}

// ---------------------------------------------------------------------------
// Serializer: BSON value tree -> shell-syntax string
// ---------------------------------------------------------------------------

function quoteString(str) {
  return JSON.stringify(str);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    !(v instanceof ObjectId) && !(v instanceof UUID) && !(v instanceof DBRef) &&
    !(v instanceof Date) && !(v instanceof Long) && !(v instanceof Decimal128) &&
    !(v instanceof Binary) && !(v instanceof Timestamp) &&
    !(v instanceof MinKey) && !(v instanceof MaxKey);
}

function valueToShell(value, indent = 0, pretty = true) {
  const pad = pretty ? '  '.repeat(indent) : '';
  const padIn = pretty ? '  '.repeat(indent + 1) : '';
  const nl = pretty ? '\n' : '';
  const sp = pretty ? ' ' : '';

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return String(value);
  }
  if (typeof value === 'string') return quoteString(value);

  if (value instanceof ObjectId) return `ObjectId(${quoteString(value.toHexString())})`;
  if (value instanceof UUID) return `UUID(${quoteString(value.toString())})`;
  if (value instanceof Date) return `ISODate(${quoteString(value.toISOString())})`;
  if (value instanceof Long) return `NumberLong(${quoteString(value.toString())})`;
  if (value instanceof Decimal128) return `NumberDecimal(${quoteString(value.toString())})`;
  if (value instanceof Timestamp) return `Timestamp(${value.t}, ${value.i})`;
  if (value instanceof Binary) return `BinData(${value.sub_type}, ${quoteString(value.toString('base64'))})`;
  if (value instanceof MinKey) return 'MinKey()';
  if (value instanceof MaxKey) return 'MaxKey()';
  if (value instanceof DBRef) {
    const db = value.db ? `${value.db}.` : '';
    return `DBRef(${quoteString(`${db}${value.collection}`)}, ${valueToShell(value.oid, indent, pretty)})`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => `${padIn}${valueToShell(v, indent + 1, pretty)}`);
    return `[${nl}${items.join(`,${nl}`)}${nl}${pad}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const items = keys.map((k) => `${padIn}${formatKey(k)}:${sp}${valueToShell(value[k], indent + 1, pretty)}`);
    return `{${nl}${items.join(`,${nl}`)}${nl}${pad}}`;
  }

  return quoteString(String(value));
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function formatKey(key) {
  return IDENT_RE.test(key) ? key : quoteString(key);
}

/** Serializes a full document/value tree to a pretty shell-syntax string. */
function toShellText(value) {
  return valueToShell(value, 0, true);
}

/** Serializes to a compact single-line shell-syntax string (for table cells). */
function toShellTextCompact(value) {
  return valueToShell(value, 0, false);
}

module.exports = { parseShell, toShellText, toShellTextCompact, valueToShell, SUPPORTED_CONSTRUCTORS };
