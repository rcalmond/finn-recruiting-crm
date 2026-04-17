// Variation 4 — "Full Liverpool" (opinionated revision)
// Color-dominant cards, asymmetric hero, oversized type.
// Red owns the hero. Teal owns the inbox. Gold owns the watch.

const LV = {
  paper: '#F6F1E8',         // warm off-white ground (NOT pure white)
  paperDeep: '#EFE8D8',
  ink: '#0E0E0E',
  inkSoft: '#1F1F1F',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  line2: '#D3CAB3',

  red: '#C8102E',
  redDeep: '#9A0B23',
  redInk: '#FFE4E8',           // pale-on-red text tint
  redChrome: '#FF5468',         // bright accent-on-red

  teal: '#00B2A9',
  tealDeep: '#006A65',
  tealInk: '#E6F7F5',           // pale-on-teal text tint

  gold: '#F6EB61',
  goldDeep: '#C8B22E',
  goldInk: '#5A4E0F',
};

const LVF = `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

// ───────── Sidebar ─────────
function LVSidebar() {
  const nav = (label, count, on) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: on ? LV.ink : 'transparent',
      cursor: 'pointer', fontSize: 14,
      color: on ? '#fff' : LV.inkMid,
      fontWeight: on ? 600 : 450, letterSpacing: -0.1,
    }}>
      <span>{label}</span>
      {count !== null && <span style={{
        marginLeft: 'auto',
        padding: '1px 7px', borderRadius: 10,
        background: on ? LV.red : 'transparent',
        color: on ? '#fff' : LV.inkLo,
        fontSize: 11, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}>{count}</span>}
    </div>
  );

  return (
    <aside style={{
      width: 232, background: LV.paper,
      borderRight: `1px solid ${LV.line}`,
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
          background: LV.red, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, letterSpacing: -0.3,
          fontStyle: 'italic',
        }}>F</div>
        <div style={{
          fontSize: 15, fontWeight: 700, color: LV.ink, letterSpacing: -0.4,
        }}>finnsoccer</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav('Today', 7, true)}
        {nav('Schools', 48, false)}
        {nav('Library', null, false)}
      </div>

      <div style={{
        marginTop: 26, marginBottom: 10, padding: '0 14px',
        fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase',
        color: LV.inkLo, fontWeight: 700,
      }}>Pipeline</div>
      <div>
        {[
          ['South Dakota Mines', LV.red, 'HOT'],
          ['Rochester', LV.teal, 'ACTIVE'],
          ['MSOE', LV.teal, 'ACTIVE'],
          ['Lafayette', LV.gold, 'WARMING'],
          ['Cal Poly SLO', LV.gold, 'WARMING'],
        ].map(([name, dot, state]) => (
          <div key={name} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 14px', fontSize: 13, color: LV.inkSoft,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot }}/>
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{
              fontSize: 9, letterSpacing: 0.8, color: LV.inkLo, fontWeight: 700,
            }}>{state}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${LV.line}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: LV.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>FA</div>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: LV.ink }}>Finn Almond</div>
          <div style={{ fontSize: 11, color: LV.inkLo }}>Class of '27 · CB/LB</div>
        </div>
      </div>
    </aside>
  );
}

// ───────── Top bar (small + opinionated) ─────────
function LVTopBar() {
  return (
    <div style={{
      padding: '24px 56px 0',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{
        fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
        fontWeight: 700, color: LV.inkLo,
      }}>Friday — April 17 · Week 16</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          padding: '6px 12px', borderRadius: 999,
          background: 'transparent', border: `1px solid ${LV.line2}`,
          fontSize: 12, color: LV.inkMid,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6"/><path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          Search · ⌘K
        </div>
        <button style={{
          padding: '7px 14px', background: LV.ink, color: '#fff',
          border: 'none', borderRadius: 999,
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: LVF,
        }}>Log activity</button>
      </div>
    </div>
  );
}

// ───────── HERO — red-dominant, asymmetric ─────────
function LVHero({ caughtUp, onComplete, isMobile }) {
  if (caughtUp) {
    return (
      <section style={{
        margin: isMobile ? '16px 16px 0' : '28px 56px 0',
        background: LV.teal, color: '#fff',
        borderRadius: 18, overflow: 'hidden',
        position: 'relative',
        padding: isMobile ? '28px 24px' : '40px 44px',
      }}>
        {/* huge faint check */}
        <div style={{
          position: 'absolute', right: -20, bottom: -40,
          fontSize: isMobile ? 240 : 320,
          color: 'rgba(255,255,255,0.10)',
          fontWeight: 800, lineHeight: 1, letterSpacing: -10,
          pointerEvents: 'none',
        }}>✓</div>

        <div style={{ position: 'relative', maxWidth: 640 }}>
          <div style={{
            fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
            fontWeight: 700, color: LV.tealInk, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#fff',
            }}/>
            Cleared — 9:42a
          </div>
          <div style={{
            fontSize: isMobile ? 36 : 56, fontWeight: 700,
            letterSpacing: -2, lineHeight: 0.95,
            marginBottom: 16, fontStyle: 'italic',
            textWrap: 'balance',
          }}>You're caught up.</div>
          <div style={{
            fontSize: isMobile ? 15 : 17, color: LV.tealInk,
            lineHeight: 1.5, marginBottom: 22, maxWidth: 460,
          }}>
            Nothing waiting on you. Four commitments sit on the horizon this week — keep the rhythm going.
          </div>
          <button style={{
            background: '#fff', color: LV.tealDeep,
            border: 'none', borderRadius: 999,
            padding: isMobile ? '12px 22px' : '14px 26px',
            fontSize: 14, fontWeight: 700, letterSpacing: -0.1,
            cursor: 'pointer', fontFamily: LVF,
            display: 'inline-flex', alignItems: 'center', gap: 10,
          }}>
            See This Week
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={{
      margin: isMobile ? '16px 16px 0' : '28px 56px 0',
      background: LV.red, color: '#fff',
      borderRadius: 18, overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 30px 60px -28px rgba(200,16,46,0.45)',
    }}>
      {/* HUGE numeral, behind everything */}
      <div style={{
        position: 'absolute',
        right: isMobile ? -30 : -20,
        bottom: isMobile ? -80 : -100,
        fontSize: isMobile ? 320 : 480,
        color: 'rgba(0,0,0,0.18)',
        fontWeight: 800, lineHeight: 1, letterSpacing: -20,
        fontStyle: 'italic',
        pointerEvents: 'none',
        userSelect: 'none',
        fontFamily: LVF,
      }}>01</div>

      {/* Top eyebrow strip */}
      <div style={{
        padding: isMobile ? '16px 22px 0' : '22px 44px 0',
        display: 'flex', alignItems: 'center', gap: 14,
        position: 'relative',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 11px', borderRadius: 999,
          background: 'rgba(0,0,0,0.20)', color: '#fff',
          fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
          textTransform: 'uppercase',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#fff',
            animation: 'cc-blink 1.4s ease-in-out infinite',
          }}/>
          Priority №1
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
          textTransform: 'uppercase', color: LV.redInk,
        }}>2 days overdue</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: LV.redInk, opacity: 0.7 }}>
          {!isMobile && 'Category A · Engineering'}
        </div>
      </div>

      {/* Asymmetric body — headline pushed left, action card pushed right */}
      <div style={{
        padding: isMobile ? '20px 22px 28px' : '36px 44px 44px',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: isMobile ? 24 : 56,
        alignItems: 'end',
        position: 'relative',
      }}>
        {/* LEFT — oversized statement */}
        <div>
          <div style={{
            fontSize: isMobile ? 44 : 76,
            fontWeight: 700,
            letterSpacing: isMobile ? -2.2 : -3.6,
            lineHeight: 0.92,
            marginBottom: 0,
            color: '#fff',
            textWrap: 'balance',
            fontFamily: LVF,
          }}>
            Reply to{' '}
            <span style={{
              fontStyle: 'italic', fontWeight: 700,
              color: '#fff',
              textDecoration: 'underline',
              textDecorationThickness: isMobile ? 3 : 5,
              textUnderlineOffset: isMobile ? 6 : 10,
              textDecorationColor: 'rgba(255,255,255,0.35)',
            }}>Coach Schuster.</span>
          </div>

          <div style={{
            marginTop: isMobile ? 18 : 22,
            fontSize: isMobile ? 14 : 16,
            color: LV.redInk, opacity: 0.95,
            lineHeight: 1.5, maxWidth: 460,
            letterSpacing: -0.1,
          }}>
            Warm inbound from <strong style={{ color: '#fff', fontWeight: 700 }}>South Dakota Mines</strong>.
            He named your Dallas film and asked about a spring visit.
            The momentum window is closing.
          </div>
        </div>

        {/* RIGHT — action stack */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 14,
          alignSelf: isMobile ? 'stretch' : 'end',
        }}>
          {!isMobile && (
            <div style={{
              padding: '14px 16px',
              background: 'rgba(0,0,0,0.22)',
              borderRadius: 12,
              fontSize: 13, color: '#fff', lineHeight: 1.5,
              fontStyle: 'italic',
              borderLeft: `3px solid ${LV.redChrome}`,
            }}>
              "Saw your film from Dallas. Love the left foot. Any chance you're out here this spring?"
              <div style={{
                marginTop: 8, fontStyle: 'normal',
                fontSize: 11, color: LV.redInk, opacity: 0.75,
                letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600,
              }}>Tue 4:12p · Head Coach</div>
            </div>
          )}

          <button onClick={onComplete} style={{
            background: '#fff', color: LV.red,
            border: 'none', borderRadius: 12,
            padding: isMobile ? '15px 22px' : '18px 26px',
            fontSize: isMobile ? 15 : 17, fontWeight: 700,
            letterSpacing: -0.2, cursor: 'pointer', fontFamily: LVF,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 14, width: '100%',
            boxShadow: '0 1px 0 rgba(0,0,0,0.08), 0 8px 20px -8px rgba(0,0,0,0.25)',
          }}>
            <span>Draft reply</span>
            <span style={{
              width: 30, height: 30, borderRadius: '50%',
              background: LV.red, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          </button>
          <div style={{
            fontSize: 12, color: LV.redInk, opacity: 0.85,
            cursor: 'pointer', textAlign: 'center',
            letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600,
          }}>Snooze 1 day</div>
        </div>
      </div>
    </section>
  );
}

// ───────── Bold section title ─────────
function LVTitle({ num, color, label, count, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: 2,
        color, textTransform: 'uppercase',
        padding: '4px 0', borderTop: `2px solid ${color}`,
      }}>№ 0{num}</div>
      <div style={{
        fontSize: 26, fontWeight: 700, letterSpacing: -0.8,
        color: LV.ink, fontStyle: 'italic',
      }}>{label}</div>
      {typeof count === 'number' && <div style={{
        fontSize: 13, color: LV.inkLo, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
      }}>{count}</div>}
      <div style={{ marginLeft: 'auto', fontSize: 11, color: LV.inkLo,
        textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700,
      }}>{sub}</div>
    </div>
  );
}

// ───────── Awaiting (teal-tinted block) ─────────
function LVAwaitBlock({ caughtUp, isMobile, dismissed, onDraft }) {
  const awaiting = DATA.awaiting.filter(a => !dismissed.has(a.id));
  return (
    <section style={{
      margin: isMobile ? '32px 16px 0' : '52px 56px 0',
      background: LV.teal, color: '#fff',
      borderRadius: 18, padding: isMobile ? '20px 4px 4px' : '28px 6px 6px',
    }}>
      <div style={{ padding: isMobile ? '0 18px 18px' : '0 30px 22px' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 2,
            color: LV.tealInk, textTransform: 'uppercase',
            padding: '4px 0', borderTop: `2px solid ${LV.tealInk}`,
          }}>№ 02</div>
          <div style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 700, letterSpacing: -0.9,
            color: '#fff', fontStyle: 'italic',
          }}>Awaiting your reply</div>
          <div style={{
            fontSize: 13, color: LV.tealInk, opacity: 0.85, fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}>{awaiting.length}</div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: LV.tealInk, opacity: 0.75,
            textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700,
          }}>Oldest first</div>
        </div>
      </div>

      <div style={{
        background: LV.paper, borderRadius: 14, overflow: 'hidden',
      }}>
        {awaiting.length === 0
          ? <div style={{
              padding: '32px 24px', textAlign: 'center',
            }}>
              <div style={{
                fontSize: 22, fontWeight: 700, color: LV.tealDeep,
                letterSpacing: -0.6, marginBottom: 4, fontStyle: 'italic',
              }}>Inbox zero. Well done.</div>
              <div style={{ fontSize: 13, color: LV.inkMid }}>
                No coaches waiting. Check back after Tuesday's film drop.
              </div>
            </div>
          : awaiting.map((a, i) => (
              <LVAwaitRow key={a.id} item={a} onDraft={onDraft} first={i === 0} isMobile={isMobile}/>
            ))
        }
      </div>
    </section>
  );
}

function LVAwaitRow({ item, onDraft, first, isMobile }) {
  return (
    <div style={{
      padding: isMobile ? '16px' : '20px 24px',
      borderTop: first ? 'none' : `1px solid ${LV.line}`,
      display: 'flex', gap: isMobile ? 12 : 20,
      alignItems: isMobile ? 'flex-start' : 'center',
    }}>
      {!isMobile && (
        <div style={{
          width: 96, flexShrink: 0,
        }}>
          <div style={{
            fontSize: 22, fontWeight: 700, color: LV.tealDeep,
            letterSpacing: -0.6, fontStyle: 'italic',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          }}>{item.waited.split(' ')[0]}<span style={{
            fontSize: 12, color: LV.inkMid, fontWeight: 600, marginLeft: 4,
            letterSpacing: 0.4, fontStyle: 'normal',
            textTransform: 'uppercase',
          }}>days</span></div>
          <div style={{
            marginTop: 4, fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
            color: LV.tealDeep, textTransform: 'uppercase',
          }}>Active thread</div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10,
          marginBottom: 4, flexWrap: 'wrap',
        }}>
          <div style={{
            fontSize: isMobile ? 17 : 19, fontWeight: 700,
            color: LV.ink, letterSpacing: -0.4,
          }}>{item.school}</div>
          <div style={{ fontSize: 13, color: LV.inkMid }}>
            {item.coach} · {item.role}
          </div>
          {isMobile && <div style={{
            marginLeft: 'auto', fontSize: 12, color: LV.tealDeep,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}>{item.waited}</div>}
        </div>
        <div style={{
          fontSize: 13, color: LV.inkMid, lineHeight: 1.5,
          letterSpacing: -0.1,
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : 540,
        }}>{item.preview}</div>
      </div>

      <button onClick={() => onDraft(item.id)} style={{
        padding: isMobile ? '10px 14px' : '11px 18px',
        background: LV.tealDeep, color: '#fff',
        border: 'none',
        borderRadius: 999, fontSize: 13, fontWeight: 650,
        cursor: 'pointer', fontFamily: LVF,
        flexShrink: 0, letterSpacing: -0.1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        Draft reply
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
  );
}

// ───────── This week — quiet, paper ─────────
function LVWeekBlock({ isMobile }) {
  return (
    <section style={{ margin: isMobile ? '32px 16px 0' : '52px 56px 0' }}>
      <div style={{ marginBottom: 20 }}>
        <LVTitle num={3} color={LV.ink} label="This week" count={DATA.week.length} sub="Apr 17 – 23"/>
      </div>
      <div style={{
        background: LV.paper,
        border: `1px solid ${LV.line}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {DATA.week.map((w, i) => <LVWeekRow key={w.id} item={w} first={i === 0} isMobile={isMobile}/>)}
      </div>
    </section>
  );
}

