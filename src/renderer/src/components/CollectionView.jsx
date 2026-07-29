import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import DocumentsTab from './DocumentsTab.jsx';
import AggregationTab from './AggregationTab.jsx';
import IndexesTab from './IndexesTab.jsx';

const TABS = ['Documents', 'Aggregation', 'Indexes'];
const TAB_LABEL_KEYS = {
    Documents: 'collectionView.tabs.documents',
    Aggregation: 'collectionView.tabs.aggregation',
    Indexes: 'collectionView.tabs.indexes'
};

function tabStorageKey(selection) {
    return `mongostudio.collectionTab.${selection.connId}.${selection.dbName}.${selection.collection}`;
}

export default function CollectionView({ selection, reloadSignal }) {
    const {t} = useTranslation();
    const [tab, setTab] = useState(() => {
        const saved = localStorage.getItem(tabStorageKey(selection));
        return TABS.includes(saved) ? saved : 'Documents';
    });
    const [docsFilter, setDocsFilter] = useState(null);

    function changeTab(next) {
        setTab(next);
        localStorage.setItem(tabStorageKey(selection), next);
    }

    function handleShowInDocuments(filterText) {
        setDocsFilter(filterText);
        changeTab('Documents');
    }

    return (
        <div className="collection-view">
            <div className="breadcrumb">
                {selection.dbName} <span className="sep">/</span> {selection.collection}
            </div>
            <div className="tab-bar">
                {TABS.map((t2) => (
                    <button key={t2} className={`tab-btn ${tab === t2 ? 'active' : ''}`}
                            onClick={() => changeTab(t2)}>{t(TAB_LABEL_KEYS[t2])}</button>
                ))}
            </div>
            <div className="tab-content">
                {tab === 'Documents' && <DocumentsTab selection={selection} reloadSignal={reloadSignal} initialFilter={docsFilter}/>}
                {tab === 'Aggregation' && <AggregationTab selection={selection} reloadSignal={reloadSignal} onShowInDocuments={handleShowInDocuments}/>}
                {tab === 'Indexes' && <IndexesTab selection={selection} reloadSignal={reloadSignal}/>}
            </div>
        </div>
    );
}