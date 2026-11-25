'use strict';
/* 녹음 화면 (자녀용 · 부모님용 링크 공용).
   링크 끝(#k=...)의 열쇠로 그 고객의 '녹음 올리기'만 할 수 있습니다. 이름·연락처는 이 화면에 오지 않습니다.

   이어 녹음: 녹음 버튼은 한 번만 누릅니다. 질문을 넘겨도 녹음은 끊기지 않고, 어느 시점에 어떤 질문으로 넘어갔는지만 표시합니다.
   - 30분(또는 40MB)마다 조각을 자동으로 나눕니다. 새 조각을 먼저 시작한 뒤 이전 조각을 닫아 빈틈이 없습니다.
   - 전화가 오거나 화면이 꺼져 녹음이 멈추면, 그때까지의 녹음은 그대로 두고 '이어서 녹음'으로 다음 조각을 붙입니다.
   - 녹음하는 동안 5초마다 휴대폰 안(IndexedDB)에 저장해, 창이 닫혀도 다시 열면 이어서 보낼 수 있습니다.
   - 보내기는 조각마다 따로 합니다. 인터넷이 끊기면 몇 번 다시 시도하고, 다시 연결되면 보내지 못한 조각만 이어서 보냅니다.
   부모님용 링크에서는 질문을 소리로 읽어 주고, 설정이 되어 있으면 AI 인터뷰어와 대화할 수도 있습니다. */
const BASE = 'https://pxfwsjipjxvafefmgdbk.supabase.co';
const KEY = 'sb_publishable_XUi0Id-De-VL6b2L6XDIsw_Xk9mg0Lk'; // 공개해도 되는 키 (권한은 서버가 확인)
const HASH = new URLSearchParams(location.hash.slice(1)), QS = new URLSearchParams(location.search);
// 체험 모드(?demo=1, 부모님 화면은 &who=parent): 가상 질문으로 녹음까지 해 볼 수 있고, 아무것도 서버로 보내지 않습니다.
const DEMO = QS.get('demo') === '1';
const TOKEN = DEMO ? 'demo-' + (QS.get('who') === 'parent' ? 'parent' : 'child') : HASH.get('k') || '';
// 실기기 시험용: 링크 끝에 &seg=60 을 붙이면 60초마다 조각을 나눕니다 (20초 이상만).
const SEG_SEC = Math.max(20, Number(HASH.get('seg')) || 30 * 60);
const SEG_BYTES = 40 * 1024 * 1024, MAX_BYTES = 50 * 1024 * 1024, MAX_TOTAL_SEC = 4 * 3600;
const MIN_MARK_SEC = 3; // 3초도 안 머문 질문은 건너뛴 것으로 봅니다
const TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', webm: 'audio/webm', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', amr: 'audio/amr' };

const UA = navigator.userAgent;
const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(UA);
const APPLE_WEBKIT = IOS || (/Safari\//.test(UA) && !/Chrome|Chromium|Edg|Android/.test(UA));
const IA = (() => { // 앱 안에서 열린 브라우저 (마이크·저장이 잘 안 될 수 있음)
  if (/KAKAOTALK/i.test(UA)) return { id: 'kakao', name: '카카오톡' };
  if (/\bLine\//.test(UA)) return { id: 'line', name: '라인' };
  if (/NAVER\(inapp/i.test(UA)) return { id: 'other', name: '네이버 앱' };
  if (/Instagram/i.test(UA)) return { id: 'other', name: '인스타그램' };
  if (/FBAN|FBAV|FB_IAB/.test(UA)) return { id: 'other', name: '페이스북' };
  if (/DaumApps/i.test(UA)) return { id: 'other', name: '다음 앱' };
  if (/BAND\//.test(UA)) return { id: 'other', name: '밴드' };
  if (ANDROID && /; wv\)/.test(UA)) return { id: 'other', name: '앱' };
  return null;
})();
const HAS_MIC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const CAN_RECORD = HAS_MIC && !!window.MediaRecorder;

// 살아온 순서(인생 단계 1~7). 화면에는 쉬운 말로 보여 줍니다.
const STAGES = ['', '어린 시절', '학창 시절', '청년 시절과 첫 일', '만남과 결혼', '자녀를 키우던 시절', '중년의 일과 가족', '지금과 앞으로'];
const stageName = st => STAGES[st] || '';
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let INFO_DAY = '';
const app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let toastTimer;
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 6000); }
// 화면 읽기 프로그램에 상태 변화를 알려 줍니다 (시계처럼 계속 바뀌는 것은 알리지 않음)
function announce(m) { const s = document.getElementById('sr'); if (!s) return; s.textContent = ''; setTimeout(() => { s.textContent = m; }, 60); }
// 화면을 바꾸고 제목으로 초점을 옮깁니다
function show(html) { app.innerHTML = html; const h = app.querySelector('h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); }

async function call(body) {
  if (DEMO) return demoCall(body);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
  let r;
  try { r = await fetch(BASE + '/functions/v1/record', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ ...body, token: TOKEN }), signal: ctl.signal }); }
  catch (e) { throw new Error('인터넷 연결이 불안정해요. 연결을 확인해 주세요.'); } // status 없음 → 다시 시도 대상
  finally { clearTimeout(timer); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || '연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); e.status = r.status; throw e; }
  return d;
}
// 인터넷 문제(응답 없음·서버 오류)일 때만 몇 번 더 시도합니다. 인터넷이 끊겨 있으면 다시 연결될 때까지 잠시 기다립니다.
async function retry(fn, onWait) {
  for (let n = 0; ; n++) {
    try { return await fn(); }
    catch (e) {
      const transient = e.status == null || e.status >= 500 || e.status === 408;
      if (!transient || n >= 2) throw e;
      if (!navigator.onLine) { if (onWait) onWait('인터넷 연결을 기다리는 중…'); await Promise.race([new Promise(r => window.addEventListener('online', r, { once: true })), wait(30000)]); }
      else { if (onWait) onWait('다시 시도하는 중…'); await wait(n ? 5000 : 1500); }
    }
  }
}

let INFO = null, PARENT = false;
const TIPS_CHILD = [
  ['조용한 곳에서', '휴대폰을 부모님 가까이(한 뼘 정도) 두세요. 녹음 중에는 화면을 끄지 마세요.'],
  ['녹음은 한 번만 누르세요', '질문을 넘겨도 녹음은 이어집니다. 다 끝나면 마지막에 한 번 \'녹음 끝내기\'를 누르세요.'],
  ['끝까지 기다려 주세요', '말씀이 멈춰도 바로 다음 질문으로 넘어가지 말고 잠시 기다려 주세요. 생각하시는 시간이에요.'],
  ['이어서 물어보세요', '"그다음엔 어떻게 됐어요?", "그때 누가 같이 있었어요?", "그분이 뭐라고 하셨어요?"'],
  ['고치지 않아요', '날짜나 이름이 틀려 보여도 바로잡지 말고 그대로 들어 주세요. 확인은 저희가 따로 여쭤봐요.'],
  ['힘든 이야기는 건너뛰어요', '"말씀하기 편하실 때만 해 주세요"라고 해 주세요. 주민번호·계좌 같은 번호는 말씀하지 않으셔도 돼요.'],
];
const TIPS_PARENT = [
  ['조용한 곳에서', '휴대폰을 앞에 두고 평소처럼 말씀하시면 됩니다.'],
  ['녹음은 한 번만 누르세요', '한 질문에 대한 말씀이 끝나면 \'다음 질문\'을 누르세요. 녹음은 끊기지 않고 이어집니다.'],
  ['천천히, 생각나는 대로', '날짜나 이름이 정확하지 않아도 괜찮아요. 떠오르는 장면을 그대로 말씀해 주세요.'],
  ['말하기 싫은 것은 건너뛰세요', '\'다음 질문\'을 누르시면 됩니다. 주민번호·계좌 같은 번호는 말씀하지 않으셔도 돼요.'],
];

/* ---------- 체험 모드: 가상 서버 ---------- */
const DEMO_Q = [[1, '어릴 적 살던 동네는 어떤 곳이었나요?'], [1, '어린 시절 집에서 가장 좋아하던 곳은 어디였나요?'], [1, '어릴 때 동무들과 자주 하던 놀이는 무엇이었나요?'],
  [2, '처음 학교에 가던 날이 기억나세요?'], [2, '학교 다닐 때 기억에 남는 선생님이 계셨나요?'], [2, '가장 친했던 친구와 함께 무엇을 하며 놀았나요?'],
  [3, '처음으로 돈을 벌었던 일은 무엇이었나요?'], [4, '배우자를 처음 만난 날은 어땠나요?'], [5, '첫 아이가 태어나던 날이 기억나세요?'],
  [6, '가장 바빴던 시절, 하루는 어떻게 흘러갔나요?'], [7, '요즘 가장 즐거운 일은 무엇인가요?']].map(([stage, text], k) => ({ id: 101 + k, week: 1, stage, text }));
const DEMO_PAST = [{ id: 91, week: 1, stage: 1, text: '태어나신 곳은 어디였나요?' }, { id: 92, week: 1, stage: 1, text: '어린 시절 별명이 있었나요?' }];
// 체험 모드에서 답한 질문(이 탭 안에서만 기억): {id: 답한 날}
const demoDone = () => { try { return JSON.parse(sessionStorage.getItem('moaon-demo-done') || '{}'); } catch (e) { return {}; } };
async function demoCall(b) {
  await wait(300);
  const parent = TOKEN === 'demo-parent', done = demoDone(), today = kstDay();
  if (b.action === 'info') {
    const open = DEMO_Q.filter(q => !done[q.id]), answered = [...DEMO_Q.filter(q => done[q.id]), ...DEMO_PAST];
    const todayN = Object.values(done).filter(d => d === today).length, room = Math.max(0, 5 - todayN);
    return { consent_ok: true, audience: parent ? 'parent' : 'child', title: parent ? '어머님' : '', ai_available: parent, expires_at: new Date(Date.now() + 60 * 864e5).toISOString(), uploads: 0,
      questions: open.slice(0, b.more ? 5 : room), answered_count: answered.length, answered: answered.reverse(),
      today: { limit: 5, answered: todayN, remaining: Math.min(room, open.length), done: room === 0 && open.length > 0, more: !!b.more, left_total: open.length },
      progress: [1, 2, 3, 4, 5, 6, 7].map(st => ({ stage: st, total: [...DEMO_Q, ...DEMO_PAST].filter(q => q.stage === st).length, answered: answered.filter(q => q.stage === st).length })) };
  }
  if (b.action === 'sign') return { upload_id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()), path: 'demo/rec.' + b.ext, token: 'demo', content_type: TYPES[b.ext] || 'audio/webm' };
  if (b.action === 'complete') { (b.marks || []).forEach(m => { if (DEMO_Q.some(q => q.id === m.plan_id) && !done[m.plan_id]) done[m.plan_id] = today; }); try { sessionStorage.setItem('moaon-demo-done', JSON.stringify(done)); } catch (e) { } return { ok: true }; }
  if (b.action === 'ai_fail') return { ok: true };
  if (b.action === 'ai_start') return { signed_url: 'wss://demo', dynamic_variables: { session_id: 'demo' } };
  const e = new Error('지원하지 않는 작업입니다.'); e.status = 400; throw e;
}

