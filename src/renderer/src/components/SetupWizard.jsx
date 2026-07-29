import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import i18n from '../i18n/index.js';

const LANGUAGES = [
    {code: 'en', label: 'English'},
    {code: 'de', label: 'Deutsch'}
];

export default function SetupWizard({onComplete}) {
    const {t} = useTranslation();
    const [step, setStep] = useState(0);
    const [language, setLanguage] = useState(i18n.language || 'en');
    const [theme, setTheme] = useState('light');
    const [encryption, setEncryption] = useState('unencrypted');
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const steps = [t('setup.steps.welcome'), t('setup.steps.language'), t('setup.steps.appearance'), t('setup.steps.security')];

    async function handleLanguageSelect(code) {
        setLanguage(code);
        await i18n.changeLanguage(code);
    }

    function handleThemeSelect(value) {
        setTheme(value);
        document.body.classList.toggle('dark', value === 'dark');
    }

    function goNext() {
        setError('');
        setStep((s) => Math.min(s + 1, steps.length - 1));
    }

    function goBack() {
        setError('');
        setStep((s) => Math.max(s - 1, 0));
    }

    async function handleFinish() {
        if (encryption === 'encrypted') {
            if (passphrase.length < 4) {
                setError(t('setup.security.tooShort'));
                return;
            }
            if (passphrase !== confirmPassphrase) {
                setError(t('setup.security.mismatch'));
                return;
            }
        }

        setBusy(true);
        setError('');
        try {
            await window.api.setup.complete({
                language,
                theme,
                encryption,
                passphrase: encryption === 'encrypted' ? passphrase : undefined
            });
            onComplete();
        } catch (err) {
            setBusy(false);
            setError(err?.message || String(err));
        }
    }

    return (
        <div className="vault-gate setup-wizard">
            <div className="vault-card setup-card">
                <div className="setup-progress">
                    {steps.map((label, i) => (
                        <div key={label} className={`setup-progress-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                            <span className="setup-progress-dot"/>
                            <span className="setup-progress-label">{label}</span>
                        </div>
                    ))}
                </div>

                {step === 0 && (
                    <div key={step} className="setup-step-content">
                        <div className="vault-icon setup-welcome-icon">
                            <i className="fa-solid fa-database"/>
                        </div>
                        <h2>{t('setup.welcome.heading')}</h2>
                        <p className="hint-text">{t('setup.welcome.hint')}</p>
                    </div>
                )}

                {step === 1 && (
                    <div key={step} className="setup-step-content">
                        <div className="vault-icon">
                            <i className="fa-solid fa-globe"/>
                        </div>
                        <h2>{t('setup.language.heading')}</h2>
                        <p className="hint-text">{t('setup.language.hint')}</p>
                        <div className="setup-option-list">
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.code}
                                    className={`setup-option ${language === lang.code ? 'selected' : ''}`}
                                    onClick={() => handleLanguageSelect(lang.code)}
                                >
                                    {lang.label}
                                    {language === lang.code && <i className="fa-solid fa-check setup-option-check"/>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div key={step} className="setup-step-content">
                        <div className="vault-icon">
                            <i className="fa-solid fa-palette"/>
                        </div>
                        <h2>{t('setup.appearance.heading')}</h2>
                        <p className="hint-text">{t('setup.appearance.hint')}</p>
                        <div className="setup-option-list setup-option-list-row">
                            <button
                                className={`setup-option ${theme === 'light' ? 'selected' : ''}`}
                                onClick={() => handleThemeSelect('light')}
                            >
                                <i className="fa-solid fa-sun"/>
                                {t('setup.appearance.light')}
                                {theme === 'light' && <i className="fa-solid fa-check setup-option-check"/>}
                            </button>
                            <button
                                className={`setup-option ${theme === 'dark' ? 'selected' : ''}`}
                                onClick={() => handleThemeSelect('dark')}
                            >
                                <i className="fa-solid fa-moon"/>
                                {t('setup.appearance.dark')}
                                {theme === 'dark' && <i className="fa-solid fa-check setup-option-check"/>}
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div key={step} className="setup-step-content">
                        <div className="vault-icon">
                            <i className="fa-solid fa-shield-halved"/>
                        </div>
                        <h2>{t('setup.security.heading')}</h2>
                        <p className="hint-text">{t('setup.security.hint')}</p>
                        <div className="setup-option-list setup-option-list-row">
                            <button
                                className={`setup-option ${encryption === 'unencrypted' ? 'selected' : ''}`}
                                onClick={() => setEncryption('unencrypted')}
                            >
                                {t('setup.security.unencrypted')}
                                {encryption === 'unencrypted' && <i className="fa-solid fa-check setup-option-check"/>}
                            </button>
                            <button
                                className={`setup-option ${encryption === 'encrypted' ? 'selected' : ''}`}
                                onClick={() => setEncryption('encrypted')}
                            >
                                {t('setup.security.encrypted')}
                                {encryption === 'encrypted' && <i className="fa-solid fa-check setup-option-check"/>}
                            </button>
                        </div>

                        {encryption === 'encrypted' && (
                            <div className="setup-passphrase-fields">
                                <input
                                    type="password"
                                    autoFocus
                                    value={passphrase}
                                    onChange={(e) => {
                                        setPassphrase(e.target.value);
                                        setError('');
                                    }}
                                    placeholder={t('setup.security.passphrasePlaceholder')}
                                    className={error ? 'has-error' : ''}
                                />
                                <input
                                    type="password"
                                    value={confirmPassphrase}
                                    onChange={(e) => {
                                        setConfirmPassphrase(e.target.value);
                                        setError('');
                                    }}
                                    placeholder={t('setup.security.confirmPlaceholder')}
                                    className={error ? 'has-error' : ''}
                                />
                            </div>
                        )}

                        {error && (
                            <div className="error-banner">
                                <i className="fa-solid fa-circle-exclamation"/> {error}
                            </div>
                        )}
                    </div>
                )}

                <div className="vault-actions setup-actions">
                    {step > 0 && (
                        <button onClick={goBack} disabled={busy}>
                            {t('setup.back')}
                        </button>
                    )}
                    {step < steps.length - 1 ? (
                        <button className="primary" onClick={goNext}>
                            {t('setup.next')}
                        </button>
                    ) : (
                        <button className="primary" onClick={handleFinish} disabled={busy}>
                            {busy ? (
                                <>
                                    <i className="fa-solid fa-circle-notch fa-spin"/> {t('setup.finishing')}
                                </>
                            ) : (
                                t('setup.finish')
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}