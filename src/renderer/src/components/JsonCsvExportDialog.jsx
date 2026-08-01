import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {useClosing} from '../lib/useClosing.js';
import {reportError} from '../lib/errorBus.js';

export default function JsonCsvExportDialog({selection, onClose, onExported, onQueued}) {
    const {t} = useTranslation();
    const format = selection.format;
    const [loading, setLoading] = useState(true);
    const [fields, setFields] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [exporting, setExporting] = useState(false);
    const {closing, requestClose} = useClosing(onClose);

    useEffect(() => {
        let cancelled = false;
        window.api.data.listCollectionFields({
            connId: selection.connId,
            dbName: selection.dbName,
            collection: selection.collection
        }).then((result) => {
            if (cancelled) return;
            setFields(result || []);
            setSelected(new Set(result || []));
        }).catch((err) => {
            reportError(err.message, 'List collection fields');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [selection]);

    function toggleField(field) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(field)) next.delete(field);
            else next.add(field);
            return next;
        });
    }

    function toggleAll() {
        setSelected((prev) => (prev.size === fields.length ? new Set() : new Set(fields)));
    }

    async function handleExport() {
        setExporting(true);
        const allSelected = selected.size === fields.length;
        const task = window.api.data.exportCollection({
            connId: selection.connId,
            dbName: selection.dbName,
            collection: selection.collection,
            format,
            fields: allSelected ? [] : Array.from(selected)
        });
        if (onQueued) {
            onQueued(task, `${selection.collection}.${format}`);
            requestClose();
            return;
        }
        try {
            const result = await task;
            if (result.ok && onExported) onExported(result);
            requestClose();
        } catch (err) {
            reportError(err.message, 'Export collection');
        } finally {
            setExporting(false);
        }
    }

    return createPortal(
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>{t('dialogs.fieldExport.title', {format: format.toUpperCase()})}</h3>

                {loading && <p className="hint-text">…</p>}

                {!loading && (
                    <>
                        <div className="sql-export-field-list-header">
                            <button className="tiny-btn" onClick={toggleAll}>
                                {selected.size === fields.length ? t('dialogs.fieldExport.deselectAll') : t('dialogs.fieldExport.selectAll')}
                            </button>
                        </div>

                        <div className="sql-export-field-list">
                            {fields.map((f) => (
                                <label key={f} className="sql-export-field-row">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(f)}
                                        onChange={() => toggleField(f)}
                                    />
                                    {f}
                                </label>
                            ))}
                        </div>

                        {fields.length === 0 && <p className="hint-text">{t('dialogs.sqlExport.noFields')}</p>}
                    </>
                )}

                <div className="modal-actions">
                    <div className="spacer"/>
                    <button onClick={() => requestClose()}>{t('dialogs.common.cancel')}</button>
                    <button
                        className="primary"
                        disabled={loading || exporting || selected.size === 0}
                        onClick={handleExport}
                    >
                        {exporting ? t('dialogs.sqlExport.exporting') : t('dialogs.sqlExport.export')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}