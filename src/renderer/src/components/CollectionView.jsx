import React, { useState, useEffect } from 'react';
import DocumentsTab from './DocumentsTab.jsx';
import AggregationTab from './AggregationTab.jsx';
import IndexesTab from './IndexesTab.jsx';
import UserManagementTab from './UserManagementTab.jsx';

const TABS = ['Documents', 'Aggregation', 'Indexes'];

export default function CollectionView({ selection, reloadSignal }) {
  const [tab, setTab] = useState('Documents');
  const [systemUsersView, setSystemUsersView] = useState(null);

  const isSystemUsers = selection.collection === 'system.users';

  useEffect(() => {
    if (isSystemUsers) {
      window.api.settings.get().then((s) => setSystemUsersView(s.systemUsersView || 'userManagement'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSystemUsers, selection.connId, selection.dbName]);

  if (isSystemUsers && systemUsersView === null) {
    return <div className="collection-view"><div className="tree-loading">loading...</div></div>;
  }

  if (isSystemUsers && systemUsersView === 'userManagement') {
    return (
      <div className="collection-view">
        <div className="breadcrumb">
          {selection.dbName} <span className="sep">/</span> Users
        </div>
        <div className="tab-content">
          <UserManagementTab selection={selection} reloadSignal={reloadSignal} />
        </div>
      </div>
    );
  }

  return (
    <div className="collection-view">
      <div className="breadcrumb">
        {selection.dbName} <span className="sep">/</span> {selection.collection}
      </div>
      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="tab-content">
        {tab === 'Documents' && <DocumentsTab selection={selection} reloadSignal={reloadSignal} />}
        {tab === 'Aggregation' && <AggregationTab selection={selection} reloadSignal={reloadSignal} />}
        {tab === 'Indexes' && <IndexesTab selection={selection} reloadSignal={reloadSignal} />}
      </div>
    </div>
  );
}