function LVWeekRow({ item, first, isMobile }) {
  const u = {
    red:   { label: item.due, color: '#fff',     bg: LV.red,      ringColor: LV.red },
    now:   { label: item.due, color: '#fff',     bg: LV.ink,      ringColor: LV.ink },
    soon:  { label: item.due, color: LV.tealDeep, bg: 'transparent', ringColor: LV.teal },
    later: { label: item.due, color: LV.goldInk,  bg: 'transparent', ringColor: LV.goldDeep },
  }[item.urgency];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '14px 1fr auto' : '14px 200px 1fr auto',
      gap: isMobile ? 12 : 20,
      alignItems: 'center',
      padding: isMobile ? '14px 16px' : '14px 24px',
      borderTop: first ? 'none' : `1px solid ${LV.line}`,
      cursor: 'pointer',
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: u.bg === 'transparent' ? '#fff' : u.bg,
        border: `2px solid ${u.ringColor}`,
      }}/>
      <div style={{
        fontSize: isMobile ? 15 : 16, fontWeight: 700, color: LV.ink, letterSpacing: -0.3,
      }}>{item.school}</div>
      {!isMobile && <div style={{
        fontSize: 13, color: LV.inkMid, letterSpacing: -0.1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{item.action}</div>}
      <div style={{
        padding: u.bg === 'transparent' ? '4px 0' : '4px 11px',
        borderRadius: 999,
        background: u.bg, color: u.color,
        fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
        textTransform: 'uppercase',
        fontVariantNumeric: 'tabular-nums',
      }}>{u.label}</div>
      {isMobile && <div style={{
        gridColumn: '2 / 4', fontSize: 13, color: LV.inkMid,
        letterSpacing: -0.1, marginTop: 2,
      }}>{item.action}</div>}
    </div>
  );
}

