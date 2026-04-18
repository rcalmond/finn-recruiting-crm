// School detail view — Rochester
// Matches V4 Liverpool: warm paper, italic display, red/teal/gold semantic
import { useState, useEffect } from 'react';

const SD = {
  paper: '#F6F1E8', paperDeep: '#EFE8D8',
  ink: '#0E0E0E', inkSoft: '#1F1F1F', inkMid: '#4A4A4A',
  inkLo: '#7A7570', inkMute: '#A8A39B',
  line: '#E2DBC9', line2: '#D3CAB3',
  red: '#C8102E', redDeep: '#9A0B23', redInk: '#FFE4E8', redSoft: '#FCE4E8',
  teal: '#00B2A9', tealDeep: '#006A65', tealSoft: '#D7F0ED', tealInk: '#E6F7F5',
  gold: '#F6EB61', goldDeep: '#C8B22E', goldSoft: '#FBF3C4', goldInk: '#5A4E0F',
};
const SDF = `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
const STG = ['Identify', 'Reach out', 'Engage', 'Visit', 'Offer', 'Decide'];

// ─── Timeline data ───
const TIMELINE = [
  { id: 'action-1', kind: 'action', date: 'Apr 18', dateFull: 'Today · overdue', overdue: true,
    title: 'Ping again for meeting', note: 'Coach Cross said he\'d circle back on scheduling. Day 10 of silence — nudge gently.',
    button: 'Mark complete · reply sent' },
  { id: 'in-2', kind: 'inbound', date: 'Apr 8', dateFull: 'Apr 8 · 6:42p',
    channel: 'Email', coach: 'Ben Cross', role: 'Head Coach',
    subject: 'Re: Thanks — quick call?',
    body: 'Finn — Glad to hear back. Your reply made it clear you\'ve done your homework on us. I\'m slammed this week but let me come back to you Mon/Tue on scheduling. Keep training.',
    button: 'Draft reply' },
  { id: 'out-1', kind: 'outbound', date: 'Apr 8', dateFull: 'Apr 8 · 2:15p',
    channel: 'Email', coach: 'You → Ben Cross',
    subject: 'Thanks — quick call?',
    body: 'Coach Cross — Thanks for the note on the Dallas film. I\'d love to learn more about your system and how you\'re thinking about the 2027 class. Any chance for a 15-min call next week? I\'m open Tue/Thu afternoons.' },
  { id: 'in-1', kind: 'inbound', date: 'Apr 3', dateFull: 'Apr 3 · 11:08a',
    channel: 'Sports Recruits', coach: 'Ben Cross', role: 'Head Coach',
    subject: 'Film from Dallas',
    body: 'Finn — saw your film from the Dallas ECNL showcase. You read the game like someone older than 16. Left foot is real. We\'re watching. Stay in touch.' },
  { id: 'log-1', kind: 'log', date: 'Mar 28', dateFull: 'Mar 28', note: 'Added Rochester to Tier A after campus visit research. Eng program + soccer level both check out.' },
  { id: 'out-0', kind: 'outbound', date: 'Mar 24', channel: 'Email', coach: 'You → Ben Cross', subject: 'Intro — Finn Almond, ECNL CB/LB, 2027' },
  { id: 'log-0', kind: 'log', date: 'Mar 22', note: 'Shared highlight film v2 with coaching staff via Sports Recruits.' },
  { id: 'log-old', kind: 'log', date: 'Mar 10', note: 'Flagged Rochester from college-search spreadsheet — eng + D3 + NY.' },
];

// ─── Stage dots ───
function StageDots({ stage = 3, size = 9 }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {STG.map((_, i) => (
        <div key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: i < stage ? SD.ink : 'transparent',
          border: i < stage ? 'none' : `1.3px solid ${SD.inkMute}`,
          boxShadow: i === stage - 1 ? `0 0 0 2px ${SD.paper}, 0 0 0 3px ${SD.ink}` : 'none',
        }}/>
      ))}
    </div>
  );
}

function TierBadge({ tier = 'A' }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      background: SD.ink, color: '#fff',
      fontSize: 10, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{tier}</div>
  );
}

// ─── Sidebar ───
function SDSidebar() {
  const nav = (label, count, on) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: on ? SD.ink : 'transparent',
      cursor: 'pointer', fontSize: 14,
      color: on ? '#fff' : SD.inkMid,
      fontWeight: on ? 600 : 450, letterSpacing: -0.1,
    }}>
      <span>{label}</span>
      {count !== null && <span style={{
        marginLeft: 'auto', padding: '1px 7px', borderRadius: 10,
        background: on ? SD.red : 'transparent',
        color: on ? '#fff' : SD.inkLo, fontSize: 11, fontWeight: 700,
      }}>{count}</span>}
    </div>
  );
  return (
    <aside style={{
      width: 232, background: SD.paper, borderRight: `1px solid ${SD.line}`,
      padding: '22px 12px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 24px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: SD.red, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, fontStyle: 'italic',
        }}>F</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: SD.ink, letterSpacing: -0.4 }}>finnsoccer</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav('Today', 3, false)}
        {nav('Schools', 32, true)}
        {nav('Library', null, false)}
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${SD.line}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: SD.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>FA</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 650, color: SD.ink }}>Finn Almond</div>
          <div style={{ fontSize: 11, color: SD.inkLo }}>Class of '27 · CB/LB</div>
        </div>
      </div>
    </aside>
  );
}

// ─── Page header ───
function SDHeader({ isMobile }) {
  return (
    <div style={{
      padding: isMobile ? '14px 16px 12px' : '28px 40px 20px',
      borderBottom: `1px solid ${SD.line}`, background: SD.paper,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 10 : 14,
      }}>
        <button style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', padding: 0,
          color: SD.inkLo, fontSize: 12, fontWeight: 600,
          letterSpacing: -0.1, cursor: 'pointer', fontFamily: SDF,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Schools
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isMobile && <>
            <span style={{ fontSize: 11, color: SD.inkLo, fontWeight: 600 }}>4 of 32 · Tier A</span>
            <button style={{
              width: 26, height: 26, borderRadius: 6, background: 'transparent',
              border: `1px solid ${SD.line2}`, cursor: 'pointer', color: SD.inkMid,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
            <button style={{
              width: 26, height: 26, borderRadius: 6, background: 'transparent',
              border: `1px solid ${SD.line2}`, cursor: 'pointer', color: SD.inkMid,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>›</button>
          </>}
          <button style={{
            width: 26, height: 26, borderRadius: 6, background: 'transparent',
            border: `1px solid ${SD.line2}`, cursor: 'pointer', color: SD.inkMid,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, letterSpacing: -2,
          }}>···</button>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <TierBadge/>
        <h1 style={{
          margin: 0, fontSize: isMobile ? 32 : 48, fontWeight: 700,
          letterSpacing: isMobile ? -1.4 : -2, color: SD.ink, lineHeight: 1,
          fontStyle: 'italic',
        }}>University of Rochester.</h1>
      </div>

      <div style={{
        marginTop: 14,
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, flexWrap: 'wrap',
      }}>
        <StageDots/>
        <div style={{ fontSize: 12, color: SD.inkMid, fontWeight: 500 }}>
          Engage · <span style={{ color: SD.inkLo }}>step 3 of 6</span>
        </div>
        <div style={{ width: 1, height: 14, background: SD.line2 }}/>
        <div style={{ fontSize: 12, color: SD.inkMid }}>
          D3 · Liberty League · Rochester, NY
        </div>
        <div style={{ width: 1, height: 14, background: SD.line2 }}/>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 999,
          background: SD.tealSoft, color: SD.tealDeep,
          fontSize: 11, fontWeight: 700, letterSpacing: -0.1,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: SD.teal }}/>
          Ongoing conversation
        </div>
      </div>
    </div>
  );
}

// ─── Action bar ───
function SDActionBar({ isMobile }) {
  return (
    <div style={{
      margin: isMobile ? '14px 16px 0' : '20px 40px 0',
      background: SD.red, color: '#fff',
      borderRadius: 16, overflow: 'hidden', position: 'relative',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 18px 42px -22px rgba(200,16,46,0.38)',
    }}>
      <div style={{
        position: 'absolute', right: -10, bottom: -40,
        fontSize: isMobile ? 160 : 200, fontWeight: 800, lineHeight: 1,
        letterSpacing: -10, color: 'rgba(0,0,0,0.16)', fontStyle: 'italic',
        pointerEvents: 'none', fontFamily: SDF,
      }}>→</div>

      <div style={{
        padding: isMobile ? '18px 20px 20px' : '22px 30px 24px',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
        gap: isMobile ? 18 : 28, alignItems: 'center', position: 'relative',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '3px 9px', borderRadius: 999, background: 'rgba(0,0,0,0.22)',
            fontSize: 10, fontWeight: 800, letterSpacing: 1.4,
            textTransform: 'uppercase', color: '#fff', marginBottom: 10,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }}/>
            Next for Rochester · overdue
          </div>
          <div style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 700,
            letterSpacing: -0.8, lineHeight: 1.1, color: '#fff',
            textWrap: 'balance',
          }}>
            Ping Coach Cross — he promised scheduling{' '}
            <span style={{
              fontStyle: 'italic',
              borderBottom: `2px solid rgba(255,255,255,0.4)`,
              paddingBottom: 1,
            }}>Mon or Tue</span>.
          </div>
          <div style={{
            marginTop: 8, fontSize: 13, color: SD.redInk, opacity: 0.9, lineHeight: 1.45,
          }}>
            10 days of silence. Due today · action item overdue since this morning.
          </div>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          alignItems: isMobile ? 'stretch' : 'end',
        }}>
          <button style={{
            background: '#fff', color: SD.red, border: 'none', borderRadius: 12,
            padding: isMobile ? '13px 20px' : '14px 22px',
            fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
            cursor: 'pointer', fontFamily: SDF,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, minWidth: 200,
            boxShadow: '0 1px 0 rgba(0,0,0,0.08), 0 6px 18px -8px rgba(0,0,0,0.25)',
          }}>
            Draft reply
            <span style={{
              width: 26, height: 26, borderRadius: '50%',
              background: SD.red, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          </button>
          <div style={{
            fontSize: 11, color: SD.redInk, opacity: 0.85, cursor: 'pointer',
            textAlign: 'center', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600,
          }}>Snooze 1 day</div>
        </div>
      </div>
    </div>
  );
}

// ─── Channel pill ───
function ChannelPill({ channel }) {
  const icons = {
    'Email': '✉',
    'Sports Recruits': 'SR',
    'Phone': '☎',
    'In Person': '◉',
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, color: SD.inkMid, fontWeight: 600, letterSpacing: -0.1,
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4,
        background: SD.paperDeep, color: SD.inkMid,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700,
      }}>{icons[channel] || '·'}</span>
      {channel}
    </span>
  );
}

// ─── Timeline entry ───
function TLEntry({ e, expanded, onToggle, first }) {
  const isAction = e.kind === 'action';
  const isInbound = e.kind === 'inbound';
  const isOutbound = e.kind === 'outbound';
  const isLog = e.kind === 'log';

  // Collapsed (older entries)
  if (!expanded && !isAction) {
    return (
      <div onClick={onToggle} style={{
        display: 'grid', gridTemplateColumns: '62px 20px 1fr auto',
        gap: 16, alignItems: 'center',
        padding: '9px 0', borderTop: `1px dashed ${SD.line}`,
        cursor: 'pointer',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: SD.inkLo,
          letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'right',
        }}>{e.date}</div>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isOutbound ? SD.ink : (isInbound ? SD.teal : SD.inkMute),
          justifySelf: 'center',
        }}/>
        <div style={{
          fontSize: 13, color: SD.inkMid, letterSpacing: -0.1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: SD.inkLo, fontWeight: 600, marginRight: 8 }}>
            {isInbound ? 'In' : isOutbound ? 'Out' : 'Log'}
          </span>
          {e.subject || e.note}
        </div>
        <div style={{ fontSize: 12, color: SD.inkMute }}>+</div>
      </div>
    );
  }

  // Action (always expanded)
  if (isAction) {
    return (
      <div style={{
        margin: first ? '0 0 18px' : '18px 0',
        padding: 18, background: SD.redSoft,
        border: `1.5px solid ${SD.red}`, borderRadius: 12,
        display: 'grid', gridTemplateColumns: '24px 1fr',
        gap: 14, alignItems: 'start',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          border: `2px solid ${SD.red}`, background: '#fff',
          cursor: 'pointer',
        }}/>
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase',
              color: SD.red,
            }}>Action · {e.dateFull}</span>
            <span style={{ fontSize: 11, color: SD.redDeep, fontWeight: 600 }}>
              Reflected in the bar above ↑
            </span>
          </div>
          <div style={{
            fontSize: 17, fontWeight: 700, color: SD.ink,
            letterSpacing: -0.3, marginBottom: 4,
          }}>{e.title}</div>
          <div style={{ fontSize: 13, color: SD.inkMid, lineHeight: 1.5 }}>{e.note}</div>
        </div>
      </div>
    );
  }

  // Expanded inbound/outbound
  if (isInbound || isOutbound) {
    return (
      <div style={{
        margin: first ? '0 0 18px' : '18px 0',
        padding: 0, display: 'grid',
        gridTemplateColumns: '62px 1fr', gap: 16,
      }}>
        <div style={{
          textAlign: 'right', paddingTop: 14,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: SD.inkLo,
            letterSpacing: 0.3, textTransform: 'uppercase',
          }}>{e.date}</div>
          <div style={{ fontSize: 10, color: SD.inkMute, marginTop: 2, fontWeight: 600 }}>
            {e.dateFull?.split(' · ')[1]}
          </div>
        </div>
        <div style={{
          padding: 18,
          background: isInbound ? SD.tealSoft : '#fff',
          border: `1px solid ${isInbound ? SD.teal : SD.line2}`,
          borderLeft: `3px solid ${isInbound ? SD.teal : SD.ink}`,
          borderRadius: 10,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 10, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase',
              color: isInbound ? SD.tealDeep : SD.ink,
            }}>{isInbound ? '← Inbound' : '→ Outbound'}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: SD.inkMute }}/>
            <span style={{ fontSize: 12, color: SD.ink, fontWeight: 650 }}>{e.coach}</span>
            {e.role && <span style={{ fontSize: 12, color: SD.inkLo }}>· {e.role}</span>}
            <div style={{ marginLeft: 'auto' }}><ChannelPill channel={e.channel}/></div>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 650, color: SD.ink,
            letterSpacing: -0.2, marginBottom: 6,
          }}>{e.subject}</div>
          <div style={{
            fontSize: 13, color: SD.inkSoft, lineHeight: 1.6, letterSpacing: -0.05,
          }}>{e.body}</div>
          {e.button && (
            <div style={{
              marginTop: 14, paddingTop: 12,
              borderTop: `1px solid ${isInbound ? 'rgba(0,178,169,0.25)' : SD.line}`,
            }}>
              <button style={{
                padding: '7px 14px', background: SD.red, color: '#fff',
                border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 650,
                cursor: 'pointer', fontFamily: SDF, letterSpacing: -0.1,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                {e.button}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Expanded log
  return (
    <div style={{
      margin: first ? '0 0 16px' : '16px 0',
      display: 'grid', gridTemplateColumns: '62px 1fr', gap: 16, alignItems: 'start',
    }}>
      <div style={{
        textAlign: 'right', paddingTop: 2,
        fontSize: 11, fontWeight: 700, color: SD.inkLo,
        letterSpacing: 0.3, textTransform: 'uppercase',
      }}>{e.date}</div>
      <div style={{
        padding: '2px 0', fontSize: 13, color: SD.inkMid, lineHeight: 1.5,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase',
          color: SD.inkLo, marginRight: 10,
        }}>Log</span>
        {e.note}
      </div>
    </div>
  );
}

// ─── Timeline ───
function Timeline({ expandedIds, setExpandedIds, isMobile }) {
  const toggle = (id) => {
    const next = new Set(expandedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedIds(next);
  };

  return (
    <div style={{ fontFamily: SDF }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 16, padding: isMobile ? '0' : '0',
      }}>
        <h2 style={{
          margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 700,
          letterSpacing: -0.7, color: SD.ink, fontStyle: 'italic',
        }}>Conversation.</h2>
        <button style={{
          background: 'transparent', border: `1px solid ${SD.line2}`,
          borderRadius: 999, padding: '5px 12px',
          fontSize: 12, fontWeight: 600, color: SD.ink, cursor: 'pointer', fontFamily: SDF,
          display: 'inline-flex', alignItems: 'center', gap: 5, letterSpacing: -0.1,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
          Log entry
        </button>
      </div>

      {TIMELINE.map((e, i) => (
        <TLEntry
          key={e.id}
          e={e}
          expanded={expandedIds.has(e.id)}
          onToggle={() => toggle(e.id)}
          first={i === 0}
        />
      ))}
    </div>
  );
}

// ─── Right sidebar — Coach card ───
function CoachCard({ isMobile }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${SD.line}`,
      borderRadius: 14, padding: 18, fontFamily: SDF,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
        textTransform: 'uppercase', color: SD.inkLo, marginBottom: 10,
      }}>Coaching staff</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: SD.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, letterSpacing: -0.2, flexShrink: 0,
        }}>BC</div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: SD.ink, letterSpacing: -0.3,
          }}>Ben Cross</div>
          <div style={{ fontSize: 12, color: SD.inkMid, marginBottom: 4 }}>Head Coach · 9y</div>
          <div style={{
            fontSize: 12, color: SD.tealDeep, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>bcross@rochester.edu</div>
        </div>
      </div>

      <div style={{
        paddingTop: 12, borderTop: `1px solid ${SD.line}`, marginBottom: 14,
      }}>
        {[
          ['Daniel Fuentes', 'Assoc. Head'],
          ['Tom McMurray', 'Assistant · Goalkeeping'],
        ].map(([n, r]) => (
          <div key={n} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0',
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: SD.paperDeep, color: SD.inkMid,
              fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{n.split(' ').map(x => x[0]).join('')}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: SD.ink, letterSpacing: -0.1 }}>{n}</div>
              <div style={{ fontSize: 11, color: SD.inkLo }}>{r}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={{
          padding: '10px 14px', background: SD.ink, color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 650,
          cursor: 'pointer', fontFamily: SDF, letterSpacing: -0.1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 7l9 6 9-6M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l9 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Draft email
        </button>
        <button style={{
          padding: '9px 14px', background: 'transparent', color: SD.ink,
          border: `1px solid ${SD.line2}`, borderRadius: 10,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SDF, letterSpacing: -0.1,
        }}>Prep for call</button>
      </div>
    </div>
  );
}

// ─── About block ───
function AboutBlock({ isMobile }) {
  const Row = ({ label, value, color }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12,
      padding: '8px 0', borderBottom: `1px dashed ${SD.line}`,
    }}>
      <div style={{
        fontSize: 11, color: SD.inkLo, fontWeight: 600,
        letterSpacing: 0.3, textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontSize: 13, color: color || SD.ink, fontWeight: 550, letterSpacing: -0.1,
        lineHeight: 1.4,
      }}>{value}</div>
    </div>
  );
  return (
    <div style={{
      background: SD.paperDeep, borderRadius: 14, padding: 18,
      fontFamily: SDF, border: `1px solid ${SD.line}`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
        textTransform: 'uppercase', color: SD.inkLo, marginBottom: 6,
      }}>About Rochester</div>
      <Row label="Program" value="D3 · Liberty League"/>
      <Row label="Location" value="Rochester, NY · 6,800 undergrad"/>
      <Row label="Tier" value={<><strong>A</strong> · warm lead</>}/>
      <Row label="Admit" value="Reach · 28% acceptance"/>
      <Row label="Engineering" value="Hajim School — strong BME, CS"/>
      <Row label="Tactics" value="3-4-3 high press · ball-playing CBs"/>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
            textTransform: 'uppercase', color: SD.inkLo, marginBottom: 3,
          }}>Last contact</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: SD.ink, fontStyle: 'italic' }}>
            Apr 12 <span style={{ fontSize: 11, color: SD.tealDeep, fontWeight: 600, fontStyle: 'normal' }}>· 6d ago</span>
          </div>
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
            textTransform: 'uppercase', color: SD.inkLo, marginBottom: 3,
          }}>RQ status</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: SD.ink, fontStyle: 'italic' }}>
            Submitted <span style={{ fontSize: 11, color: SD.inkLo, fontWeight: 500, fontStyle: 'normal' }}>· Mar 22</span>
          </div>
        </div>
      </div>
      <div style={{
        marginTop: 12, fontSize: 12, color: SD.inkMid, lineHeight: 1.5,
        padding: 10, background: '#fff', borderRadius: 8,
        border: `1px solid ${SD.line}`,
        fontStyle: 'italic',
      }}>
        "Coach Cross praised film in email, personalized reply." <span style={{ color: SD.inkLo, fontStyle: 'normal' }}>— Mar 28 note</span>
      </div>
    </div>
  );
}

