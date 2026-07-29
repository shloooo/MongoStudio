import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {EJSON} from 'bson';
import {parseShell} from '../lib/shellSyntax.js';
import {reportError} from '../lib/errorBus.js';
import {useClosing} from '../lib/useClosing.js';
import i18n from '../i18n/index.js';

const IDS_PLACEHOLDER = `[
  
]`;

const UPDATE_PLACEHOLDER = `{
  
}`;

function buildUpdateDoc(parsedUpdate) {
    const keys = Object.keys(parsedUpdate);
    const opKeys = keys.filter((k) => k.startsWith('$'));
    const plainKeys = keys.filter((k) => !k.startsWith('$'));

    if (opKeys.length && plainKeys.length) {
        throw new Error(i18n.t('dialogs.bulkUpdate.errorMixedFields', {plainKeys: plainKeys.join(', '), opKeys: opKeys.join(', ')}));
    }

    if (opKeys.length) {
        delete parsedUpdate._id;
        return parsedUpdate;
    }

    const set = {};
    const unset = {};
    for (const key of plainKeys) {
        if (key === '_id') continue;
        const value = parsedUpdate[key];
        if (value === undefined) unset[key] = '';
        else set[key] = value;
    }

    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    if (Object.keys(update).length === 0) {
        throw new Error(i18n.t('dialogs.bulkUpdate.errorNoChanges'));
    }
    return update;
}

export default function BulkUpdateDialog({selection, onClose, onApplied}) {
    const {t} = useTranslation();
    const [step, setStep] = useState(1);

    const [idsText, setIdsText] = useState(IDS_PLACEHOLDER);
    const [ids, setIds] = useState(null);

    const [updateText, setUpdateText] = useState(UPDATE_PLACEHOLDER);
    const [applying, setApplying] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const {closing, requestClose} = useClosing(onClose);

    const idsParsed = useMemo(() => {
        try {
            const value = parseShell(idsText);
            if (!Array.isArray(value)) return {
                ok: false,
                error: t('dialogs.bulkUpdate.errorIdsMustBeArray')
            };
            if (value.length === 0) return {ok: false, error: t('dialogs.bulkUpdate.errorEnterOneId')};
            return {ok: true, value};
        } catch (err) {
            return {ok: false, error: err.message};
        }
    }, [idsText, t]);

    const updateParsed = useMemo(() => {
        try {
            const value = parseShell(updateText);
            if (Array.isArray(value) || value === null || typeof value !== 'object') {
                return {ok: false, error: t('dialogs.bulkUpdate.errorUpdateMustBeObject')};
            }
            return {ok: true, value};
        } catch (err) {
            return {ok: false, error: err.message};
        }
    }, [updateText, t]);

    function goToStep2() {
        if (!idsParsed.ok) return;
        setIds(idsParsed.value);
        setStep(2);
    }

    async function handleApply() {
        if (!updateParsed.ok || !ids) return;
        setError('');
        let updateDoc;
        try {
            updateDoc = buildUpdateDoc({...updateParsed.value});
        } catch (err) {
            setError(err.message);
            return;
        }
        setApplying(true);
        try {
            const res = await window.api.data.updateMany({
                connId: selection.connId,
                dbName: selection.dbName,
                collection: selection.collection,
                filter: EJSON.stringify({_id: {$in: ids}}),
                update: EJSON.stringify(updateDoc)
            });
            setResult(res);
            if (onApplied) onApplied();
        } catch (err) {
            setError(err.message);
            reportError(err.message, 'Bulk Update');
        } finally {
            setApplying(false);
        }
    }

    return (
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>{t('dialogs.bulkUpdate.title')}</h3>
                <div className="wizard-steps">
                    <span className={`wizard-step ${step === 1 ? 'active' : 'done'}`}>{t('dialogs.bulkUpdate.step1')}</span>
                    <span className="wizard-step-sep">→</span>
                    <span className={`wizard-step ${step === 2 ? 'active' : ''}`}>{t('dialogs.bulkUpdate.step2')}</span>
                </div>

                {step === 1 && (
                    <>
                        <p className="hint-text">
                            {t('dialogs.bulkUpdate.step1Hint')}
                        </p>
                        <textarea
                            className={`json-editor ${!idsParsed.ok ? 'has-error' : ''}`}
                            value={idsText}
                            onChange={(e) => setIdsText(e.target.value)}
                            spellCheck={false}
                            rows={14}
                            autoFocus
                        />
                        {!idsParsed.ok && <div className="error-banner">{idsParsed.error}</div>}
                        <div className="modal-actions">
                            <div className="spacer"/>
                            <button onClick={() => requestClose()}>{t('dialogs.common.cancel')}</button>
                            <button className="primary" onClick={goToStep2} disabled={!idsParsed.ok}>{t('dialogs.bulkUpdate.continue')}</button>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <p className="hint-text">
                            {t('dialogs.bulkUpdate.step2Hint', {count: ids.length})}
                        </p>
                        <textarea
                            className={`json-editor ${!updateParsed.ok ? 'has-error' : ''}`}
                            value={updateText}
                            onChange={(e) => setUpdateText(e.target.value)}
                            spellCheck={false}
                            rows={14}
                            autoFocus
                        />
                        {!updateParsed.ok && <div className="error-banner">{updateParsed.error}</div>}
                        {error && <div className="error-banner">{error}</div>}
                        {result && (
                            <div className="info-banner">
                                {t('dialogs.bulkUpdate.result', {matched: result.matchedCount, modified: result.modifiedCount})}
                            </div>
                        )}
                        <div className="modal-actions">
                            <button onClick={() => setStep(1)} disabled={applying}>{t('dialogs.bulkUpdate.back')}</button>
                            <div className="spacer"/>
                            <button onClick={() => requestClose()}>{result ? t('dialogs.common.close') : t('dialogs.common.cancel')}</button>
                            {!result && (
                                <button className="primary" onClick={handleApply}
                                        disabled={!updateParsed.ok || applying}>
                                    {applying ? t('dialogs.bulkUpdate.applying') : t('dialogs.bulkUpdate.apply')}
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}