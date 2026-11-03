// Hilfesystem: F1 oder „?“ öffnet die Hilfe zur aktuellen Seite; Artikel durchsuchbar.

import { useMemo, useState, type ReactNode } from 'react';
import { Search, GraduationCap } from 'lucide-react';
import { setUi, useUi } from '../game/store.ts';
import { HELP } from './help.ts';
import { Modal } from './components.tsx';

export function HelpDialog() {
  const open = useUi((u) => u.help);
  if (open === null) return null;
  return <HelpBody initial={open} />;
}

function HelpBody({ initial }: { initial: string }) {
  const [id, setId] = useState(initial);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return HELP;
    return HELP.filter((a) => {
      const text = `${a.title} ${a.keywords} ${a.body.join(' ')}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [q]);
  const article = HELP.find((a) => a.id === id) ?? HELP[0];
  const close = () => setUi({ help: null });
  return (
    <Modal
      title="Hilfe"
      onClose={close}
      width={880}
      footer={
        <>
          <span className="dim" style={{ fontSize: 12.5, marginRight: 'auto' }}>F1 öffnet die Hilfe zur aktuellen Seite.</span>
          <button className="btn" onClick={() => setUi({ help: null, tutorial: true })}><GraduationCap size={15} />Erste Schritte einblenden</button>
        </>
      }
    >
      <div className="help">
        <aside>
          <div className="help-search">
            <Search size={14} />
            <input className="input" autoFocus placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <nav>
            {list.map((a) => (
              <button key={a.id} className={`help-item ${a.id === article.id ? 'active' : ''}`} onClick={() => setId(a.id)}>{a.title}</button>
            ))}
            {!list.length && <p className="dim" style={{ fontSize: 12.5, padding: '6px 8px' }}>Nichts gefunden.</p>}
          </nav>
        </aside>
        <article>
          <h3>{article.title}</h3>
          {renderBody(article.body)}
        </article>
      </div>
    </Modal>
  );
}

function renderBody(body: string[]) {
  const out: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) out.push(<ul key={`l${out.length}`}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>);
    items = [];
  };
  for (const p of body) {
    if (p.startsWith('• ')) items.push(p.slice(2));
    else {
      flush();
      out.push(<p key={`p${out.length}`}>{p}</p>);
    }
  }
  flush();
  return out;
}
