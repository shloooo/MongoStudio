const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    app: {
        onError: (cb) => {
            const listener = (event, message) => cb(message);
            ipcRenderer.on('app:error', listener);
            return () => ipcRenderer.removeListener('app:error', listener);
        },
        getInfo: () => ipcRenderer.invoke('app:getInfo'),
        relaunch: () => ipcRenderer.invoke('app:relaunch')
    },
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
        close: () => ipcRenderer.invoke('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
        onMaximizedChange: (cb) => {
            const listener = (event, isMaximized) => cb(isMaximized);
            ipcRenderer.on('window:maximized', listener);
            return () => ipcRenderer.removeListener('window:maximized', listener);
        },
        platform: process.platform
    },
    setup: {
        needed: () => ipcRenderer.invoke('setup:needed'),
        complete: (payload) => ipcRenderer.invoke('setup:complete', payload)
    },
    vault: {
        status: () => ipcRenderer.invoke('vault:status'),
        unlock: (passphrase) => ipcRenderer.invoke('vault:unlock', passphrase),
        setup: (passphrase) => ipcRenderer.invoke('vault:setup', passphrase),
        disable: (currentPassphrase) => ipcRenderer.invoke('vault:disable', currentPassphrase),
        changePassphrase: (current, next) => ipcRenderer.invoke('vault:changePassphrase', { current, next }),
        reset: () => ipcRenderer.invoke('vault:reset')
    },
    settings: {
        get: () => ipcRenderer.invoke('settings:get'),
        set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
        export: (connections) => ipcRenderer.invoke('settings:export', { connections }),
        import: () => ipcRenderer.invoke('settings:import')
    },
    conn: {
        list: () => ipcRenderer.invoke('conn:list'),
        get: (id) => ipcRenderer.invoke('conn:get', id),
        save: (conn) => ipcRenderer.invoke('conn:save', conn),
        delete: (id) => ipcRenderer.invoke('conn:delete', id),
        test: (conn) => ipcRenderer.invoke('conn:test', conn),
        open: (conn) => ipcRenderer.invoke('conn:open', conn),
        close: (id) => ipcRenderer.invoke('conn:close', id),
        listDatabases: (id) => ipcRenderer.invoke('conn:listDatabases', id),
        listCollections: (connId, dbName) => ipcRenderer.invoke('conn:listCollections', { connId, dbName }),
        listCollectionsWithCounts: (connId, dbName) => ipcRenderer.invoke('conn:listCollectionsWithCounts', { connId, dbName }),
        createDatabase: (args) => ipcRenderer.invoke('conn:createDatabase', args),
        pickPrivateKey: () => ipcRenderer.invoke('conn:pickPrivateKey'),
        onDisconnected: (cb) => {
            const listener = (event, id) => cb(id);
            ipcRenderer.on('conn:disconnected', listener);
            return () => ipcRenderer.removeListener('conn:disconnected', listener);
        }
    },
    updater: {
        check: () => ipcRenderer.invoke('updater:check'),
        download: () => ipcRenderer.invoke('updater:download'),
        quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
        getState: () => ipcRenderer.invoke('updater:getState'),
        onEvent: (cb) => {
            const listener = (event, payload) => cb(payload);
            ipcRenderer.on('updater:event', listener);
            return () => ipcRenderer.removeListener('updater:event', listener);
        }
    },
    data: {
        find: (args) => ipcRenderer.invoke('data:find', args),
        aggregate: (args) => ipcRenderer.invoke('data:aggregate', args),
        insertOne: (args) => ipcRenderer.invoke('data:insertOne', args),
        updateOne: (args) => ipcRenderer.invoke('data:updateOne', args),
        updateMany: (args) => ipcRenderer.invoke('data:updateMany', args),
        deleteOne: (args) => ipcRenderer.invoke('data:deleteOne', args),
        deleteMany: (args) => ipcRenderer.invoke('data:deleteMany', args),
        createCollection: (args) => ipcRenderer.invoke('data:createCollection', args),
        dropCollection: (args) => ipcRenderer.invoke('data:dropCollection', args),
        renameCollection: (args) => ipcRenderer.invoke('data:renameCollection', args),
        indexes: (args) => ipcRenderer.invoke('data:indexes', args),
        createIndex: (args) => ipcRenderer.invoke('data:createIndex', args),
        listUsers: (args) => ipcRenderer.invoke('data:listUsers', args),
        listAllUsers: (args) => ipcRenderer.invoke('data:listAllUsers', args),
        listRoles: (args) => ipcRenderer.invoke('data:listRoles', args),
        userPrivileges: (args) => ipcRenderer.invoke('data:userPrivileges', args),
        collectionUsers: (args) => ipcRenderer.invoke('data:collectionUsers', args),
        createUser: (args) => ipcRenderer.invoke('data:createUser', args),
        updateUser: (args) => ipcRenderer.invoke('data:updateUser', args),
        dropUser: (args) => ipcRenderer.invoke('data:dropUser', args),
        exportResults: (args) => ipcRenderer.invoke('data:exportResults', args),
        importFile: (args) => ipcRenderer.invoke('data:importFile', args),
        exportCollection: (args) => ipcRenderer.invoke('data:exportCollection', args),
        listCollectionFields: (args) => ipcRenderer.invoke('data:listCollectionFields', args),
        analyzeSqlExport: (args) => ipcRenderer.invoke('data:analyzeSqlExport', args),
        exportCollectionSql: (args) => ipcRenderer.invoke('data:exportCollectionSql', args),
        importIntoCollection: (args) => ipcRenderer.invoke('data:importIntoCollection', args),
        copyCollection: (args) => ipcRenderer.invoke('data:copyCollection', args),
        dropDatabase: (args) => ipcRenderer.invoke('data:dropDatabase', args),
        exportDatabase: (args) => ipcRenderer.invoke('data:exportDatabase', args),
        importDatabase: (args) => ipcRenderer.invoke('data:importDatabase', args),
        copyDatabase: (args) => ipcRenderer.invoke('data:copyDatabase', args),
        cancelCopy: (requestId) => ipcRenderer.invoke('data:cancelCopy', {requestId}),
        historyList: (args) => ipcRenderer.invoke('data:history:list', args),
        historyClear: (args) => ipcRenderer.invoke('data:history:clear', args),
        historyUndo: (args) => ipcRenderer.invoke('data:history:undo', args),
        shellExec: (args) => ipcRenderer.invoke('data:shell:exec', args),
        gridfsListBuckets: (args) => ipcRenderer.invoke('data:gridfs:listBuckets', args),
        gridfsListFiles: (args) => ipcRenderer.invoke('data:gridfs:listFiles', args),
        gridfsUpload: (args) => ipcRenderer.invoke('data:gridfs:upload', args),
        gridfsDownload: (args) => ipcRenderer.invoke('data:gridfs:download', args),
        gridfsDelete: (args) => ipcRenderer.invoke('data:gridfs:delete', args),
        gridfsCreateBucket: (args) => ipcRenderer.invoke('data:gridfs:createBucket', args),
        gridfsDropBucket: (args) => ipcRenderer.invoke('data:gridfs:dropBucket', args),
        onCopyProgress: (cb) => {
            const listener = (event, payload) => cb(payload);
            ipcRenderer.on('data:copyProgress', listener);
            return () => ipcRenderer.removeListener('data:copyProgress', listener);
        }
    }
});