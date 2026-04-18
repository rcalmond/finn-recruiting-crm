// Library landing — V4 Liverpool system, restrained
// Matches school-detail.jsx tokens exactly

const LIB_SDF = `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
const LIB = {
  paper: '#F6F1E8', paperDeep: '#EFE8D8',
  ink: '#0E0E0E', inkSoft: '#1F1F1F', inkMid: '#4A4A4A',
  inkLo: '#7A7570', inkMute: '#A8A39B',
  line: '#E2DBC9', line2: '#D3CAB3',
  red: '#C8102E', tealDeep: '#006A65',
};

function LibSidebar() {
  const nav = (label, count, on) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: on ? LIB.ink : 'transparent',
      cursor: 'pointer', fontSize: 14,
      color: on ? '#fff' : LIB.inkMid,
      fontWeight: on ? 600 : 450, letterSpacing: -0.1,
    }}>
      <span>{label}</span>
      {count !== null && <span style={{
        marginLeft: 'auto', padding: '1px 7px', borderRadius: 10,
        background: on ? LIB.red : 'transparent',
        color: on ? '#fff' : LIB.inkLo, fontSize: 11, fontWeight: 700,
      }}>{count}</span>}
    </div>
  );
  return (
    <aside style={{
      width: 232, background: LIB.paper, borderRight: `1px solid ${LIB.line}`,
      padding: '22px 12px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 24px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: LIB.red, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, fontStyle: 'italic',
        }}>F</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: LIB.ink, letterSpacing: -0.4 }}>finnsoccer</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav('Today', 3, false)}
        {nav('Schools', 32, false)}
        {nav('Library', null, true)}
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${LIB.line}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: LIB.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>FA</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 650, color: LIB.ink }}>Finn Almond</div>
          <div style={{ fontSize: 11, color: LIB.inkLo }}>Class of '27 · CB/LB</div>
        </div>
      </div>
    </aside>
  );
}

// A single tile
function LibTile({ title, count, countLabel, blurb, samples, isMobile }) {
  return (
    <a href="#" style={{
      display: 'block', textDecoration: 'none',
      background: '#fff', borderRadius: 16,
      border: `1px solid ${LIB.line}`,
      padding: isMobile ? '22px 22px 24px' : '32px 32px 28px',
      color: LIB.ink, fontFamily: LIB_SDF,
      position: 'relative', overflow: 'hidden',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 14px 30px -20px rgba(0,0,0,0.2)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'none';
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: isMobile ? 14 : 20,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
          textTransform: 'uppercase', color: LIB.inkLo,
        }}>{countLabel}</div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: LIB.ink,
          fontVariantNumeric: 'tabular-nums',
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
        }}>
          <span style={{ fontSize: isMobile ? 22 : 28, letterSpacing: -0.8 }}>{count}</span>
          <span style={{ color: LIB.inkLo, fontWeight: 600, fontSize: 11 }}>items</span>
        </div>
      </div>

      <h2 style={{
        margin: 0, fontSize: isMobile ? 36 : 52, fontWeight: 700,
        letterSpacing: isMobile ? -1.4 : -2, color: LIB.ink,
        lineHeight: 1, fontStyle: 'italic', marginBottom: isMobile ? 14 : 18,
      }}>{title}.</h2>

      <div style={{
        fontSize: isMobile ? 14 : 15, color: LIB.inkMid,
        lineHeight: 1.5, letterSpacing: -0.1,
        maxWidth: 420, marginBottom: isMobile ? 20 : 28,
      }}>{blurb}</div>

      {/* Sample list — quiet preview */}
      <div style={{
        borderTop: `1px dashed ${LIB.line2}`, paddingTop: 14, marginBottom: 18,
      }}>
        {samples.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 0', fontSize: 13, color: LIB.inkMid, letterSpacing: -0.1,
          }}>
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s[0]}</span>
            <span style={{ fontSize: 11, color: LIB.inkLo, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>{s[1]}</span>
          </div>
        ))}
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 13, fontWeight: 650, color: LIB.ink, letterSpacing: -0.1,
      }}>
        Open {title.toLowerCase()}
        <span style={{
          width: 24, height: 24, borderRadius: '50%',
          background: LIB.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </div>
    </a>
  );
}

function LibHeader({ isMobile }) {
  return (
    <div style={{
      padding: isMobile ? '22px 20px 8px' : '60px 56px 20px',
    }}>
      <div style={{
        fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase',
        fontWeight: 700, color: LIB.inkLo, marginBottom: isMobile ? 10 : 14,
      }}>Your reference materials</div>
      <h1 style={{
        margin: 0, fontSize: isMobile ? 44 : 72, fontWeight: 700,
        letterSpacing: isMobile ? -1.8 : -3, color: LIB.ink,
        lineHeight: 0.95, fontStyle: 'italic',
      }}>Library.</h1>
      <div style={{
        marginTop: isMobile ? 14 : 18, fontSize: isMobile ? 14 : 16,
        color: LIB.inkMid, letterSpacing: -0.1, lineHeight: 1.5, maxWidth: 560,
      }}>
        Two stacks — the stuff you send to coaches, and the stuff you ask them. Everything else lives where you'd expect it.
      </div>
    </div>
  );
}

function LibBody({ isMobile }) {
  const assets = [
    ['Highlight reel · Dallas ECNL (2026)', 'MP4'],
    ['Full transcript · Spring \'26', 'PDF'],
    ['Sports Recruits profile', 'Link'],
    ['Academic resume', 'PDF'],
  ];
  const questions = [
    ['About the program', '5'],
    ['Roster & playing time', '4'],
    ['Campus life & academics', '3'],
    ['Recruiting process', '3'],
  ];
  return (
    <>
      <LibHeader isMobile={isMobile}/>
      <div style={{
        padding: isMobile ? '16px 16px 32px' : '28px 56px 56px',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? 16 : 24,
      }}>
        <LibTile
          title="Assets"
          countLabel="Files, videos, links"
          count="12"
          blurb="Resumes, transcripts, highlight reel, Sports Recruits link, and other reference materials you share with coaches."
          samples={assets}
          isMobile={isMobile}
        />
        <LibTile
          title="Questions"
          countLabel="Interview prep · by category"
          count="15"
          blurb="Questions to ask coaches during calls and campus visits, organized by category and saved for reuse."
          samples={questions}
          isMobile={isMobile}
        />
      </div>

      {/* Subtle footnote */}
      <div style={{
        padding: isMobile ? '0 20px 30px' : '0 56px 60px',
        fontSize: 12, color: LIB.inkLo, letterSpacing: -0.1,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: LIB.inkMute }}/>
        Looking for templates or past drafts? Those live inside Schools, under each conversation.
      </div>
    </>
  );
}

function LibDesktopFrame({ label }) {
  return (
    <div data-screen-label={label} style={{
      width: 1440, height: 960,
      display: 'flex', background: LIB.paper, color: LIB.ink,
      fontFamily: LIB_SDF, overflow: 'hidden', borderRadius: 10,
    }}>
      <LibSidebar/>
      <main className="frame-scroll" style={{ flex: 1, overflow: 'auto', background: LIB.paper }}>
        <LibBody isMobile={false}/>
      </main>
    </div>
  );
}

function LibMobileFrame({ label }) {
  return (
    <div data-screen-label={label} style={{
      width: 390, height: 844,
      borderRadius: 48, padding: 10, background: '#0a0a0a',
      boxShadow: '0 0 0 2px #222, 0 30px 80px -30px rgba(0,0,0,0.5)',
      fontFamily: LIB_SDF,
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 38,
        overflow: 'hidden', background: LIB.paper, color: LIB.ink,
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          width: 110, height: 30, background: '#0a0a0a', borderRadius: 20, zIndex: 3,
        }}/>
        <div style={{
          height: 44, padding: '0 22px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 600, color: LIB.ink,
        }}>
          <span>9:41</span>
          <div style={{ width: 40 }}/>
        </div>
        <div className="frame-scroll" style={{ flex: 1, overflow: 'auto' }}>
          <LibBody isMobile={true}/>
        </div>
        <div style={{
          borderTop: `1px solid ${LIB.line}`,
          padding: '10px 24px 26px', background: LIB.paper,
          display: 'flex', justifyContent: 'space-around',
        }}>
          {[['Today', false], ['Schools', false], ['Library', true]].map(([l, on]) => (
            <div key={l} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: on ? LIB.ink : LIB.inkLo,
              fontSize: 11, fontWeight: on ? 700 : 500, position: 'relative',
              fontStyle: on ? 'italic' : 'normal',
            }}>
              {on && <div style={{
                position: 'absolute', top: -10, width: 24, height: 3,
                background: LIB.red, borderRadius: 2,
              }}/>}
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LibDesktopFrame, LibMobileFrame });
