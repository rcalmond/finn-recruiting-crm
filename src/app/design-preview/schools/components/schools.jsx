// Schools list view — matches V4 Liverpool system

const SL = {
  paper: '#F6F1E8',
  paperDeep: '#EFE8D8',
  paperHover: '#EFE8D8',
  ink: '#0E0E0E',
  inkSoft: '#1F1F1F',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  line2: '#D3CAB3',
  red: '#C8102E',
  redDeep: '#9A0B23',
  redSoft: '#FCE4E8',
  teal: '#00B2A9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
  gold: '#F6EB61',
  goldDeep: '#C8B22E',
  goldSoft: '#FBF3C4',
  goldInk: '#5A4E0F',
};
const SF = `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

// Schools data
const SCHOOLS = [
  { name: 'University of Rochester',  tier: 'A', div: 'D3', stage: 3, signal: { kind: 'awaiting', text: 'Awaiting call' } },
  { name: 'MSOE',                     tier: 'A', div: 'D3', stage: 3, signal: { kind: 'active', text: 'Active' } },
  { name: 'Case Western Reserve',     tier: 'A', div: 'D3', stage: 3, signal: { kind: 'cold', text: 'Going cold · 7d' } },
  { name: 'Lafayette College',        tier: 'A', div: 'D1', stage: 3, signal: null },
  { name: 'Cal Poly SLO',             tier: 'A', div: 'D1', stage: 2, signal: { kind: 'active', text: 'Intro sent' } },
  { name: 'WPI',                      tier: 'A', div: 'D3', stage: 2, signal: null },
  { name: 'RPI',                      tier: 'A', div: 'D3', stage: 2, signal: null },
  { name: 'Rose-Hulman',              tier: 'A', div: 'D3', stage: 2, signal: null },
  { name: 'Harvey Mudd',              tier: 'A', div: 'D3', stage: 1, signal: null },
  { name: 'Colorado School of Mines', tier: 'A', div: 'D2', stage: 1, signal: null },
  { name: 'South Dakota Mines',       tier: 'B', div: 'D2', stage: 3, signal: { kind: 'awaiting', text: 'Awaiting reply · 2d' } },
  { name: 'Bucknell University',      tier: 'B', div: 'D1', stage: 3, signal: null },
  { name: 'Carnegie Mellon',          tier: 'B', div: 'D3', stage: 3, signal: null },
  { name: 'Stevens Institute',        tier: 'B', div: 'D3', stage: 3, signal: { kind: 'awaiting', text: 'Awaiting reply · 5d' } },
  { name: 'Lehigh University',        tier: 'B', div: 'D1', stage: 2, signal: null },
  { name: 'Union College',            tier: 'B', div: 'D3', stage: 2, signal: { kind: 'cold', text: 'Going cold' } },
  { name: 'Trinity College',          tier: 'B', div: 'D3', stage: 2, signal: null },
  { name: 'Swarthmore',               tier: 'B', div: 'D3', stage: 1, signal: null },
  { name: 'Grove City College',       tier: 'B', div: 'D3', stage: 1, signal: null },
  { name: 'Clarkson University',      tier: 'B', div: 'D3', stage: 1, signal: null },
  { name: 'Valparaiso',               tier: 'C', div: 'D1', stage: 2, signal: null },
  { name: 'Oregon Tech',              tier: 'C', div: 'D2', stage: 1, signal: null },
  { name: 'Milwaukee School · Eng.',  tier: 'C', div: 'D3', stage: 1, signal: null },
  { name: 'Widener University',       tier: 'C', div: 'D3', stage: 1, signal: null },
  { name: 'Hope College',             tier: 'C', div: 'D3', stage: 0, signal: null },
  { name: 'Kettering University',     tier: 'C', div: 'D2', stage: 0, signal: null },
  { name: 'Michigan Tech',            tier: 'C', div: 'D2', stage: 0, signal: null },
  { name: 'Montana Tech',             tier: 'C', div: 'D2', stage: 0, signal: null },
  { name: 'NJIT',                     tier: 'C', div: 'D1', stage: 0, signal: null },
  { name: 'Embry-Riddle',             tier: 'C', div: 'D2', stage: 0, signal: null },
  { name: 'Florida Tech',             tier: 'C', div: 'D2', stage: 0, signal: null },
  { name: 'SUNY Poly',                tier: 'C', div: 'D3', stage: 0, signal: null },
];

const STAGES = ['Identify', 'Reach out', 'Engage', 'Visit', 'Offer', 'Decide'];

// ───────── Sidebar ─────────
function SLSidebar() {
  const nav = (label, count, on) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: on ? SL.ink : 'transparent',
      cursor: 'pointer', fontSize: 14,
      color: on ? '#fff' : SL.inkMid,
      fontWeight: on ? 600 : 450, letterSpacing: -0.1,
    }}>
      <span>{label}</span>
      {count !== null && <span style={{
        marginLeft: 'auto',
        padding: '1px 7px', borderRadius: 10,
        background: on ? SL.red : 'transparent',
        color: on ? '#fff' : SL.inkLo,
        fontSize: 11, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}>{count}</span>}
    </div>
  );
  return (
    <aside style={{
      width: 232, background: SL.paper,
      borderRight: `1px solid ${SL.line}`,
      padding: '22px 12px 16px',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '4px 12px 24px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: SL.red, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, letterSpacing: -0.3, fontStyle: 'italic',
        }}>F</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: SL.ink, letterSpacing: -0.4 }}>finnsoccer</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav('Today', 3, false)}
        {nav('Schools', 32, true)}
        {nav('Library', null, false)}
      </div>
      <div style={{
        marginTop: 26, marginBottom: 10, padding: '0 14px',
        fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase',
        color: SL.inkLo, fontWeight: 700,
      }}>Saved views</div>
      {[
        ['Tier A only', 10],
        ['Need follow-up', 4],
        ['D3 Engineering', 14],
      ].map(([l, n]) => (
        <div key={l} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 14px', fontSize: 13, color: SL.inkSoft,
        }}>
          <span style={{ flex: 1 }}>{l}</span>
          <span style={{ fontSize: 11, color: SL.inkLo, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
        </div>
      ))}
      <div style={{ flex: 1 }}/>
      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${SL.line}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: SL.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>FA</div>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: SL.ink }}>Finn Almond</div>
          <div style={{ fontSize: 11, color: SL.inkLo }}>Class of '27 · CB/LB</div>
        </div>
      </div>
    </aside>
  );
}

// ───────── Stage dots ─────────
function StageDots({ stage, size = 8 }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {STAGES.map((_, i) => {
        const filled = i < stage;
        const current = i === stage - 1;
        return (
          <div key={i} style={{
            width: size, height: size, borderRadius: '50%',
            background: filled ? SL.ink : 'transparent',
            border: filled ? 'none' : `1.3px solid ${SL.inkMute}`,
            boxShadow: current ? `0 0 0 2px ${SL.paper}, 0 0 0 3px ${SL.ink}` : 'none',
          }}/>
        );
      })}
    </div>
  );
}

// ───────── Tier badge ─────────
function TierBadge({ tier }) {
  const palette = {
    A: { bg: SL.ink, fg: '#fff' },
    B: { bg: 'transparent', fg: SL.ink, border: SL.ink },
    C: { bg: 'transparent', fg: SL.inkLo, border: SL.line2 },
  }[tier];
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      background: palette.bg,
      color: palette.fg,
      border: palette.border ? `1.3px solid ${palette.border}` : 'none',
      fontSize: 10, fontWeight: 800, letterSpacing: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>{tier}</div>
  );
}

// ───────── Signal pill ─────────
function Signal({ signal, compact }) {
  if (!signal) return <div style={{ fontSize: 12, color: SL.inkMute }}>—</div>;
  const p = {
    awaiting: { bg: SL.tealSoft, fg: SL.tealDeep, dot: SL.teal },
    active:   { bg: SL.tealSoft, fg: SL.tealDeep, dot: SL.teal },
    cold:     { bg: SL.goldSoft, fg: SL.goldInk,  dot: SL.goldDeep },
  }[signal.kind];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: 999, background: p.bg, color: p.fg,
      fontSize: compact ? 11 : 12, fontWeight: 650, letterSpacing: -0.1,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.dot }}/>
      {signal.text}
    </div>
  );
}

// ───────── Desktop row ─────────
function SLRow({ s, even }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr 100px 170px 180px 16px',
      gap: 18, alignItems: 'center',
      padding: '0 20px', height: 40,
      borderBottom: `1px solid ${SL.line}`,
      background: even ? 'transparent' : 'rgba(239,232,216,0.3)',
      cursor: 'pointer', fontFamily: SF,
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = SL.paperDeep}
    onMouseLeave={e => e.currentTarget.style.background = even ? 'transparent' : 'rgba(239,232,216,0.3)'}
    >
      <TierBadge tier={s.tier}/>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0,
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: SL.ink, letterSpacing: -0.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{s.name}</div>
        <div style={{
          fontSize: 11, color: SL.inkLo, fontWeight: 500,
          letterSpacing: 0.2,
        }}>{s.div}</div>
      </div>
      <div style={{
        fontSize: 12, color: SL.inkMid, fontWeight: 500,
      }}>{STAGES[Math.max(0, s.stage - 1)] || 'Identify'}</div>
      <StageDots stage={s.stage}/>
      <div>{s.signal ? <Signal signal={s.signal}/> : null}</div>
      <div style={{ color: SL.inkMute, fontSize: 12, textAlign: 'right' }}>›</div>
    </div>
  );
}

// ───────── Filter chip ─────────
function Chip({ label, active, onClick, color, count }) {
  const c = color || { bg: SL.paperDeep, fg: SL.ink, bgOn: SL.ink, fgOn: '#fff' };
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '6px 12px', borderRadius: 999,
      background: active ? c.bgOn : c.bg,
      color: active ? c.fgOn : c.fg,
      border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 550, letterSpacing: -0.1,
      fontFamily: SF, whiteSpace: 'nowrap',
    }}>
      {label}
      {count != null && <span style={{
        fontSize: 11, opacity: active ? 0.85 : 0.6, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }}>{count}</span>}
    </button>
  );
}

// ───────── Dropdown (visual only) ─────────
function Dropdown({ label, value }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 999,
      background: 'transparent', border: `1px solid ${SL.line2}`,
      color: SL.ink, fontSize: 13, fontWeight: 550,
      cursor: 'pointer', fontFamily: SF, letterSpacing: -0.1,
    }}>
      <span style={{ color: SL.inkLo, fontWeight: 500 }}>{label}:</span>
      <span>{value}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );
}

// ───────── Desktop body ─────────
function SLDesktopBody() {
  const [q, setQ] = React.useState('');
  const [quick, setQuick] = React.useState(null); // 'awaiting' | 'cold' | 'active' | null
  const [tierFilter, setTierFilter] = React.useState(null);

  const filtered = SCHOOLS.filter(s => {
    if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (tierFilter && s.tier !== tierFilter) return false;
    if (quick === 'awaiting' && s.signal?.kind !== 'awaiting') return false;
    if (quick === 'cold' && s.signal?.kind !== 'cold') return false;
    if (quick === 'active' && (!s.signal || (s.signal.kind !== 'active' && s.signal.kind !== 'awaiting'))) return false;
    return true;
  });

  return (
    <>
      {/* Header strip */}
      <div style={{
        padding: '24px 40px 18px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 20,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap',
        }}>
          <h1 style={{
            margin: 0, fontSize: 44, fontWeight: 700,
            letterSpacing: -1.8, color: SL.ink, lineHeight: 1,
            fontStyle: 'italic',
          }}>Schools.</h1>
          <div style={{
            fontSize: 14, color: SL.inkLo, fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}>{filtered.length} of {SCHOOLS.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            padding: '8px 14px', background: 'transparent',
            border: `1px solid ${SL.line2}`, borderRadius: 999,
            fontSize: 13, fontWeight: 600, color: SL.ink,
            cursor: 'pointer', fontFamily: SF, letterSpacing: -0.1,
          }}>Import CSV</button>
          <button style={{
            padding: '8px 16px', background: SL.ink, color: '#fff',
            border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 650,
            cursor: 'pointer', fontFamily: SF, letterSpacing: -0.1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
            Add school
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 40px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10,
          background: '#fff', border: `1px solid ${SL.line2}`,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: SL.inkLo }}>
            <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by school, coach, or location"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: SL.ink, fontFamily: SF, letterSpacing: -0.1,
            }}
          />
          <span style={{
            fontSize: 11, color: SL.inkLo, padding: '2px 6px',
            border: `1px solid ${SL.line2}`, borderRadius: 4,
          }}>⌘K</span>
        </div>
      </div>

      {/* Filter row */}
      <div style={{
        padding: '0 40px 10px',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <Dropdown label="Stage" value="All"/>
        <Dropdown label="Tier" value={tierFilter || 'All'}/>
        <Dropdown label="Division" value="All"/>
        <div style={{ width: 1, height: 20, background: SL.line2, margin: '0 4px' }}/>
        <Chip
          label="Awaiting reply"
          count={SCHOOLS.filter(s => s.signal?.kind === 'awaiting').length}
          active={quick === 'awaiting'}
          onClick={() => setQuick(quick === 'awaiting' ? null : 'awaiting')}
          color={{ bg: SL.tealSoft, fg: SL.tealDeep, bgOn: SL.tealDeep, fgOn: '#fff' }}
        />
        <Chip
          label="Going cold"
          count={SCHOOLS.filter(s => s.signal?.kind === 'cold').length}
          active={quick === 'cold'}
          onClick={() => setQuick(quick === 'cold' ? null : 'cold')}
          color={{ bg: SL.goldSoft, fg: SL.goldInk, bgOn: SL.goldInk, fgOn: '#fff' }}
        />
        <Chip
          label="Active conversations"
          count={SCHOOLS.filter(s => s.signal?.kind === 'active' || s.signal?.kind === 'awaiting').length}
          active={quick === 'active'}
          onClick={() => setQuick(quick === 'active' ? null : 'active')}
          color={{ bg: SL.tealSoft, fg: SL.tealDeep, bgOn: SL.tealDeep, fgOn: '#fff' }}
        />
        {(q || quick || tierFilter) && (
          <button onClick={() => { setQ(''); setQuick(null); setTierFilter(null); }} style={{
            marginLeft: 4, padding: '6px 10px', background: 'transparent',
            border: 'none', color: SL.inkLo, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: SF, letterSpacing: -0.1,
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}>Reset</button>
        )}
      </div>

      {/* Column header + sort */}
      <div style={{
        margin: '14px 40px 0',
        borderTop: `1px solid ${SL.line}`,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 100px 170px 180px 16px',
          gap: 18, alignItems: 'center',
          padding: '10px 20px', height: 36,
          fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase',
          fontWeight: 700, color: SL.inkLo,
          borderBottom: `1px solid ${SL.line}`,
          background: SL.paperDeep,
        }}>
          <div>Tier</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            School
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>Stage</div>
          <div>Progress</div>
          <div>Signal</div>
          <div/>
        </div>

        {filtered.length === 0 ? (
          <div style={{
            padding: '80px 20px', textAlign: 'center', background: SL.paper,
            borderBottom: `1px solid ${SL.line}`,
          }}>
            <div style={{
              fontSize: 24, fontWeight: 700, color: SL.ink,
              letterSpacing: -0.6, marginBottom: 6, fontStyle: 'italic',
            }}>No schools match your filters.</div>
            <div style={{ fontSize: 13, color: SL.inkMid, marginBottom: 18 }}>
              Try loosening tier, clearing search, or removing quick filters.
            </div>
            <button onClick={() => { setQ(''); setQuick(null); setTierFilter(null); }} style={{
              padding: '9px 18px', background: SL.ink, color: '#fff',
              border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 650,
              cursor: 'pointer', fontFamily: SF,
            }}>Reset filters</button>
          </div>
        ) : filtered.map((s, i) => <SLRow key={s.name} s={s} even={i % 2 === 0}/>)}
      </div>

      {/* Footer meta */}
      <div style={{
        padding: '14px 60px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: SL.inkLo, fontWeight: 500,
      }}>
        <div>Sort: <span style={{ color: SL.ink, fontWeight: 650 }}>Tier</span> · then last contact</div>
        <div>{filtered.length} schools shown</div>
      </div>
    </>
  );
}

// ───────── Mobile body ─────────
function SLMobileBody() {
  const [q, setQ] = React.useState('');
  const [quick, setQuick] = React.useState(null);
  const filtered = SCHOOLS.filter(s => {
    if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (quick === 'awaiting' && s.signal?.kind !== 'awaiting') return false;
    if (quick === 'cold' && s.signal?.kind !== 'cold') return false;
    if (quick === 'active' && (!s.signal || (s.signal.kind !== 'active' && s.signal.kind !== 'awaiting'))) return false;
    return true;
  });

  return (
    <>
      <div style={{ padding: '8px 16px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase',
            fontWeight: 700, color: SL.inkLo,
          }}>Pipeline</div>
          <button style={{
            padding: '6px 12px', background: SL.ink, color: '#fff',
            border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 650,
            cursor: 'pointer', fontFamily: SF,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
            Add
          </button>
        </div>
        <h1 style={{
          margin: 0, fontSize: 34, fontWeight: 700, color: SL.ink,
          letterSpacing: -1.4, lineHeight: 1, fontStyle: 'italic',
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        }}>
          Schools.
          <span style={{
            fontSize: 13, fontWeight: 650, color: SL.inkLo, letterSpacing: 0,
            fontStyle: 'normal', fontVariantNumeric: 'tabular-nums',
          }}>{filtered.length} of {SCHOOLS.length}</span>
        </h1>
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10,
          background: '#fff', border: `1px solid ${SL.line2}`,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: SL.inkLo }}>
            <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search schools, coaches"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: SL.ink, fontFamily: SF,
            }}
          />
        </div>
      </div>

      {/* Filter chips row - horizontal scroll */}
      <div style={{
        padding: '0 16px 10px', display: 'flex', gap: 6,
        overflowX: 'auto', whiteSpace: 'nowrap',
      }}>
        <Chip label="Stage" active={false}/>
        <Chip label="Tier" active={false}/>
        <Chip label="Division" active={false}/>
        <Chip
          label="Awaiting"
          count={SCHOOLS.filter(s => s.signal?.kind === 'awaiting').length}
          active={quick === 'awaiting'}
          onClick={() => setQuick(quick === 'awaiting' ? null : 'awaiting')}
          color={{ bg: SL.tealSoft, fg: SL.tealDeep, bgOn: SL.tealDeep, fgOn: '#fff' }}
        />
        <Chip
          label="Cold"
          count={SCHOOLS.filter(s => s.signal?.kind === 'cold').length}
          active={quick === 'cold'}
          onClick={() => setQuick(quick === 'cold' ? null : 'cold')}
          color={{ bg: SL.goldSoft, fg: SL.goldInk, bgOn: SL.goldInk, fgOn: '#fff' }}
        />
      </div>

      <div style={{
        padding: '8px 16px 4px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
        fontWeight: 700, color: SL.inkLo,
        borderBottom: `1px solid ${SL.line}`,
      }}>
        <span>By tier</span>
        <span>Sort: Tier ↓</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: SL.ink, fontStyle: 'italic', marginBottom: 6 }}>
            No matches.
          </div>
          <div style={{ fontSize: 13, color: SL.inkMid, marginBottom: 16 }}>
            Try clearing filters or search.
          </div>
          <button onClick={() => { setQ(''); setQuick(null); }} style={{
            padding: '9px 18px', background: SL.ink, color: '#fff',
            border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 650,
            cursor: 'pointer', fontFamily: SF,
          }}>Reset filters</button>
        </div>
      ) : filtered.map((s) => (
        <div key={s.name} style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${SL.line}`,
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
        }}>
          <TierBadge tier={s.tier}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 650, color: SL.ink, letterSpacing: -0.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: 5,
            }}>{s.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StageDots stage={s.stage} size={6}/>
              {s.signal && <Signal signal={s.signal} compact/>}
            </div>
          </div>
          <div style={{ color: SL.inkMute, fontSize: 14 }}>›</div>
        </div>
      ))}
    </>
  );
}

