import React from 'react';
import UserManagementTab from './UserManagementTab.jsx';

export default function UsersView({selection, mode, reloadSignal}) {
    return (
        <div className="collection-view">
            <div className="breadcrumb">
                {selection.dbName} <span className="sep">/</span>{' '}
                {mode === 'collection' && <>{selection.collection} <span className="sep">/</span> </>}
                Users
            </div>
            <div className="tab-content">
                <UserManagementTab selection={selection} mode={mode} reloadSignal={reloadSignal}/>
            </div>
        </div>
    );
}
