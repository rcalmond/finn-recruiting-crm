fetch('/api/prep-for-call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    school: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Stevens Institute of Technology',
      division: 'D3',
      conference: 'MAC',
      location: 'Hoboken, NJ',
      status: 'Ongoing Conversation',
      head_coach: 'Coach Smith',
      admit_likelihood: 'Target',
      notes: 'Runs a 3-4-3. Coach watched film and reached out. Interested in Finn as a wingback.',
      category: 'A',
      videos_sent: true,
      sort_order: 1,
      short_name: 'Stevens',
      coach_email: null,
      rq_status: null,
      last_contact: '2026-04-10',
      id_camp_1: null,
      id_camp_2: null,
      id_camp_3: null,
      created_at: '2026-01-01',
      updated_at: '2026-04-10'
    },
    recentLogs: [],
    globalQuestions: [
      {
        id: '00000000-0000-0000-0000-000000000101',
        category: 'Formation & Fit',
        question: 'What formation do you typically play, and how do you use your wide players?',
        rationale: 'Confirms back-three system.',
        is_custom: false,
        sort_order: 1,
        created_at: '2026-01-01'
      },
      {
        id: '00000000-0000-0000-0000-000000000102',
        category: 'Roster & Playing Time',
        question: 'Are you actively recruiting left wingbacks for the 2027 class?',
        rationale: 'Direct roster fit question.',
        is_custom: false,
        sort_order: 4,
        created_at: '2026-01-01'
      }
    ]
  })
}).then(r => r.json()).then(d => {
  if (d.error) { console.error('ERROR:', d.error); return }
  console.log('SUMMARY:', d.call_summary)
  console.log('OVERRIDES:', d.overrides)
  console.log('SPECIFIC:', d.school_specific_questions)
})