// ───────── Frames ─────────
function SLDesktopFrame({ label }) {
  return (
    <div data-screen-label={label} style={{
      width: 1440, height: 960,
      display: 'flex', background: SL.paper, color: SL.ink,
      fontFamily: SF, overflow: 'hidden', borderRadius: 10,
    }}>
      <SLSidebar/>
      <main className="frame-scroll" style={{ flex: 1, overflow: 'auto', background: SL.paper }}>
        <SLDesktopBody/>
      </main>
    </div>
  );
}

function SLMobileFrame({ label }) {
  return (
    <div data-screen-label={label} style={{
      width: 390, height: 844,
      borderRadius: 48, padding: 10,
      background: '#0a0a0a',
      boxShadow: '0 0 0 2px #222, 0 30px 80px -30px rgba(0,0,0,0.5)',
      fontFamily: SF,
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 38,
        overflow: 'hidden', background: SL.paper, color: SL.ink,
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          width: 110, height: 30, background: '#0a0a0a', borderRadius: 20, zIndex: 3,
        }}/>
        <div style={{
          height: 44, padding: '0 22px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 600, color: SL.ink,
        }}>
          <span>9:41</span>
          <div style={{ width: 40 }}/>
        </div>
        <div className="frame-scroll" style={{ flex: 1, overflow: 'auto' }}>
          <SLMobileBody/>
        </div>
        <div style={{
          borderTop: `1px solid ${SL.line}`,
          padding: '10px 24px 26px', background: SL.paper,
          display: 'flex', justifyContent: 'space-around',
        }}>
          {[['Today', false], ['Schools', true], ['Library', false]].map(([l, on]) => (
            <div key={l} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: on ? SL.ink : SL.inkLo,
              fontSize: 11, fontWeight: on ? 700 : 500, position: 'relative',
              fontStyle: on ? 'italic' : 'normal',
            }}>
              {on && <div style={{
                position: 'absolute', top: -10, width: 24, height: 3,
                background: SL.red, borderRadius: 2,
              }}/>}
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SLDesktopFrame, SLMobileFrame, SL });
