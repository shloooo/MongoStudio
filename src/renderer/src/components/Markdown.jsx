import React from 'react';

const INLINE_RE = /(\*\*\*(.+?)\*\*\*)|(___(.+?)___)|(\*\*(.+?)\*\*)|(__(.+?)__)|(`(.+?)`)|(\*(.+?)\*)|(_(.+?)_)|(\[([^\]]+)]\((https?:\/\/[^\s)]+)\))/g;

function parseInline(text) {
    const nodes = [];
    let lastIndex = 0;
    let match;
    let key = 0;
    INLINE_RE.lastIndex = 0;
    while ((match = INLINE_RE.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
        key++;
        if (match[1] !== undefined) nodes.push(<strong key={key}><em>{match[2]}</em></strong>);
        else if (match[3] !== undefined) nodes.push(<strong key={key}><em>{match[4]}</em></strong>);
        else if (match[5] !== undefined) nodes.push(<strong key={key}>{match[6]}</strong>);
        else if (match[7] !== undefined) nodes.push(<strong key={key}>{match[8]}</strong>);
        else if (match[9] !== undefined) nodes.push(<code key={key}>{match[10]}</code>);
        else if (match[11] !== undefined) nodes.push(<em key={key}>{match[12]}</em>);
        else if (match[13] !== undefined) nodes.push(<em key={key}>{match[14]}</em>);
        else if (match[15] !== undefined) nodes.push(<a key={key} href={match[17]} target="_blank" rel="noreferrer">{match[16]}</a>);
        lastIndex = INLINE_RE.lastIndex;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
}

export default function Markdown({text, className}) {
    if (!text) return null;
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
            continue;
        }

        const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
        if (headingMatch) {
            const Tag = `h${Math.min(headingMatch[1].length + 3, 6)}`;
            blocks.push(<Tag key={key++} className="markdown-heading">{parseInline(headingMatch[2])}</Tag>);
            i++;
            continue;
        }

        if (/^[-*]\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^[-*]\s+/, ''));
                i++;
            }
            blocks.push(
                <ul key={key++} className="markdown-list">
                    {items.map((item, idx) => <li key={idx}>{parseInline(item)}</li>)}
                </ul>
            );
            continue;
        }

        const paraLines = [];
        while (i < lines.length && lines[i].trim() && !/^[-*]\s+/.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i])) {
            paraLines.push(lines[i]);
            i++;
        }
        blocks.push(
            <p key={key++} className="markdown-paragraph">
                {paraLines.map((l, idx) => (
                    <React.Fragment key={idx}>
                        {idx > 0 && <br/>}
                        {parseInline(l)}
                    </React.Fragment>
                ))}
            </p>
        );
    }

    return <div className={`markdown-body${className ? ` ${className}` : ''}`}>{blocks}</div>;
}