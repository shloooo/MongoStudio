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

export default function CollectionView({selection, reloadSignal}) {
    const {t} = useTranslation();
    const [tab, setTab] = useState(() => {
        const saved = localStorage.getItem(tabStorageKey(selection));
        return TABS.includes(saved) ? saved : 'Documents';
    });
    const [filterRequest, setFilterRequest] = useState(null);

    function changeTab(next) {
        setTab(next);
        localStorage.setItem(tabStorageKey(selection), next);
    }

    function handleShowInDocuments(filterText) {
        setFilterRequest((prev) => ({text: filterText, seq: (prev?.seq ?? 0) + 1}));
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
                <div className={`tab-slot ${tab === 'Documents' ? '' : 'tab-slot-hidden'}`}>
                    <DocumentsTab selection={selection} reloadSignal={reloadSignal} filterRequest={filterRequest}/>
                </div>
                <div className={`tab-slot ${tab === 'Aggregation' ? '' : 'tab-slot-hidden'}`}>
                    <AggregationTab selection={selection} reloadSignal={reloadSignal}
                                    onShowInDocuments={handleShowInDocuments}/>
                </div>
                <div className={`tab-slot ${tab === 'Indexes' ? '' : 'tab-slot-hidden'}`}>
                    <IndexesTab selection={selection} reloadSignal={reloadSignal}/>
                </div>
            </div>
        </div>
    );
}