/* ---------- 휴대폰 안 임시 저장 (IndexedDB) ---------- */
const store = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open('moaon-rec', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'key' }); r.result.createObjectStore('chunks', { keyPath: ['sess', 'seg', 'i'] }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const tx = async (name, mode, fn) => { const db = await open(); return new Promise((ok, no) => { const t = db.transaction(name, mode); const out = fn(t.objectStore(name)); t.oncomplete = () => ok(out && out.result); t.onerror = () => no(t.error); t.onabort = () => no(t.error); }); };
  const range = sess => IDBKeyRange.bound([sess, 0, 0], [sess, Infinity, Infinity]);
  return {
    async putMeta(m) { try { await tx('meta', 'readwrite', s => s.put({ ...m, updated: Date.now() })); } catch (e) { /* 저장 공간이 없으면 메모리로만 진행 */ } },
    async getMeta(key) { try { return await tx('meta', 'readonly', s => s.get(key)); } catch (e) { return null; } },
    async putChunk(sess, seg, i, blob) { try { await tx('chunks', 'readwrite', s => s.put({ sess, seg, i, blob })); } catch (e) { } },
    async chunks(sess) { try { return (await tx('chunks', 'readonly', s => s.getAll(range(sess)))) || []; } catch (e) { return []; } },
    async clear(sess) { try { await tx('meta', 'readwrite', s => s.delete(sess)); await tx('chunks', 'readwrite', s => s.delete(range(sess))); } catch (e) { } },
  };
})();
let SESS = '';
async function sessKey() { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN)); return 'rec-' + [...new Uint8Array(b)].slice(0, 8).map(n => n.toString(16).padStart(2, '0')).join(''); }

/* ---------- 녹음 상태 ---------- */
const R = {
  state: 'idle',         // idle | recording | paused | interrupted | stopping
  stream: null, rec: null, mime: '', ext: '',
  segs: [],              // [{id, start(초), chunks: Blob[], bytes, dur, done}]  id는 저장소 열쇠라 바뀌지 않습니다
  nextId: 0,
  marks: [],             // [{plan_id, at(초, 전체 녹음 기준)}]
  qmap: {},              // 녹음한 질문의 글 {plan_id: text} — 다음 날 복구해도 어떤 질문이었는지 보이게
  qi: 0, free: false,
  activeMs: 0, resumeAt: 0, hiddenAt: null, tick: null, wake: null, muteTimer: null,
  sent: [], up: {},      // 보낸 조각 id, 올렸지만 등록을 못 한 조각 {id: {upload_id}}
  source: 'mic', sendFailed: false,
};
const elapsed = () => (R.activeMs + (R.state === 'recording' ? performance.now() - R.resumeAt : 0)) / 1000;
const curSeg = () => R.segs[R.segs.length - 1];
const totalBytes = () => R.segs.reduce((n, s) => n + (s.file ? s.file.size : s.chunks.reduce((a, c) => a + c.size, 0)), 0);
const extOf = m => /mp4|aac|m4a/.test(m || '') ? 'm4a' : /ogg/.test(m || '') ? 'ogg' : 'webm';
const saveMeta = () => R.source === 'file' ? null : store.putMeta({ key: SESS, mime: R.mime, marks: R.marks, segs: R.segs.map(s => ({ id: s.id, start: s.start, dur: s.dur || 0 })), nextId: R.nextId, sent: R.sent, up: R.up, free: R.free, qi: R.qi, qmap: R.qmap });
function resetAll() {
  if (R.tick) clearInterval(R.tick);
  if (R.rec && R.rec.state !== 'inactive') try { R.rec.stop(); } catch (e) { }
  if (R.stream) R.stream.getTracks().forEach(t => t.stop());
  clearTimeout(R.muteTimer); releaseWake(); meterOff();
  revokeUrls();
  Object.assign(R, { state: 'idle', stream: null, rec: null, mime: '', ext: '', segs: [], nextId: 0, marks: [], qmap: {}, qi: 0, free: false, activeMs: 0, resumeAt: 0, hiddenAt: null, tick: null, muteTimer: null, sent: [], up: {}, source: 'mic', sendFailed: false });
}
async function releaseWake() { try { if (R.wake) await R.wake.release(); } catch (e) { } R.wake = null; }
async function holdWake() { try { if ('wakeLock' in navigator && !R.wake && document.visibilityState === 'visible') { R.wake = await navigator.wakeLock.request('screen'); R.wake.addEventListener('release', () => { R.wake = null; }); } } catch (e) { } }

/* ---------- 시작 ---------- */
async function start() {
  if (!TOKEN) return fatal('링크가 올바르지 않아요', '받으신 문자나 카카오톡의 링크를 다시 눌러 주세요.');
  try { INFO = await retry(() => call({ action: 'info' })); INFO_DAY = kstDay(); }
  catch (e) { return fatal(e.status === 410 ? '사용이 끝난 링크예요' : '링크를 열 수 없어요', e.message, e.status == null); }
  PARENT = INFO.audience === 'parent';
  document.body.classList.toggle('parent', PARENT);
  document.querySelector('.top span').textContent = PARENT ? '내 이야기 녹음' : '부모님 이야기 녹음';
  document.title = PARENT ? '모아온 · 내 이야기 녹음' : '모아온 · 부모님 이야기 녹음';
  if (DEMO && !document.querySelector('.demo-strip')) document.querySelector('.top').insertAdjacentHTML('afterend', '<p class="demo-strip" role="note"><b>체험 모드</b> · 실제로 보내지 않습니다</p>');
  SESS = await sessKey();
  const pending = await store.getMeta(SESS);
  if (pending && pending.segs && pending.segs.length) return showPending(pending);
  showHome();
}
function fatal(title, msg, again) { show(`<section class="card center"><h1>${esc(title)}</h1><p>${esc(msg)}</p>${again ? '<button type="button" class="big go" data-act="reload">다시 열기</button>' : ''}</section>`); }

