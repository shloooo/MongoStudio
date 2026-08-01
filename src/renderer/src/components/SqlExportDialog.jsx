import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {useClosing} from '../lib/useClosing.js';
import {reportError} from '../lib/errorBus.js';

export default function SqlExportDialog({selection, onClose, onExported}) {
    const {t} = useTranslation();
    const [loading, setLoading] = useState(true);
    const [fields, setFields] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [exporting, setExporting] = useState(false);
    const {closing, requestClose} = useClosing(onClose);

    useEffect(() => {
        let cancelled = false;
        window.api.data.analyzeSqlExport({
            connId: selection.connId,
            dbName: selection.dbName,
            collection: selection.collection
        }).then((result) => {
            if (cancelled) return;
            setFields(result || []);
            setSelected(new Set((result || []).filter((f) => f.sqlSafe).map((f) => f.field)));
        }).catch((err) => {
            reportError(err.message, 'Analyze SQL export');
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

    async function handleExport() {
        setExporting(true);
        try {
            const result = await window.api.data.exportCollectionSql({
                connId: selection.connId,
                dbName: selection.dbName,
                collection: selection.collection,
                fields: Array.from(selected)
            });
            if (result.ok && onExported) onExported(result);
            requestClose();
        } catch (err) {
            reportError(err.message, 'Export SQL');
        } finally {
            setExporting(false);
        }
    }

    const safeFields = fields.filter((f) => f.sqlSafe);
    const unsafeFields = fields.filter((f) => !f.sqlSafe);

    return createPortal(
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>{t('dialogs.sqlExport.title')}</h3>

                {loading && <p className="hint-text">…</p>}

                {!loading && (
                    <>
                        <p className="hint-text">{t('dialogs.sqlExport.hint')}</p>

                        <div className="sql-export-field-list">
                            {safeFields.map((f) => (
                                <label key={f.field} className="sql-export-field-row">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(f.field)}
                                        onChange={() => toggleField(f.field)}
                                    />
                                    {f.field}
                                </label>
                            ))}
                        </div>

                        {unsafeFields.length > 0 && (
                            <div className="sql-export-unsafe-section">
                                <div className="sql-export-section-label">{t('dialogs.sqlExport.excludedLabel')}</div>
                                <div className="sql-export-field-list">
                                    {unsafeFields.map((f) => (
                                        <div key={f.field} className="sql-export-field-row is-disabled"
                                             title={t('dialogs.sqlExport.excludedReason')}>
                                            <input type="checkbox" checked={false} disabled/>
                                            {f.field}
                                        </div>
                                    ))}
                                </div>
                                <p className="hint-text">{t('dialogs.sqlExport.excludedReason')}</p>
                            </div>
                        )}

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