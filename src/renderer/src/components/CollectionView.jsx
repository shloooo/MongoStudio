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

export default function CollectionView({ selection, reloadSignal }) {
    const {t} = useTranslation();
    const [tab, setTab] = useState('Documents');

    return (
        <div className="collection-view">
            <div className="breadcrumb">
                {selection.dbName} <span className="sep">/</span> {selection.collection}
            </div>
            <div className="tab-bar">
                {TABS.map((t2) => (
                    <button key={t2} className={`tab-btn ${tab === t2 ? 'active' : ''}`}
                            onClick={() => setTab(t2)}>{t(TAB_LABEL_KEYS[t2])}</button>
                ))}
            </div>
            <div className="tab-content">
                {tab === 'Documents' && <DocumentsTab selection={selection} reloadSignal={reloadSignal}/>}
                {tab === 'Aggregation' && <AggregationTab selection={selection} reloadSignal={reloadSignal}/>}
                {tab === 'Indexes' && <IndexesTab selection={selection} reloadSignal={reloadSignal}/>}
            </div>
        </div>
    );
}