// ─── Action items ───
function ActionItems() {
  const [done, setDone] = useState(new Set());
  const [showDone, setShowDone] = useState(false);
  const items = [
    { id: 'a1', text: 'Ping Coach Cross for meeting date', due: 'Overdue · today', overdue: true },
    { id: 'a2', text: 'Send campus-visit prep questions', due: 'Apr 22' },
    { id: 'a3', text: 'Ask about Hajim Engineering rep', due: 'Apr 25' },
  ];
  const completed = [
    { id: 'c1', text: 'Reply to inbound from Coach Cross', doneOn: 'Apr 8' },
    { id: 'c2', text: 'Upload Dallas ECNL highlight reel', doneOn: 'Mar 22' },
  ];
  return (
    <div style={{
      background: '#fff', border: `1px solid ${SD.line}`,
      borderRadius: 14, padding: 18, fontFamily: SDF,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
        textTransform: 'uppercase', color: SD.inkLo, marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>Action items</span>
        <span style={{
          fontSize: 11, color: SD.inkLo, fontWeight: 600, letterSpacing: 0,
          textTransform: 'none',
        }}>{items.length - done.size} open</span>
      </div>
      {items.map(it => {
        const isDone = done.has(it.id);
        return (
          <div key={it.id} style={{
            display: 'grid', gridTemplateColumns: '18px 1fr auto',
            gap: 10, alignItems: 'center',
            padding: '9px 0', borderBottom: `1px solid ${SD.line}`,
          }}>
            <div onClick={() => {
              const n = new Set(done); n.has(it.id) ? n.delete(it.id) : n.add(it.id); setDone(n);
            }} style={{
              width: 16, height: 16, borderRadius: 5,
              border: `1.5px solid ${it.overdue && !isDone ? SD.red : SD.inkMute}`,
              background: isDone ? SD.ink : '#fff',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {isDone && <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <div style={{
              fontSize: 13, color: isDone ? SD.inkLo : SD.ink,
              textDecoration: isDone ? 'line-through' : 'none', letterSpacing: -0.1,
              fontWeight: it.overdue ? 600 : 500,
            }}>{it.text}</div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: -0.1,
              color: it.overdue && !isDone ? SD.red : SD.inkLo,
            }}>{it.due}</div>
          </div>
        );
      })}
      <button style={{
        width: '100%', padding: '10px 0', marginTop: 8,
        background: 'transparent', border: 'none',
        color: SD.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SDF,
        letterSpacing: -0.1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
        Add action
      </button>
      <button onClick={() => setShowDone(!showDone)} style={{
        width: '100%', padding: '7px 0', background: 'transparent', border: 'none',
        color: SD.inkLo, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SDF,
        letterSpacing: -0.1, borderTop: `1px solid ${SD.line}`,
      }}>
        {showDone ? 'Hide' : 'Show'} {completed.length} completed
      </button>
      {showDone && completed.map(c => (
        <div key={c.id} style={{
          display: 'grid', gridTemplateColumns: '18px 1fr auto',
          gap: 10, alignItems: 'center', padding: '6px 0',
          fontSize: 12, color: SD.inkLo,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 1 }}><path d="M5 12.5l4.5 4.5L19 7" stroke={SD.tealDeep} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{ textDecoration: 'line-through' }}>{c.text}</div>
          <div style={{ fontSize: 10, color: SD.inkMute, fontWeight: 600 }}>{c.doneOn}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Desktop body ───
function SDDesktopBody({ extraExpanded }) {
  const defaultExpanded = new Set(['action-1', 'in-2', 'out-1', 'in-1', 'log-1']);
  const all = extraExpanded ? new Set([...defaultExpanded, 'out-0']) : defaultExpanded;
  const [expandedIds, setExpandedIds] = useState(all);
  useEffect(() => { setExpandedIds(all); }, [extraExpanded]);

  return (
    <>
      <SDHeader isMobile={false}/>
      <SDActionBar isMobile={false}/>
      <div style={{
        padding: '28px 40px 40px',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) 340px',
        gap: 32, alignItems: 'start',
      }}>
        <Timeline expandedIds={expandedIds} setExpandedIds={setExpandedIds} isMobile={false}/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 20 }}>
          <CoachCard/>
          <AboutBlock/>
          <ActionItems/>
        </div>
      </div>
    </>
  );
}

// ─── Mobile body ───
function SDMobileBody({ extraExpanded }) {
  const defaultExpanded = new Set(['action-1', 'in-2', 'out-1', 'in-1']);
  const all = extraExpanded ? new Set([...defaultExpanded, 'log-1']) : defaultExpanded;
  const [expandedIds, setExpandedIds] = useState(all);
  useEffect(() => { setExpandedIds(all); }, [extraExpanded]);

  return (
    <>
      <SDHeader isMobile={true}/>
      <SDActionBar isMobile={true}/>
      <div style={{ padding: '20px 16px 24px' }}>
        <Timeline expandedIds={expandedIds} setExpandedIds={setExpandedIds} isMobile={true}/>
      </div>
      <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CoachCard/>
        <AboutBlock/>
        <ActionItems/>
      </div>
    </>
  );
}

// ─── Frames ───
function SDDesktopFrame({ label, extraExpanded = false }) {
  return (
    <div data-screen-label={label} style={{
      width: 1440, height: 960,
      display: 'flex', background: SD.paper, color: SD.ink,
      fontFamily: SDF, overflow: 'hidden', borderRadius: 10,
    }}>
      <SDSidebar/>
      <main className="frame-scroll" style={{ flex: 1, overflow: 'auto', background: SD.paper }}>
        <SDDesktopBody extraExpanded={extraExpanded}/>
      </main>
    </div>
  );
}

function SDMobileFrame({ label, extraExpanded = false }) {
  return (
    <div data-screen-label={label} style={{
      width: 390, height: 844,
      borderRadius: 48, padding: 10, background: '#0a0a0a',
      boxShadow: '0 0 0 2px #222, 0 30px 80px -30px rgba(0,0,0,0.5)',
      fontFamily: SDF,
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 38,
        overflow: 'hidden', background: SD.paper, color: SD.ink,
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          width: 110, height: 30, background: '#0a0a0a', borderRadius: 20, zIndex: 3,
        }}/>
        <div style={{
          height: 44, padding: '0 22px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 600, color: SD.ink,
        }}>
          <span>9:41</span>
          <div style={{ width: 40 }}/>
        </div>
        <div className="frame-scroll" style={{ flex: 1, overflow: 'auto' }}>
          <SDMobileBody extraExpanded={extraExpanded}/>
        </div>
        <div style={{
          borderTop: `1px solid ${SD.line}`,
          padding: '10px 24px 26px', background: SD.paper,
          display: 'flex', justifyContent: 'space-around',
        }}>
          {[['Today', false], ['Schools', true], ['Library', false]].map(([l, on]) => (
            <div key={l} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: on ? SD.ink : SD.inkLo,
              fontSize: 11, fontWeight: on ? 700 : 500, position: 'relative',
              fontStyle: on ? 'italic' : 'normal',
            }}>
              {on && <div style={{
                position: 'absolute', top: -10, width: 24, height: 3,
                background: SD.red, borderRadius: 2,
              }}/>}
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') Object.assign(window, { SDDesktopFrame, SDMobileFrame, SD });
export { SDDesktopFrame, SDMobileFrame };
