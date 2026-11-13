import { Sparkles } from 'lucide-react';

export default function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark"><Sparkles size={22} strokeWidth={2.4} /></span>
      <span className="brand-word">Research<span>Mind</span></span>
    </div>
  );
}
