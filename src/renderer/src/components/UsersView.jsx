import React from 'react';
import {useTranslation} from 'react-i18next';
import UserManagementTab from './UserManagementTab.jsx';

export default function UsersView({selection, mode, reloadSignal}) {
    const {t} = useTranslation();
    return (
        <div className="collection-view">
            <div className="breadcrumb">
                {selection.dbName} <span className="sep">/</span>{' '}
                {mode === 'collection' && <>{selection.collection} <span className="sep">/</span> </>}
                {t('usersView.breadcrumb')}
            </div>
            <div className="tab-content">
                <UserManagementTab selection={selection} mode={mode} reloadSignal={reloadSignal}/>
            </div>
        </div>
    );
}