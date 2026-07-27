import React, { useState } from 'react';
import DocumentsTab from './DocumentsTab.jsx';
import AggregationTab from './AggregationTab.jsx';
import IndexesTab from './IndexesTab.jsx';

const TABS = ['Documents', 'Aggregation', 'Indexes'];

export default function CollectionView({ selection, reloadSignal }) {
  const [tab, setTab] = useState('Documents');

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