// ───────── Cold — gold-tinted block ─────────
function LVColdBlock({ isMobile }) {
  return (
    <section style={{
      margin: isMobile ? '32px 16px 32px' : '52px 56px 56px',
      background: LV.gold,
      borderRadius: 18,
      padding: isMobile ? '20px 4px 4px' : '28px 6px 6px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ padding: isMobile ? '0 18px 18px' : '0 30px 22px',
        display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 2,
          color: LV.goldInk, textTransform: 'uppercase',
          padding: '4px 0', borderTop: `2px solid ${LV.goldInk}`,
        }}>№ 04</div>
        <div style={{
          fontSize: isMobile ? 22 : 28, fontWeight: 700, letterSpacing: -0.9,
          color: LV.goldInk, fontStyle: 'italic',
        }}>Don't let these go cold</div>
        <div style={{
          fontSize: 13, color: LV.goldInk, opacity: 0.7, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>{DATA.cold.length}</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: LV.goldInk, opacity: 0.7,
          textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700,
        }}>5+ days silent</div>
      </div>
      <div style={{
        background: LV.paper, borderRadius: 14,
        padding: isMobile ? 12 : 14,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: isMobile ? 12 : 14,
      }}>
        {DATA.cold.map(c => <LVColdCard key={c.id} item={c} isMobile={isMobile}/>)}
      </div>
    </section>
  );
}

