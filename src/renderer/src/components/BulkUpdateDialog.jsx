import React, {useMemo, useState} from 'react';
import {EJSON} from 'bson';
import {parseShell} from '../lib/shellSyntax.js';
import {reportError} from '../lib/errorBus.js';

const IDS_PLACEHOLDER = `[
  
]`;

const UPDATE_PLACEHOLDER = `{
  
}`;

function buildUpdateDoc(parsedUpdate) {
    const keys = Object.keys(parsedUpdate);
    const opKeys = keys.filter((k) => k.startsWith('$'));
    const plainKeys = keys.filter((k) => !k.startsWith('$'));

    if (opKeys.length && plainKeys.length) {
        throw new Error(`Fields and update operators must not be mixed (found: ${plainKeys.join(', ')} next to ${opKeys.join(', ')}). Use either pure field:value pairs or exclusively operators such as $set/$unset/$inc.`);
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
        throw new Error('No changes specified. Enter a value or `undefined` (to remove) in at least one field.');
    }
    return update;
}

export default function BulkUpdateDialog({selection, onClose, onApplied}) {
    const [step, setStep] = useState(1);

    const [idsText, setIdsText] = useState(IDS_PLACEHOLDER);
    const [ids, setIds] = useState(null);

    const [updateText, setUpdateText] = useState(UPDATE_PLACEHOLDER);
    const [applying, setApplying] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const idsParsed = useMemo(() => {
        try {
            const value = parseShell(idsText);
            if (!Array.isArray(value)) return {
                ok: false,
                error: 'The target IDs must be specified as an array, for example, [ObjectId(“...”)].'
            };
            if (value.length === 0) return {ok: false, error: 'Enter at least one ID.'};
            return {ok: true, value};
        } catch (err) {
            return {ok: false, error: err.message};
        }
    }, [idsText]);

    const updateParsed = useMemo(() => {
        try {
            const value = parseShell(updateText);
            if (Array.isArray(value) || value === null || typeof value !== 'object') {
                return {ok: false, error: 'Updates must be specified as an object, e.g., { field: “value” }.'};
            }
            return {ok: true, value};
        } catch (err) {
            return {ok: false, error: err.message};
        }
    }, [updateText]);

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
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>Bulk Update</h3>
                <div className="wizard-steps">
                    <span className={`wizard-step ${step === 1 ? 'active' : 'done'}`}>1. Target IDs</span>
                    <span className="wizard-step-sep">→</span>
                    <span className={`wizard-step ${step === 2 ? 'active' : ''}`}>2. Updates</span>
                </div>

                {step === 1 && (
                    <>
                        <p className="hint-text">
                            Specify the IDs of the target documents as an array in shell syntax
                            (supports <code>ObjectId(...)</code>, {' '}
                            <code>UUID(...)</code>, strings, numbers, ...).
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
                            <button onClick={onClose}>Cancel</button>
                            <button className="primary" onClick={goToStep2} disabled={!idsParsed.ok}>Continue</button>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <p className="hint-text">
                            {ids.length} Target document(s). Specify update fields as an object in shell syntax—only
                            these fields will be
                            modified. A value of <code>undefined</code> removes the field. Alternatively, specify a raw
                            update document with
                            operators such as <code>$set</code> / <code>$unset</code> / <code>$inc</code>.
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
                                {result.matchedCount} document(s) found, {result.modifiedCount} actually modified.
                            </div>
                        )}
                        <div className="modal-actions">
                            <button onClick={() => setStep(1)} disabled={applying}>← Back</button>
                            <div className="spacer"/>
                            <button onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
                            {!result && (
                                <button className="primary" onClick={handleApply}
                                        disabled={!updateParsed.ok || applying}>
                                    {applying ? 'Apply changes...' : 'Apply'}
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}