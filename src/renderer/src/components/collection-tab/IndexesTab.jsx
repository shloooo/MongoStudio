import React, {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {EJSON} from 'bson';
import {parseShell} from '../../lib/shellSyntax.js';

export default function IndexesTab({selection, reloadSignal}) {
    const {t} = useTranslation();
    const [indexes, setIndexes] = useState([]);
    const [spec, setSpec] = useState('{field: 1}');
    const [options, setOptions] = useState('{unique: false}');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const idx = await window.api.data.indexes({
            connId: selection.connId,
            dbName: selection.dbName,
            collection: selection.collection
        });
        setIndexes(idx);
    }, [selection]);

    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => {
        if (reloadSignal !== undefined && reloadSignal > 0) load();
    }, [reloadSignal]);

    async function handleCreate() {
        setError('');
        try {
            const specValue = parseShell(spec);
            const optionsValue = parseShell(options);
            await window.api.data.createIndex({
                connId: selection.connId,
                dbName: selection.dbName,
                collection: selection.collection,
                spec: EJSON.stringify(specValue),
                options: EJSON.stringify(optionsValue)
            });
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <div className="indexes-tab">
            <table className="indexes-table">
                <thead>
                <tr>
                    <th>{t('indexesTab.name')}</th>
                    <th>{t('indexesTab.keys')}</th>
                    <th>{t('indexesTab.options')}</th>
                </tr>
                </thead>
                <tbody>
                {indexes.map((idx) => (
                    <tr key={idx.name}>
                        <td>{idx.name}</td>
                        <td><code>{JSON.stringify(idx.key)}</code></td>
                        <td>{idx.unique ? t('indexesTab.unique') : ''}</td>
                    </tr>
                ))}
                </tbody>
            </table>

            <div className="new-index-form">
                <h4>{t('indexesTab.createNewIndex')}</h4>
                <div className="row">
                    <div>
                        <label>{t('indexesTab.keys')}</label>
                        <input value={spec} onChange={(e) => setSpec(e.target.value)}/>
                    </div>
                    <div>
                        <label>{t('indexesTab.options')}</label>
                        <input value={options} onChange={(e) => setOptions(e.target.value)}/>
                    </div>
                </div>
                {error && <div className="error-banner">{error}</div>}
                <button className="primary" onClick={handleCreate}>{t('indexesTab.createIndex')}</button>
            </div>
        </div>
    );
}