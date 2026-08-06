import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {EJSON} from 'bson';
import {parseShell, toShellText, toShellTextCompact} from '../../lib/shellSyntax.js';
import ContextMenu from '../lib/ContextMenu.jsx';

const TEMPLATE = `[
  { $match: {} },
  { $group: { _id: "$field", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]`;

export default function AggregationTab({selection, reloadSignal, onShowInDocuments}) {
  const {t} = useTranslation();
  const [pipelineText, setPipelineText] = useState(TEMPLATE);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rowContextMenu, setRowContextMenu] = useState(null);

  async function runPipeline() {
    setLoading(true);
    setError('');
    try {
      const pipeline = parseShell(pipelineText);
      if (!Array.isArray(pipeline)) throw new Error(t('aggregationTab.errorPipelineMustBeArray'));
      const docs = await window.api.data.aggregate({
        connId: selection.connId,
        dbName: selection.dbName,
        collection: selection.collection,
        pipeline: EJSON.stringify(pipeline)
      });
      setResults(docs.map((d) => EJSON.parse(JSON.stringify(d))));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (reloadSignal !== undefined && reloadSignal > 0) runPipeline(); }, [reloadSignal]);

  async function handleExport(format) {
    if (results.length === 0) return;
    await window.api.data.exportResults({
      docs: results,
      format,
      suggestedName: `${selection.collection}_aggregation.${format}`
    });
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
  }

  function handleRowContextMenu(e, doc) {
    e.preventDefault();
    setRowContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t('documentActions.copyDocumentRaw'),
          onClick: () => copyToClipboard(JSON.stringify(EJSON.serialize(doc)))
        },
        {label: t('documentActions.copyDocumentShell'), onClick: () => copyToClipboard(toShellText(doc))},
        {separator: true},
        {
          label: t('documentActions.showInList'),
          disabled: doc._id === undefined,
          onClick: () => onShowInDocuments(toShellText({_id: doc._id}))
        }
      ]
    });
  }

  return (
      <div className="aggregation-tab">
        <div className="agg-editor-pane">
          <label>{t('aggregationTab.pipelineLabel')}</label>
          <textarea className="json-editor"
                    value={pipelineText}
                    onChange={(e) => setPipelineText(e.target.value)}
                    rows={16}
                    spellCheck={false}/>
          <div className="toolbar">
            <button className="primary" onClick={runPipeline}
                    disabled={loading}>{loading ? t('aggregationTab.running') : t('aggregationTab.runPipeline')}</button>
            <div className="spacer"/>
            <button onClick={() => handleExport('json')}
                    disabled={results.length === 0}>{t('aggregationTab.exportJson')}</button>
            <button onClick={() => handleExport('csv')}
                    disabled={results.length === 0}>{t('aggregationTab.exportCsv')}</button>
          </div>
          {error && <div className="error-banner">{error}</div>}
        </div>
        <div className="agg-results-pane">
          <div className="results-header">{t('aggregationTab.resultsHeader', {count: results.length})}</div>
          <div className="results-area">
            <table className="agg-results-table">
              <tbody>
              {results.map((doc, i) => (
                  <tr key={i} onContextMenu={(e) => handleRowContextMenu(e, doc)}>
                    <td className="doc-cell"><code>{toShellTextCompact(doc).slice(0, 300)}</code></td>
                  </tr>
              ))}
              {results.length === 0 && <tr>
                <td className="tree-empty">{t('aggregationTab.noResults')}</td>
              </tr>}
              </tbody>
            </table>
          </div>
        </div>
        {rowContextMenu && (
            <ContextMenu
                x={rowContextMenu.x}
                y={rowContextMenu.y}
                items={rowContextMenu.items}
                onClose={() => setRowContextMenu(null)}
            />
        )}
      </div>
  );
}