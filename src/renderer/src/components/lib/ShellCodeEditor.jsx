import React, {useMemo} from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {json} from '@codemirror/lang-json';
import {EditorView} from '@codemirror/view';
import {foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {keymap} from '@codemirror/view';
import {tags as t} from '@lezer/highlight';

const baseTheme = EditorView.theme({
    '&': {
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        backgroundColor: 'transparent',
        color: 'var(--text-primary)'
    },
    '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        overflow: 'auto'
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--text-tertiary)'
    },
    '.cm-activeLine': {
        backgroundColor: 'var(--glass-panel)'
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'var(--glass-panel)'
    },
    '.cm-content': {
        color: 'var(--text-primary)',
        caretColor: 'var(--text-primary)',
        padding: '6px 0'
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--text-primary)'
    },
    '.cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--accent-dim) !important'
    },
    '.cm-focused .cm-selectionBackground, .cm-focused ::selection': {
        backgroundColor: 'var(--accent-dim) !important'
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
        backgroundColor: 'var(--accent-dim)',
        outline: 'none'
    },
    '.cm-foldPlaceholder': {
        backgroundColor: 'var(--glass-panel-strong)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-secondary)',
        borderRadius: 'var(--radius-sm)',
        padding: '0 4px'
    },
    '&.cm-focused': {
        outline: 'none'
    }
});

const highlightStyle = HighlightStyle.define([
    {tag: t.propertyName, color: 'var(--syntax-key)'},
    {tag: t.string, color: 'var(--syntax-string)'},
    {tag: t.number, color: 'var(--syntax-number)'},
    {tag: [t.bool, t.null], color: 'var(--syntax-boolean)'},
    {tag: t.punctuation, color: 'var(--text-secondary)'},
    {tag: t.squareBracket, color: 'var(--text-secondary)'},
    {tag: t.brace, color: 'var(--text-secondary)'}
]);

export default function ShellCodeEditor({value, onChange, hasError, rows = 20}) {
    const extensions = useMemo(() => [
        json(),
        foldGutter(),
        keymap.of(foldKeymap),
        baseTheme,
        syntaxHighlighting(highlightStyle),
        EditorView.lineWrapping
    ], []);

    return (
        <div className={`shell-code-editor ${hasError ? 'has-error' : ''}`}>
            <CodeMirror
                value={value}
                height="auto"
                maxHeight={`${rows * 1.4}em`}
                theme="none"
                extensions={extensions}
                onChange={onChange}
                basicSetup={{
                    lineNumbers: true,
                    foldGutter: false,
                    highlightActiveLine: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: false,
                    defaultKeymap: true
                }}
            />
        </div>
    );
}