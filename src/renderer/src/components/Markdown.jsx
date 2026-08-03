import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ text, className }) {
    return (
        <div className={`markdown-body${className ? ` ${className}` : ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ href, children }) => (
                        <a href={href}
                           onClick={(e) => {
                               e.preventDefault();
                               console.log('Opening link:', href);
                               if (href) {
                                   console.log(window.api)
                                   console.log('Opening link2:', href);
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