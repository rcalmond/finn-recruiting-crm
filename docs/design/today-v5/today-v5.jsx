/* eslint-disable */
// Today v5 — production-aligned. Three tactical priority cards (rank 1/2/3),
// strategic prompts, recently handled, and a Pipeline Activity right rail.
// Spiritual reference: V4 Liverpool. Structural reference: production code.

const LV5 = {
  paper:    '#F6F1E8',
  paperDeep:'#EFE8D8',
  paperWarm:'#F0E8D2',
  ink:      '#0E0E0E',
  inkSoft:  '#1F1F1F',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  line2:    '#D3CAB3',

  red:       '#C8102E',
  redDeep:   '#9A0B23',
  redInk:    '#FFE4E8',
  redChrome: '#FF5468',

  teal:     '#00B2A9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
  tealInk:  '#E6F7F5',

  gold:     '#F6EB61',
  goldDeep: '#C8B22E',
  goldSoft: '#FDF6E3',
  goldInk:  '#5A4E0F',
  goldText: '#8A6F0E',
};
const LV5F = `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

// ─────────────────────────────────────────────────────────────────────
// Sidebar — current 5-item nav (Today · Schools · Campaigns · Library ·
// Tools). Production-accurate.
// ─────────────────────────────────────────────────────────────────────
function V5Sidebar({ on = 'Today' }) {
  const NavRow = ({ label, count, active, sub, indent }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: sub ? '8px 14px' : '10px 14px',
      paddingLeft: indent ? 26 : 14,
      borderRadius: 8,
      background: active ? LV5.ink : 'transparent',
      cursor: 'pointer',
      fontSize: sub ? 13 : 14,
      color: active ? '#fff' : LV5.inkMid,
      fontWeight: active ? 600 : 450,
      letterSpacing: -0.1,
    }}>
      <span>{label}</span>
      {count != null && (
        <span style={{
          marginLeft: 'auto',
          padding: '1px 7px', borderRadius: 10,
          background: active ? LV5.red : 'transparent',
          color: active ? '#fff' : LV5.inkLo,
          fontSize: 11, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      )}
    </div>
  );

  return (
    <aside style={{
      width: 232, background: LV5.paper,
      borderRight: `1px solid ${LV5.line}`,
      padding: '22px 12px 16px',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '4px 12px 24px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: LV5.red, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, fontStyle: 'italic',
        }}>F</div>
        <div style={{
          fontSize: 15, fontWeight: 700, color: LV5.ink, letterSpacing: -0.4,
        }}>finnsoccer</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavRow label="Today"     active={on === 'Today'} />
        <NavRow label="Schools"   active={on === 'Schools'} />
        <NavRow label="Campaigns" active={on === 'Campaigns'} />
        <NavRow label="Library"   active={on === 'Library'} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 8,
          color: LV5.inkMid, fontSize: 14, fontWeight: 450,
          letterSpacing: -0.1, cursor: 'pointer',
        }}>
          <span>Tools</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ marginLeft: 2, transform: 'rotate(180deg)' }}>
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{
            marginLeft: 'auto',
            padding: '1px 7px', borderRadius: 10,
            color: LV5.inkLo, fontSize: 11, fontWeight: 700,
          }}>3</span>
        </div>
        <NavRow sub indent label="Coach Changes" count={1} />
        <NavRow sub indent label="Parse Review"  count={2} />
        <NavRow sub indent label="Classification Review" />
        <NavRow sub indent label="Gmail Settings" />
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        padding: '12px 14px',
        borderTop: `1px solid ${LV5.line}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: LV5.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>FA</div>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: LV5.ink }}>Finn Almond</div>
          <div style={{ fontSize: 11, color: LV5.inkLo }}>Class of '27 · LWB</div>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Masthead — split metric line: overdue · active · this week
