import {
  Award,
  Baby,
  Bell,
  BookOpen,
  CalendarHeart,
  Camera,
  Clock,
  Gift,
  Heart,
  Home,
  Image,
  ListChecks,
  Mail,
  Medal,
  MessageCircle,
  MoonStar,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  WandSparkles
} from 'lucide-react';

export type Child = {
  id: string;
  name: string;
  age: number;
  color: string;
  avatar: string;
  stars: number;
  tabletMinutes: number;
};

export type ParentFeature = {
  title: string;
  description: string;
  href: string;
  icon: typeof Home;
  stat?: string;
};

export type ChildFeature = {
  title: string;
  voiceLabel: string;
  href: string;
  icon: typeof Home;
  color: string;
};

export const children: Child[] = [
  { id: 'child-a', name: '安安', age: 4, color: 'bg-dream-sky', avatar: 'A', stars: 18, tabletMinutes: 25 },
  { id: 'child-b', name: '樂樂', age: 6, color: 'bg-dream-mint', avatar: 'L', stars: 32, tabletMinutes: 40 },
  { id: 'child-c', name: '米米', age: 8, color: 'bg-dream-peach', avatar: 'M', stars: 45, tabletMinutes: 35 }
];

export const parentFeatures: ParentFeature[] = [
  { title: '孩子管理', description: '孩子資料、平板綁定與推播', href: '/parent/children', icon: Baby, stat: '3 位孩子' },
  { title: '任務管理', description: '任務、完成回報與獎勵設定', href: '/parent/tasks', icon: ListChecks, stat: '4 待審核' },
  { title: '願望管理', description: '願望基金、進度與達成狀態', href: '/parent/wishes', icon: MoonStar, stat: '2 進行中' },
  { title: '鼓勵卡', description: '文字、照片、語音、影片鼓勵', href: '/parent/cards', icon: Heart, stat: '3 草稿' },
  { title: '成長相簿', description: '孩子分享、家長留言與星星', href: '/parent/albums', icon: Image, stat: '9 新內容' },
  { title: '特殊日子', description: '生日、畢業、旅行與第一次', href: '/parent/special-days', icon: CalendarHeart, stat: '下週生日' },
  { title: '設定', description: '家庭成員、通知與安全設定', href: '/parent/settings', icon: Settings }
];

export const childFeatures: ChildFeature[] = [
  { title: '我的家', voiceLabel: '聽今天有什麼', href: '/child/home', icon: Home, color: 'bg-dream-sky' },
  { title: '今天任務', voiceLabel: '聽任務', href: '/child/tasks', icon: ListChecks, color: 'bg-dream-mint' },
  { title: '分享成長', voiceLabel: '拍照錄音', href: '/child/share', icon: Camera, color: 'bg-dream-peach' },
  { title: '我的夢想', voiceLabel: '看夢想', href: '/child/dreams', icon: WandSparkles, color: 'bg-dream-coral' },
  { title: '愛的信箱', voiceLabel: '聽爸爸媽媽', href: '/child/mailbox', icon: Mail, color: 'bg-yellow-200' }
];

export const tasks = [
  { id: 'task-1', child: '安安', title: '自己刷牙', reward: '3 顆星星', status: '待審核', media: '照片', color: 'bg-sky-200', picture: 'tooth' },
  { id: 'task-2', child: '樂樂', title: '收好積木', reward: '10 分鐘平板', status: '已完成', media: '語音', color: 'bg-emerald-200', picture: 'blocks' },
  { id: 'task-3', child: '米米', title: '讀一本故事書', reward: '願望基金 20', status: '進行中', media: '影片', color: 'bg-amber-200', picture: 'book' }
];

export const wishes = [
  { id: 'wish-1', child: '安安', title: '彩虹積木組', progress: 60, target: '100 顆星星' },
  { id: 'wish-2', child: '樂樂', title: '動物園旅行', progress: 35, target: '願望基金 1200' },
  { id: 'wish-3', child: '米米', title: '畫畫課', progress: 80, target: '願望基金 2000' }
];

export const timeline = [
  { title: '安安上傳新照片', detail: '分享了自己的拼圖作品', icon: Camera },
  { title: '樂樂收到鼓勵卡', detail: '媽媽傳了一段語音', icon: Heart },
  { title: '米米獲得新徽章', detail: '完成閱讀任務', icon: Medal }
];

export const mediaTypes = [
  { label: '文字', icon: MessageCircle },
  { label: '照片', icon: Image },
  { label: '語音', icon: Bell },
  { label: '影片', icon: Camera }
];

export const rewardTypes = [
  { label: '星星', icon: Star },
  { label: '願望基金', icon: Gift },
  { label: '平板時間', icon: Clock },
  { label: '徽章', icon: Award }
];

export const safetyHighlights = [
  { label: '孩子免帳密', icon: ShieldCheck },
  { label: '平板綁定', icon: Baby },
  { label: '語音優先', icon: Bell },
  { label: '圖片優先', icon: Sparkles }
];
