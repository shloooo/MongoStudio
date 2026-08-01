import React, {createContext, useCallback, useContext, useState} from 'react';
import {useTranslation} from 'react-i18next';

const TaskQueueContext = createContext(null);

let taskIdCounter = 0;

export function TaskQueueProvider({children}) {
    const {t} = useTranslation();
    const [tasks, setTasks] = useState([]);
    const [collapsed, setCollapsed] = useState(false);

    const enqueue = useCallback((promise, label, opts = {}) => {
        const id = `task-${++taskIdCounter}`;
        const task = {
            id,
            label,
            status: 'running',
            startedAt: Date.now(),
            progress: null,
            result: null,
            error: null,
            onProgress: opts.onProgress
        };
        setTasks((prev) => [...prev, task]);

        promise.then((result) => {
            setTasks((prev) => prev.map((tk) => (tk.id === id ? {
                ...tk,
                status: 'done',
                result,
                finishedAt: Date.now()
            } : tk)));
            if (opts.onDone) opts.onDone(result);
        }).catch((err) => {
            setTasks((prev) => prev.map((tk) => (tk.id === id ? {
                ...tk,
                status: 'error',
                error: err.message,
                finishedAt: Date.now()
            } : tk)));
            if (opts.onError) opts.onError(err);
        });

        return id;
    }, []);

    const updateTaskProgress = useCallback((id, progress) => {
        setTasks((prev) => prev.map((tk) => (tk.id === id ? {...tk, progress} : tk)));
    }, []);

    const dismissTask = useCallback((id) => {
        setTasks((prev) => prev.filter((tk) => tk.id !== id));
    }, []);

    const clearFinished = useCallback(() => {
        setTasks((prev) => prev.filter((tk) => tk.status === 'running'));
    }, []);

    const runningCount = tasks.filter((tk) => tk.status === 'running').length;

    return (
        <TaskQueueContext.Provider value={{enqueue, updateTaskProgress, dismissTask}}>
            {children}
            {tasks.length > 0 && (
                <div className={`task-queue-panel ${collapsed ? 'is-collapsed' : ''}`}>
                    <div className="task-queue-header" onClick={() => setCollapsed((v) => !v)}>
            <span>
              {runningCount > 0
                  ? t('taskQueue.runningCount', {count: runningCount})
                  : t('taskQueue.allDone')}
            </span>
                        <div className="spacer"/>
                        {tasks.some((tk) => tk.status !== 'running') && (
                            <button
                                className="tiny-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearFinished();
                                }}
                            >
                                {t('taskQueue.clearFinished')}
                            </button>
                        )}
                        <i className={`fa-solid fa-chevron-${collapsed ? 'up' : 'down'}`}/>
                    </div>
                    {!collapsed && (
                        <div className="task-queue-list">
                            {tasks.map((task) => (
                                <div key={task.id} className={`task-queue-item status-${task.status}`}>
                                    <div className="task-queue-item-row">
                                        <i className={
                                            task.status === 'running' ? 'fa-solid fa-spinner fa-spin'
                                                : task.status === 'done' ? 'fa-solid fa-check'
                                                    : 'fa-solid fa-triangle-exclamation'
                                        }/>
                                        <span className="task-queue-item-label">{task.label}</span>
                                        {task.status !== 'running' && (
                                            <button className="tiny-btn task-queue-dismiss"
                                                    onClick={() => dismissTask(task.id)}>×</button>
                                        )}
                                    </div>
                                    {task.progress && (
                                        <div className="task-queue-progress-bar-track">
                                            <div className="task-queue-progress-bar-fill"
                                                 style={{width: `${task.progress.percent || 0}%`}}/>
                                        </div>
                                    )}
                                    {task.progress && task.progress.detail && (
                                        <div className="task-queue-item-detail">{task.progress.detail}</div>
                                    )}
                                    {task.status === 'error' &&
                                        <div className="task-queue-item-error">{task.error}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </TaskQueueContext.Provider>
    );
}

export function useTaskQueue() {
    const ctx = useContext(TaskQueueContext);
    if (!ctx) throw new Error('useTaskQueue() must be used within a <TaskQueueProvider>');
    return ctx;
}