// ─────────────────────────────────────────────────────────────────────
function V5Masthead({ overdue, active, week, day, date }) {
  return (
    <div style={{
      padding: '24px clamp(28px, 4vw, 56px) 8px',
    }}>
      <h1 style={{
        margin: 0,
        fontSize: 'clamp(56px, 7vw, 88px)',
        fontWeight: 700, letterSpacing: '-0.04em',
        color: LV5.ink, lineHeight: 0.95,
        fontStyle: 'italic',
      }}>Today.</h1>

      <div style={{
        marginTop: 10,
        display: 'flex', alignItems: 'baseline',
        gap: 14, flexWrap: 'wrap',
        fontSize: 14, fontWeight: 600,
        color: LV5.inkMid, letterSpacing: -0.1,
      }}>
        {overdue > 0 && (
          <>
            <span style={{ color: LV5.red, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{overdue}</span> overdue
            </span>
            <span style={{ color: LV5.inkMute }}>·</span>
          </>
        )}
        <span style={{ whiteSpace: 'nowrap' }}>
          <span style={{ color: LV5.tealDeep, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{active}</span>{' '}
          <span style={{ color: LV5.inkLo, fontWeight: 500 }}>active</span>
        </span>
        <span style={{ color: LV5.inkMute }}>·</span>
        <span style={{ whiteSpace: 'nowrap' }}>
          <span style={{ color: LV5.goldText, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{week}</span>{' '}
          <span style={{ color: LV5.inkLo, fontWeight: 500 }}>this week</span>
        </span>
      </div>

      <div style={{
        marginTop: 10, fontSize: 11, letterSpacing: '0.18em',
        textTransform: 'uppercase', fontWeight: 800, color: LV5.inkLo,
      }}>{day}, {date}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section header — borrowed directly from production
// ─────────────────────────────────────────────────────────────────────
function V5SectionHeader({ kicker, title, subtle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 14,
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: subtle ? LV5.inkMute : LV5.inkLo,
        padding: '4px 0',
        borderTop: `2px solid ${subtle ? LV5.inkMute : LV5.inkLo}`,
      }}>{kicker}</div>
      <div style={{
        fontSize: subtle ? 18 : 24, fontWeight: 700,
        letterSpacing: '-0.03em',
        color: subtle ? LV5.inkLo : LV5.ink,
        fontStyle: 'italic',
      }}>{title}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tier badge
// ─────────────────────────────────────────────────────────────────────
function V5TierBadge({ tier, onAccent }) {
  const tones = {
    A: onAccent
      ? { bg: 'rgba(255,255,255,0.18)', color: '#fff' }
      : { bg: '#FEE2E2', color: '#991B1B' },
    B: onAccent
      ? { bg: 'rgba(255,255,255,0.18)', color: '#fff' }
      : { bg: '#DBEAFE', color: '#1E40AF' },
    C: onAccent
      ? { bg: 'rgba(255,255,255,0.18)', color: '#fff' }
      : { bg: '#F3F4F6', color: '#374151' },
  };
  const t = tones[tier] ?? tones.C;
  return (
    <span style={{
      background: t.bg, color: t.color,
      fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
      padding: '2px 7px', borderRadius: 4,
      lineHeight: 1.4,
    }}>{tier}</span>
  );
}

function V5ChannelPill({ channel, onAccent }) {
  const tones = onAccent
    ? { bg: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.92)' }
    : channel === 'Email'
      ? { bg: LV5.tealSoft, color: LV5.tealDeep }
      : { bg: LV5.paperDeep, color: LV5.inkMid };
  return (
    <span style={{
      background: tones.bg, color: tones.color,
      fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
      padding: '3px 8px', borderRadius: 999,
      textTransform: 'uppercase',
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
    }}>{channel}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tactical card — UNIFIED red treatment. All three priorities are
// "things Finn should do today" — same color family, hierarchy comes
// from size + numeral, not from urgency-type colors.
//   #1 hero  : full red fill
//   #2, #3   : paper card, red rail + red rank numeral
// ─────────────────────────────────────────────────────────────────────
function V5TacticalCard({ item, rank, hero }) {
  const onAccent = hero;

  // Hero sizing — dialed down. Hero title only modestly larger than compacts.
  const titleSize = hero ? 'clamp(26px, 2.4vw, 32px)' : 'clamp(20px, 1.9vw, 26px)';
  const padV      = hero ? 26 : 22;
  const padH      = hero ? 30 : 26;

  const softInk   = onAccent ? LV5.redInk : LV5.inkLo;
  const midInk    = onAccent ? 'rgba(255,255,255,0.86)' : LV5.inkMid;
  const titleInk  = onAccent ? '#fff' : LV5.ink;

  // Italic numeral — watermark on hero, left rail on compact.
  const Numeral = (
    <div style={{
      fontStyle: 'italic', fontWeight: 800,
      letterSpacing: '-0.06em', lineHeight: 0.85,
      fontVariantNumeric: 'lining-nums',
      color: LV5.red,
      flexShrink: 0,
      fontSize: 64,
      width:    56,
      textAlign: 'center',
      paddingTop: 2,
      opacity: 0.85,
    }}>{rank}</div>
  );

  const RankLabel = (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 0.24,
      textTransform: 'uppercase',
      color: softInk,
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      marginBottom: hero ? 6 : 10,
    }}>
      {hero && <span style={{ opacity: 0.85 }}>Priority</span>}
      <span style={{ fontStyle: 'italic', fontSize: hero ? 12 : 11 }}>№ {rank}</span>
      <span style={{ opacity: 0.55 }}>·</span>
      <span style={{ fontWeight: 700, color: softInk }}>{item.context}</span>
    </div>
  );

  const TopMeta = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      fontSize: 12, color: midInk,
    }}>
      <span style={{
        fontWeight: 700, color: titleInk, letterSpacing: '-0.01em',
      }}>{item.school}</span>
      <V5TierBadge tier={item.tier} onAccent={onAccent} />
      {item.coach && (
        <>
          <span style={{ opacity: 0.55 }}>·</span>
          <span>{item.coach}</span>
        </>
      )}
    </div>
  );

  const Hero = (
    <div style={{
      fontSize: titleSize, fontWeight: 700,
      letterSpacing: '-0.03em', lineHeight: 1.05,
      fontStyle: 'italic',
      color: titleInk,
      marginTop: hero ? 12 : 8,
      marginBottom: hero ? 12 : 10,
      textWrap: 'balance',
    }}>{item.heroText}</div>
  );

  const Preview = item.preview && (
    <div style={{
      fontSize: hero ? 14 : 13,
      lineHeight: 1.55,
      color: midInk,
      marginBottom: hero ? 22 : 14,
      maxWidth: hero ? 640 : 540,
      display: '-webkit-box',
      WebkitLineClamp: hero ? 2 : 1,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    }}>
      {item.preview}
    </div>
  );

  const PrimaryBtn = (
    <button style={{
      padding: hero ? '9px 18px' : '8px 16px',
      background: onAccent ? '#fff' : LV5.red,
      color:      onAccent ? LV5.red : '#fff',
      border: 'none', borderRadius: 999,
      fontSize: 12, fontWeight: 800, letterSpacing: -0.1,
      cursor: 'pointer', fontFamily: 'inherit',
      display: 'inline-flex', alignItems: 'center', gap: 8,
    }}>
      {item.cta}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.6"
          strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );

  const SecondaryBtn = (label) => (
    <button key={label} style={{
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: 0, fontFamily: 'inherit', letterSpacing: -0.1,
      fontSize: hero ? 12 : 11, fontWeight: 700,
      color: softInk,
    }}>{label}</button>
  );

  // Hero: red fill + watermark numeral. Compact: paper card with red numeral rail.
  if (hero) {
    return (
      <div style={{
        position: 'relative',
        background: LV5.red,
        borderRadius: 16,
        padding: `${padV}px ${padH}px`,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: 28, top: 8,
          fontSize: 180, fontWeight: 800, fontStyle: 'italic',
          letterSpacing: '-0.06em', lineHeight: 1,
          color: 'rgba(255,255,255,0.10)',
          pointerEvents: 'none', userSelect: 'none',
        }}>{rank}</div>

        <div style={{ position: 'relative', zIndex: 1, paddingRight: 80 }}>
          {RankLabel}
          {TopMeta}
          {Hero}
          {Preview}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18,
            flexWrap: 'wrap',
          }}>
            {PrimaryBtn}
            <span style={{
              display: 'inline-block', width: 1, height: 14,
              background: 'rgba(255,255,255,0.25)',
            }} />
            {SecondaryBtn('Done')}
            {SecondaryBtn('Snooze 7d')}
          </div>
        </div>
      </div>
    );
  }

  // Compact: paper card, italic red numeral as a left rail.
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${LV5.line}`,
      borderRadius: 16,
      padding: `${padV}px ${padH}px`,
      display: 'flex', gap: 22, alignItems: 'flex-start',
    }}>
      {Numeral}
      <div style={{ flex: 1, minWidth: 0 }}>
        {RankLabel}
        {TopMeta}
        {Hero}
        {Preview}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          flexWrap: 'wrap',
        }}>
          {PrimaryBtn}
          <span style={{
            display: 'inline-block', width: 1, height: 14,
            background: LV5.line2,
          }} />
          {SecondaryBtn('Done')}
          {SecondaryBtn('Snooze 7d')}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Caught-up tactical empty state
// ─────────────────────────────────────────────────────────────────────
function V5CaughtUp() {
  return (
    <div style={{
      background: LV5.ink, color: '#fff',
      borderRadius: 16, padding: '40px 32px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -20, bottom: -50,
        fontSize: 280, fontWeight: 800, fontStyle: 'italic',
        letterSpacing: '-0.06em', lineHeight: 1,
        color: 'rgba(255,255,255,0.06)',
        pointerEvents: 'none',
      }}>0</div>
      <div style={{ position: 'relative' }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 0.24,
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
        }}>Priority</div>
        <div style={{
          fontSize: 'clamp(40px, 4.4vw, 56px)', fontWeight: 700,
          fontStyle: 'italic', letterSpacing: '-0.035em',
          color: '#fff', lineHeight: 0.98, marginTop: 12, marginBottom: 12,
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        }}>
          Caught up.
          <span style={{
            fontSize: 14, fontStyle: 'normal', fontWeight: 700,
            color: LV5.red, letterSpacing: 0,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6.25" stroke={LV5.red} strokeWidth="1.6"/>
              <path d="M4 7.4L6.2 9.4L10 5.2" stroke={LV5.red}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            All clear
          </span>
        </div>
        <div style={{
          fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55,
          maxWidth: 520, marginBottom: 22,
        }}>
          Nothing pressing right now. Strategic prompts and pipeline
          activity are still worth a look below.
        </div>
        <button style={{
          padding: '10px 20px', background: '#fff', color: LV5.ink,
          border: 'none', borderRadius: 999,
          fontSize: 12, fontWeight: 800, cursor: 'pointer',
          fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          Scan pipeline
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Strategic prompt — quieter V4 DNA. Italic question, paper card, single
// red accent on CTA.
// ─────────────────────────────────────────────────────────────────────
function V5StrategicCard({ prompt }) {
  return (
    <div style={{
      background: LV5.tealDeep,
      borderRadius: 14,
      padding: '22px 24px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative', overflow: 'hidden',
      color: '#fff',
    }}>
      <div style={{
        position: 'absolute', top: 18, right: 20,
        fontSize: 10, fontWeight: 800, letterSpacing: 0.32,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.65)',
      }}>{prompt.tag}</div>

      <div style={{
        fontSize: 'clamp(19px, 1.5vw, 22px)', fontWeight: 700,
        fontStyle: 'italic', letterSpacing: '-0.025em',
        lineHeight: 1.15, color: '#fff', paddingRight: 80,
        textWrap: 'balance',
      }}>{prompt.question}</div>

      <div style={{
        fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55,
        marginBottom: 4,
      }}>{prompt.summary}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 2 }}>
        <button style={{
          padding: '8px 18px', background: '#fff', color: LV5.tealDeep,
          border: 'none', borderRadius: 999,
          fontSize: 12, fontWeight: 800, letterSpacing: -0.1,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          {prompt.action}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 700,
          color: 'rgba(255,255,255,0.65)',
          fontFamily: 'inherit', padding: 0, letterSpacing: -0.1,
        }}>Skip this week</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Handled — restrained, low-opacity (per brief: keep current treatment)
// ─────────────────────────────────────────────────────────────────────
function V5HandledRow({ item }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', borderRadius: 10,
      background: LV5.paper, border: `1px solid ${LV5.line}`,
      opacity: 0.62,
    }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.25" stroke={LV5.tealDeep} strokeWidth="1.4"/>
        <path d="M4 7.4L6.2 9.4L10 5.4" stroke={LV5.tealDeep}
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
        <span style={{ fontWeight: 650, color: LV5.ink }}>{item.school}</span>
        {item.coach && (<>
          <span style={{ color: LV5.inkLo }}> · {item.coach}</span>
        </>)}
        <span style={{ color: LV5.inkMute }}> · {item.what}</span>
      </div>
      <span style={{
        fontSize: 11, color: LV5.inkMute, fontWeight: 600,
      }}>{item.when}</span>
      <button style={{
        padding: '4px 10px', borderRadius: 6,
        border: `1px solid ${LV5.line}`, background: '#fff',
        fontSize: 11, fontWeight: 700, cursor: 'pointer',
        fontFamily: 'inherit', color: LV5.tealDeep,
      }}>Undo</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pipeline Activity rail — HOT → ACTIVE → WARMING → COLD
// ─────────────────────────────────────────────────────────────────────
const STATUS_TONE = {
  HOT:     { color: LV5.red,      dot: LV5.red,      label: LV5.red },
  ACTIVE:  { color: LV5.tealDeep, dot: LV5.teal,     label: LV5.tealDeep },
  WARMING: { color: LV5.goldText, dot: LV5.goldDeep, label: LV5.goldText },
  COLD:    { color: LV5.inkMute,  dot: LV5.inkMute,  label: LV5.inkMute },
};

function V5PipelineRow({ row, divider }) {
  const tone = STATUS_TONE[row.status];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 4px',
      cursor: 'pointer',
      borderTop: divider ? `1px solid ${LV5.line}` : 'none',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: 99,
        background: tone.dot, flexShrink: 0,
      }} />
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          fontSize: 13.5, fontWeight: 650, color: LV5.ink,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{row.school}</span>
        <V5TierBadge tier={row.tier} />
      </div>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
        color: tone.label,
      }}>{row.status}</span>
    </div>
  );
}

function V5PipelineRail({ rows, mobile }) {
  // Group with section breaks
  const groupOrder = ['HOT', 'ACTIVE', 'WARMING', 'COLD'];
  const grouped = groupOrder
    .map(s => ({ status: s, items: rows.filter(r => r.status === s) }))
    .filter(g => g.items.length > 0);

  return (
    <aside style={{
      width: mobile ? '100%' : 320,
      flexShrink: 0,
      padding: mobile
        ? 'clamp(28px, 5vw, 36px) clamp(20px, 5vw, 28px) 24px'
        : '24px 28px 24px 8px',
      borderLeft: mobile ? 'none' : `1px solid ${LV5.line}`,
      background: mobile ? LV5.paperDeep : 'transparent',
      borderTop: mobile ? `1px solid ${LV5.line}` : 'none',
    }}>
      <V5SectionHeader kicker="Pipeline" title="Activity." />

      <div style={{
        background: '#fff',
        border: `1px solid ${LV5.line}`,
        borderRadius: 14,
        padding: '6px 16px',
      }}>
        {grouped.map((g, gi) => (
          <div key={g.status}>
            {gi > 0 && (
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 0.18,
                color: STATUS_TONE[g.status].label,
                textTransform: 'uppercase',
                padding: '14px 0 4px',
                borderTop: `1px solid ${LV5.line}`,
                marginTop: 4,
              }}>{g.status}</div>
            )}
            {gi === 0 && (
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 0.18,
                color: STATUS_TONE[g.status].label,
                textTransform: 'uppercase',
                padding: '12px 0 4px',
              }}>{g.status}</div>
            )}
            {g.items.map((row, ri) => (
              <V5PipelineRow key={row.school} row={row} divider={ri > 0} />
            ))}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 14, fontSize: 11, color: LV5.inkMute,
        textAlign: 'center', letterSpacing: 0.1,
      }}>
        Tier A · B only — view all in <span style={{
          color: LV5.tealDeep, fontWeight: 700, cursor: 'pointer',
        }}>Schools →</span>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sample data (matches scoring shape from production)
// ─────────────────────────────────────────────────────────────────────
const TACTICAL_DEFAULT = [
  {
    type: 'inbound_awaiting',
    urgency: 'red',           // Tier A inbound awaiting → red
    school: 'Brown',
    tier: 'A',
    coach: 'Brandon Bowman',
    channel: 'Email',
    context: '4d waiting',
    heroText: 'Reply to Brandon Bowman.',
    preview: '"Loved the new highlight reel. Want to set up a 15-min call before showcase weekend? I have Thursday at 3 or Friday morning open."',
    cta: 'Draft reply',
  },
  {
    type: 'inbound_awaiting',
    urgency: 'teal',
    school: 'Penn',
    tier: 'A',
    coach: 'Marc Lewis',
    channel: 'Sports Recruits',
    context: '2d waiting',
    heroText: 'Reply to Marc Lewis.',
    preview: 'Asked for an updated transcript and the link to your fall ECNL schedule — wants to come watch in person.',
    cta: 'Draft reply',
  },
  {
    type: 'going_cold',
    urgency: 'gold',
    school: 'Dartmouth',
    tier: 'B',
    coach: 'Bobby Clark',
    channel: 'Email',
    context: '11d silent',
    heroText: 'Re-engage Bobby Clark.',
    preview: 'Last touch was your intro note on April 19 — no reply. Tier B school, worth one more nudge before letting it sit.',
    cta: 'Open school',
  },
];

const TACTICAL_CAUGHTUP = []; // empty array → caught-up state

const STRATEGIC = [
  {
    tag: 'Coverage',
    question: 'Have you sent the new reel to your Tier A list?',
    summary: '4 of 9 Tier A coaches haven\'t seen "April 2026 — ECNL Showcase." Send in one batch.',
    action: 'Send batch reel',
  },
  {
    tag: 'Roster gap',
    question: 'Add 2–3 more Patriot League schools to balance the list?',
    summary: 'Tier A is 70% Ivies. Lehigh, Lafayette, Holy Cross have rosters that fit.',
    action: 'Browse schools',
  },
  {
    tag: 'Rhythm',
    question: 'Three Tier A schools haven\'t heard from you in 3+ weeks.',
    summary: 'Princeton, Yale, Cornell — none cold yet, but the rhythm is slipping.',
    action: 'Open list',
  },
];

const HANDLED = [
  { school: 'Princeton', coach: 'Jim Barlow', what: 'replied to fit question', when: '8:42a' },
  { school: 'Cornell',   coach: 'Jaro Zawislan', what: 'sent reel', when: 'Yesterday' },
  { school: 'Lehigh',    coach: 'Devon Kerr', what: 'logged call notes', when: 'Yesterday' },
];

const PIPELINE = [
  { school: 'Brown',      tier: 'A', status: 'HOT',     detail: 'inbound 4d ago · awaiting reply' },
  { school: 'Penn',       tier: 'A', status: 'HOT',     detail: 'inbound 2d ago · awaiting reply' },
  { school: 'Yale',       tier: 'A', status: 'HOT',     detail: 'inbound 6d ago' },
  { school: 'Princeton',  tier: 'A', status: 'ACTIVE',  detail: 'reply sent today' },
  { school: 'Cornell',    tier: 'A', status: 'ACTIVE',  detail: 'reel sent yesterday' },
  { school: 'Harvard',    tier: 'A', status: 'ACTIVE',  detail: 'outbound 4d ago' },
  { school: 'Lehigh',     tier: 'B', status: 'ACTIVE',  detail: 'call logged yesterday' },
  { school: 'Dartmouth',  tier: 'B', status: 'WARMING', detail: 'no contact 11d' },
  { school: 'Columbia',   tier: 'A', status: 'WARMING', detail: 'no contact 18d' },
  { school: 'Lafayette',  tier: 'B', status: 'WARMING', detail: 'no contact 22d' },
  { school: 'Holy Cross', tier: 'B', status: 'COLD',    detail: 'no contact 34d' },
  { school: 'Bucknell',   tier: 'B', status: 'COLD',    detail: 'no contact 41d' },
];

const PIPELINE_CAUGHTUP = [
  { school: 'Princeton', tier: 'A', status: 'ACTIVE',  detail: 'reply sent 1h ago' },
  { school: 'Brown',     tier: 'A', status: 'ACTIVE',  detail: 'replied today · 8:42a' },
  { school: 'Penn',      tier: 'A', status: 'ACTIVE',  detail: 'reply sent today' },
  { school: 'Cornell',   tier: 'A', status: 'ACTIVE',  detail: 'reel sent yesterday' },
  { school: 'Harvard',   tier: 'A', status: 'ACTIVE',  detail: 'outbound 4d ago' },
  { school: 'Lehigh',    tier: 'B', status: 'ACTIVE',  detail: 'call logged yesterday' },
  { school: 'Dartmouth', tier: 'B', status: 'WARMING', detail: 'no contact 11d' },
  { school: 'Yale',      tier: 'A', status: 'WARMING', detail: 'no contact 16d' },
  { school: 'Columbia',  tier: 'A', status: 'WARMING', detail: 'no contact 18d' },
  { school: 'Lafayette', tier: 'B', status: 'WARMING', detail: 'no contact 22d' },
  { school: 'Holy Cross',tier: 'B', status: 'COLD',    detail: 'no contact 34d' },
];

// ─────────────────────────────────────────────────────────────────────
// Body composer (desktop)
// ─────────────────────────────────────────────────────────────────────
function V5TodayDesktop({ caughtUp }) {
  const tactical = caughtUp ? TACTICAL_CAUGHTUP : TACTICAL_DEFAULT;
  const handled  = caughtUp ? HANDLED : HANDLED.slice(0, 2);
  const pipeline = caughtUp ? PIPELINE_CAUGHTUP : PIPELINE;
  const overdue  = caughtUp ? 0 : 1;
  const active   = caughtUp ? 0 : 2;
  const week     = caughtUp ? 5 : 5;

  return (
    <div style={{
      display: 'flex', minHeight: '100%',
      background: LV5.paper, fontFamily: LV5F,
      color: LV5.ink,
    }}>
      <V5Sidebar />

      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <main style={{
          flex: 1, minWidth: 0,
          padding: '0 0 60px',
        }}>
          <V5Masthead overdue={overdue} active={active} week={week}
            day="Friday" date="May 1" />

          {/* Tactical */}
          <section style={{
            margin: 'clamp(24px, 3vw, 36px) clamp(28px, 4vw, 56px) 0',
          }}>
            <V5SectionHeader kicker="Today" title={tactical.length ? `Your top ${tactical.length}.` : 'Your top 3.'} />

            {tactical.length === 0 ? (
              <V5CaughtUp />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tactical.map((item, i) => (
                  <V5TacticalCard key={i} item={item} rank={i + 1} hero={i === 0} />
                ))}
              </div>
            )}
          </section>

          {/* Strategic */}
          <section style={{
            margin: 'clamp(36px, 4vw, 52px) clamp(28px, 4vw, 56px) 0',
          }}>
            <V5SectionHeader subtle kicker="Think" title="This week." />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 14,
            }}>
              {STRATEGIC.map((p, i) => (
                <V5StrategicCard key={i} prompt={p} />
              ))}
            </div>
          </section>

          {/* Handled */}
          <section style={{
            margin: 'clamp(28px, 3vw, 40px) clamp(28px, 4vw, 56px) 0',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.24,
              textTransform: 'uppercase', color: LV5.inkMute,
              marginBottom: 12,
            }}>Recently handled</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {handled.map((item, i) => (
                <V5HandledRow key={i} item={item} />
              ))}
            </div>
          </section>
        </main>

        <V5PipelineRail rows={pipeline} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Mobile composer
// ─────────────────────────────────────────────────────────────────────
function V5TodayMobile({ caughtUp }) {
  const tactical = caughtUp ? TACTICAL_CAUGHTUP : TACTICAL_DEFAULT;
  const handled  = caughtUp ? HANDLED : HANDLED.slice(0, 2);
  const pipeline = caughtUp ? PIPELINE_CAUGHTUP.slice(0, 7) : PIPELINE.slice(0, 7);
  const overdue  = caughtUp ? 0 : 1;
  const active   = caughtUp ? 0 : 2;
  const week     = caughtUp ? 5 : 5;

  return (
    <div style={{
      background: LV5.paper, minHeight: '100%',
      fontFamily: LV5F, color: LV5.ink, paddingBottom: 80,
    }}>
      <V5Masthead overdue={overdue} active={active} week={week}
        day="Friday" date="May 1" />

      {/* Tactical */}
      <section style={{ margin: '24px 20px 0' }}>
        <V5SectionHeader kicker="Today" title={tactical.length ? `Your top ${tactical.length}.` : 'Your top 3.'} />
        {tactical.length === 0 ? (
          <V5CaughtUp />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tactical.map((item, i) => (
              <V5TacticalCard key={i} item={item} rank={i + 1} hero={i === 0} />
            ))}
          </div>
        )}
      </section>

      {/* Strategic */}
      <section style={{ margin: '36px 20px 0' }}>
        <V5SectionHeader subtle kicker="Think" title="This week." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STRATEGIC.map((p, i) => (
            <V5StrategicCard key={i} prompt={p} />
          ))}
        </div>
      </section>

      {/* Handled */}
      <section style={{ margin: '28px 20px 0' }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 0.24,
          textTransform: 'uppercase', color: LV5.inkMute,
          marginBottom: 10,
        }}>Recently handled</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {handled.map((item, i) => (
            <V5HandledRow key={i} item={item} />
          ))}
        </div>
      </section>

      {/* Pipeline rail (full width, bottom on mobile) */}
      <div style={{ marginTop: 32 }}>
        <V5PipelineRail rows={pipeline} mobile />
      </div>

      {/* Bottom nav */}
      <V5MobileNav />
    </div>
  );
}

function V5MobileNav() {
  const Item = ({ label, on }) => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      color: on ? LV5.ink : LV5.inkLo,
      fontSize: 11, fontWeight: on ? 700 : 500,
      fontStyle: on ? 'italic' : 'normal',
      position: 'relative',
    }}>
      {on && (
        <div style={{
          position: 'absolute', top: -10, width: 22, height: 3,
          background: LV5.red, borderRadius: 2,
        }} />
      )}
      {label}
    </div>
  );
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: LV5.paper, borderTop: `1px solid ${LV5.line}`,
      padding: '10px 20px 22px',
      display: 'flex', justifyContent: 'space-around',
      zIndex: 40,
    }}>
      <Item label="Today" on />
      <Item label="Schools" />
      <Item label="Campaigns" />
      <Item label="Library" />
      <Item label="Tools" />
    </nav>
  );
}

// Export to window
window.V5TodayDesktop = V5TodayDesktop;
window.V5TodayMobile  = V5TodayMobile;
