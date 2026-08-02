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
            onCancel: opts.onCancel || null
        };
        setTasks((prev) => [...prev, task]);

        promise.then((result) => {
            if (result && result.cancelled) {
                setTasks((prev) => prev.map((tk) => (tk.id === id ? {
                    ...tk,
                    status: 'cancelled',
                    result,
                    finishedAt: Date.now()
                } : tk)));
                return;
            }
            setTasks((prev) => prev.map((tk) => (tk.id === id ? {
                ...tk,
                status: 'done',
                result,
                finishedAt: Date.now()
            } : tk)));
            if (opts.onDone) opts.onDone(result);
        }).catch((err) => {
            if (err && err.message === 'CANCELLED') {
                setTasks((prev) => prev.map((tk) => (tk.id === id ? {
                    ...tk,
                    status: 'cancelled',
                    finishedAt: Date.now()
                } : tk)));
                return;
            }
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

    const cancelTask = useCallback((id) => {
        setTasks((prev) => {
            const task = prev.find((tk) => tk.id === id);
            if (task && task.onCancel) task.onCancel();
            return prev.map((tk) => (tk.id === id ? {...tk, cancelling: true} : tk));
        });
    }, []);

    const clearFinished = useCallback(() => {
        setTasks((prev) => prev.filter((tk) => tk.status === 'running'));
    }, []);

    const runningCount = tasks.filter((tk) => tk.status === 'running').length;

    return (
        <TaskQueueContext.Provider value={{enqueue, updateTaskProgress, dismissTask, cancelTask}}>
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
                                                    : task.status === 'cancelled' ? 'fa-solid fa-ban'
                                                        : 'fa-solid fa-triangle-exclamation'
                                        }/>
                                        <span className="task-queue-item-label">{task.label}</span>
                                        {task.status === 'running' && task.onCancel && (
                                            <button className="tiny-btn task-queue-cancel"
                                                    disabled={task.cancelling}
                                                    onClick={() => cancelTask(task.id)}>
                                                {task.cancelling ? t('taskQueue.cancelling') : t('taskQueue.cancel')}
                                            </button>
                                        )}
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
                                    {task.progress && task.progress.subitems && task.progress.subitems.length > 0 && (
                                        <div className="task-queue-subitems">
                                            {task.progress.subitems.map((sub) => (
                                                <div key={sub.name}
                                                     className={`task-queue-subitem status-${sub.status}`}>
                                                    <span className="task-queue-subitem-icon">
                                                        {sub.status === 'done' ? '✓' : sub.status === 'active' ? '↻' : '·'}
                                                    </span>
                                                    <span className="task-queue-subitem-name">{sub.name}</span>
                                                    <span className="task-queue-subitem-count">
                                                        {sub.total ? `${sub.copied || 0} / ${sub.total}` : (sub.copied || 0)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
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