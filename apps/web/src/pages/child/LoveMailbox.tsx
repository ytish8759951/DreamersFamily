import { Mail } from 'lucide-react';
import { ChildPage } from './ChildPage';

export function LoveMailbox() {
  return <ChildPage title="爸爸媽媽的信" subtitle="每一句話，都是陪伴你的愛" icon={Mail} mode="mailbox" />;
}
