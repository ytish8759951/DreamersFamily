import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function StatCard({ label, value, tone = 'ds-tone-blue' }: { label: string; value: string; tone?: string }) {
  return <article className={`ds-parent-stat ${tone}`}><p>{label}</p><strong>{value}</strong></article>;
}

export function FeatureCard({ title, description, href, icon: Icon }: { title: string; description: string; href: string; icon: LucideIcon; stat?: string }) {
  return <Link to={href} className="ds-parent-feature"><span><Icon size={24} /></span><div><strong>{title}</strong><p>{description}</p></div></Link>;
}

export function KidTile({ title, voiceLabel, href, icon: Icon, color }: { title: string; voiceLabel: string; href: string; icon: LucideIcon; color: string }) {
  return <Link to={href} className={`ds-parent-feature ${color}`}><span><Icon size={25} /></span><div><strong>{title}</strong><p>{voiceLabel}</p></div></Link>;
}

export function BigActionButton({ children }: { children: ReactNode }) {
  return <button className="ds-primary-button">{children}</button>;
}
