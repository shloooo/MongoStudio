import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import i18n from '../i18n/index.js';

const LANGUAGES = [
    {code: 'en', label: 'English'},
    {code: 'de', label: 'Deutsch'}
];

const STEP_IDS = ['welcome', 'language', 'appearance', 'security'];
const MIN_PASSPHRASE_LENGTH = 4;

function StepProgress({stepIds, activeIndex, t}) {
    return (
        <div className="setup-progress" role="list">
            {stepIds.map((id, i) => (
                <div key={id}
                     role="listitem"
                     aria-current={i === activeIndex ? 'step' : undefined}
                     className={`setup-progress-step ${i === activeIndex ? 'active' : ''} ${i < activeIndex ? 'done' : ''}`}>
                    <span className="setup-progress-dot">
                        {i < activeIndex && <i className="fa-solid fa-check"/>}
                    </span>
                    <span className="setup-progress-label">{t(`setup.steps.${id}`)}</span>
                </div>
            ))}
        </div>
    );
}

function WelcomeStep({t}) {
    return (
        <div className="setup-step-content">
            <div className="vault-icon setup-welcome-icon">
                <i className="fa-solid fa-database"/>
            </div>
            <h2>{t('setup.welcome.heading')}</h2>
            <p className="hint-text">{t('setup.welcome.hint')}</p>
        </div>
    );
}

function LanguageStep({t, language, onSelect}) {
    return (
        <div className="setup-step-content">
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
                        onClick={() => onSelect(lang.code)}
                    >
                        {lang.label}
                        {language === lang.code && <i className="fa-solid fa-check setup-option-check"/>}
                    </button>
                ))}
            </div>
        </div>
    );
}

function AppearanceStep({t, theme, onSelect}) {
    return (
        <div className="setup-step-content">
            <div className="vault-icon">
                <i className="fa-solid fa-palette"/>
            </div>
            <h2>{t('setup.appearance.heading')}</h2>
            <p className="hint-text">{t('setup.appearance.hint')}</p>
            <div className="setup-option-list setup-option-list-row">
                <button
                    className={`setup-option ${theme === 'light' ? 'selected' : ''}`}
                    onClick={() => onSelect('light')}
                >
                    <i className="fa-solid fa-sun"/>
                    {t('setup.appearance.light')}
                    {theme === 'light' && <i className="fa-solid fa-check setup-option-check"/>}
                </button>
                <button
                    className={`setup-option ${theme === 'dark' ? 'selected' : ''}`}
                    onClick={() => onSelect('dark')}
                >
                    <i className="fa-solid fa-moon"/>
                    {t('setup.appearance.dark')}
                    {theme === 'dark' && <i className="fa-solid fa-check setup-option-check"/>}
                </button>
            </div>
        </div>
    );
}

