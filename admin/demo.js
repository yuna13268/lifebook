'use strict';
// Fictional, memory-only demo. Never reads or writes production customer data.
// 모든 이름·번호·이야기는 가상입니다. 새로고침하면 처음 상태로 돌아갑니다.
if (new URLSearchParams(location.search).get('demo') === '1') {
  const now = () => new Date().toISOString();
  const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
  const kst = ts => ts ? new Date(new Date(ts).getTime() + 9 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') : '';
  const later = d => new Date(Date.now() + d * 864e5).toISOString();
  const consentItems = ['개인정보 수집·이용', '음성 녹음과 보관', 'AI 처리 위탁(국외 이전 포함)', '책 제작 업체에 원고 제공', '오픈·진행 안내 수신'];
  const agreed = n => consentItems.map((item, i) => ({ item, agreed: i < n, agreed_on: i < n ? '2026-11-01' : null }));

  const c = {
    id: 1, code: 'DEMO-001', source: 'signup',
    guardian_name: '가상 자녀', guardian_contact: '010-1234-5678', guardian_gender: '여성', guardian_birthday: '1986-05-20',
    parent_name: '가상 부모님', parent_phone: '010-2345-6789', parent_gender: '여성', parent_birthday: '1951-03-14', parent_birth: '1951',
    hometown: '이야기 마을', job: '', family: '', notes: '서비스를 둘러보기 위한 창작 예시입니다. 실제 사람이 아닙니다.',
    status: '원고 작성', owner_id: 'demo', owner_name: '체험 담당자', delete_after: '2099-12-31',
    consents: agreed(3),
    plans: [
      { id: 1, week: 1, question_id: null, stage: 2, text: '학교가 끝나면 주로 어디에서 노셨어요?', status: '답변 도착', sent_at: ago(240) },
      { id: 2, week: 2, question_id: null, stage: 3, text: '처음으로 월급을 받던 날을 기억하세요?', status: '답변 도착', sent_at: ago(100) },
      { id: 3, week: 3, question_id: null, stage: 4, text: '결혼식 날 가장 기억에 남는 장면은 무엇인가요?', status: '승인' },
      { id: 4, week: 4, question_id: null, stage: 5, text: '자녀가 태어났을 때 어떤 마음이셨어요?', status: '승인' },
      { id: 5, week: 5, question_id: null, stage: null, text: '가장 좋아하던 노래와 그 노래에 얽힌 이야기가 있나요?', status: '초안' },
      { id: 6, week: 5, question_id: null, stage: 2, text: '냇가에는 주로 누구와 함께 가셨어요?', status: '초안', source: 'ai', reason: '"친구랑 냇가로 갔어"라는 말씀 → 함께 간 사람과 그 친구 이야기가 비어 있음', from_transcript_id: 1 },
    ],
    transcripts: [
      { id: 1, title: '학교가 끝나면 외 1개 질문', plan_id: 1, status: '녹취 도착', created: kst(ago(30)),
        raw: '학교가 끝나면 친구랑 냇가로 갔어. 다리 밑에 앉아서 발을 담그곤 했지. 집에 돌아오면 어머니가 저녁 먹으라고 부르셨어.',
        audio_name: '자녀 녹음 2026-11-23 19:12', audio_path: 'demo/child-1.wav', has_audio: true, stt_status: '완료', loop_status: '완료', loop_attempts: 0,
        versions: [{ id: 101, clean: '학교가 끝나면 친구와 냇가로 갔습니다. 다리 밑에 앉아 발을 물에 담그곤 했지요. 집에 돌아오면 어머니께서 저녁 먹으라고 부르셨습니다.', created: kst(ago(29)), editor: 'AI 초안', ai: true }],
        marks: [{ plan_id: 1, at: 0, text: '학교가 끝나면 주로 어디에서 노셨어요?' }, { plan_id: 2, at: 48, text: '처음으로 월급을 받던 날을 기억하세요?' }] },
      { id: 2, title: '처음으로 월급을 받던 날을 기억하세요?', plan_id: 2, status: '녹취 도착', created: kst(ago(5)),
        raw: '[AI 0:00] 안녕하세요, 어머님. 모아온 AI예요. 오늘은 처음 월급 받던 날 이야기를 여쭤봐도 될까요?\n\n[어머님 0:09] 아이고, 그럼요. 그게 벌써 오십 년도 넘었네.\n\n[AI 0:15] 그날 월급봉투를 받고 제일 먼저 무엇을 하셨어요?\n\n[어머님 0:21] 시장에 가서 어머니 드릴 내복을 샀지. 빨간 내복. 그거 들고 집에 가는데 발걸음이 그렇게 가벼울 수가 없었어.\n\n[AI 0:38] 정말 뿌듯하셨겠어요. 어머님께서는 뭐라고 하셨나요?\n\n[어머님 0:44] 아무 말씀 안 하시고 그냥 한참을 만지작거리시더라고.',
        audio_name: 'AI 대화(링크) 2026-11-24 10:05', audio_path: null, has_audio: false, versions: [], stt_status: '건너뜀', stt_note: 'AI 대화 기록이 이미 글로 들어와 있습니다.', loop_status: '정리', loop_attempts: 1,
        marks: [{ plan_id: 2, at: 0, text: '처음으로 월급을 받던 날을 기억하세요?' }] },
      { id: 3, title: '결혼식 날 가장 기억에 남는 장면은 무엇인가요?', plan_id: 3, status: '녹취 도착', created: kst(ago(2)), raw: '',
        audio_name: '부모님 녹음 2026-11-24 13:40', audio_path: 'demo/parent-3.wav', has_audio: true, versions: [],
        stt_status: '실패', stt_note: '말소리가 너무 작아 글로 옮기지 못했습니다. 음성을 들어 보고 직접 옮기거나 다시 시도해 주세요.', loop_status: '실패', loop_note: '음성을 글로 옮기지 못해 정리를 멈췄습니다.', loop_attempts: 0,
        marks: [{ plan_id: 3, at: 0, text: '결혼식 날 가장 기억에 남는 장면은 무엇인가요?' }] },
    ],
    clips: [
      { id: 1, customer_id: 1, story_id: 1, transcript_id: 1, title: '냇가에서 보낸 오후', audio_path: '1/clip-demo-1.wav', start_sec: 0, end_sec: 48, duration_secs: 48, token: 'DemoToken-Demo_Token01', created_at: ago(20), revoked_at: null, play_count: 3, last_played_at: ago(3) },
      { id: 2, customer_id: 1, story_id: 1, transcript_id: 1, title: '냇가 (처음 자른 것)', audio_path: '1/clip-demo-0.wav', start_sec: 0, end_sec: 60, duration_secs: 60, token: 'DemoToken-Demo_Token00', created_at: ago(30), revoked_at: ago(21), play_count: 0, last_played_at: null },
    ],
    stories: [{ id: 1, title: '냇가에서 보낸 오후', body: '학교가 끝나면 친구랑 냇가로 갔어. 다리 밑에 앉아서 발을 담그곤 했지. 집에 돌아오면 어머니가 저녁 먹으라고 부르셨어.', status: '확정', era: '학창 시절', tags: '', sensitive_note: '', updated: now(), transcript_id: 1 }],
    links: [
      { id: 3, audience: 'parent', created_at: ago(30), expires_at: later(88), revoked_at: null, last_used_at: ago(2), upload_count: 1 },
      { id: 2, audience: 'child', created_at: ago(200), expires_at: later(80), revoked_at: null, last_used_at: ago(30), upload_count: 1 },
      { id: 1, audience: 'child', created_at: ago(400), expires_at: later(70), revoked_at: ago(210), last_used_at: null, upload_count: 0 },
    ],
    ai_sessions: [
      { id: 'demo-s3', customer_id: 1, channel: 'web', plan_ids: [2], status: '완료', created_at: ago(5), ended_at: ago(4.9), duration_secs: 312, failure: null, transcript_id: 2, audio_pending: true, safety_note: '체험용 예시: 요즘 잠을 잘 못 주무신다고 하셨습니다. 보호자께 안부 확인을 권해 주세요.' },
      { id: 'demo-s2', customer_id: 1, channel: 'web', plan_ids: [2, 3], status: '실패', created_at: ago(26), ended_at: ago(26), duration_secs: 14, failure: '부모님 말씀이 기록되지 않았습니다 (바로 닫힘)', transcript_id: null, audio_pending: false },
      { id: 'demo-s1', customer_id: 1, channel: 'web', plan_ids: [1], status: '준비', created_at: ago(50), ended_at: null, duration_secs: null, failure: null, transcript_id: null, audio_pending: false },
    ],
  };
  const c2 = {
    id: 2, code: 'DEMO-002', source: 'manual', guardian_name: '가상 아들', guardian_contact: '010-3456-7890', guardian_gender: '남성', guardian_birthday: null,
    parent_name: '가상 아버님', parent_phone: '', parent_gender: '남성', parent_birthday: null, parent_birth: '1947',
    hometown: '바닷가 마을', job: '', family: '', notes: '', status: '동의 완료', owner_id: 'demo', owner_name: '체험 담당자', delete_after: '2099-12-31',
    clips: [], consents: agreed(2), plans: [{ id: 21, week: 1, question_id: null, text: '어린 시절 살던 집은 어떤 모습이었나요?', status: '승인' }], transcripts: [], stories: [], links: [], ai_sessions: [], book: null,
  };
  const customers = [c, c2];
  let usageCap = 20, memoryOn = true;
  const memory = {
    1: { customer_id: 1, enabled: true, summary: '학창 시절 냇가에서 친구들과 놀던 이야기를 해 주셨다. 함께 간 친구가 누구였는지, 그 친구와 지금도 연락하는지는 아직 듣지 못했다.', confirmed_at: ago(48), confirmed_by: 'demo',
      draft: '첫 월급으로 어머니께 빨간 내복을 사 드린 이야기를 해 주셨다. 그때 어머니가 하신 말씀과, 월급을 받던 일터가 어떤 곳이었는지는 아직 듣지 못했다.', draft_from: [2], draft_at: ago(4),
      forget_note: '시댁 식구 이야기는 기억하지 말아 달라고 하셨습니다.', forget_at: ago(5) },
  };
  const memView = id => { const m = memory[id] || { customer_id: +id, enabled: true, summary: null, draft: null, draft_from: [], forget_note: null };
    return { ...m, global: memoryOn, exists: !!memory[id], confirmed: kst(m.confirmed_at), confirmed_name: m.confirmed_by ? '체험 담당자' : '', draft_when: kst(m.draft_at), forget_when: kst(m.forget_at) }; };
  const templates = {
    message_template: '{보호자}님, 안녕하세요. 모아온입니다.\n이번 주에 {부모님}님께 드리는 질문이에요.\n\n{질문}\n\n{링크}\n\n편하게 말씀하시듯 녹음해서 보내 주세요. 길지 않아도 괜찮습니다.',
    parent_message_template: '{부모님}님, 안녕하세요. 모아온입니다.\n이번 주에 여쭙고 싶은 이야기예요.\n\n{질문}\n\n{링크}\n\n편하신 때에 말씀하시듯 답해 주시면 됩니다.',
  };
  const byId = id => customers.find(x => x.id === +id);
  let book = { customer_id: 1, title: '내가 기억하기 전의 이야기', subtitle: '학교가 끝나면 시작되던 작은 모험', author: '가상 부모님', dedication: '엄마의 이야기를 함께 듣는 이 시간이 오래 남기를.', story_ids: [1], revision: 1, parent_agreed: true, ai_agreed: false, consent_name: '가상 부모님', consent_evidence: '체험용 가상 동의 기록', consent_at: now(), share_scope: '가족 비공개', print_checks: {} }, runs = [], approved = false;
  const clone = x => JSON.parse(JSON.stringify(x));
  const meta = { customerStatus: ['신청', '동의 완료', '인터뷰 중', '원고 작성', '고객 확인', '인쇄', '배송', '보관'], planStatus: ['초안', '승인', '보냄', '답변 도착', '건너뜀'], transcriptStatus: ['녹취 도착', '정리 중', '정리 완료', '고객 확인', '확정'], storyStatus: ['초안', '고객 확인', '확정'], consentItems, today: kst(now()).slice(0, 10) };
  const catalog = Promise.all([fetch('skills.json').then(r => r.json()), fetch('questions.json').then(r => r.json()), import('./engine.mjs')]);
  // 체험용 무음 음성 (2분). 재생 위치 이동을 시험할 수 있게 길이만 있는 파일을 만든다.
  const silent = {};
  const silence = (secs = 120) => {
    if (silent[secs]) return silent[secs];
    const rate = 8000, n = rate * secs, buf = new DataView(new ArrayBuffer(44 + n));
    const str = (o, s) => [...s].forEach((ch, i) => buf.setUint8(o + i, ch.charCodeAt(0)));
    str(0, 'RIFF'); buf.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
    buf.setUint32(24, rate, true); buf.setUint32(28, rate, true); buf.setUint16(32, 1, true); buf.setUint16(34, 8, true); str(36, 'data'); buf.setUint32(40, n, true);
    for (let i = 0; i < n; i++) buf.setUint8(44 + i, 128);
    return (silent[secs] = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  };
  const withC = (r, x) => ({ ...r, customer_id: x.id, code: x.code, parent_name: x.parent_name, guardian_name: x.guardian_name });
  const SOURCES = ['자녀 녹음', '부모님 녹음', 'AI 전화', 'AI 대화(링크)'];

  window.MOAON_DEMO = {
    audioUrl(path) { let cl = null; customers.forEach(x => x.clips.forEach(k => { if (k.audio_path === path) cl = k; })); return silence(cl ? Math.max(1, Math.round(cl.duration_secs)) : 120); },
    async createClip(cid, meta, blob) {
      const x = byId(cid), id = Date.now(), token = 'Demo' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      x.clips.push({ id, customer_id: x.id, ...meta, duration_secs: Math.round(meta.duration_secs), audio_path: `${x.id}/clip-${id}.wav`, token, created_at: now(), revoked_at: null, play_count: 0, last_played_at: null, size: blob.size });
      return { id, token };
    },
    async interview(b) {
      // 체험에서는 설정이 끝난 상태를 보여 주되, 실제로 전화를 걸지는 않는다
      if (b.action === 'config') return { key: true, agent: true, phone: false, webhook: true, policy: true, telephony: 'twilio', web_ready: true, phone_ready: false };
      const x = byId(b.customer_id);
      if (!x) throw new Error('고객을 찾을 수 없습니다.');
      if (b.action === 'call') {
        if (b.confirm !== true) throw new Error('부모님께 AI 전화가 간다는 것을 미리 알렸는지 확인해 주세요.');
        if (!x.parent_phone) throw new Error("'정보' 탭에 부모님 휴대폰 번호를 입력해 주세요.");
        x.ai_sessions.unshift({ id: 'demo-' + Date.now(), customer_id: x.id, channel: 'phone', plan_ids: (b.plan_ids || []).slice(0, 3), status: '거는 중', created_at: now(), ended_at: null, duration_secs: null, failure: null, transcript_id: null, audio_pending: false });
        return { ok: true, session_id: x.ai_sessions[0].id };
      }
      if (b.action === 'fetch_audio') {
        const s = x.ai_sessions.find(s => s.id === b.session_id);
        if (!s || !s.transcript_id) throw new Error('다시 가져올 녹음이 없습니다.');
        const t = x.transcripts.find(t => t.id === s.transcript_id);
        t.audio_path = 'demo/ai-' + s.id + '.wav'; t.has_audio = true; s.audio_pending = false;
        return { ok: true };
      }
      throw new Error('알 수 없는 요청입니다.');
    },
    async agent(b) {
      if (b.action === 'loop_restart') {
        let t = null; customers.forEach(x => x.transcripts.forEach(k => { if (k.id === +b.transcript_id) t = k; }));
        if (!t) throw new Error('이 고객의 녹취를 선택해 주세요.');
        const hasRaw = !!String(t.raw || '').trim(), redo = b.redo_stt === true || !hasRaw;
        if (redo && !t.has_audio) throw new Error('글로 옮길 음성 파일이 없습니다. 원문을 직접 입력해 주세요.');
        if (redo && hasRaw && b.confirm !== true) return { need_confirm: true, message: '지금 원문을 지우고 음성을 다시 글로 옮길까요? 지운 원문은 되살릴 수 없습니다.' };
        Object.assign(t, { loop_status: '대기', loop_note: null, loop_attempts: 0 }, redo ? { raw: '', stt_status: '대기', stt_note: null } : {});
        return { ok: true };
      }
      const [skills, questions, engine] = await catalog;
      if (b.action === 'config') return { version: engine.VERSION, ai_enabled: false, key_configured: false, policy_confirmed: false, skills, questions };
      if (b.action === 'workspace') return clone({ book, runs, stories: book.story_ids.map(id => c.stories.find(s => s.id === id)).filter(Boolean), approval_current: approved, expired: false });
      if (b.action === 'run') {
        if (!book.parent_agreed) throw new Error('부모님 참여 동의를 기록해 주세요.');
        const sources = b.transcript_id ? c.transcripts.map(t => ({ id: t.id, type: 'transcript', title: t.title, body: t.raw })) : b.use_stories ? c.stories.map(s => ({ ...s, type: 'story' })) : [];
        if (b.skill !== 'interview' && !sources.length) throw new Error('작업할 자료를 선택해 주세요.');
        const r = { id: crypto.randomUUID(), customer_id: 1, skill: b.skill, mode: 'local', created_at: now(), result: engine.localRun(b.skill, sources, questions), source_refs: sources.map(s => ({ id: s.id, type: s.type })) }; runs.unshift(r); return clone({ run: r });
      }
      if (b.action === 'save_result') { if (b.target === 'clean') { c.transcripts[0].versions.unshift({ id: Date.now(), clean: b.body, created: kst(now()), editor: '체험 담당자' }); } else { c.stories.push({ id: c.stories.length + 1, title: b.title, body: b.body, status: '초안', era: '', tags: '', sensitive_note: '', updated: now() }); } return { ok: true }; }
      if (b.action === 'consent') { book = { ...book, parent_agreed: b.parent_agreed, ai_agreed: b.ai_agreed, consent_name: b.name, consent_evidence: b.evidence, share_scope: b.share_scope }; approved = false; }
      if (b.action === 'save_book') { book = { ...book, title: b.title, subtitle: b.subtitle, author: b.author, dedication: b.dedication, story_ids: b.story_ids }; approved = false; }
      if (b.action === 'approve') { if (book.story_ids.some(id => c.stories.find(s => s.id === id)?.status !== '확정')) throw new Error('이야기를 먼저 확정해 주세요.'); book = { ...book, review_name: b.name, review_evidence: b.evidence, approved_at: now() }; approved = true; }
      if (b.action === 'print_ready') { if (!approved || Object.values(b.checks).some(v => !v)) throw new Error('원고 승인과 확인 항목을 완료해 주세요.'); book = { ...book, print_checks: b.checks, print_requested_at: now() }; }
      book.revision++; return clone({ book });
    },
    async call(method, path, b = {}) {
      let m;
      if (path === '/state') return { loggedIn: true, needsSetup: false };
      if (path === '/me') return { id: 'demo', name: '체험 담당자', role: 'admin' };
      if (path === '/meta') return meta;
      if (path === '/team' || path === '/users') return [{ id: 'demo', name: '체험 담당자', role: 'admin', email: '가상 계정' }];
      if (path === '/logout') { location.href = './'; return {}; }
      if (path === '/dashboard') {
        const byStatus = {}; customers.forEach(x => { byStatus[x.status] = (byStatus[x.status] || 0) + 1; });
        return { total: customers.length, byStatus, soon: [], readyToSend: customers.reduce((n, x) => n + x.plans.filter(p => p.status === '승인').length, 0), draftPlans: 1, newTranscripts: c.transcripts.filter(t => t.status === '녹취 도착').length, unassigned: 0 };
      }
      if (path === '/customers' && method === 'GET') return clone(customers.map(x => ({ ...x, book: x.id === 1 ? book : null })));
      if (method === 'POST' && path === '/customers') {
        const id = customers.length + 1, x = { ...b, id, code: 'DEMO-' + String(id).padStart(3, '0'), status: '신청', owner_id: 'demo', owner_name: '체험 담당자', delete_after: null, consents: agreed(0), plans: [], transcripts: [], stories: [], links: [], ai_sessions: [], book: null };
        ['guardian_gender', 'parent_gender', 'guardian_birthday', 'parent_birthday'].forEach(k => { if (!x[k]) x[k] = null; });
        customers.push(x); return { id, code: x.code };
      }
      if ((m = path.match(/^\/customers\/(\d+)$/))) {
        const x = byId(m[1]); if (!x) throw new Error('고객을 찾을 수 없습니다.');
        if (method === 'GET') return clone({ ...x, memory: memView(x.id), book: x.id === 1 ? book : x.book, ai_sessions: x.ai_sessions.map(s => ({ ...s, created: kst(s.created_at), ended: kst(s.ended_at) })) });
        if (method === 'PUT') { Object.entries(b).forEach(([k, v]) => { x[k] = v === '' && /gender|birthday|delete_after|delivered_at/.test(k) ? null : v; }); return { ok: true }; }
      }
      if ((m = path.match(/^\/customers\/(\d+)\/consents$/)) && method === 'PUT') { byId(m[1]).consents = b.consents.map(r => ({ ...r, agreed_on: r.agreed ? (r.agreed_on || meta.today) : null })); return { ok: true }; }
      if (path === '/questions') return (await catalog)[1].map((q, i) => ({ ...q, id: i + 1, era: '', sort: i + 1, active: true, stage: q.stage || null }));
      if ((m = path.match(/^\/customers\/(\d+)\/plans\/bulk$/))) {
        const x = byId(m[1]), bank = (await catalog)[1].map((q, i) => ({ ...q, id: i + 1 }));
        const used = new Set(x.plans.map(p => p.question_id).filter(Boolean)), week = x.plans.reduce((w, p) => Math.max(w, p.week), 0) + 1;
        const add = bank.filter(q => b.question_ids.includes(q.id) && !used.has(q.id));
        add.forEach((q, i) => x.plans.push({ id: Date.now() + i, week, question_id: q.id, text: q.text, status: '초안', stage: q.stage || null }));
        return { ok: true, count: add.length, skipped: b.question_ids.length - add.length };
      }
      if (path === '/settings' && method === 'GET') return clone(templates);
      if (path === '/settings' && method === 'PUT') { Object.keys(templates).forEach(k => { if (k in b) templates[k] = b[k]; }); return { ok: true }; }
      if (path === '/queue') {
        const live = (x, aud) => x.links.filter(l => (l.audience || 'child') === aud && !l.revoked_at && l.expires_at > now()).sort((p, q) => (p.expires_at < q.expires_at ? 1 : -1))[0] || null;
        const list = customers.map(x => ({ id: x.id, code: x.code, guardian_name: x.guardian_name, guardian_contact: x.guardian_contact, parent_name: x.parent_name, parent_phone: x.parent_phone, parent_gender: x.parent_gender,
          drafts: x.plans.filter(p => p.status === '초안'), ready: x.plans.filter(p => p.status === '승인'), links: { child: live(x, 'child'), parent: live(x, 'parent') } })).filter(x => x.drafts.length || x.ready.length);
        return clone({ templates, customers: list });
      }
      if (path === '/queue/sent') { let n = 0; customers.forEach(x => x.plans.forEach(p => { if (b.plan_ids.includes(p.id) && p.status === '승인') { p.status = '보냄'; p.sent_at = now(); n++; } })); return { ok: true, count: n }; }
      if (path === '/activity') return [];
      if (path === '/settings/memory') { if (method === 'PUT') memoryOn = !!b.enabled; return { enabled: memoryOn }; }
      if ((m = path.match(/^\/customers\/(\d+)\/memory$/))) {
        const mm = memory[m[1]] = memory[m[1]] || { customer_id: +m[1], enabled: true, summary: null, draft: null, draft_from: [], forget_note: null };
        if ('summary' in b) { mm.summary = b.summary || null; mm.confirmed_at = mm.summary ? now() : null; mm.confirmed_by = mm.summary ? 'demo' : null; }
        if ('draft' in b) { mm.draft = null; mm.draft_from = []; mm.draft_at = null; }
        if ('enabled' in b) mm.enabled = !!b.enabled;
        return { ok: true };
      }
      if (path.startsWith('/usage')) {
        const mon = back => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
        if (path === '/usage/cap') { usageCap = Math.round(+b.cap * 100) / 100; if (!(usageCap >= 1)) throw new Error('상한은 1달러에서 10,000달러 사이로 적어 주세요.'); return { ok: true, cap: usageCap }; }
        const m0 = mon(0), m1 = mon(1), m2 = mon(2);
        const rows = [
          { month: m0, customer_id: 1, kind: 'llm', calls: 42, input_tokens: 310000, output_tokens: 96000, seconds: 0, cost_usd: 4.10 },
          { month: m0, customer_id: 1, kind: 'stt', calls: 6, input_tokens: 0, output_tokens: 0, seconds: 2460, cost_usd: 1.60 },
          { month: m0, customer_id: 1, kind: 'voice', calls: 3, input_tokens: 0, output_tokens: 0, seconds: 1320, cost_usd: 7.30 },
          { month: m0, customer_id: 2, kind: 'llm', calls: 11, input_tokens: 80000, output_tokens: 21000, seconds: 0, cost_usd: 1.20 },
          { month: m0, customer_id: null, kind: 'stt', calls: 4, input_tokens: 0, output_tokens: 0, seconds: 4800, cost_usd: 3.00 },
          { month: m1, customer_id: 1, kind: 'llm', calls: 20, input_tokens: 150000, output_tokens: 40000, seconds: 0, cost_usd: 6.40 },
          { month: m2, customer_id: 1, kind: 'llm', calls: 4, input_tokens: 30000, output_tokens: 9000, seconds: 0, cost_usd: 0.90 },
        ].map(r => ({ ...r, code: (byId(r.customer_id) || {}).code || '', parent_name: (byId(r.customer_id) || {}).parent_name || '' }));
        if (path === '/usage/summary') return { spend: rows.filter(r => r.month === m0).reduce((x, r) => x + r.cost_usd, 0), cap: usageCap, cap_set: true };
        return clone({ month: m0, months: [m0, m1, m2], cap: usageCap, cap_set: true, rows });
      }
      if (path === '/today') {
        const proposals = [], reviews = [], problems = []; let running = 0;
        customers.forEach(x => {
          const who = { code: x.code, parent_name: x.parent_name, parent_gender: x.parent_gender, customer_id: x.id };
          x.plans.filter(p => p.status === '초안').forEach(p => { const f = x.transcripts.find(t => t.id === p.from_transcript_id); proposals.push({ ...p, ...who, source: p.source || 'staff', from: f ? { title: f.title, created: f.created } : null }); });
          x.transcripts.filter(t => ['녹취 도착', '정리 중'].includes(t.status)).forEach(t => {
            const base = { ...t, ...who }, latest = t.versions[0], hasRaw = !!String(t.raw || '').trim();
            if (['대기', '교정', '정리', '질문'].includes(t.loop_status)) running++;
            if (latest && latest.ai && hasRaw) reviews.push({ ...base, draft: latest.clean, draft_id: latest.id, draft_at: latest.created });
            else if (t.stt_status === '실패' || t.loop_status === '실패' || t.loop_status === '건너뜀' || (t.has_audio && !hasRaw && !['대기', '진행 중'].includes(t.stt_status))) problems.push(base);
          });
        });
        return clone({ proposals, reviews, problems, running });
      }
      if (path === '/plans/approve') { let n = 0; customers.forEach(x => x.plans.forEach(p => { const it = b.items.find(i => i.id === p.id); if (it && p.status === '초안') { p.status = '승인'; if (it.text) p.text = it.text; n++; } })); return { ok: true, count: n }; }
      if ((m = path.match(/^\/transcripts\/(\d+)\/confirm$/))) { customers.forEach(x => x.transcripts.forEach(t => { if (t.id === +m[1]) { t.versions.unshift({ id: Date.now(), clean: b.clean, created: kst(now()), editor: '체험 담당자', ai: false }); t.status = '정리 완료'; } })); return { ok: true }; }
      if (path === '/destruction') return { due: [], log: [] };
      if (path === '/recordings') {
        const arrivals = [], links = [], sessions = [];
        customers.forEach(x => {
          x.transcripts.forEach(t => { const source = SOURCES.find(k => (t.audio_name || '').startsWith(k)); if (source) arrivals.push({ ...withC(t, x), source, created_at: t.created }); });
          x.links.forEach(l => links.push(withC(l, x)));
          x.ai_sessions.forEach(s => sessions.push({ ...withC(s, x), created: kst(s.created_at) }));
        });
        arrivals.sort((p, q) => (q.created > p.created ? 1 : -1));
        return clone({ arrivals, links, sessions });
      }
      if ((m = path.match(/^\/customers\/(\d+)\/links$/))) {
        const x = byId(m[1]);
        if (method === 'GET') return clone(x.links);
        const l = { id: Date.now(), audience: b.audience === 'parent' ? 'parent' : 'child', created_at: now(), expires_at: later(90), revoked_at: null, last_used_at: null, upload_count: 0 };
        x.links.unshift(l);
        return { id: l.id, url: 'https://example.invalid/r/#k=체험용-가상-링크-실제로-열리지-않습니다', expires_at: l.expires_at, audience: l.audience };
      }
      if ((m = path.match(/^\/clips\/(\d+)\/revoke$/))) { customers.forEach(x => x.clips.forEach(cl => { if (cl.id === +m[1]) cl.revoked_at = now(); })); return { ok: true }; }
      if ((m = path.match(/^\/links\/(\d+)\/revoke$/))) { customers.forEach(x => x.links.forEach(l => { if (l.id === +m[1]) l.revoked_at = now(); })); return { ok: true }; }
      if ((m = path.match(/^\/plans\/(\d+)$/)) && method === 'PUT') { customers.forEach(x => x.plans.forEach(p => { if (p.id === +m[1]) Object.assign(p, b); })); return { ok: true }; }
      if ((m = path.match(/^\/customers\/(\d+)\/plans$/)) && method === 'POST') { const x = byId(m[1]); x.plans.push({ id: Date.now(), week: +b.week || x.plans.length + 1, text: b.text, status: '초안' }); return { ok: true }; }
      if (method === 'POST' && path === '/customers/1/stories') { c.stories.push({ ...b, id: c.stories.length + 1, status: '초안', updated: now() }); approved = false; return { ok: true }; }
      if (method === 'PUT' && /^\/stories\/\d+$/.test(path)) { Object.assign(c.stories.find(s => s.id === +path.split('/')[2]), b); approved = false; return { ok: true }; }
      if ((m = path.match(/^\/transcripts\/(\d+)$/)) && method === 'PUT') { customers.forEach(x => x.transcripts.forEach(t => { if (t.id === +m[1]) Object.assign(t, b); })); return { ok: true }; }
      if (method === 'POST' && /^\/transcripts\/\d+\/versions$/.test(path)) { const t = c.transcripts.find(t => t.id === +path.split('/')[2]); t.versions.unshift({ id: Date.now(), clean: b.clean, created: kst(now()), editor: '체험 담당자' }); return { ok: true }; }
      if ((m = path.match(/^\/customers\/(\d+)\/export$/))) return { path: '체험에서는 파일을 만들지 않습니다' };
      throw new Error('이 기능은 실제 관리자로 로그인한 뒤 사용할 수 있습니다.');
    },
  };
}
