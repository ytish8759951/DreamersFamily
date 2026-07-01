import { ListChecks } from 'lucide-react';
import { ChildPage } from './ChildPage';

export function TodayTasks() {
  return <ChildPage title="今天任務" subtitle="聽一聽，做完按大按鈕。" icon={ListChecks} mode="tasks" />;
}

