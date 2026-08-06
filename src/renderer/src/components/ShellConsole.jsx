import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {EJSON} from 'bson';
import {parseShellCommand} from '../lib/shellCommand.js';
import {toShellText} from '../lib/shellSyntax.js';
import {getSuggestions} from '../lib/shellAutocomplete.js';

function serializeArgsForTransport(args) {
    return (args || []).map((a) => EJSON.stringify(a));
}

function formatResult(result) {
    if (result.type === 'documents') {
        const docs = result.value.map((d) => EJSON.deserialize(d));
        if (docs.length === 0) return '[]';
        return docs.map((d) => toShellText(d)).join('\n');
    }
    const value = result.value;
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return String(value);
    try {
        return toShellText(EJSON.deserialize(value));
    } catch {
        return JSON.stringify(value, null, 2);
    }
}

const HISTORY_LIMIT = 200;

export default function ShellConsole({selection, log, onLogChange, cmdHistory, onCmdHistoryChange}) {
    const {t} = useTranslation();
    const [input, setInput] = useState('');
    const [running, setRunning] = useState(false);
    const [historyPos, setHistoryPos] = useState(-1);
    const [collectionNames, setCollectionNames] = useState([]);
    const [suggestion, setSuggestion] = useState(null); // {prefix, replaceFrom, options, activeIndex}
    const inputRef = useRef(null);
    const logEndRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        window.api.conn.listCollections(selection.connId, selection.dbName).then((cols) => {
            if (cancelled) return;
            setCollectionNames((cols || []).map((c) => (typeof c === 'string' ? c : c.name)));
        }).catch(() => {
        });
        return () => {
            cancelled = true;
        };
    }, [selection.connId, selection.dbName]);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [log]);

    function updateSuggestions(value, cursorPos) {
        const before = value.slice(0, cursorPos);
        const result = getSuggestions(before, collectionNames);
        setSuggestion(result ? {...result, activeIndex: 0} : null);
    }

    function handleInputChange(e) {
        const value = e.target.value;
        setInput(value);
        updateSuggestions(value, e.target.selectionStart);
    }

    function applySuggestion(option) {
        if (!suggestion) return;
        const before = input.slice(0, suggestion.replaceFrom);
        const after = input.slice(suggestion.replaceFrom + suggestion.prefix.length);
        const next = `${before}${option}${after}`;
        setInput(next);
        setSuggestion(null);
        requestAnimationFrame(() => {
            const pos = before.length + option.length;
            inputRef.current?.setSelectionRange(pos, pos);
            inputRef.current?.focus();
        });
    }

    async function runCommand(raw) {
        const line = raw.trim();
        if (!line) return;

        onLogChange((prev) => [...prev, {type: 'input', text: line}]);
        onCmdHistoryChange((prev) => {
            const next = [...prev, line];
            return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
        });
        setHistoryPos(-1);
        setInput('');
        setSuggestion(null);
        setRunning(true);

        try {
            const parsed = parseShellCommand(line);
            const result = await window.api.data.shellExec({
                connId: selection.connId,
                dbName: selection.dbName,
                collection: parsed.collection,
                root: {name: parsed.root.name, args: serializeArgsForTransport(parsed.root.args)},
                chain: parsed.chain.map((c) => ({name: c.name, args: serializeArgsForTransport(c.args)}))
            });
            const text = formatResult(result);
            onLogChange((prev) => [...prev, {type: 'output', text}]);
        } catch (err) {
            onLogChange((prev) => [...prev, {type: 'error', text: err.message}]);
        } finally {
            setRunning(false);
        }
    }

    function handleKeyDown(e) {
        if (suggestion && suggestion.options.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSuggestion((s) => ({...s, activeIndex: (s.activeIndex + 1) % s.options.length}));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSuggestion((s) => ({...s, activeIndex: (s.activeIndex - 1 + s.options.length) % s.options.length}));
                return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                applySuggestion(suggestion.options[suggestion.activeIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setSuggestion(null);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            runCommand(input);
            return;
        }
        if (e.key === 'ArrowUp') {
            if (cmdHistory.length === 0) return;
            e.preventDefault();
            const nextPos = historyPos === -1 ? cmdHistory.length - 1 : Math.max(0, historyPos - 1);
            setHistoryPos(nextPos);
            setInput(cmdHistory[nextPos]);
            return;
        }
        if (e.key === 'ArrowDown') {
            if (historyPos === -1) return;
            e.preventDefault();
            const nextPos = historyPos + 1;
            if (nextPos >= cmdHistory.length) {
                setHistoryPos(-1);
                setInput('');
            } else {
                setHistoryPos(nextPos);
                setInput(cmdHistory[nextPos]);
            }
        }
    }

    return (
        <div className="shell-console">
            <div className="shell-console-log">
                {log.length === 0 && (
                    <div className="shell-console-hint">{t('shellConsole.hint')}</div>
                )}
                {log.map((entry, i) => (
                    <div key={i} className={`shell-log-entry shell-log-${entry.type}`}>
                        {entry.type === 'input' ?
                            <span className="shell-log-prompt shell-log-prompt-noselect">{'>'}</span> : null}
                        <pre>{entry.text}</pre>
                    </div>
                ))}
                <div ref={logEndRef}/>
            </div>
            <div className="shell-console-input-row">
                <span className="shell-log-prompt">{'>'}</span>
                <div className="shell-console-input-wrap">
          <textarea
              ref={inputRef}
              className="shell-console-input"
              value={input}
              disabled={running}
              placeholder={t('shellConsole.placeholder')}
              rows={1}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setSuggestion(null), 120)}
          />
                    {suggestion && suggestion.options.length > 0 && (
                        <div className="shell-autocomplete-dropdown">
                            {suggestion.options.map((opt, i) => (
                                <div
                                    key={opt}
                                    className={`shell-autocomplete-item ${i === suggestion.activeIndex ? 'is-active' : ''}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        applySuggestion(opt);
                                    }}
                                >
                                    {opt}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <button className="shell-run-btn" disabled={running || !input.trim()} onClick={() => runCommand(input)}>
                    {running ? t('shellConsole.running') : t('shellConsole.run')}
                </button>
            </div>
        </div>
    );
}