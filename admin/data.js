'use strict';
/* 관리자 화면과 Supabase를 잇는 곳.
   화면(app.js)은 API.call(method, path, body)만 부릅니다.
   누가 무엇을 볼 수 있는지는 여기가 아니라 DB의 권한 규칙(RLS)이 정합니다. */
const SUPABASE_URL = 'https://pxfwsjipjxvafefmgdbk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XUi0Id-De-VL6b2L6XDIsw_Xk9mg0Lk'; // 공개해도 되는 키입니다 (권한은 DB 규칙이 막음)
// 책 QR이 가리키는 공개 재생 페이지. 인쇄한 뒤에는 바꿀 수 없으니 인쇄 전에 주소를 확정한다.
const VOICE_PAGE = 'https://yuna13268.github.io/lifebook/v/';

const API = (() => {
  const sb = window.MOAON_DEMO ? null : supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'moaon-admin-auth' },
  });
  const META = {
    customerStatus: ['신청', '동의 완료', '인터뷰 중', '원고 작성', '고객 확인', '인쇄', '배송', '보관'],
    planStatus: ['초안', '승인', '보냄', '답변 도착', '건너뜀'],
    transcriptStatus: ['녹취 도착', '정리 중', '정리 완료', '고객 확인', '확정'],
    storyStatus: ['초안', '고객 확인', '확정'],
    consentItems: ['개인정보 수집·이용', '음성 녹음과 보관', 'AI 처리 위탁(국외 이전 포함)', '책 제작 업체에 원고 제공', '오픈·진행 안내 수신'],
  };
  const DEFAULT_TEMPLATE = '{보호자}님, 안녕하세요. 모아온입니다.\n이번 주에 {부모님}님께 드리는 질문이에요.\n\n{질문}\n\n{링크}\n\n편하게 말씀하시듯 녹음해서 보내 주세요. 길지 않아도 괜찮습니다.';
  // 부모님께 직접 보내는 문안: 짧고 쉬운 말로, 할 일은 '링크 누르기' 하나만
  const DEFAULT_PARENT_TEMPLATE = '{부모님}님, 안녕하세요. 모아온입니다.\n이번 주에 여쭙고 싶은 이야기예요.\n\n{질문}\n\n{링크}\n\n편하신 때에 말씀하시듯 답해 주시면 됩니다.';
  const SETTING_KEYS = { message_template: DEFAULT_TEMPLATE, parent_message_template: DEFAULT_PARENT_TEMPLATE };
  const AUDIO_TYPES = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', amr: 'audio/amr', ogg: 'audio/ogg', webm: 'audio/webm', mp4: 'audio/mp4' };
  const MAX_AUDIO = 50 * 1024 * 1024;
  const CUSTOMER_FIELDS = ['guardian_name', 'guardian_contact', 'parent_name', 'parent_phone', 'parent_birth', 'hometown', 'job', 'family', 'notes'];
  // 비워 두면 null로 저장하는 항목 (성별은 정해진 값만, 생년월일은 날짜만)
  const CUSTOMER_CHOICES = { guardian_gender: ['여성', '남성', '기타'], parent_gender: ['여성', '남성', '기타'] };
  const CUSTOMER_DATES = ['guardian_birthday', 'parent_birthday'];
  const phone = v => { const s = clean(v, 20); if (s && !/^[0-9+() -]+$/.test(s)) throw fail('휴대폰 번호는 숫자와 - 만 입력해 주세요.', 400); return s; };
  function customerRow(b, partial) {
    const row = {};
    CUSTOMER_FIELDS.forEach(f => { if (!partial || f in b) row[f] = f === 'guardian_contact' || f === 'parent_phone' ? phone(b[f]) : clean(b[f]); });
    Object.entries(CUSTOMER_CHOICES).forEach(([f, ok]) => { if (!partial || f in b) row[f] = ok.includes(b[f]) ? b[f] : null; });
    CUSTOMER_DATES.forEach(f => { if (!partial || f in b) row[f] = dateOrNull(b[f]); });
    return row;
  }

  let PROFILE = null;
  const kst = ts => ts ? new Date(new Date(ts).getTime() + 9 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') : '';
  const todayKST = () => kst(Date.now()).slice(0, 10);
  const fail = (msg, status) => { const e = new Error(msg); e.status = status; return e; };

  function check(error) {
    if (!error) return;
    const m = error.message || '오류가 발생했습니다.';
    if (error.code === '23505') throw fail('이미 있는 값입니다. (같은 질문을 두 번 넣을 수 없습니다.)');
    if (error.code === '42501' || /row-level security/i.test(m)) throw fail('권한이 없습니다.', 403);
    if (error.code === '23514') throw fail('입력한 값이 허용 범위를 벗어났습니다.');
    if (/JWT|not authenticated/i.test(m)) throw fail('로그인이 필요합니다.', 401);
    throw fail(m);
  }
  async function run(query) { const { data, error } = await query; check(error); return data; }

  async function session() { const { data } = await sb.auth.getSession(); return data.session; }
  async function me() {
    if (PROFILE) return PROFILE;
    const s = await session();
    if (!s) throw fail('로그인이 필요합니다.', 401);
    PROFILE = await run(sb.from('profiles').select('id,name,email,role').eq('id', s.user.id).single());
    return PROFILE;
  }
  const isAdmin = async () => (await me()).role === 'admin';
  async function needAdmin() { if (!(await isAdmin())) throw fail('관리자만 할 수 있습니다.', 403); }

  function log(action, target = '', detail = '') {
    sb.from('activity').insert({ action, target: String(target), detail: String(detail) }).then(() => {}, () => {});
  }

  async function fn(body, authed) {
    const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
    if (authed) { const s = await session(); if (!s) throw fail('로그인이 필요합니다.', 401); headers.Authorization = 'Bearer ' + s.access_token; }
    const r = await fetch(SUPABASE_URL + '/functions/v1/admin-api', { method: 'POST', headers, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(d.error || '요청을 처리하지 못했습니다.', r.status);
    return d;
  }

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email: String(email || '').trim(), password: String(password || '') });
    if (error) throw fail('이메일 또는 비밀번호가 맞지 않습니다.', 401);
    PROFILE = null;
    await me();
  }

  const clean = (v, n = 4000) => String(v == null ? '' : v).trim().slice(0, n);
  const stageOrNull = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null; };
  const dateOrNull = v => {
    v = clean(v, 10);
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw fail('날짜는 YYYY-MM-DD 형식으로 입력해 주세요.');
    return v;
  };

  async function teamMap() {
    const rows = await run(sb.from('profiles').select('id,name'));
    return Object.fromEntries(rows.map(r => [r.id, r.name]));
  }

  /* AI 인터뷰 기록 (서버 함수만 쓰고, 화면은 읽기만 한다). 표가 아직 없으면 빈 목록으로 둔다. */
  // '*': 배포 때 새 칸(safety_note 등)이 생겨도 화면이 깨지지 않게 있는 칸을 모두 읽는다
  const AI_COLS = '*';
  async function aiSessions(query) {
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) { console.warn('ai_sessions', error.message); return []; }
    return data.map(s => ({ ...s, created: kst(s.created_at), ended: kst(s.ended_at) }));
  }
  /* 녹음이 어디서 왔는지: audio_name 앞부분으로 구분한다 (record·interview 서버 함수가 붙인다) */
  const SOURCES = ['자녀 녹음', '부모님 녹음', 'AI 전화', 'AI 대화(링크)'];
  const sourceOf = name => SOURCES.find(k => String(name || '').startsWith(k)) || '';

  /* ---------- 경로별 처리 ---------- */
  const handlers = [];
  const route = (method, pattern, fnc) => handlers.push([method, new RegExp('^' + pattern + '$'), fnc]);

  route('GET', '/state', async () => {
    const needsSetup = await run(sb.rpc('needs_setup'));
    const s = await session();
    if (!s) return { needsSetup, loggedIn: false };
    const p = await me().catch(() => null);
    return { needsSetup: false, loggedIn: !!p, pending: !!p && p.role === 'pending' };
  });
  route('POST', '/setup', async (_, b) => {
    await fn({ action: 'setup', code: b.code, name: b.name, email: b.email, password: b.password }, false);
    await signIn(b.email, b.password);
    log('관리자 계정 생성');
    return { ok: true };
  });
  route('POST', '/login', async (_, b) => { await signIn(b.email, b.password); log('로그인'); return { ok: true }; });
  route('POST', '/logout', async () => { await sb.auth.signOut(); PROFILE = null; return { ok: true }; });
  route('GET', '/me', async () => { const p = await me(); return { id: p.id, name: p.name, role: p.role }; });
  route('GET', '/meta', async () => ({ ...META, today: todayKST() }));
  route('GET', '/team', async () => run(sb.from('profiles').select('id,name').in('role', ['admin', 'staff']).order('created_at')));

  route('GET', '/dashboard', async () => {
    const admin = await isAdmin();
    const customers = await run(sb.from('customers').select('id,code,status,delete_after,owner_id'));
    const byStatus = Object.fromEntries(META.customerStatus.map(s => [s, 0]));
    const limit = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const soon = [];
    customers.forEach(c => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      if (c.delete_after && c.delete_after <= limit) soon.push({ id: c.id, code: c.code, delete_after: c.delete_after });
    });
    const plans = await run(sb.from('plans').select('status').in('status', ['초안', '승인']));
    const tr = await run(sb.from('transcripts').select('id').eq('status', '녹취 도착'));
    return {
      total: customers.length, byStatus, soon,
      readyToSend: plans.filter(p => p.status === '승인').length,
      draftPlans: plans.filter(p => p.status === '초안').length,
      newTranscripts: tr.length,
      unassigned: admin ? customers.filter(c => !c.owner_id).length : 0,
    };
  });

  /* 오늘의 업무 = 한 바퀴 처리: ① AI(와 팀원)가 제안한 질문 초안 ② 확인할 AI 정리본 ③ 글로 옮기지 못했거나 자동 정리를 건너뛴 녹음.
     칸(source, reason, stt_status, loop_status …)은 ai-intro migration으로 생긴다. '*'로 읽어서 칸이 없어도 깨지지 않게 한다. */
  const LOOP_RUNNING = ['대기', '교정', '정리', '질문'];
  route('GET', '/today', async () => {
    const [drafts, trs, customers] = await Promise.all([
      run(sb.from('plans').select('*').eq('status', '초안').order('customer_id').order('week').order('id')),
      run(sb.from('transcripts').select('*, transcript_versions(id,clean,edited_by,created_at)').in('status', ['녹취 도착', '정리 중']).order('id', { ascending: false }).limit(80)),
      run(sb.from('customers').select('id,code,parent_name,parent_gender')),
    ]);
    const C = Object.fromEntries(customers.map(c => [c.id, c]));
    const who = r => ({ code: C[r.customer_id]?.code || '', parent_name: C[r.customer_id]?.parent_name || '', parent_gender: C[r.customer_id]?.parent_gender || null });
    const srcIds = [...new Set(drafts.map(p => p.from_transcript_id).filter(Boolean))];
    const srcs = srcIds.length ? await run(sb.from('transcripts').select('id,title,created_at').in('id', srcIds)) : [];
    const S = Object.fromEntries(srcs.map(t => [t.id, { title: t.title, created: kst(t.created_at) }]));
    const proposals = drafts.map(p => ({ ...p, ...who(p), source: p.source || 'staff', from: p.from_transcript_id ? S[p.from_transcript_id] || null : null }));
    const reviews = [], problems = [];
    let running = 0;
    trs.forEach(t => {
      const vers = (t.transcript_versions || []).sort((a, b) => b.id - a.id), latest = vers[0];
      const base = { id: t.id, customer_id: t.customer_id, title: t.title, status: t.status, created: kst(t.created_at), audio_name: t.audio_name, has_audio: !!t.audio_path,
        stt_status: t.stt_status || null, stt_note: t.stt_note || '', loop_status: t.loop_status || null, loop_note: t.loop_note || '', loop_attempts: t.loop_attempts || 0, ...who(t) };
      const hasRaw = !!String(t.raw || '').trim();
      if (LOOP_RUNNING.includes(t.loop_status)) running++;
      if (latest && !latest.edited_by && hasRaw) reviews.push({ ...base, raw: t.raw, draft: latest.clean, draft_id: latest.id, draft_at: kst(latest.created_at) });
      else if (t.stt_status === '실패' || t.loop_status === '실패' || t.loop_status === '건너뜀' || (t.audio_path && !hasRaw && !['대기', '진행 중'].includes(t.stt_status)))
        problems.push(base);
    });
    return { proposals, reviews, problems, running };
  });
  /* 질문 초안 여러 개를 한 번에 승인 (승인은 관리자만, DB 규칙). 고친 문장이 있으면 같이 저장한다. */
  route('POST', '/plans/approve', async (_, b) => {
    await needAdmin();
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 100);
    let n = 0;
    // 문장을 고치지 않은 것은 한 번에, 고친 것은 하나씩
    const plain = items.filter(it => !clean(it.text, 500)).map(it => +it.id).filter(Number.isSafeInteger);
    if (plain.length) n += (await run(sb.from('plans').update({ status: '승인' }).in('id', plain).eq('status', '초안').select('id'))).length;
    for (const it of items.filter(it => clean(it.text, 500))) {
      const r = await run(sb.from('plans').update({ status: '승인', text: clean(it.text, 500) }).eq('id', +it.id).eq('status', '초안').select('id'));
      n += r.length;
    }
    log('질문 승인', '', `${n}개`);
    return { ok: true, count: n };
  });
  /* AI 정리본 확인: 사람이 확인한 새 버전으로 저장하고 녹취를 '정리 완료'로 */
  route('POST', '/transcripts/(\\d+)/confirm', async ([id], b) => {
    const body = clean(b.clean, 200000);
    if (!body) throw fail('정리본이 비어 있습니다.');
    await run(sb.from('transcript_versions').insert({ transcript_id: +id, clean: body }));
    await run(sb.from('transcripts').update({ status: '정리 완료', updated_at: new Date().toISOString() }).eq('id', id));
    log('정리본 확인', id);
    return { ok: true };
  });

  route('GET', '/customers', async () => {
    // 고객마다 진행 단계를 계산할 수 있도록 상태 값만 가볍게 모은다 (본문·연락처는 읽지 않는다)
    const [list, names, plans, consents, trs, stories, books] = await Promise.all([
      run(sb.from('customers').select('*').order('id', { ascending: false })),
      teamMap(),
      run(sb.from('plans').select('customer_id,week,status')),
      run(sb.from('consents').select('customer_id,item,agreed')),
      run(sb.from('transcripts').select('customer_id,status')),
      run(sb.from('stories').select('customer_id,status')),
      run(sb.from('book_projects').select('customer_id,parent_agreed,ai_agreed,story_ids,approved_hash,approved_at,print_requested_at,share_scope')),
    ]);
    const by = rows => rows.reduce((m, r) => ((m[r.customer_id] = m[r.customer_id] || []).push(r), m), {});
    const P = by(plans), C = by(consents), T = by(trs), S = by(stories), B = Object.fromEntries(books.map(b => [b.customer_id, b]));
    const next = {};
    plans.filter(p => ['초안', '승인'].includes(p.status)).forEach(p => { next[p.customer_id] = Math.min(next[p.customer_id] || 1e9, p.week); });
    return list.map(c => ({ ...c, owner_name: names[c.owner_id] || '', next_week: next[c.id] || null,
      plans: P[c.id] || [], consents: C[c.id] || [], transcripts: T[c.id] || [], stories: S[c.id] || [], book: B[c.id] || null }));
  });

  route('POST', '/customers', async (_, b) => {
    const p = await me();
    const row = customerRow(b, false);
    row.owner_id = p.role === 'admin' ? (b.owner_id || p.id) : p.id;
    row.code = 'x';
    const c = await run(sb.from('customers').insert(row).select('id,code').single());
    await run(sb.from('consents').insert(META.consentItems.map(item => ({ customer_id: c.id, item, agreed: false }))));
    log('고객 등록', c.code);
    return { id: c.id, code: c.code };
  });

  /* 인터뷰 이어 듣기 (ai-intro interview_memory). 권한과 활동 기록은 DB 트리거가 맡는다. 표가 없으면 null. */
  async function memoryGlobal() {
    const r = await run(sb.from('settings').select('value').eq('key', 'ai_memory_enabled').maybeSingle());
    return !!r && r.value === 'true';
  }
  async function memoryOf(id, names) {
    const [{ data, error }, on] = await Promise.all([sb.from('interview_memory').select('*').eq('customer_id', id).maybeSingle(), memoryGlobal()]);
    if (error) { console.warn('interview_memory', error.message); return null; }
    const m = data || { customer_id: +id, enabled: true, summary: null, draft: null, draft_from: [], forget_note: null };
    return { ...m, global: on, exists: !!data, confirmed: kst(m.confirmed_at), confirmed_name: m.confirmed_by ? names[m.confirmed_by] || '' : '', draft_when: kst(m.draft_at), forget_when: kst(m.forget_at) };
  }
  route('PUT', '/customers/(\\d+)/memory', async ([id], b) => {
    const row = {};
    if ('summary' in b) { const t = b.summary == null ? null : clean(b.summary, 600); row.summary = t || null; }
    if ('draft' in b) { if (b.draft !== null) throw fail('AI 초안은 버리기만 할 수 있습니다.'); row.draft = null; }
    if ('enabled' in b) row.enabled = !!b.enabled;
    if (!Object.keys(row).length) return { ok: true };
    const has = await run(sb.from('interview_memory').select('customer_id').eq('customer_id', id).maybeSingle());
    if (has) await run(sb.from('interview_memory').update(row).eq('customer_id', id));
    else await run(sb.from('interview_memory').insert({ customer_id: +id, ...row }));
    return { ok: true };
  });
  route('GET', '/settings/memory', async () => ({ enabled: await memoryGlobal() }));
  route('PUT', '/settings/memory', async (_, b) => {
    await needAdmin();
    await run(sb.from('settings').upsert({ key: 'ai_memory_enabled', value: b.enabled ? 'true' : 'false' }));
    log(b.enabled ? 'AI 이어 듣기 전체 켬' : 'AI 이어 듣기 전체 끔');
    return { ok: true };
  });

  route('GET', '/customers/(\\d+)', async ([id]) => {
    const c = await run(sb.from('customers').select('*').eq('id', id).maybeSingle());
    if (!c) throw fail('고객을 찾을 수 없습니다.', 404);
    log('고객 조회', c.code);
    const [consents, plans, stories, ts, names, book] = await Promise.all([
      run(sb.from('consents').select('item,agreed,agreed_on').eq('customer_id', id)),
      run(sb.from('plans').select('*').eq('customer_id', id).order('week').order('id')),
      run(sb.from('stories').select('*').eq('customer_id', id).order('id')),
      run(sb.from('transcripts').select('*, transcript_versions(id,clean,created_at,edited_by)').eq('customer_id', id).order('id', { ascending: false })),
      teamMap(),
      run(sb.from('book_projects').select('*').eq('customer_id', id).maybeSingle()),
    ]);
    c.ai_sessions = await aiSessions(sb.from('ai_sessions').select(AI_COLS).eq('customer_id', id));
    { const { data, error } = await sb.from('voice_clips').select('*').eq('customer_id', id).order('id'); c.clips = error ? [] : data; if (error) console.warn('voice_clips', error.message); }
    c.memory = await memoryOf(id, names);
    c.consents = consents; c.plans = plans; c.book = book; c.owner_name = names[c.owner_id] || '';
    c.stories = stories.map(s => ({ ...s, updated: kst(s.updated_at) }));
    c.transcripts = ts.map(t => ({
      ...t, created: kst(t.created_at), has_audio: !!t.audio_path,
      versions: (t.transcript_versions || []).sort((a, b) => b.id - a.id)
        .map(v => ({ id: v.id, clean: v.clean, created: kst(v.created_at), ai: !v.edited_by, editor: v.edited_by ? names[v.edited_by] || '' : 'AI 초안' })),
    }));
    return c;
  });

  route('PUT', '/customers/(\\d+)', async ([id], b) => {
    const row = customerRow(b, true);
    if ('status' in b) row.status = b.status;
    if ('delivered_at' in b) row.delivered_at = dateOrNull(b.delivered_at);
    if ('delete_after' in b) row.delete_after = dateOrNull(b.delete_after);
    if ('owner_id' in b) { await needAdmin(); row.owner_id = b.owner_id || null; }
    if (!Object.keys(row).length) return { ok: true };
    const rows = await run(sb.from('customers').update(row).eq('id', id).select('code'));
    if (!rows.length) throw fail('고객을 찾을 수 없거나 권한이 없습니다.', 403);
    log('고객 수정', rows[0].code, Object.keys(row).join(', '));
    return { ok: true };
  });

  route('PUT', '/customers/(\\d+)/consents', async ([id], b) => {
    const rows = (b.consents || []).filter(r => META.consentItems.includes(r.item)).map(r => ({
      customer_id: +id, item: r.item, agreed: !!r.agreed,
      agreed_on: r.agreed ? (dateOrNull(r.agreed_on) || todayKST()) : null,
    }));
    await run(sb.from('consents').upsert(rows, { onConflict: 'customer_id,item' }));
    log('동의 내역 수정', id);
    return { ok: true };
  });

  /* 질문 은행 */
  route('GET', '/questions', async () => run(sb.from('questions').select('*').order('sort').order('id')));
  route('POST', '/questions', async (_, b) => {
    await needAdmin();
    const text = clean(b.text, 500);
    if (!text) throw fail('질문 문장을 입력해 주세요.');
    const last = await run(sb.from('questions').select('sort').order('sort', { ascending: false }).limit(1));
    const row = { topic: clean(b.topic, 50), era: clean(b.era, 50), text, sort: (last[0]?.sort || 0) + 1 };
    if ('stage' in b) row.stage = stageOrNull(b.stage);
    await run(sb.from('questions').insert(row));
    log('질문 추가', text.slice(0, 40));
    return { ok: true };
  });
  route('PUT', '/questions/(\\d+)', async ([id], b) => {
    await needAdmin();
    const row = {};
    if ('topic' in b) row.topic = clean(b.topic, 50);
    if ('era' in b) row.era = clean(b.era, 50);
    if ('text' in b) row.text = clean(b.text, 500);
    if ('active' in b) row.active = !!b.active;
    if ('stage' in b) row.stage = stageOrNull(b.stage);
    if (Object.keys(row).length) await run(sb.from('questions').update(row).eq('id', id));
    log('질문 수정', id);
    return { ok: true };
  });
  route('DELETE', '/questions/(\\d+)', async ([id]) => {
    await needAdmin();
    const used = await run(sb.from('plans').select('id', { count: 'exact', head: false }).eq('question_id', id).limit(1));
    if (used.length) {
      await run(sb.from('questions').update({ active: false }).eq('id', id));
      log('질문 사용 중지', id);
      return { ok: true, note: '이미 계획에 쓰인 질문이라 삭제하지 않고 사용 중지했습니다.' };
    }
    await run(sb.from('questions').delete().eq('id', id));
    log('질문 삭제', id);
    return { ok: true };
  });
  route('POST', '/questions/(\\d+)/move', async ([id], b) => {
    await needAdmin();
    const items = await run(sb.from('questions').select('id,sort').order('sort').order('id'));
    const i = items.findIndex(r => r.id === +id), j = i + (b.direction === 'up' ? -1 : 1);
    if (i < 0) throw fail('질문이 없습니다.', 404);
    if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]];
    await Promise.all(items.map((r, n) => run(sb.from('questions').update({ sort: n + 1 }).eq('id', r.id))));
    return { ok: true };
  });
  async function templates() {
    const rows = await run(sb.from('settings').select('key,value').in('key', Object.keys(SETTING_KEYS)));
    return Object.fromEntries(Object.entries(SETTING_KEYS).map(([k, d]) => [k, (rows.find(r => r.key === k) || {}).value || d]));
  }
  route('GET', '/settings', async () => templates());
  route('PUT', '/settings', async (_, b) => {
    await needAdmin();
    const rows = Object.entries(SETTING_KEYS).filter(([k]) => k in b).map(([k, d]) => ({ key: k, value: clean(b[k], 2000) || d }));
    if (rows.length) await run(sb.from('settings').upsert(rows));
    log('문안 템플릿 수정');
    return { ok: true };
  });

  /* 질문 계획과 발송 */
  /* 살아온 순서대로 질문 담기: 고른 질문 은행 질문을 질문 은행 순서(단계 → 시간)대로 초안으로 넣는다.
     이미 담은 질문은 빼고, stage는 DB 트리거가 질문에서 물려받는다. */
  route('POST', '/customers/(\\d+)/plans/bulk', async ([id], b) => {
    const want = [...new Set((Array.isArray(b.question_ids) ? b.question_ids : []).map(Number).filter(Number.isSafeInteger))].slice(0, 100);
    if (!want.length) throw fail('담을 질문을 골라 주세요.');
    const [qs, have, last] = await Promise.all([
      run(sb.from('questions').select('id,text,sort').in('id', want).eq('active', true).order('sort').order('id')),
      run(sb.from('plans').select('question_id').eq('customer_id', id).not('question_id', 'is', null)),
      run(sb.from('plans').select('week').eq('customer_id', id).order('week', { ascending: false }).limit(1)),
    ]);
    const used = new Set(have.map(p => p.question_id)), week = (last[0]?.week || 0) + 1;
    const rows = qs.filter(q => !used.has(q.id)).map(q => ({ customer_id: +id, week, question_id: q.id, text: q.text, status: '초안' }));
    if (rows.length) await run(sb.from('plans').insert(rows));
    log('살아온 순서대로 질문 담기', id, `${rows.length}개`);
    return { ok: true, count: rows.length, skipped: want.length - rows.length };
  });
  route('POST', '/customers/(\\d+)/plans', async ([id], b) => {
    let text = clean(b.text, 500);
    const qid = b.question_id || null;
    if (qid) {
      const q = await run(sb.from('questions').select('text').eq('id', qid).maybeSingle());
      if (!q) throw fail('질문 은행에 없는 질문입니다.', 404);
      text = text || q.text;
    }
    if (!text) throw fail('질문을 고르거나 직접 입력해 주세요.');
    let week = +b.week;
    if (!week) {
      const last = await run(sb.from('plans').select('week').eq('customer_id', id).order('week', { ascending: false }).limit(1));
      week = (last[0]?.week || 0) + 1;
    }
    await run(sb.from('plans').insert({ customer_id: +id, week, question_id: qid, text, status: '초안' }));
    log('질문 계획 추가', id, week + '주차');
    return { ok: true };
  });
  route('PUT', '/plans/(\\d+)', async ([id], b) => {
    const row = {};
    if ('text' in b) row.text = clean(b.text, 500);
    if ('week' in b) row.week = +b.week;
    if ('status' in b) row.status = b.status;
    if (Object.keys(row).length) await run(sb.from('plans').update(row).eq('id', id));
    log('질문 계획 수정', id, b.status || '');
    return { ok: true };
  });
  route('DELETE', '/plans/(\\d+)', async ([id]) => {
    const rows = await run(sb.from('plans').delete().eq('id', id).select('id'));
    if (!rows.length) throw fail('이미 보낸 질문은 지울 수 없습니다. \'건너뜀\'으로 바꿔 주세요.', 409);
    log('질문 계획 삭제', id);
    return { ok: true };
  });
  /* 발송 대기열: 고객마다 승인 대기(초안)와 보낼 수 있는(승인) 질문, 사용 중인 링크, 문안 템플릿.
     링크 주소는 해시만 저장하므로 다시 보여 줄 수 없다. 사용 중인 링크가 있으면 '받은 링크를 다시 열어 주세요'로 안내한다. */
  route('GET', '/queue', async () => {
    const [tpl, customers, plans, links] = await Promise.all([
      templates(),
      run(sb.from('customers').select('id,code,guardian_name,guardian_contact,parent_name,parent_phone,parent_gender,delete_after').order('id')),
      run(sb.from('plans').select('*').in('status', ['초안', '승인']).order('week').order('id')),
      run(sb.from('record_links').select('id,customer_id,audience,expires_at,revoked_at,last_used_at').is('revoked_at', null).gt('expires_at', new Date().toISOString())),
    ]);
    const out = customers.map(c => {
      const mine = plans.filter(p => p.customer_id === c.id), act = links.filter(l => l.customer_id === c.id);
      const pick = aud => act.filter(l => (l.audience || 'child') === aud).sort((a, b) => (a.expires_at < b.expires_at ? 1 : -1))[0] || null;
      return { ...c, drafts: mine.filter(p => p.status === '초안'), ready: mine.filter(p => p.status === '승인'), links: { child: pick('child'), parent: pick('parent') } };
    }).filter(c => c.drafts.length || c.ready.length);
    out.sort((a, b) => (b.ready.length > 0) - (a.ready.length > 0) || a.id - b.id);
    return { templates: tpl, customers: out };
  });
  /* 문안을 보낸 뒤 고른 질문을 한 번에 '보냄'으로 */
  route('POST', '/queue/sent', async (_, b) => {
    const ids = (Array.isArray(b.plan_ids) ? b.plan_ids : []).map(Number).filter(Number.isSafeInteger).slice(0, 10);
    if (!ids.length) throw fail('보낸 질문을 골라 주세요.');
    const rows = await run(sb.from('plans').update({ status: '보냄' }).in('id', ids).eq('status', '승인').select('id,customer_id'));
    log('질문 보냄', rows[0]?.customer_id || '', `${rows.length}개 · ${b.audience === 'parent' ? '부모님께' : '보호자께'}`);
    return { ok: true, count: rows.length };
  });

  /* 녹취와 이야기 */
  route('POST', '/customers/(\\d+)/transcripts', async ([id], b) => {
    const row = { customer_id: +id, plan_id: b.plan_id || null, title: clean(b.title, 200), raw: clean(b.raw, 200000), status: '녹취 도착' };
    const t = await run(sb.from('transcripts').insert(row).select('id').single());
    if (row.plan_id) await sb.from('plans').update({ status: '답변 도착' }).eq('id', row.plan_id).eq('status', '보냄');
    log('녹취 추가', id);
    return { id: t.id };
  });
  route('PUT', '/transcripts/(\\d+)', async ([id], b) => {
    const row = { updated_at: new Date().toISOString() };
    if ('title' in b) row.title = clean(b.title, 200);
    if ('raw' in b) row.raw = clean(b.raw, 200000);
    if ('status' in b) row.status = b.status;
    await run(sb.from('transcripts').update(row).eq('id', id));
    log('녹취 수정', id, Object.keys(b).join(', '));
    return { ok: true };
  });
  route('POST', '/transcripts/(\\d+)/versions', async ([id], b) => {
    await run(sb.from('transcript_versions').insert({ transcript_id: +id, clean: clean(b.clean, 200000) }));
    log('정리본 저장', id);
    return { ok: true };
  });
  route('DELETE', '/transcripts/(\\d+)', async ([id]) => {
    const t = await run(sb.from('transcripts').select('audio_path').eq('id', id).maybeSingle());
    if (t && t.audio_path) await sb.storage.from('audio').remove([t.audio_path]);
    await run(sb.from('transcripts').delete().eq('id', id));
    log('녹취 삭제', id);
    return { ok: true };
  });

  const storyRow = b => ({ title: clean(b.title, 200), era: clean(b.era, 100), tags: clean(b.tags, 300), body: clean(b.body, 200000), sensitive_note: clean(b.sensitive_note, 2000) });
  route('POST', '/customers/(\\d+)/stories', async ([id], b) => {
    await run(sb.from('stories').insert({ ...storyRow(b), customer_id: +id, transcript_id: b.transcript_id || null, status: '초안' }));
    log('이야기 추가', id);
    return { ok: true };
  });
  route('PUT', '/stories/(\\d+)', async ([id], b) => {
    const all = storyRow(b), row = { updated_at: new Date().toISOString() };
    Object.keys(all).forEach(k => { if (k in b) row[k] = all[k]; });
    if (b.status) row.status = b.status;
    await run(sb.from('stories').update(row).eq('id', id));
    log('이야기 수정', id);
    return { ok: true };
  });
  route('DELETE', '/stories/(\\d+)', async ([id]) => { await run(sb.from('stories').delete().eq('id', id)); log('이야기 삭제', id); return { ok: true }; });

  /* 자녀용 녹음 링크: 열쇠(토큰)는 이 브라우저에서 만들고, 서버에는 해시만 저장한다.
     열쇠 원문은 만든 그 순간에만 화면에 보여 준다. */
  const RECORD_PAGE = 'https://yuna13268.github.io/lifebook/r/';
  route('GET', '/customers/(\\d+)/links', async ([id]) => run(sb.from('record_links').select('id,audience,created_at,expires_at,revoked_at,last_used_at,upload_count').eq('customer_id', id).order('id', { ascending: false })));
  route('POST', '/customers/(\\d+)/links', async ([id], b) => {
    const days = Math.min(Math.max(+b.days || 90, 1), 120);
    const audience = b.audience === 'parent' ? 'parent' : 'child';
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(n => n.toString(16).padStart(2, '0')).join('');
    const expires = new Date(Date.now() + days * 864e5).toISOString();
    const row = await run(sb.from('record_links').insert({ customer_id: +id, token_hash: hash, expires_at: expires, audience }).select('id').single());
    log('녹음 링크 발급', id, `링크 ${row.id} · ${audience === 'parent' ? '부모님용' : '자녀용'} · ${days}일`);
    return { id: row.id, url: `${RECORD_PAGE}#k=${token}`, expires_at: expires, audience };
  });
  /* 녹음 도착: 자녀·부모님 녹음 링크와 AI 전화·AI 대화로 들어온 녹음, 링크 상태, AI 인터뷰 기록.
     권한 규칙상 담당자는 자기 고객 것만 보인다. 직접 올린 음성(파일 이름 그대로)은 고객 화면에서만 본다. */
  route('GET', '/recordings', async () => {
    const [recent, links, customers, sessions] = await Promise.all([
      run(sb.from('transcripts').select('id,customer_id,title,status,created_at,audio_name,audio_path').not('audio_name', 'is', null).order('id', { ascending: false }).limit(300)),
      run(sb.from('record_links').select('id,customer_id,audience,created_at,expires_at,revoked_at,last_used_at,upload_count').order('id', { ascending: false })),
      run(sb.from('customers').select('id,code,parent_name,guardian_name')),
      aiSessions(sb.from('ai_sessions').select(AI_COLS)),
    ]);
    const C = Object.fromEntries(customers.map(c => [c.id, c]));
    const withC = r => ({ ...r, code: C[r.customer_id]?.code || '', parent_name: C[r.customer_id]?.parent_name || '', guardian_name: C[r.customer_id]?.guardian_name || '' });
    const arrivals = recent.map(t => ({ ...t, source: sourceOf(t.audio_name) })).filter(t => t.source).slice(0, 60);
    return { arrivals: arrivals.map(t => ({ ...withC(t), created: kst(t.created_at), has_audio: !!t.audio_path })), links: links.map(withC), sessions: sessions.map(withC) };
  });
  /* 책 QR 음성: 중지하면 그 QR은 다시 쓸 수 없다 (새로 만든다) */
  route('POST', '/clips/(\\d+)/revoke', async ([id]) => {
    await run(sb.from('voice_clips').update({ revoked_at: new Date().toISOString() }).eq('id', id));
    log('QR 음성 중지', id);
    return { ok: true };
  });
  route('POST', '/links/(\\d+)/revoke', async ([id]) => {
    await run(sb.from('record_links').update({ revoked_at: new Date().toISOString() }).eq('id', id));
    log('녹음 링크 중지', id);
    return { ok: true };
  });

  /* 내려받기와 파기 */
  route('POST', '/customers/(\\d+)/export', async ([id]) => {
    const c = await handlers.find(h => h[1].test('/customers/' + id) && h[0] === 'GET')[2]([id]);
    const L = [];
    L.push(`# ${c.code} 프로필`, '',
      '## 보호자 (신청한 자녀)', `- 이름: ${c.guardian_name || ''}`, `- 휴대폰: ${c.guardian_contact || ''}`, `- 성별: ${c.guardian_gender || ''}`, `- 생년월일: ${c.guardian_birthday || ''}`, '',
      '## 부모님', `- 성함: ${c.parent_name || ''}`, `- 휴대폰: ${c.parent_phone || ''}`, `- 성별: ${c.parent_gender || ''}`, `- 생년월일: ${c.parent_birthday || ''}`, `- 생년(대략): ${c.parent_birth || ''}`,
      `- 고향: ${c.hometown || ''}`, `- 직업: ${c.job || ''}`, `- 가족: ${c.family || ''}`, '', `- 진행 상태: ${c.status}`, '', '## 메모', c.notes || '', '');
    L.push('# 동의 내역', '', ...c.consents.map(r => `- [${r.agreed ? 'x' : ' '}] ${r.item} ${r.agreed_on || ''}`), '', `delete_after: ${c.delete_after || ''}`, '');
    L.push('# 질문 계획', '', ...c.plans.map(p => `${p.week}주차 [${p.status}] ${p.text}`), '');
    c.transcripts.slice().reverse().forEach((t, i) => {
      const marks = Array.isArray(t.marks) && t.marks.length ? ['## 질문이 바뀐 시점', ...t.marks.map(m => `- ${Math.floor(m.at / 60)}:${String(m.at % 60).padStart(2, '0')} ${m.text || ''}`), ''] : [];
      L.push(`# 녹취 ${i + 1}: ${t.title || ''} (${t.created.slice(0, 10)}, ${t.status}${sourceOf(t.audio_name) ? ', ' + sourceOf(t.audio_name) : ''})`, '', ...marks, '## 원문', t.raw || '', '', '## 정리본', (t.versions[0] && t.versions[0].clean) || '', '');
    });
    c.stories.forEach((s, i) => L.push(`# 이야기 ${i + 1}: ${s.title || ''}`, '', `- 시기: ${s.era || ''}`, `- 태그: ${s.tags || ''}`, `- 상태: ${s.status}`,
      `- 민감 정보 표시: ${s.sensitive_note || '없음'}`, '', s.body || '', ''));
    const name = `${c.code}.md`;
    const url = URL.createObjectURL(new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log('내려받기', c.code);
    return { path: name + ' (음성 파일은 포함되지 않습니다)' };
  });
  route('GET', '/destruction', async () => {
    await needAdmin();
    const limit = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), today = todayKST();
    const due = await run(sb.from('customers').select('id,code,delete_after,status').not('delete_after', 'is', null).lte('delete_after', limit).order('delete_after'));
    due.forEach(c => { c.overdue = c.delete_after < today; });
    const logRows = await run(sb.from('destruction_log').select('*').order('id', { ascending: false }).limit(100));
    return { due, log: logRows };
  });
  route('POST', '/customers/(\\d+)/destroy', async ([id], b) => {
    await needAdmin();
    await fn({ action: 'destroy', customer_id: +id, confirm: b.confirm }, true);
    return { ok: true };
  });
  /* AI 사용 비용 (관리자만, ai-intro의 ai_usage_monthly 보기). 비용은 가격표로 계산한 추정치다.
     상한: settings 'ai_monthly_cap_usd' 값, 없으면 20달러 (서버 함수와 같은 규칙). */
  const SERVER_DEFAULT_CAP = 20;
  const monthKST = (back = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
  async function aiCap() {
    const r = await run(sb.from('settings').select('value').eq('key', 'ai_monthly_cap_usd').maybeSingle());
    const v = r ? Number(r.value) : NaN;
    return Number.isFinite(v) && v > 0 ? { cap: v, cap_set: true } : { cap: SERVER_DEFAULT_CAP, cap_set: false };
  }
  async function usageRows(months) {
    const { data, error } = await sb.from('ai_usage_monthly').select('*').in('month', months);
    if (error) { console.warn('ai_usage_monthly', error.message); return null; }
    return data;
  }
  route('GET', '/usage', async () => {
    await needAdmin();
    const months = [monthKST(0), monthKST(1), monthKST(2)];
    const [rows, cap, customers] = await Promise.all([usageRows(months), aiCap(), run(sb.from('customers').select('id,code,parent_name'))]);
    if (!rows) return { missing: true, month: months[0], ...cap };
    const C = Object.fromEntries(customers.map(c => [c.id, c]));
    return { month: months[0], months, ...cap, rows: rows.map(r => ({ ...r, cost_usd: Number(r.cost_usd) || 0, seconds: Number(r.seconds) || 0, code: C[r.customer_id]?.code || '', parent_name: C[r.customer_id]?.parent_name || '' })) };
  });
  /* 오늘의 업무 알림용: 이번 달 합계와 상한만 */
  route('GET', '/usage/summary', async () => {
    if (!(await isAdmin())) return { spend: 0, cap: 0, hidden: true };
    const [rows, cap] = await Promise.all([usageRows([monthKST(0)]), aiCap()]);
    return { spend: (rows || []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0), missing: !rows, ...cap };
  });
  route('PUT', '/usage/cap', async (_, b) => {
    await needAdmin();
    const v = Math.round(Number(b.cap) * 100) / 100;
    if (!(v >= 1 && v <= 10000)) throw fail('상한은 1달러에서 10,000달러 사이로 적어 주세요.');
    await run(sb.from('settings').upsert({ key: 'ai_monthly_cap_usd', value: String(v) }));
    log('AI 월 상한 변경', '', `${v}달러`);
    return { ok: true, cap: v };
  });
  route('GET', '/activity', async () => {
    await needAdmin();
    const rows = await run(sb.from('activity').select('*').order('id', { ascending: false }).limit(300));
    return rows.map(r => ({ ...r, ts: kst(r.ts) }));
  });

  /* 팀 */
  route('GET', '/users', async () => {
    await needAdmin();
    const rows = await run(sb.from('profiles').select('id,name,email,role,created_at').order('created_at'));
    return rows.map(r => ({ ...r, created: kst(r.created_at) }));
  });
  route('POST', '/users', async (_, b) => {
    await needAdmin();
    await fn({ action: 'create_user', email: b.email, name: b.name, password: b.password, role: b.role }, true);
    log('팀원 추가', b.name, b.role);
    return { ok: true };
  });
  route('PUT', '/users/([0-9a-f-]{36})', async ([id], b) => {
    await needAdmin();
    await fn({ action: 'update_user', id, role: b.role, password: b.password }, true);
    log('팀원 수정', id);
    return { ok: true };
  });

  return {
    /* AI 인터뷰 서버 함수(interview): config · call · fetch_audio */
    async interview(body) {
      if (window.MOAON_DEMO) return window.MOAON_DEMO.interview(body);
      const s = await session();
      if (!s) throw fail('로그인이 필요합니다.', 401);
      let r;
      try { r = await fetch(SUPABASE_URL + '/functions/v1/interview', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body) }); }
      catch (e) { throw fail('AI 인터뷰 서버에 연결하지 못했습니다. 아직 배포되지 않았을 수 있습니다.', 503); }
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) throw fail('AI 인터뷰 서버가 아직 배포되지 않았습니다.', 404);
      if (!r.ok) throw fail(d.error || 'AI 인터뷰 요청을 처리하지 못했습니다.', r.status);
      return d;
    },
    async agent(body) {
      if (window.MOAON_DEMO) return window.MOAON_DEMO.agent(body);
      const s = await session();
      if (!s) throw fail('로그인이 필요합니다.', 401);
      const r = await fetch(SUPABASE_URL + '/functions/v1/book-agent', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw fail(d.error || '제작실에 연결하지 못했습니다.', r.status);
      return d;
    },
    async call(method, path, body) {
      if (window.MOAON_DEMO) return window.MOAON_DEMO.call(method, path, body);
      for (const [m, rx, h] of handlers) {
        if (m !== method) continue;
        const mm = rx.exec(path);
        if (mm) {
          try { return await h(mm.slice(1), body || {}); }
          catch (e) { if (!e.status && /Failed to fetch|NetworkError/i.test(e.message)) e.message = '인터넷에 연결할 수 없습니다.'; throw e; }
        }
      }
      throw fail('찾을 수 없습니다.', 404);
    },
    async uploadAudio(tid, file) {
      if (window.MOAON_DEMO) throw fail('실제 음성 업로드는 로그인 후 사용할 수 있습니다.');
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!AUDIO_TYPES[ext]) throw fail('지원하지 않는 음성 형식입니다. (m4a, mp3, wav, aac, amr, ogg, webm, mp4)');
      if (file.size > MAX_AUDIO) throw fail('파일이 너무 큽니다. 50MB까지 올릴 수 있습니다.');
      const t = await run(sb.from('transcripts').select('customer_id,audio_path,audio_name').eq('id', tid).single());
      const path = `${t.customer_id}/${tid}-${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('audio').upload(path, file, { contentType: AUDIO_TYPES[ext], upsert: false });
      check(error);
      if (t.audio_path) await sb.storage.from('audio').remove([t.audio_path]);
      await run(sb.from('transcripts').update({ audio_path: path, audio_name: sourceOf(t.audio_name) ? t.audio_name : file.name.slice(0, 120), updated_at: new Date().toISOString() }).eq('id', tid));
      log('음성 업로드', tid);
    },
    /* 잘라 낸 음성(WAV)을 올리고 QR 토큰을 만든다. 토큰 원문은 다시 인쇄할 수 있게 표에 둔다(팀원만 읽음). */
    async createClip(cid, meta, blob) {
      if (window.MOAON_DEMO) return window.MOAON_DEMO.createClip(cid, meta, blob);
      const path = `${cid}/clip-${crypto.randomUUID()}.wav`;
      const { error } = await sb.storage.from('audio').upload(path, blob, { contentType: 'audio/wav', upsert: false });
      check(error);
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const { data, error: e2 } = await sb.from('voice_clips').insert({ customer_id: +cid, story_id: meta.story_id || null, transcript_id: meta.transcript_id || null, title: clean(meta.title, 200), audio_path: path,
        start_sec: meta.start_sec, end_sec: meta.end_sec, duration_secs: Math.max(1, Math.round(meta.duration_secs)), token }).select('id').single();
      if (e2) { await sb.storage.from('audio').remove([path]); check(e2); }
      log('QR 음성 만들기', cid, `클립 ${data.id} · ${Math.round(meta.duration_secs)}초`);
      return { id: data.id, token };
    },
    async signedUrl(path) {
      if (window.MOAON_DEMO) return window.MOAON_DEMO.audioUrl(path);
      const { data, error } = await sb.storage.from('audio').createSignedUrl(path, 600);
      check(error);
      return data.signedUrl;
    },
  };
})();
