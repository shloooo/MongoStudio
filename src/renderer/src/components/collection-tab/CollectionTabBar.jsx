import React from 'react';
import {useTranslation} from 'react-i18next';

export default function CollectionTabBar({ tabs, activeTabId, onSelectTab, onCloseTab }) {
  const {t} = useTranslation();
  if (tabs.length === 0) return null;
  return (
      <div className="collection-tab-bar">
        {tabs.map((tab) => (
            <div key={tab.id}
                 className={`collection-tab ${tab.id === activeTabId ? 'active' : ''}`}
                 onClick={() => onSelectTab(tab.id)}
                 title={`${tab.dbName}.${tab.collection}`}>
          <span className="collection-tab-label">
            <span className="collection-tab-db">{tab.dbName}</span>
            <span className="collection-tab-sep">.</span>
            <span className="collection-tab-name">{tab.collection}</span>
          </span>
              <button className="collection-tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      aria-label={t('collectionTabBar.closeTab')}>×
              </button>
            </div>
        ))}
      </div>
  );
}