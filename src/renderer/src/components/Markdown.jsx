import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function looksLikeHtml(text) {
    return /<\/?[a-z][\s\S]*>/i.test(text);
}

const ALLOWED_TAGS = new Set([
    'P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'A', 'CODE', 'PRE',
    'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'TABLE', 'THEAD',
    'TBODY', 'TR', 'TH', 'TD', 'SPAN', 'DIV', 'DEL', 'S'
]);

function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href)) a.setAttribute('data-safe-href', href);
    });

    function clean(node) {
        [...node.childNodes].forEach((child) => {
            if (child.nodeType === Node.COMMENT_NODE) {
                child.remove();
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) return;

            if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') {
                child.remove();
                return;
            }

            clean(child);

            if (!ALLOWED_TAGS.has(child.tagName)) {
                child.replaceWith(...child.childNodes);
                return;
            }

            const safeHref = child.getAttribute('data-safe-href');
            [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
            if (child.tagName === 'A' && safeHref) child.setAttribute('href', safeHref);
        });
    }

    clean(doc.body);
    return doc.body.innerHTML;
}

function HtmlReleaseNotes({html, className}) {
    const containerRef = React.useRef(null);
    const safeHtml = React.useMemo(() => sanitizeHtml(html), [html]);

    function handleClick(e) {
        const anchor = e.target.closest('a[href]');
        if (!anchor) return;
        e.preventDefault();
        window.api.window.openExternal(anchor.getAttribute('href'));
    }

    return (
        <div
            ref={containerRef}
            className={`markdown-body${className ? ` ${className}` : ''}`}
            onClick={handleClick}
            dangerouslySetInnerHTML={{__html: safeHtml}}
        />
    );
}

export default function Markdown({ text, className }) {
    if (!text) return null;

    if (looksLikeHtml(text)) {
        return <HtmlReleaseNotes html={text} className={className}/>;
    }

    return (
        <div className={`markdown-body${className ? ` ${className}` : ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ href, children }) => (
                        <a href={href}
                           onClick={(e) => {
                               e.preventDefault();
                               if (href) {
                                   window.api.window.openExternal(href);
                               }
                           }}>
                            {children}
                        </a>
                    )}}>
                {text}
            </ReactMarkdown>
        </div>
    );
}