function SecurityStep({t, encryption, onSelectEncryption, passphrase, onPassphraseChange, confirmPassphrase, onConfirmPassphraseChange, error, onSubmit, busy}) {
    const [showPassphrase, setShowPassphrase] = useState(false);
    const passphraseType = showPassphrase ? 'text' : 'password';

    return (
        <div className="setup-step-content">
            <div className="vault-icon">
                <i className="fa-solid fa-shield-halved"/>
            </div>
            <h2>{t('setup.security.heading')}</h2>
            <p className="hint-text">{t('setup.security.hint')}</p>
            <div className="setup-option-list setup-option-list-row">
                <button
                    className={`setup-option ${encryption === 'unencrypted' ? 'selected' : ''}`}
                    onClick={() => onSelectEncryption('unencrypted')}
                >
                    {t('setup.security.unencrypted')}
                    {encryption === 'unencrypted' && <i className="fa-solid fa-check setup-option-check"/>}
                </button>
                <button
                    className={`setup-option ${encryption === 'encrypted' ? 'selected' : ''}`}
                    onClick={() => onSelectEncryption('encrypted')}
                >
                    {t('setup.security.encrypted')}
                    {encryption === 'encrypted' && <i className="fa-solid fa-check setup-option-check"/>}
                </button>
            </div>

            {encryption === 'encrypted' && (
                <form className="setup-passphrase-fields" onSubmit={onSubmit}>
                    <div className="vault-password-field">
                        <input
                            type={passphraseType}
                            autoFocus
                            value={passphrase}
                            onChange={(e) => onPassphraseChange(e.target.value)}
                            placeholder={t('setup.security.passphrasePlaceholder')}
                            className={error ? 'has-error' : ''}
                        />
                        <button
                            type="button"
                            className="vault-password-toggle"
                            onClick={() => setShowPassphrase((v) => !v)}
                            tabIndex={-1}
                            aria-label={t(showPassphrase ? 'dialogs.vaultGate.hidePassword' : 'dialogs.vaultGate.showPassword')}
                        >
                            <i className={`fa-solid ${showPassphrase ? 'fa-eye-slash' : 'fa-eye'}`}/>
                        </button>
                    </div>
                    <input
                        type={passphraseType}
                        value={confirmPassphrase}
                        onChange={(e) => onConfirmPassphraseChange(e.target.value)}
                        placeholder={t('setup.security.confirmPlaceholder')}
                        className={error ? 'has-error' : ''}
                    />
                    {/* Allows Enter to submit from either passphrase field without a visible extra button.
                        Inline style (not the `hidden` attribute) because the global `button { display: ... }`
                        rule outranks the UA [hidden] rule in the cascade. */}
                    <button type="submit" style={{display: 'none'}} disabled={busy}/>
                </form>
            )}

            {error && (
                <div className="error-banner">
                    <i className="fa-solid fa-circle-exclamation"/> {error}
                </div>
            )}
        </div>
    );
}

export default function SetupWizard({onComplete}) {
    const {t} = useTranslation();
    const [stepIndex, setStepIndex] = useState(0);
    const [language, setLanguage] = useState(i18n.language || 'en');
    const [theme, setTheme] = useState('light');
    const [encryption, setEncryption] = useState('unencrypted');
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const stepId = STEP_IDS[stepIndex];
    const isLastStep = stepIndex === STEP_IDS.length - 1;

    async function handleLanguageSelect(code) {
        setLanguage(code);
        await i18n.changeLanguage(code);
    }

    function handleThemeSelect(value) {
        setTheme(value);
        document.body.classList.toggle('dark', value === 'dark');
    }

    function handleEncryptionSelect(value) {
        setEncryption(value);
        setError('');
    }

    function goNext() {
        setError('');
        setStepIndex((i) => Math.min(i + 1, STEP_IDS.length - 1));
    }

    function goBack() {
        setError('');
        setStepIndex((i) => Math.max(i - 1, 0));
    }

    function validatePassphrase() {
        if (encryption !== 'encrypted') return true;
        if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
            setError(t('setup.security.tooShort'));
            return false;
        }
        if (passphrase !== confirmPassphrase) {
            setError(t('setup.security.mismatch'));
            return false;
        }
        return true;
    }

    async function handleFinish(e) {
        e?.preventDefault();
        if (!validatePassphrase()) return;

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
                <StepProgress stepIds={STEP_IDS} activeIndex={stepIndex} t={t}/>

                <div key={stepId}>
                    {stepId === 'welcome' && <WelcomeStep t={t}/>}
                    {stepId === 'language' && (
                        <LanguageStep t={t} language={language} onSelect={handleLanguageSelect}/>
                    )}
                    {stepId === 'appearance' && (
                        <AppearanceStep t={t} theme={theme} onSelect={handleThemeSelect}/>
                    )}
                    {stepId === 'security' && (
                        <SecurityStep
                            t={t}
                            encryption={encryption}
                            onSelectEncryption={handleEncryptionSelect}
                            passphrase={passphrase}
                            onPassphraseChange={(v) => { setPassphrase(v); setError(''); }}
                            confirmPassphrase={confirmPassphrase}
                            onConfirmPassphraseChange={(v) => { setConfirmPassphrase(v); setError(''); }}
                            error={error}
                            onSubmit={handleFinish}
                            busy={busy}
                        />
                    )}
                </div>

                <div className="vault-actions setup-actions">
                    {stepIndex > 0 && (
                        <button onClick={goBack} disabled={busy}>
                            {t('setup.back')}
                        </button>
                    )}
                    {!isLastStep ? (
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