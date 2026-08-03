import React from 'react';
import ReactMarkdown from 'react-markdown';

export default function Markdown({ text, className }) {
    return (
        <div className={`markdown-body${className ? ` ${className}` : ''}`}>
            <ReactMarkdown>{text}</ReactMarkdown>
        </div>
    );
}