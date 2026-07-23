import React, { useEffect, useRef, useState } from 'react';

// Sik, logolu, (cok ogede) aranabilir dropdown.
// options: [{ value, label, logo?, hint? }]
export default function FancySelect({ value, options, onChange, placeholder = 'Seçin…', searchable, size = 'md', icon }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const canSearch = searchable ?? options.length > 6;

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => { if (!open) setQ(''); }, [open]);

  const cur = options.find(o => o.value === value) || null;
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div className={`fsel ${size} ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="fsel-btn" onClick={() => setOpen(o => !o)}>
        {icon && <span className="fsel-ico">{icon}</span>}
        {cur?.logo && <img className="fsel-logo" src={cur.logo} alt="" />}
        <span className="fsel-cur">{cur ? cur.label : placeholder}</span>
        <span className="fsel-arrow">▾</span>
      </button>
      {open && (
        <div className="fsel-menu">
          {canSearch && (
            <input className="fsel-search" autoFocus placeholder="Ara…" value={q}
              onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()} />
          )}
          <div className="fsel-list">
            {filtered.length === 0 && <div className="fsel-empty">Sonuç yok</div>}
            {filtered.map(o => (
              <button type="button" key={o.value}
                className={`fsel-opt ${o.value === value ? 'active' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}>
                {o.logo ? <img className="fsel-logo" src={o.logo} alt="" /> : <span className="fsel-dot" />}
                <span className="fsel-opt-label">{o.label}</span>
                {o.hint && <span className="fsel-hint">{o.hint}</span>}
                {o.value === value && <span className="fsel-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