/* ---------- 앱 안 브라우저 안내 ---------- */
function inAppBanner() {
  if (!IA) return '';
  const browser = IOS ? 'Safari(사파리)' : 'Chrome(크롬)';
  const direct = IA.id === 'kakao' || IA.id === 'line';
  const how = IOS ? '화면 아래나 위의 <b>⋯</b> 또는 공유 버튼을 누르고 <b>\'Safari로 열기\'</b>를 고르세요.' : '오른쪽 위 <b>⋮</b>를 누르고 <b>\'다른 브라우저로 열기\'</b>를 고르세요.';
  return `<section class="banner" role="note"><p><b>${esc(IA.name)} 안에서 열렸어요.</b> 녹음이 중간에 멈추지 않도록 ${browser}에서 열어 주세요.</p>
    ${direct ? `<button type="button" class="big go" data-act="external">${browser}로 열기</button>` : `<p class="hint">${how}</p><button type="button" class="big outline" data-act="copy">링크 복사하기</button>`}
    <p class="hint">그대로 녹음해도 되지만, 마이크가 안 되면 위 방법으로 열어 주세요.</p></section>`;
}
function openExternal() {
  if (IA && IA.id === 'kakao') { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href); return; }
  if (IA && IA.id === 'line') { const u = new URL(location.href); u.searchParams.set('openExternalBrowser', '1'); location.href = u.toString(); return; }
  copyLink();
}
async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast('링크를 복사했어요. 브라우저 주소창에 붙여 넣어 주세요.'); }
  catch (e) { const b = app.querySelector('.banner'); if (b && !b.querySelector('input')) { b.insertAdjacentHTML('beforeend', '<label class="lbl" for="linkbox">이 링크를 길게 눌러 복사하세요</label><input id="linkbox" class="linkbox" readonly>'); const i = b.querySelector('input'); i.value = location.href; i.select(); } }
}

/* ---------- 살아온 순서 중 어디쯤인지 ---------- */
// 7칸 막대 하나와 한 줄 글. 지금 여쭙는 시절은 진하게, 다 들려주신 시절은 ✓.
function lifePath() {
  const pr = INFO.progress; if (!Array.isArray(pr) || !pr.some(p => p.total)) return '';
  const first = (INFO.questions || [])[0];
  const now = first && first.stage ? first.stage : (pr.find(p => p.answered < p.total) || {}).stage;
  const cells = pr.map(p => {
    const full = p.total && p.answered >= p.total, cls = p.stage === now ? 'now' : full ? 'full' : p.total ? '' : 'none';
    return `<li class="${cls}"><span class="sr">${p.stage}. ${esc(stageName(p.stage))}: ${p.stage === now ? '지금 여쭙는 시절' : full ? '다 들려주심' : p.total ? '아직' : '질문 없음'}</span></li>`;
  }).join('');
  return `<section class="lifepath" aria-label="살아온 순서">${now ? `<p class="lp-now">지금은 <b>'${esc(stageName(now))}'</b> 이야기를 여쭤봐요</p>` : ''}
    <ol class="lp-bar">${cells}</ol><p class="lp-ends" aria-hidden="true"><span>어린 시절</span>${now ? `<span>${now} / 7</span>` : ''}<span>지금</span></p></section>`;
}
async function moreQuestions(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '질문을 불러오는 중…'; }
  try { INFO = await retry(() => call({ action: 'info', more: true })); INFO_DAY = kstDay(); showHome(); }
  catch (e) { toast(e.message); if (btn) { btn.disabled = false; btn.textContent = '더 이야기하기'; } }
}
// 날짜가 바뀌면(한국 시간 0시) 처음 화면의 질문을 새로 받아 옵니다
async function refreshIfNewDay() {
  if (!INFO || !INFO_DAY || kstDay() === INFO_DAY || document.visibilityState !== 'visible') return;
  if (R.state !== 'idle' || R.segs.length || AI || sending || !app.querySelector('.intro')) return;
  try { INFO = await call({ action: 'info' }); INFO_DAY = kstDay(); if (app.querySelector('.intro') && R.state === 'idle' && !R.segs.length) showHome(); } catch (e) { }
}
setInterval(refreshIfNewDay, 60000);

/* ---------- 1. 처음 화면 ---------- */
function showHome() {
  resetAll();
  if (!INFO.consent_ok) {
    show(`<section class="card center"><h1>녹음 동의가 필요해요</h1><p>${PARENT ? '녹음·보관 동의가 아직 기록되지 않았어요. 자녀분이나 담당자에게 알려 주세요.' : '부모님의 녹음·보관 동의가 아직 기록되지 않았어요. 담당자에게 알려 주시면 확인 후 바로 열어 드릴게요.'}</p></section>`);
    return;
  }
  const qs = INFO.questions, n = qs.length;
  const T = PARENT ? INFO.title || '부모님' : '';
  const recBtn = CAN_RECORD
    ? `<button type="button" class="big go" data-act="rec">● 녹음 시작</button>
       <p class="hint center">처음 누르면 마이크를 허용해 달라는 창이 떠요. <b>'허용'</b>을 눌러 주세요.</p>`
    : `<p class="warn">이 브라우저에서는 바로 녹음이 안 돼요. 휴대폰의 음성 메모(녹음기)로 녹음한 뒤 아래 <b>'녹음 파일 올리기'</b>로 보내 주세요.</p>`;
  const past = INFO.answered || [], done = INFO.answered_count || 0, td = INFO.today || null;
  const todayDone = !!(td && td.done && !n); // 오늘 몫(5개)을 다 함
  // 자녀 화면: 진행 상황 한 줄. 부모님 화면: 답한 것이 있을 때만 격려 한 줄.
  const stat = PARENT ? (done ? `지금까지 <b>${done}개</b>의 질문에 답해 주셨어요.` : '')
    : td ? `오늘 답한 질문 <b>${td.answered}개</b> · 오늘 남은 질문 <b>${n}개</b> · 지금까지 <b>${done}개</b>`
    : (done || n ? `지금까지 답한 질문 <b>${done}개</b> · 이번에 여쭤볼 질문 <b>${n}개</b>` : '');
  const listTitle = td && td.more ? `더 여쭤볼 질문 ${n}개` : `오늘 여쭤볼 질문 ${n}개`;
  show(`${inAppBanner()}<section class="intro">${PARENT
      ? `<h1>${esc(T)}, 안녕하세요.<br>살아오신 이야기를 들려주세요</h1><p>질문을 보시고 편하게 말씀해 주세요. 글로 옮기고 책으로 엮는 일은 모아온이 해요.</p>`
      : `<h1>이번 질문을<br>부모님께 여쭤봐 주세요</h1><p>녹음 버튼은 처음에 한 번만 누르세요. 질문을 넘겨도 녹음은 끊기지 않고 이어져요.</p>`}
    ${lifePath()}${stat ? `<p class="done-count">${stat}</p>` : ''}</section>
    ${INFO.ai_available ? `<section class="card ai-card"><h2>AI와 이야기 나누기</h2><p>AI 인터뷰어가 질문을 소리 내어 여쭙고, 말씀을 듣고 이어서 물어봐요.</p>${INFO.ai_paused ? '<p class="warn">지금은 AI 대화를 쓸 수 없어요. 아래 <b>\'● 녹음 시작\'</b>으로 직접 녹음해 주세요.</p>' : HAS_MIC ? '<button type="button" class="big go" data-act="ai">AI와 이야기 시작하기</button>' : noMicCard()}</section><div class="or"><span>또는 직접 녹음하기</span></div>` : ''}
    ${todayDone ? `<section class="card center today-done"><p class="check" aria-hidden="true">✓</p><h2>오늘 이야기는 여기까지예요</h2>
        <p>오늘 질문 <b>${td.answered}개</b>에 답해 주셨어요. 고맙습니다.<br>내일 이 링크를 다시 열면 이어서 여쭤볼게요.</p>
        <button type="button" class="big outline" data-act="more-q">더 이야기하기</button><p class="hint">다음 질문을 ${Math.min(5, td.left_total || 5)}개 더 볼 수 있어요.</p></section>`
      : `${recBtn}
    <h2>${n ? listTitle : '오늘은 정해진 질문이 없어요'}</h2>
    ${n ? `<ol class="qlist">${qs.map((q, i) => `<li><span class="qno" aria-hidden="true">${i + 1}</span><span class="qtext">${q.stage && (i === 0 || qs[i - 1].stage !== q.stage) ? `<small class="qst">${esc(stageName(q.stage))}</small>` : ''}${esc(q.text)}</span>${PARENT ? `<button type="button" class="say" data-say="${i}" aria-label="${i + 1}번 질문 소리로 듣기">🔊 듣기</button>` : ''}</li>`).join('')}</ol>
      ${td && !td.more ? `<p class="hint center">답하지 못한 질문은 내일 이어서 나와요.</p>` : ''}`
      : `<p class="empty">살아오신 이야기 중 떠오르는 장면을 자유롭게 녹음해 주세요.</p>`}`}
    ${(n || todayDone) && CAN_RECORD ? '<button type="button" class="link block" data-act="free">질문 없이 자유롭게 녹음하기</button>' : ''}
    ${past.length ? `<details class="card past"><summary>지난번에 들려주신 이야기 ${INFO.answered_count || past.length}개</summary><ul>${past.map(p => `<li><span class="ok" aria-hidden="true">✓</span> ${esc(p.text)}</li>`).join('')}</ul>${(INFO.answered_count || 0) > past.length ? `<p class="hint">최근 ${past.length}개만 보여요.</p>` : ''}</details>` : ''}
    <details class="card tips"><summary>${PARENT ? '이렇게 하시면 좋아요' : '이렇게 물어보세요'}</summary><ol>${(PARENT ? TIPS_PARENT : TIPS_CHILD).map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol></details>
    <label class="filebtn">${CAN_RECORD ? '휴대폰에 이미 녹음해 둔 파일 올리기' : '녹음 파일 올리기'}<input type="file" accept="audio/*,.m4a,.amr" id="file"></label>
    <p class="foot">링크 사용 기한: ${esc(new Date(INFO.expires_at).toLocaleDateString('ko-KR'))}까지 · 이 링크는 이 가족만을 위한 것이니 다른 분께 전달하지 말아 주세요.</p>`);
}

