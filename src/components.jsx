import { ArrowUpRight, Check, Circle, LoaderCircle, Sparkles } from 'lucide-react';

export function Button({ children, icon: Icon, variant = 'primary', busy, className = '', ...props }) {
  return <button className={`button ${variant} ${className}`} {...props} disabled={props.disabled || busy}>{busy ? <LoaderCircle size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}{children}</button>;
}
export function Card({ title, eyebrow, action, children, className = '', id }) {
  return <section id={id} className={`card ${className}`}><div className="card-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}
export function Empty({ icon: Icon = Sparkles, title, children, action }) {
  return <div className="empty"><div className="empty-icon"><Icon size={23} strokeWidth={1.5} /></div><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Tags({ skills, tone = 'green', empty = 'No skills identified yet.' }) {
  if (!skills?.length) return <p className="muted small">{empty}</p>;
  return <div className="tags">{skills.map(s => <span className={`tag ${tone}`} key={s.name || s} title={s.evidence || undefined}>{tone === 'green' && <Check size={12} />}{s.name || s}</span>)}</div>;
}
export function BulletList({ items, empty = 'Not explicitly identified in the source.' }) {
  return items?.length ? <ul className="text-list">{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="muted small">{empty}</p>;
}
export function TextLink({ children, onClick }) {
  return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={15} /></button>;
}
export function SourceBadge({ ai = false }) {
  return <span className={`source-badge ${ai ? 'ai' : ''}`}>{ai ? <Sparkles size={11} /> : <Circle size={9} />}{ai ? 'AI generated · review' : 'Rule-based'}</span>;
}
