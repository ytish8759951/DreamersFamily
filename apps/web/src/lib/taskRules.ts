import type { LocalTask } from './localTypes';

const activeTaskStatuses: LocalTask['status'][] = ['pending', 'submitted', 'rejected', 'approved'];
const reviewableStatuses: LocalTask['status'][] = ['submitted'];
const historicalStatuses: LocalTask['status'][] = ['approved', 'cancelled', 'expired'];

export function getTodayTaskDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function isTaskOccurrenceToday(task: LocalTask, today = getTodayTaskDate()) {
  return (task.occurrence_date ?? task.task_date) === today;
}

export function isPastDailyTask(task: LocalTask, today = getTodayTaskDate()) {
  return task.category === 'daily' && (task.occurrence_date ?? task.task_date) < today;
}

function isDisplayableDailyTask(task: LocalTask) {
  return task.category !== 'daily' || task.daily_template_active !== true || Boolean(task.occurrence_date);
}

export function getChildVisibleTasks(
  tasks: LocalTask[],
  category: LocalTask['category'],
  today = getTodayTaskDate()
) {
  return tasks
    .filter((task) => task.category === category)
    .filter(isDisplayableDailyTask)
    .filter((task) => task.category !== 'daily' || isTaskOccurrenceToday(task, today))
    .filter((task) => activeTaskStatuses.includes(task.status))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getChildTodayTasks(tasks: LocalTask[], today = getTodayTaskDate()) {
  return tasks
    .filter((task) => task.category !== 'daily' || isTaskOccurrenceToday(task, today))
    .filter(isDisplayableDailyTask)
    .filter((task) => task.category !== 'daily' || task.status !== 'expired')
    .filter((task) => task.category === 'daily' ? activeTaskStatuses.includes(task.status) : ['pending', 'submitted', 'rejected'].includes(task.status))
    .sort((a, b) => {
      const aDone = ['submitted', 'approved'].includes(a.status);
      const bDone = ['submitted', 'approved'].includes(b.status);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return a.created_at.localeCompare(b.created_at);
    });
}

export function getChildHistoryTasks(tasks: LocalTask[], today = getTodayTaskDate()) {
  return tasks
    .filter((task) => historicalStatuses.includes(task.status) || isPastDailyTask(task, today))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getParentOpenTasks(tasks: LocalTask[], today = getTodayTaskDate()) {
  return tasks
    .filter((task) => {
      if (!isDisplayableDailyTask(task)) return false;
      if (reviewableStatuses.includes(task.status)) return true;
      if (!['pending', 'rejected'].includes(task.status)) return false;
      return task.category !== 'daily' || isTaskOccurrenceToday(task, today);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getParentHistoryTasks(tasks: LocalTask[], _today = getTodayTaskDate()) {
  return tasks
    .filter((task) => task.category === 'challenge' && task.status === 'approved')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