/* ---------- 질문 읽어 주기 (부모님용) ---------- */
function say(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.9;
  const v = speechSynthesis.getVoices().find(x => /^ko/i.test(x.lang)); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
// 아이폰은 버튼을 누른 그 순간에 한 번 말해 두어야 나중에 소리를 낼 수 있습니다
function unlockSpeech() { try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { } }

/* ---------- 마이크 소리 크기 (녹음 중 막대로 보여 줌) ---------- */
const M = { ctx: null, src: null, an: null, buf: null, raf: 0, paint: 0, quietMs: 0, last: 0, heard: false };
// 버튼을 누른 순간(사용자 동작 안)에 만들어야 아이폰에서 막대가 움직입니다
function audioCtx() {
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  try { if (!M.ctx || M.ctx.state === 'closed') M.ctx = new C(); if (M.ctx.state === 'suspended') M.ctx.resume().catch(() => { }); } catch (e) { M.ctx = null; }
  return M.ctx;
}
function meterOn(stream) {
  meterOff(true);
  if (!M.ctx) return;
  try { M.src = M.ctx.createMediaStreamSource(stream); M.an = M.ctx.createAnalyser(); M.an.fftSize = 1024; M.buf = new Uint8Array(M.an.fftSize); M.src.connect(M.an); } catch (e) { return; }
  M.quietMs = 0; M.last = performance.now(); M.heard = false;
  const loop = now => {
    M.raf = requestAnimationFrame(loop);
    const dt = now - M.last; M.last = now;
    if (now - M.paint < 100) return; M.paint = now;
    M.an.getByteTimeDomainData(M.buf);
    let sum = 0; for (let i = 0; i < M.buf.length; i++) { const v = (M.buf[i] - 128) / 128; sum += v * v; }
    const db = 20 * Math.log10(Math.sqrt(sum / M.buf.length) || 1e-6);
    const pct = Math.max(0, Math.min(100, Math.round((db + 60) / 50 * 100)));
    const bar = document.getElementById('lvl'); if (bar) bar.style.width = pct + '%';
    if (R.state !== 'recording') return;
    if (pct >= 18) { M.quietMs = 0; M.heard = true; } else M.quietMs += Math.min(dt, 1000) + 100;
    const msg = document.getElementById('lvlmsg'); if (!msg) return;
    const quiet = M.quietMs > 12000;
    const text = quiet ? '소리가 거의 들리지 않아요. 휴대폰을 말씀하시는 분 가까이 두세요.' : M.heard ? '소리가 잘 들어오고 있어요.' : '말씀하시면 막대가 움직여요.';
    if (msg.textContent !== text) { msg.textContent = text; msg.classList.toggle('bad', quiet); }
  };
  M.raf = requestAnimationFrame(loop);
}
function meterOff(keepCtx) {
  cancelAnimationFrame(M.raf); M.raf = 0;
  try { if (M.src) M.src.disconnect(); } catch (e) { }
  M.src = M.an = null;
  if (!keepCtx && M.ctx) { M.ctx.close().catch(() => { }); M.ctx = null; }
}

/* ---------- 2. 이어 녹음 ---------- */
function pickMime() {
  // 아이폰·맥 사파리는 mp4(AAC)가 가장 안정적이고, 그 밖에는 webm(Opus)이 가장 안정적입니다.
  const list = APPLE_WEBKIT ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return list.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}
async function getMic(ask) {
  const s = await (ask ? askMic : c => navigator.mediaDevices.getUserMedia(c))({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const track = s.getAudioTracks()[0];
  if (track) {
    track.addEventListener('ended', () => interrupted());
    // 다른 앱(전화)이 마이크를 가져가면 '음소거'가 됩니다. 잠깐(2.5초)이 아니면 멈춘 것으로 봅니다.
    track.addEventListener('mute', () => { clearTimeout(R.muteTimer); R.muteTimer = setTimeout(() => { if (track.muted) interrupted(); }, 2500); });
    track.addEventListener('unmute', () => clearTimeout(R.muteTimer));
  }
  return s;
}
function startSegment() {
  let rec;
  try { rec = new MediaRecorder(R.stream, R.mime ? { mimeType: R.mime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 }); }
  catch (e) { rec = new MediaRecorder(R.stream); }
  const seg = { id: R.nextId++, start: elapsed(), chunks: [], bytes: 0, dur: 0 };
  seg.done = new Promise(ok => { seg.finish = ok; });
  R.segs.push(seg);
  let i = 0;
  rec.ondataavailable = e => {
    if (!e.data || !e.data.size) return;
    if (!R.mime && e.data.type) R.mime = e.data.type;
    seg.chunks.push(e.data); seg.bytes += e.data.size; store.putChunk(SESS, seg.id, i++, e.data);
    if (rec === R.rec && R.state === 'recording' && seg.bytes >= SEG_BYTES) rotate(); // 파일 한 개가 50MB를 넘지 않게
  };
  rec.onstop = () => { seg.dur = Math.max(0, elapsed() - seg.start); saveMeta(); seg.finish(); };
  rec.onerror = () => { if (rec === R.rec) interrupted(); };
  rec.start(5000);
  if (!R.mime) R.mime = rec.mimeType || '';
  R.rec = rec;
  saveMeta();
}
// 새 녹음기를 먼저 시작하고 이전 것을 닫아 빈틈이 없게 합니다
function rotate() { const old = R.rec; startSegment(); try { old.stop(); } catch (e) { } }
function markQuestion() {
  if (R.free || !INFO.questions.length) return;
  const q = INFO.questions[R.qi];
  const last = R.marks[R.marks.length - 1];
  R.qmap[q.id] = q.text;
  if (!last || last.plan_id !== q.id) R.marks.push({ plan_id: q.id, at: Math.round(elapsed() * 10) / 10 });
  saveMeta();
}
// 마이크 허용 창이 뜰 때 큰 글씨로 무엇을 눌러야 하는지 알려 줍니다 (이미 허용했으면 거의 보이지 않음)
async function askMic(constraints) {
  let st = 'unknown';
  try { st = (await navigator.permissions.query({ name: 'microphone' })).state; } catch (e) { }
  if (st === 'denied') { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }
  let ov = null;
  const timer = st === 'granted' ? 0 : setTimeout(() => { ov = showAskMic(); }, 400);
  try { return await navigator.mediaDevices.getUserMedia(constraints); }
  finally { clearTimeout(timer); if (ov) ov.remove(); }
}
function showAskMic() {
  const btn = IOS ? '<span class="fake-btn">허용</span>' : '<span class="fake-btn">사이트 사용 중에만 허용</span> 또는 <span class="fake-btn">이번만 허용</span>';
  document.body.insertAdjacentHTML('beforeend', `<div class="askmic" role="alertdialog" aria-labelledby="askt" aria-describedby="askd"><div class="askbox">
    <p class="askicon" aria-hidden="true">🎤</p><h2 id="askt">마이크를 허용해 주세요</h2>
    <p id="askd">화면에 작은 창이 떠요.<br>그 창에서 ${btn}을 눌러 주세요.</p>
    <p class="hint">허용해야 목소리를 들을 수 있어요. 녹음은 책을 만드는 데에만 쓰여요.</p></div></div>`);
  return document.body.lastElementChild;
}
function micHelp(e) {
  const name = e && e.name;
  const how = IOS ? '주소창 왼쪽의 <b>가가</b>(또는 ⓐ) 버튼 → <b>웹 사이트 설정</b> → <b>마이크: 허용</b>으로 바꾼 뒤 다시 눌러 주세요.'
    : '주소창 왼쪽의 <b>자물쇠</b>(또는 ⓘ) 버튼 → <b>권한</b> → <b>마이크 허용</b>으로 바꾼 뒤 다시 눌러 주세요.';
  const msg = name === 'NotAllowedError' || name === 'SecurityError' ? `마이크 사용이 막혀 있어요. ${how}`
    : name === 'NotFoundError' ? '마이크를 찾지 못했어요. 이어폰을 뺐다 끼우거나 다른 휴대폰으로 해 주세요.'
    : name === 'NotReadableError' ? '다른 앱(전화·영상 통화·카메라)이 마이크를 쓰고 있어요. 그 앱을 닫고 다시 눌러 주세요.'
    : '마이크를 켜지 못했어요. 잠시 후 다시 눌러 주세요.';
  const box = document.getElementById('michelp');
  if (box) {
    box.innerHTML = `<p class="warn big-warn" role="alert">${msg}${IA ? `<br><b>${esc(IA.name)} 안에서는 마이크가 막혀 있을 수 있어요.</b> 다른 브라우저에서 열어 주세요.` : ''}</p>
      ${IA ? noMicCard().replace(/<p class="warn">[\s\S]*?<\/p>/, '') : ''}
      ${CAN_RECORD ? '<p class="hint">계속 안 되면 휴대폰 녹음기로 녹음한 뒤 파일로 올려 주세요.</p>' : ''}`;
    box.scrollIntoView({ block: 'center' });
  }
  else toast(msg.replace(/<[^>]+>/g, ''));
}
async function begin(free) {
  audioCtx(); if (PARENT) unlockSpeech();
  if (!CAN_RECORD) return;
  const btn = app.querySelector('[data-act="rec"]'); if (btn) btn.disabled = true;
  if (!document.getElementById('michelp') && btn) btn.insertAdjacentHTML('afterend', '<div id="michelp"></div>');
  try { R.stream = await getMic(true); }
  catch (e) { if (btn) btn.disabled = false; return micHelp(e); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { }); } catch (e) { }
  R.free = !!free || !INFO.questions.length; R.mime = pickMime(); R.source = 'mic';
  R.state = 'recording'; R.resumeAt = performance.now();
  try { startSegment(); } catch (e) { R.state = 'idle'; R.stream.getTracks().forEach(t => t.stop()); toast('이 휴대폰에서는 녹음을 시작하지 못했어요. 휴대폰 녹음기로 녹음한 뒤 파일로 올려 주세요.'); if (btn) btn.disabled = false; return; }
  markQuestion(); holdWake(); meterOn(R.stream);
  R.tick = setInterval(onTick, 500);
  showRecorder(); announce('녹음을 시작했어요.');
  if (PARENT && !R.free) setTimeout(() => say(INFO.questions[R.qi].text), 400);
}
function onTick() {
  const c = document.getElementById('clock'); if (c) c.textContent = clock(elapsed());
  if (R.state !== 'recording') return;
  if (elapsed() >= MAX_TOTAL_SEC) { toast('4시간이 되어 녹음을 마쳤어요. 보낸 뒤 새로 녹음해 주세요.'); stopAll(); return; }
  if (elapsed() - curSeg().start >= SEG_SEC) rotate();
}
function pause() {
  if (R.state !== 'recording' || !R.rec.pause) return;
  try { R.rec.pause(); } catch (e) { return; }
  R.activeMs += performance.now() - R.resumeAt; R.state = 'paused'; showRecorder(); announce('잠시 멈췄어요.');
}
function resume() {
  if (R.state !== 'paused') return;
  audioCtx();
  const t = R.stream && R.stream.getAudioTracks()[0];
  if (!t || t.readyState === 'ended' || R.rec.state === 'inactive') { R.state = 'recording'; R.resumeAt = performance.now(); interrupted(); return; }
  try { R.rec.resume(); } catch (e) { R.state = 'recording'; R.resumeAt = performance.now(); interrupted(); return; }
  R.resumeAt = performance.now(); R.state = 'recording'; holdWake(); showRecorder(); announce('다시 녹음하고 있어요.');
}
function interrupted() {
  if (!['recording', 'paused'].includes(R.state)) return;
  const endAt = R.hiddenAt != null ? Math.max(R.resumeAt, R.hiddenAt) : performance.now();
  if (R.state === 'recording') R.activeMs += endAt - R.resumeAt;
  R.state = 'interrupted';
  clearTimeout(R.muteTimer);
  try { if (R.rec && R.rec.state !== 'inactive') R.rec.stop(); } catch (e) { }
  if (R.stream) R.stream.getTracks().forEach(t => t.stop());
  R.stream = null;
  meterOff(true); releaseWake(); showRecorder(); announce('녹음이 멈췄어요. 이어서 녹음을 누르면 계속됩니다.');
  if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) { }
}
// 멈춘 뒤 이어서 녹음, 또는 '들어 보고 보내기' 화면에서 더 녹음
async function continueRec() {
  audioCtx(); if (PARENT) unlockSpeech();
  const btn = app.querySelector('[data-act="continue"], [data-act="more"]'); if (btn) btn.disabled = true;
  if (!document.getElementById('michelp') && btn) btn.insertAdjacentHTML('afterend', '<div id="michelp"></div>');
  let stream;
  try { stream = await getMic(true); }
  catch (e) { if (btn) btn.disabled = false; return micHelp(e); }
  if (R.state === 'idle') R.activeMs = Math.max(R.activeMs, ...R.segs.map(s => (s.start + Math.max(s.dur || 0, 1)) * 1000));
  R.stream = stream; R.state = 'recording'; R.resumeAt = performance.now(); R.hiddenAt = null;
  startSegment(); markQuestion(); holdWake(); meterOn(R.stream);
  if (!R.tick) R.tick = setInterval(onTick, 500);
  showRecorder(); announce('이어서 녹음하고 있어요.');
}
async function stopAll() {
  if (!['recording', 'paused', 'interrupted'].includes(R.state)) return;
  if (R.state === 'recording') R.activeMs += performance.now() - R.resumeAt;
  const live = R.rec && R.rec.state !== 'inactive';
  R.state = 'stopping';
  const b = app.querySelector('[data-act="stop"]'); if (b) { b.disabled = true; b.textContent = '녹음을 정리하는 중…'; }
  if (live) try { R.rec.stop(); } catch (e) { }
  await Promise.race([Promise.all(R.segs.map(s => s.done)), wait(4000)]); // 마지막 조각이 다 저장될 때까지
  finishStop();
}
function finishStop() {
  if (R.tick) clearInterval(R.tick); R.tick = null;
  if (R.stream) R.stream.getTracks().forEach(t => t.stop()); R.stream = null;
  releaseWake(); meterOff();
  R.segs = R.segs.filter(s => s.chunks.length);
  R.state = 'idle'; saveMeta();
  if (!R.segs.length) { toast('녹음된 소리가 없어요. 다시 시도해 주세요.'); store.clear(SESS); showHome(); return; }
  showReview();
}
function goQuestion(d) {
  const n = INFO.questions.length; if (!n || R.free) return;
  const was = R.qi;
  R.qi = Math.max(0, Math.min(n - 1, R.qi + d));
  if (R.qi === was) return;
  if (['recording', 'paused'].includes(R.state)) markQuestion(); else saveMeta();
  showRecorder(true);
  announce(`질문 ${R.qi + 1}. ${INFO.questions[R.qi].text}`);
  if (PARENT) say(INFO.questions[R.qi].text);
}
function showRecorder(focusQ) {
  const n = INFO.questions.length, q = !R.free && n ? INFO.questions[R.qi] : null;
  const live = R.state === 'recording', paused = R.state === 'paused', stopped = R.state === 'interrupted';
  const last = q && R.qi === n - 1;
  app.innerHTML = `<section class="card status ${live ? 'is-live' : paused ? 'is-paused' : 'is-stopped'}">
      <p class="live">${live ? '<i aria-hidden="true"></i>녹음 중' : paused ? '<span aria-hidden="true">Ⅱ</span> 잠시 멈춤' : '<span aria-hidden="true">■</span> 녹음이 멈췄어요'} <b id="clock" aria-label="녹음 시간">${clock(elapsed())}</b></p>
      ${stopped ? `<p class="warn">전화가 왔거나, 화면이 꺼졌거나, 다른 앱을 쓰셔서 녹음이 멈췄어요. <b>지금까지 녹음은 휴대폰에 안전하게 남아 있어요.</b></p><button type="button" class="big go" data-act="continue">● 이어서 녹음</button>`
        : `<div class="meter" aria-hidden="true"><i id="lvl"></i></div><p class="lvlmsg" id="lvlmsg" aria-live="polite">${paused ? '잠시 멈췄어요. \'계속 녹음\'을 누르면 이어서 녹음돼요.' : '말씀하시면 막대가 움직여요.'}</p>
           ${R.rec && R.rec.pause ? (paused ? '<button type="button" class="big go" data-act="resume">▶ 계속 녹음</button>' : '<button type="button" class="pill-btn" data-act="pause">Ⅱ 잠시 멈춤</button>') : ''}`}
    </section>
    ${q ? `<section class="card qcard" aria-label="지금 질문"><small>${q.stage ? `${esc(stageName(q.stage))} · ` : ''}질문 ${R.qi + 1} / ${n}</small><h1>${esc(q.text)}</h1>${PARENT ? '<button type="button" class="say" data-act="say">🔊 다시 듣기</button>' : ''}
      ${last ? `<p class="hint">마지막 질문이에요. 다 말씀하셨으면 아래 <b>'녹음 끝내기'</b>를 누르세요.</p>` : `<button type="button" class="big outline next" data-act="next">다음 질문 ›</button>`}
      ${R.qi > 0 ? '<button type="button" class="link" data-act="prev">‹ 이전 질문으로</button>' : ''}</section>`
      : `<section class="card qcard"><small>자유 녹음</small><h1>${PARENT ? '떠오르는 이야기를 편하게 말씀해 주세요' : '부모님이 하고 싶으신 이야기를 들어 주세요'}</h1></section>`}
    ${!PARENT && q ? `<details class="card tips"><summary>이렇게 물어보세요</summary><ol>${TIPS_CHILD.slice(2).map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol></details>` : ''}
    <button type="button" class="big stop" data-act="stop">■ 녹음 끝내기</button>
    <p class="hint center">다 끝나면 마지막에 한 번만 누르세요. 들어 보고 보낼 수 있어요.</p>`;
  if (focusQ) { const h = app.querySelector('.qcard h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  else if (stopped) { const b = app.querySelector('[data-act="continue"]'); if (b) b.focus({ preventScroll: true }); }
}

/* ---------- 3. 확인하고 보내기 ---------- */
let urls = [];
function revokeUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
function segBlob(s) { return s.file || new Blob(s.chunks, { type: TYPES[extOf(R.mime)] || 'audio/webm' }); }
// 3초도 안 머문 질문은 빼고, 같은 질문이 이어지면 하나로 합칩니다
function cleanMarks() {
  const out = [];
  R.marks.forEach((m, i) => {
    const next = R.marks[i + 1];
    if (next && next.at - m.at < MIN_MARK_SEC) return;
    const last = out[out.length - 1];
    if (last && last.plan_id === m.plan_id) return;
    out.push(m);
  });
  return out;
}
// 조각 i 안에서의 질문 표시 (조각 시작 기준 초). 조각이 시작될 때 이미 보고 있던 질문은 0초로 넣습니다.
function marksFor(i) {
  const s = R.segs[i], end = i + 1 < R.segs.length ? R.segs[i + 1].start : Infinity, all = cleanMarks();
  const before = all.filter(m => m.at <= s.start).slice(-1);
  const inside = all.filter(m => m.at > s.start && m.at < end);
  const out = [...before.map(m => ({ plan_id: m.plan_id, at: 0 })), ...inside.map(m => ({ plan_id: m.plan_id, at: Math.round(m.at - s.start) }))];
  return out.filter((m, k) => !k || m.plan_id !== out[k - 1].plan_id);
}
function showReview() {
  revokeUrls();
  const parts = R.segs.length, total = R.segs.reduce((a, s) => a + (s.dur || 0), 0);
  const qtext = id => (INFO.questions.find(q => q.id === id) || {}).text || R.qmap[id] || '(이전에 받은 질문)';
  const fromFile = R.source === 'file', marks = fromFile ? [] : cleanMarks();
  const src = s => { const u = URL.createObjectURL(segBlob(s)); urls.push(u); return u; };
  show(`<section class="card"><h1>들어 보고 보내 주세요</h1>
      <p class="meta">${fromFile ? esc(R.segs[0].file.name) : `녹음 ${total ? clock(total) : ''}`} · ${(totalBytes() / 1024 / 1024).toFixed(1)}MB${parts > 1 ? ` · ${parts}개로 나눠 보냅니다` : ''}</p>
      ${R.segs.map((s, i) => `<div class="part">${parts > 1 ? `<small>${i + 1}번째 부분${s.dur ? ` (${clock(s.dur)})` : ''}${R.sent.includes(s.id) ? ' · <b class="ok">✓ 보냄</b>' : ''}</small>` : ''}<audio controls preload="metadata" src="${src(s)}"></audio></div>`).join('')}
      ${fromFile && INFO.questions.length ? `<label for="fileq" class="lbl">어떤 질문에 대한 대답인가요?</label><select id="fileq"><option value="">질문 없이 자유 녹음</option>${INFO.questions.map(q => `<option value="${q.id}">${esc(q.text)}</option>`).join('')}</select>` : ''}
      ${marks.length ? `<h2>녹음한 질문 ${marks.length}개</h2><ol class="marks">${marks.map(m => `<li><span class="t">${clock(m.at)}</span><span>${esc(qtext(m.plan_id))}</span></li>`).join('')}</ol>` : ''}
      <label class="agree"><input type="checkbox" id="agree"><span>${PARENT ? '녹음한 제 이야기를 책 만드는 데 쓰는 것에 동의합니다.' : '부모님께 녹음해서 책 제작에 쓴다는 것을 말씀드리고 동의를 받았어요.'}</span></label>
      <button type="button" class="big send" data-act="send" disabled>보내기</button>
      <div class="progress" hidden role="progressbar" aria-label="보내는 중" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><p class="hint center" id="sendmsg" aria-live="polite"></p>
      ${fromFile ? '' : '<button type="button" class="big outline" data-act="more">● 더 녹음하기</button>'}
      <button type="button" class="link block danger" data-act="discard">지우고 처음부터 다시</button></section>`);
}
function put(url, body, type, onProgress) {
  if (DEMO) return new Promise(ok => { let n = 0; const t = setInterval(() => { n += 0.25; onProgress(body.size * Math.min(1, n)); if (n >= 1) { clearInterval(t); ok(); } }, 250); });
  return new Promise((ok, fail) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('apikey', KEY); x.setRequestHeader('content-type', type); x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded); };
    x.onload = () => { if (x.status >= 200 && x.status < 300) ok(); else { const e = new Error('파일을 올리지 못했어요. 다시 시도해 주세요.'); e.status = x.status; fail(e); } };
    x.onerror = x.ontimeout = () => fail(new Error('인터넷 연결이 끊겼어요. 연결을 확인해 주세요.'));
    x.send(body);
  });
}
let sending = false, infoRefresh = null;
async function send() {
  if (sending) return;
  const agree = document.getElementById('agree'); if (!agree || !agree.checked) return;
  const segs = R.segs, blobs = segs.map(segBlob);
  if (blobs.some(b => b.size > MAX_BYTES)) return toast('파일이 너무 커요. 한 파일은 50MB까지 올릴 수 있어요.');
  sending = true; R.sendFailed = false;
  const btn = document.querySelector('[data-act="send"]'), bar = document.querySelector('.progress'), msg = document.getElementById('sendmsg');
  app.querySelectorAll('[data-act="more"],[data-act="discard"]').forEach(b => { b.disabled = true; });
  btn.disabled = true; btn.textContent = '보내는 중…'; bar.hidden = false; holdWake();
  const total = blobs.reduce((a, b) => a + b.size, 0);
  let doneBytes = blobs.reduce((a, b, i) => a + (R.sent.includes(segs[i].id) ? b.size : 0), 0);
  const setBar = n => { const p = Math.round((doneBytes + n) / total * 100); bar.firstElementChild.style.width = p + '%'; bar.setAttribute('aria-valuenow', p); };
  const fileQ = document.getElementById('fileq');
  const ext = R.source === 'file' ? R.ext : extOf(R.mime);
  try {
    for (let i = 0; i < blobs.length; i++) {
      const s = segs[i]; if (R.sent.includes(s.id)) continue;
      const label = blobs.length > 1 ? `${i + 1} / ${blobs.length} 보내는 중. ` : '';
      msg.textContent = label + '보내는 동안 화면을 끄지 마세요.';
      const onWait = t => { msg.textContent = label + t; };
      if (!R.up[s.id]) {
        // 올리다 끊기면 새 주소를 받아 처음부터 다시 올립니다 (반쯤 올라간 파일은 서버가 하루 뒤 지웁니다)
        const sg = await retry(async () => {
          const sg = await call({ action: 'sign', ext, size: blobs[i].size });
          const url = `${BASE}/storage/v1/object/upload/sign/audio/${sg.path.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(sg.token)}`;
          await put(url, blobs[i], sg.content_type, setBar);
          return sg;
        }, onWait);
        R.up[s.id] = { upload_id: sg.upload_id }; saveMeta();
      }
      const marks = R.source === 'file' ? (fileQ && fileQ.value ? [{ plan_id: Number(fileQ.value), at: 0 }] : []) : marksFor(i);
      try { await retry(() => call({ action: 'complete', upload_id: R.up[s.id].upload_id, agreed: true, marks, part: i + 1, parts: blobs.length }), onWait); }
      catch (e) { if (e.status === 404 || e.status === 409) { delete R.up[s.id]; saveMeta(); } throw e; }
      delete R.up[s.id]; R.sent.push(s.id); doneBytes += blobs[i].size; setBar(0); saveMeta();
      const tag = app.querySelectorAll('.part small')[i]; if (tag && !tag.querySelector('.ok')) tag.insertAdjacentHTML('beforeend', ' · <b class="ok">✓ 보냄</b>');
    }
    await store.clear(SESS); resetAll(); releaseWake(); showDone();
  } catch (e) {
    R.sendFailed = true; releaseWake();
    btn.disabled = false; btn.textContent = '다시 보내기';
    app.querySelectorAll('[data-act="more"],[data-act="discard"]').forEach(b => { b.disabled = false; });
    const left = segs.filter(s => !R.sent.includes(s.id)).length;
    msg.innerHTML = `<span class="bad">${esc(e.message)}</span><br>${R.sent.length ? `${segs.length}개 중 ${left}개가 남았어요. ` : ''}녹음은 휴대폰에 남아 있어요. 인터넷이 다시 연결되면 자동으로 이어서 보내요.`;
    announce(e.message);
  } finally { sending = false; }
}
function showDone() {
  show(`<section class="card center done"><p class="check" aria-hidden="true">✓</p><h1>잘 받았어요</h1>
    <p>${PARENT ? '소중한 이야기 고맙습니다. 담당자가 글로 옮겨 정리할게요.' : '담당자가 녹음을 글로 옮겨 정리할게요. 이야기 속에서 더 듣고 싶은 장면이 있으면 다음 질문으로 보내 드려요.'}</p>
    <button type="button" class="big go" data-act="home">처음 화면으로</button></section>`);
  // 답한 질문이 빠진 새 목록을 받아 둡니다. '처음 화면으로'는 이것을 기다립니다.
  infoRefresh = call({ action: 'info' }).then(d => { INFO = d; INFO_DAY = kstDay(); }).catch(() => { }).finally(() => { infoRefresh = null; });
}

/* ---------- 보내지 못한 녹음 이어서 보내기 ---------- */
async function showPending(m) {
  const rows = await store.chunks(SESS);
  R.mime = m.mime || ''; R.marks = m.marks || []; R.qmap = m.qmap || {}; R.sent = m.sent || []; R.up = m.up || {}; R.free = !!m.free; R.qi = Math.min(m.qi || 0, Math.max(0, INFO.questions.length - 1)); R.source = 'mic';
  R.segs = (m.segs || []).map((s, k) => {
    const id = s.id != null ? s.id : k;
    const seg = { id, start: s.start, dur: s.dur, chunks: rows.filter(r => r.seg === id).sort((a, b) => a.i - b.i).map(r => r.blob) };
    seg.bytes = seg.chunks.reduce((a, c) => a + c.size, 0); seg.done = Promise.resolve();
    return seg;
  }).filter(s => s.chunks.length);
  R.nextId = Math.max(m.nextId || 0, ...R.segs.map(s => s.id + 1));
  R.activeMs = Math.max(0, ...R.segs.map(s => (s.start + Math.max(s.dur || 0, 1)) * 1000));
  if (!R.segs.length) { await store.clear(SESS); return showHome(); }
  const total = R.segs.reduce((a, s) => a + (s.dur || 0), 0), left = R.segs.filter(s => !R.sent.includes(s.id)).length;
  show(`<section class="card center"><h1>보내지 않은 녹음이 있어요</h1><p>지난번 녹음${total ? `(${clock(total)})` : ''}이 휴대폰에 남아 있어요.${R.sent.length ? ` ${R.segs.length}개 중 ${left}개를 아직 보내지 않았어요.` : ''} 들어 보고 보낼 수 있어요.</p>
    <button type="button" class="big go" data-act="review">들어 보고 보내기</button><button type="button" class="link block danger" data-act="discard">지우고 새로 녹음하기</button></section>`);
}

/* ---------- 파일로 올리기 ---------- */
function pickFile(file) {
  if (!file) return;
  const e = (file.name.split('.').pop() || '').toLowerCase();
  if (!TYPES[e]) { toast('m4a, mp3, wav 같은 음성 파일을 골라 주세요.'); return; }
  if (file.size > MAX_BYTES) { toast('파일이 너무 커요. 50MB까지 올릴 수 있어요. 길면 나눠서 올려 주세요.'); return; }
  resetAll();
  R.source = 'file'; R.ext = e; R.segs = [{ id: 0, start: 0, dur: 0, chunks: [file], file }];
  showReview();
}

/* ---------- 부모님용: AI 인터뷰어와 대화 ----------
   흐름: 소개·동의 → (마이크 허용 안내) → 연결 → 대화 → 끝.
   연결이 안 되거나 중간에 끊기면 '다시 연결하기' 또는 '직접 녹음으로 바꾸기'를 고를 수 있습니다.
   대화하는 동안에는 화면이 꺼지지 않게 하고, 아이폰에서 화면이 꺼졌다 켜지면(마이크가 멈춤) 끊긴 것으로 안내합니다. */
let AI = null, aiTick = null, aiRun = null, aiHiddenAt = null;
function loadSdk() {
  if (window.ElevenLabsClient) return Promise.resolve();
  if (DEMO) { demoSdk(); return Promise.resolve(); }
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/elevenlabs-client-1.35.0.js'; s.onload = ok; s.onerror = () => no(new Error('AI 대화 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); document.head.appendChild(s); });
}
function noMicCard() {
  return `<p class="warn">${IA ? `${esc(IA.name)} 안에서는 마이크를 쓸 수 없어요.` : '이 브라우저에서는 마이크를 쓸 수 없어요.'} <b>${IOS ? 'Safari(사파리)' : 'Chrome(크롬)'}</b>에서 이 링크를 열어 주세요.</p>
    ${IA && (IA.id === 'kakao' || IA.id === 'line') ? `<button type="button" class="big go" data-act="external">${IOS ? 'Safari(사파리)' : 'Chrome(크롬)'}로 열기</button>` : '<button type="button" class="big outline" data-act="copy">링크 복사하기</button>'}`;
}
function showAiIntro() {
  show(`<button type="button" class="back" data-act="home">‹ 처음 화면</button>${HAS_MIC ? inAppBanner() : ''}
    <section class="card"><h1>AI와 이야기 나누기</h1>
    <ol class="steps"><li>AI 인터뷰어가 먼저 인사하고 질문을 소리 내어 여쭤봐요.</li><li>평소처럼 말씀하시면 AI가 듣고 이어서 물어봐요.</li><li>그만하고 싶으시면 언제든 '대화 끝내기'를 누르세요.</li></ol>
    <p class="hint">상대는 사람이 아닌 AI예요. 대화는 녹음되어 책을 만드는 데에만 쓰여요. 주민번호·계좌 같은 번호는 말씀하지 않으셔도 돼요.</p>
    ${HAS_MIC ? `<label class="agree"><input type="checkbox" id="agree"><span>AI와의 대화를 녹음해 책 만드는 데 쓰는 것에 동의합니다.</span></label>
    <button type="button" class="big send" data-act="ai-go" disabled>대화 시작</button><div id="michelp"></div>` : noMicCard()}</section>`);
}
async function aiStart() {
  const btn = app.querySelector('[data-act="ai-go"], [data-act="ai-retry"]'), label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '연결하는 중…'; if (!document.getElementById('michelp')) btn.insertAdjacentHTML('afterend', '<div id="michelp"></div>'); }
  holdWake(); // 연결하는 동안에도 화면이 꺼지지 않게
  try { const s = await askMic({ audio: true }); s.getTracks().forEach(t => t.stop()); }
  catch (e) { if (btn) { btn.disabled = false; btn.textContent = label; } releaseWake(); return micHelp(e); }
  if (!navigator.onLine) { releaseWake(); return showAiProblem('offline'); }
  let d;
  try { await loadSdk(); d = await call({ action: 'ai_start' }); }
  catch (e) { releaseWake(); return showAiProblem('start', e); }
  const run = aiRun = { started: performance.now(), connected: false, done: false, why: '' };
  showAiLive();
  aiTick = setInterval(() => aiPaint(run), 200);
  try {
    const conv = await window.ElevenLabsClient.Conversation.startSession({
      signedUrl: d.signed_url, connectionType: 'websocket', dynamicVariables: d.dynamic_variables,
      libsampleratePath: 'vendor/libsamplerate.worklet.js',
      onConnect: () => { run.connected = true; run.started = performance.now(); setAiMode('listening'); announce('AI와 연결되었어요. 말씀해 주세요.'); },
      onModeChange: m => { if (run.connected) setAiMode(m && m.mode); },
      onDisconnect: det => aiDisconnected(run, det),
      onError: () => { /* 끊기면 onDisconnect가 따로 옵니다 */ },
    });
    if (run.done) return;
    AI = conv; run.connected = true; holdWake();
  } catch (e) {
    if (run.done) return;
    run.done = true; clearInterval(aiTick); AI = null; releaseWake();
    if (d && d.dynamic_variables) call({ action: 'ai_fail', session_id: d.dynamic_variables.session_id }).catch(() => { });
    showAiProblem('start', e);
  }
}
function aiDisconnected(run, det) {
  if (run.done) return;
  run.done = true; clearInterval(aiTick); aiTick = null; AI = null; releaseWake();
  const why = run.why || (det && det.reason) || 'error';
  if (why === 'home') return;
  if (why === 'user' || why === 'agent') return showAiDone();
  showAiProblem(why === 'away' ? 'away' : !navigator.onLine ? 'offline' : 'drop');
}
function aiEnd(why) { if (!AI || !aiRun) return Promise.resolve(); aiRun.why = why; return AI.endSession().catch(() => aiDisconnected(aiRun, { reason: why })); }
function aiPaint(run) {
  const c = document.getElementById('clock'); if (c) c.textContent = clock(run.connected ? (performance.now() - run.started) / 1000 : 0);
  const bar = document.getElementById('ailvl');
  if (bar && AI && AI.getInputVolume) { let v = 0; try { v = AI.getInputVolume() || 0; } catch (e) { } bar.style.width = Math.min(100, Math.round(Math.sqrt(v) * 130)) + '%'; }
}
function setAiMode(m) {
  const t = document.getElementById('aimode'); if (!t) return;
  t.textContent = m === 'speaking' ? 'AI가 말하는 중이에요' : '듣고 있어요. 말씀해 주세요';
  const card = app.querySelector('.ai-live'); if (card) card.classList.toggle('speaking', m === 'speaking');
}
function showAiLive() {
  const noWake = !('wakeLock' in navigator);
  show(`<section class="card center ai-live"><h1 class="sr">AI와 대화 중</h1>
    <p class="live"><i aria-hidden="true"></i><span id="aimode" aria-live="polite">연결하는 중…</span></p>
    <p class="clock-big" id="clock" aria-label="대화 시간">0:00</p>
    <div class="meter" aria-hidden="true"><i id="ailvl"></i></div>
    <p class="hint">말씀하시면 막대가 움직여요. 휴대폰을 앞에 두고 평소처럼 말씀하세요.</p>
    <p class="warn" id="ainet" hidden></p>
    ${noWake ? '<p class="hint"><b>화면이 꺼지면 대화가 끊겨요.</b> 가끔 화면을 살짝 눌러 주세요.</p>' : '<p class="hint">대화하는 동안 화면은 꺼지지 않아요.</p>'}
    <button type="button" class="big stop" data-act="ai-end">■ 대화 끝내기</button>
    ${DEMO ? '<button type="button" class="link block" data-act="demo-drop">(체험) 연결이 끊긴 경우 보기</button>' : ''}</section>`);
}
function showAiProblem(kind, err) {
  const st = err && err.status, noRetry = st === 403 || st === 409 || st === 429;
  const korean = err && err.message && /[가-힣]/.test(err.message) && err.message.length < 90 ? err.message : '';
  const T = { start: 'AI와 연결하지 못했어요', drop: '대화가 중간에 끊겼어요', away: '화면이 꺼져서 대화가 멈췄어요', offline: '인터넷이 끊겼어요' }[kind];
  const P = {
    start: korean || '잠시 후 다시 연결해 보세요.',
    drop: '인터넷이 잠깐 불안정했을 수 있어요. 다시 연결하면 AI가 다시 인사하고 이어서 여쭤봐요.',
    away: '대화하는 동안에는 화면을 켜 두세요. 다시 연결하면 이어서 이야기할 수 있어요.',
    offline: '와이파이나 데이터가 켜져 있는지 확인한 뒤 \'다시 연결하기\'를 눌러 주세요.',
  }[kind];
  show(`${kind === 'start' && IA ? inAppBanner() : ''}<section class="card center problem"><p class="mark" aria-hidden="true">!</p><h1>${T}</h1><p>${esc(P)}</p>
    ${noRetry ? '' : '<button type="button" class="big go" data-act="ai-retry">다시 연결하기</button><div id="michelp"></div>'}
    ${CAN_RECORD ? `<button type="button" class="big ${noRetry ? 'go' : 'outline'}" data-act="ai-to-rec">● 직접 녹음으로 바꾸기</button><p class="hint">AI 없이 질문을 보며 말씀하시면 그대로 녹음돼요.</p>` : ''}
    <button type="button" class="link block" data-act="home">처음 화면으로</button></section>`);
  announce(T);
}
function showAiDone() {
  show(`<section class="card center done"><p class="check" aria-hidden="true">✓</p><h1>고맙습니다</h1><p>들려주신 이야기는 담당자가 글로 옮겨 정리할게요. 더 하고 싶은 이야기가 있으면 언제든 다시 눌러 주세요.</p>
    <button type="button" class="big go" data-act="home">처음 화면으로</button></section>`);
}
// 체험 모드: 진짜 AI 대신 말하기·듣기를 번갈아 보여 주는 가짜 대화
function demoSdk() {
  window.ElevenLabsClient = { Conversation: { startSession: async o => {
    await wait(900);
    let alive = true, t = 0, mode = 'listening';
    const turn = () => { if (!alive) return; mode = mode === 'speaking' ? 'listening' : 'speaking'; o.onModeChange({ mode }); t = setTimeout(turn, mode === 'speaking' ? 3500 : 6000); };
    o.onConnect({ conversationId: 'demo' }); t = setTimeout(turn, 300);
    const stop = reason => { if (!alive) return; alive = false; clearTimeout(t); setTimeout(() => o.onDisconnect({ reason }), 50); };
    return { endSession: async () => stop('user'), getInputVolume: () => alive && mode === 'listening' ? 0.05 + Math.random() * 0.25 : 0, demoDrop: () => stop('error') };
  } } };
}

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async e => {
  const s = e.target.closest('[data-say]'); if (s) { say(INFO.questions[+s.dataset.say].text); return; }
  const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
  const act = a.dataset.act;
  if (act === 'rec') begin(false);
  if (act === 'free') begin(true);
  if (act === 'pause') pause();
  if (act === 'resume') resume();
  if (act === 'continue' || act === 'more') continueRec();
  if (act === 'stop') stopAll();
  if (act === 'next') goQuestion(1);
  if (act === 'prev') goQuestion(-1);
  if (act === 'say') say(INFO.questions[R.qi].text);
  if (act === 'review') showReview();
  if (act === 'send') send();
  if (act === 'discard') { if (confirm('녹음을 지울까요? 지우면 되돌릴 수 없어요.')) { await store.clear(SESS); resetAll(); showHome(); } }
  if (act === 'home') { if (AI) await aiEnd('home'); if (infoRefresh) { a.disabled = true; await Promise.race([infoRefresh, wait(5000)]); } showHome(); }
  if (act === 'ai') showAiIntro();
  if (act === 'ai-go' || act === 'ai-retry') aiStart();
  if (act === 'ai-to-rec') { showHome(); begin(false); }
  if (act === 'ai-end') {
    // 잘못 눌러 끝나지 않게 두 번 누르게 합니다
    if (!a.dataset.armed) { a.dataset.armed = '1'; a.textContent = '한 번 더 누르면 대화가 끝나요'; setTimeout(() => { if (a.isConnected) { delete a.dataset.armed; a.textContent = '■ 대화 끝내기'; } }, 4000); return; }
    a.disabled = true; a.textContent = '끝내는 중…'; await aiEnd('user');
  }
  if (act === 'demo-drop' && AI && AI.demoDrop) AI.demoDrop();
  if (act === 'external') openExternal();
  if (act === 'copy') copyLink();
  if (act === 'reload') location.reload();
  if (act === 'more-q') moreQuestions(a);
});
document.addEventListener('change', e => {
  if (e.target.id === 'file') pickFile(e.target.files[0]);
  if (e.target.id === 'agree') { const b = document.querySelector('[data-act="send"], [data-act="ai-go"]'); if (b && !sending) b.disabled = !e.target.checked; }
});
// 다른 앱에 다녀오면 마이크가 꺼져 있는지 확인합니다.
// 아이폰은 화면이 꺼지거나 다른 앱으로 가면 마이크가 멈추므로, 3초 넘게 나가 있었으면 멈춘 것으로 보고 '이어서 녹음'을 띄웁니다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (R.state === 'recording') R.hiddenAt = performance.now(); if (AI) aiHiddenAt = performance.now(); saveMeta(); return; }
  // AI 대화: 아이폰은 화면이 꺼지면 마이크가 멈추므로, 3초 넘게 나가 있었으면 끊긴 것으로 안내합니다
  if (AI && IOS && aiHiddenAt != null && performance.now() - aiHiddenAt > 3000) aiEnd('away');
  aiHiddenAt = null;
  refreshIfNewDay();
  const away = R.hiddenAt != null ? performance.now() - R.hiddenAt : 0;
  if (R.stream && ['recording', 'paused'].includes(R.state)) {
    const t = R.stream.getAudioTracks()[0];
    if (!t || t.readyState === 'ended' || t.muted || (IOS && R.state === 'recording' && away > 3000)) interrupted();
  }
  R.hiddenAt = null;
  if (R.state === 'recording' || AI || sending) holdWake();
});
window.addEventListener('offline', () => { const n = document.getElementById('ainet'); if (n && AI) { n.hidden = false; n.textContent = '인터넷이 끊겼어요. 다시 연결되기를 기다리는 중이에요…'; } });
window.addEventListener('online', () => { const n = document.getElementById('ainet'); if (n) n.hidden = true; if (app.querySelector('[data-act="ai-retry"]')) toast('인터넷이 다시 연결됐어요. \'다시 연결하기\'를 눌러 주세요.'); });
window.addEventListener('online', () => { if (R.sendFailed && !sending && document.querySelector('[data-act="send"]')) { toast('인터넷이 다시 연결되어 이어서 보내요.'); send(); } });
window.addEventListener('pagehide', () => { if (R.segs.length) saveMeta(); });
window.addEventListener('beforeunload', e => { if (['recording', 'paused', 'interrupted', 'stopping'].includes(R.state) || AI || sending) { e.preventDefault(); e.returnValue = ''; } });
start();