function LVColdCard({ item, isMobile }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${LV.line}`,
      borderRadius: 12, padding: isMobile ? '16px' : '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 10,
      minHeight: isMobile ? 'auto' : 168,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 20, right: 20, height: 3,
        background: LV.gold, borderRadius: '0 0 3px 3px',
      }}/>
      <div style={{
        fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase',
        fontWeight: 800, color: LV.goldInk,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 7, height: 7, background: LV.gold,
          borderRadius: '50%', border: `1px solid ${LV.goldDeep}`,
        }}/>
        Day 6 · cooling
      </div>
      <div style={{
        fontSize: isMobile ? 17 : 19, fontWeight: 700, color: LV.ink,
        letterSpacing: -0.4,
      }}>{item.school}</div>
      <div style={{
        fontSize: 13, color: LV.inkMid, lineHeight: 1.5,
        letterSpacing: -0.1,
      }}>{item.risk}</div>
      <div style={{ flex: 1 }}/>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 10, borderTop: `1px solid ${LV.line}`,
      }}>
        <div style={{ fontSize: 11, color: LV.inkLo, fontWeight: 600 }}>
          {item.meta}
        </div>
        <button style={{
          background: LV.ink, color: '#fff', border: 'none',
          padding: '7px 13px', borderRadius: 999, fontFamily: LVF,
          fontSize: 12, fontWeight: 650, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          letterSpacing: -0.1,
        }}>
          Draft follow-up
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}

// ───────── Main "Today" header ─────────
function LVMasthead({ caughtUp, isMobile }) {
  return (
    <div style={{
      padding: isMobile ? '20px 16px 8px' : '14px 56px 8px',
    }}>
      <h1 style={{
        margin: 0,
        fontSize: isMobile ? 44 : 64,
        fontWeight: 700, letterSpacing: isMobile ? -2 : -3,
        color: LV.ink, lineHeight: 1,
        display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
      }}>
        <span style={{ fontStyle: 'italic' }}>Today.</span>
        <span style={{
          fontSize: isMobile ? 13 : 14, fontWeight: 600,
          color: LV.inkLo, letterSpacing: 0,
          display: 'inline-flex', alignItems: 'baseline', gap: 6,
        }}>
          {caughtUp
            ? <><span style={{ color: LV.tealDeep, fontWeight: 700 }}>0 overdue</span> · 4 ahead</>
            : <><span style={{ color: LV.red, fontWeight: 700 }}>1 overdue</span> · 2 active · 5 this week</>
          }
        </span>
      </h1>
    </div>
  );
}

// ───────── Body ─────────
function LVBody({ caughtUp, onHeroComplete, isMobile }) {
  const [dismissed, setDismissed] = React.useState(new Set());
  const onDraft = (id) => setDismissed(prev => new Set([...prev, id]));

  return (
    <>
      <LVMasthead caughtUp={caughtUp} isMobile={isMobile}/>
      <LVHero caughtUp={caughtUp} onComplete={onHeroComplete} isMobile={isMobile}/>
      <LVAwaitBlock caughtUp={caughtUp} isMobile={isMobile} dismissed={dismissed} onDraft={onDraft}/>
      <LVWeekBlock isMobile={isMobile}/>
      <LVColdBlock isMobile={isMobile}/>
    </>
  );
}

// ───────── Frames ─────────
function LVDesktopFrame({ initialCaughtUp = false, label }) {
  const [caughtUp, setCaughtUp] = React.useState(initialCaughtUp);
  return (
    <div data-screen-label={label} style={{
      width: 1440, height: 960,
      display: 'flex', background: LV.paper, color: LV.ink,
      fontFamily: LVF, overflow: 'hidden', borderRadius: 10,
    }}>
      <LVSidebar/>
      <main className="frame-scroll" style={{ flex: 1, overflow: 'auto', background: LV.paper }}>
        <LVTopBar/>
        <LVBody caughtUp={caughtUp} onHeroComplete={() => setCaughtUp(true)} isMobile={false}/>
      </main>
    </div>
  );
}

function LVMobileFrame({ initialCaughtUp = false, label }) {
  const [caughtUp, setCaughtUp] = React.useState(initialCaughtUp);
  return (
    <div data-screen-label={label} style={{
      width: 390, height: 844,
      borderRadius: 48, padding: 10,
      background: '#0a0a0a',
      boxShadow: '0 0 0 2px #222, 0 30px 80px -30px rgba(0,0,0,0.5)',
      fontFamily: LVF,
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 38,
        overflow: 'hidden', background: LV.paper, color: LV.ink,
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          width: 110, height: 30, background: '#0a0a0a', borderRadius: 20, zIndex: 3,
        }}/>
        <div style={{
          height: 44, padding: '0 22px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 600, color: LV.ink,
        }}>
          <span>9:41</span>
          <div style={{ width: 40 }}/>
        </div>

        {/* Mobile top */}
        <div style={{
          padding: '6px 16px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase',
            fontWeight: 700, color: LV.inkLo,
          }}>Fri · April 17</div>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: LV.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>FA</div>
        </div>

        <div className="frame-scroll" style={{ flex: 1, overflow: 'auto' }}>
          <LVBody caughtUp={caughtUp} onHeroComplete={() => setCaughtUp(true)} isMobile={true}/>
        </div>

        {/* Bottom nav */}
        <div style={{
          borderTop: `1px solid ${LV.line}`,
          padding: '10px 24px 26px', background: LV.paper,
          display: 'flex', justifyContent: 'space-around',
        }}>
          {[['Today', true], ['Schools', false], ['Library', false]].map(([l, on]) => (
            <div key={l} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: on ? LV.ink : LV.inkLo,
              fontSize: 11, fontWeight: on ? 700 : 500, position: 'relative',
              fontStyle: on ? 'italic' : 'normal',
            }}>
              {on && <div style={{
                position: 'absolute', top: -10, width: 24, height: 3,
                background: LV.red, borderRadius: 2,
              }}/>}
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') Object.assign(window, { LVDesktopFrame, LVMobileFrame, LV });

export { LVDesktopFrame, LVMobileFrame };
