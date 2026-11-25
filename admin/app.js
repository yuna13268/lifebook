'use strict';
/* 모아온 관리자 화면. 사용자가 입력한 값은 모두 esc()를 거쳐 화면에 넣습니다. */
const root = document.getElementById('app');
let ME = null, META = null, TEAM = [], QUESTIONS = [], CUR = null;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (sel, el) => (el || document).querySelector(sel);
const addYear = d => { const t = new Date(d + 'T00:00:00'); t.setFullYear(t.getFullYear() + 1); return t.toISOString().slice(0, 10); };

async function api(method, path, body) {
  try {
    return await API.call(method, path, body);
  } catch (e) {
    if (e.status === 401 && !/login|setup|state/.test(path)) { ME = null; boot(); }
    throw e;
  }
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

/* ---------- 시작 ---------- */
async function boot() {
  const st = await api('GET', '/state');
  if (st.needsSetup) return renderAuth(true);
  if (!st.loggedIn) return renderAuth(false);
  if (st.pending) return renderPending();
  ME = await api('GET', '/me');
  META = await api('GET', '/meta');
  TEAM = await api('GET', '/team');
  route();
}

function renderAuth(setup) {
  let idle = false; try { idle = sessionStorage.getItem('moaon-idle') === '1'; sessionStorage.removeItem('moaon-idle'); } catch (e) {}
  root.innerHTML = `<div class="login card"><h1>모아온 관리자</h1>${idle ? '<p class="warnbox">30분 동안 사용하지 않아 자동으로 로그아웃했습니다. 다시 로그인해 주세요.</p>' : ''}
    <p class="sub">${setup ? '처음 실행입니다. 설정 코드로 관리자 계정을 만들어 주세요.' : '이메일과 비밀번호로 로그인해 주세요.'}</p>
    <form data-form="${setup ? 'setup' : 'login'}">
      ${setup ? '<label for="sc">설정 코드</label><input id="sc" name="code" type="text" required autocomplete="off"><label for="sn">이름</label><input id="sn" name="name" type="text" required autocomplete="name">' : ''}
      <label for="e">이메일</label><input id="e" name="email" type="email" required autocomplete="username">
      <label for="p">비밀번호${setup ? ' (6자 이상)' : ''}</label><input id="p" name="password" type="password" required autocomplete="${setup ? 'new-password' : 'current-password'}">
      <p><button class="btn" type="submit">${setup ? '계정 만들기' : '로그인'}</button></p>
    </form>
    <p class="muted">계정은 관리자가 만들어 줍니다. 허가된 팀원만 쓸 수 있습니다.</p><p><a href="?demo=1#/studio/1">가상 고객으로 제작실 둘러보기</a></p></div>`;
}

function renderPending() {
  root.innerHTML = `<div class="login card"><h1>승인을 기다리고 있어요</h1>
    <p class="sub">로그인은 되었지만 아직 관리자가 역할을 정하지 않았습니다. 관리자에게 승인을 요청해 주세요.</p>
    <p class="row"><button class="btn sub-btn" data-act="reload">다시 확인</button><button class="btn sub-btn" data-act="logout">로그아웃</button></p></div>`;
}

/* 비밀번호 칸마다 '보기' 버튼을 붙인다 */
new MutationObserver(() => {
  document.querySelectorAll('input[type=password]').forEach(i => {
    if (i.dataset.pw) return;
    i.dataset.pw = '1';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn small sub-btn'; b.dataset.act = 'pw-toggle';
    b.textContent = '보기'; b.setAttribute('aria-label', '비밀번호 보기');
    i.insertAdjacentElement('afterend', b);
  });
}).observe(document.getElementById('app'), { childList: true, subtree: true });

/* ---------- 라우팅 ---------- */
window.addEventListener('hashchange', () => { if (ME) route(); });
let routeSeq = 0;
function route() {
  const seq = ++routeSeq;
  const paint = (html, active) => { if (seq === routeSeq) view(html, active); };
  const h = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  const [a, b, c] = h;
  const go = guard(async () => {
    if (!a) return paint(await pageDashboard(), 'dashboard');
    if (a === 'customers') return paint(await pageCustomers(), 'customers');
    if (a === 'customer') return paint(await pageCustomer(+b, c || 'overview'), 'customers');
    if (a === 'questions') return paint(await pageQuestions(), 'questions');
    if (a === 'queue') return paint(await pageQueue(), 'queue');
    if (a === 'recordings') return paint(await pageRecordings(), 'recordings');
    if (a === 'studio') return paint(await Studio.page(b), 'studio');
    if (a === 'skills') return paint(await Studio.skills(), 'skills');
    if (a === 'security') return paint(await Studio.security(), 'security');
    if (a === 'destruction') return paint(await pageDestruction(), 'destruction');
    if (a === 'team') return paint(await pageTeam(), 'team');
    if (a === 'activity') return paint(await pageActivity(), 'activity');
    if (a === 'usage') return paint(await pageUsage(), 'usage');
    paint('<p class="empty">없는 화면입니다.</p>', '');
  });
  go();
}

function view(html, active) {
  const admin = ME.role === 'admin';
  const link = (k, label, href) => `<a href="${href}" class="${active === k ? 'on' : ''}"${active === k ? ' aria-current="page"' : ''}>${label}</a>`;
  root.innerHTML = `<a class="skip" href="#main" data-act="skip">본문으로 건너뛰기</a>
    <div class="shell"><nav class="side" aria-label="메뉴"><div class="brand">모아온<small>관리자</small></div>
    <div class="grp">업무</div>${link('dashboard', '오늘의 업무', '#/')}${link('customers', '고객', '#/customers')}${link('studio', '책 제작실', '#/studio')}${link('queue', '발송 대기열', '#/queue')}${link('recordings', '녹음 도착', '#/recordings')}${link('questions', '질문 은행', '#/questions')}
    <div class="grp">안내</div>${link('skills', '제작 스킬', '#/skills')}${link('security', '개인정보 보호', '#/security')}
    ${admin ? '<div class="grp">관리</div>' + link('destruction', '파기 대기', '#/destruction') + link('team', '팀원', '#/team') + link('activity', '활동 기록', '#/activity') + link('usage', 'AI 설정·비용', '#/usage') : ''}
    <div class="who"><b>${esc(ME.name)}</b><span>${admin ? '관리자' : '담당자'}</span><a href="#" data-act="logout">로그아웃</a></div></nav>
    <main id="main" tabindex="-1">${html}</main></div>`;
  window.scrollTo(0, 0);
  labelTables();
  hydrateAudio();
  hydrateQR();
  lifeCount($('form[data-form=plan-bulk]'));
  if (active === 'studio') Studio.mount();
}

function hydrateAudio() {
  document.querySelectorAll('audio[data-audio-path]').forEach(el => {
    API.signedUrl(el.dataset.audioPath).then(u => { el.src = u; }).catch(e => toast(e.message));
  });
}

const pill = (t, cls) => `<span class="pill ${cls || ''}">${esc(t)}</span>`;
/* 진행 상태는 단계별로 색을 달리한다: 시작(회색) / 진행(초록) / 마무리(진한 초록) */
const STAGE = { '신청': 'st-a', '동의 완료': 'st-a', '인터뷰 중': 'st-b', '원고 작성': 'st-b', '고객 확인': 'st-b', '인쇄': 'st-c', '배송': 'st-c', '보관': 'st-c' };
const statusPill = s => pill(s, STAGE[s] || 'gray');
/* 표의 칸 이름을 각 칸에 붙여 두면 좁은 화면에서 카드처럼 나눠 보인다 */
function labelTables() {
  document.querySelectorAll('main table').forEach(t => {
    const head = t.querySelector('tr:has(th)');
    if (!head) return;
    const names = [...head.children].map(th => th.textContent.trim());
    t.classList.add('stack');
    t.querySelectorAll('tr').forEach(tr => { if (tr !== head) [...tr.children].forEach((td, i) => { if (names[i]) td.dataset.label = names[i]; }); });
  });
}
const options = (list, cur) => list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');

/* ---------- 고객별 진행 단계 ----------
   GOV.UK 'task list'처럼 단계마다 이름 · 지금 상태 · 한 줄 설명을 둔다.
   상태는 색만으로 구분하지 않고 기호와 글자를 함께 쓴다 (Carbon status indicator). */
const TAG = { done: ['완료', '✓'], doing: ['진행 중', '◐'], todo: ['시작 전', '○'], warn: ['확인 필요', '!'] };
const tag = s => `<span class="tag t-${s}"><i aria-hidden="true">${TAG[s][1]}</i>${TAG[s][0]}</span>`;
const tagL = (s, label) => `<span class="tag t-${s}"><i aria-hidden="true">${TAG[s][1]}</i>${esc(label)}</span>`;
/* AI 인터뷰 상태: 준비 ○ / 거는 중 ◐ / 완료 ✓ / 실패 ! */
const AI_STATE = { '준비': 'todo', '거는 중': 'doing', '완료': 'done', '실패': 'warn' };
const aiTag = st => tagL(AI_STATE[st] || 'todo', st);
const mmss = sec => { sec = Math.max(0, Math.round(+sec || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
const lengthText = sec => sec ? (sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`) : '-';
/* 녹음 출처: audio_name 앞부분 ('자녀 녹음' · '부모님 녹음' · 'AI 전화' · 'AI 대화(링크)') */
const SOURCES = ['자녀 녹음', '부모님 녹음', 'AI 전화', 'AI 대화(링크)'];
const sourceOf = name => SOURCES.find(k => String(name || '').startsWith(k)) || '';
const srcPill = src => src ? `<span class="pill src">${esc(src)}</span>` : '';
const hasConsent = (c, item) => (c.consents || []).some(r => r.item === item && r.agreed);
const DONE_TR = ['정리 완료', '고객 확인', '확정'];
/* 화면 노출을 줄이려고 연락처 가운데 숫자를 가린다. 전체 번호는 '보기'를 눌러야 나온다. */
const maskContact = s => { s = String(s || ''); const d = s.replace(/\D/g, ''); if (d.length < 7) return s; let i = 0; const keep = n => n < 3 || n >= d.length - 4; return s.replace(/\d/g, ch => keep(i++) ? ch : '*'); };
const daysLeft = d => d ? Math.round((new Date(d + 'T00:00:00') - new Date(META.today + 'T00:00:00')) / 864e5) : null;
function steps(c) {
  const b = c.book || {};
  const agreed = new Set((c.consents || []).filter(r => r.agreed).map(r => r.item));
  const plans = c.plans || [], sent = plans.filter(p => ['보냄', '답변 도착'].includes(p.status)).length, answered = plans.filter(p => p.status === '답변 도착').length;
  const trs = c.transcripts || [], cleaned = trs.filter(t => DONE_TR.includes(t.status)).length;
  const st = c.stories || [], fin = st.filter(s => s.status === '확정').length, inBook = (b.story_ids || []).length;
  const d = daysLeft(c.delete_after);
  const S = (title, state, hint, tab) => ({ title, state, hint, tab });
  return [
    S('기본 정보', c.parent_name && c.guardian_contact ? 'done' : 'todo', c.parent_name ? [c.parent_name, personMeta(c.parent_gender, c.parent_birthday, c.parent_birth), c.hometown].filter(Boolean).join(' · ') + (c.guardian_contact ? '' : ' · 보호자 휴대폰 미입력') : '부모님 성함과 보호자 휴대폰 번호를 입력해 주세요', 'info'),
    S('동의 받기', ['개인정보 수집·이용', '음성 녹음과 보관'].every(i => agreed.has(i)) && b.parent_agreed ? 'done' : (agreed.size || b.parent_agreed ? 'doing' : 'todo'),
      `동의서 ${agreed.size}/${META.consentItems.length}항목 · 제작 참여 ${b.parent_agreed ? '기록됨' : '미기록'} · AI 처리 ${b.ai_agreed ? '동의' : '미동의'}`, 'consent'),
    S('질문 보내기', !plans.length ? 'todo' : plans.some(p => ['초안', '승인', '보냄'].includes(p.status)) ? 'doing' : 'done', plans.length ? `계획 ${plans.length}개 · 보냄 ${sent}개 · 답변 ${answered}개` : '질문 계획이 없습니다', 'plan'),
    S('녹취 받기', trs.length ? 'done' : 'todo', trs.length ? `녹취 ${trs.length}편` : '녹음 링크를 보내거나 AI 인터뷰로 녹음을 받아 주세요', trs.length ? 'tr' : 'plan'),
    S('녹취 정리', !trs.length ? 'todo' : cleaned === trs.length ? 'done' : 'doing', trs.length ? `정리 완료 ${cleaned}/${trs.length}편` : '녹취가 오면 시작합니다', 'tr'),
    S('이야기 쓰기', !st.length ? 'todo' : fin === st.length ? 'done' : 'doing', st.length ? `확정 ${fin}/${st.length}편` : '아직 이야기가 없습니다', 'story'),
    S('책 원고 확인', b.approved_hash ? 'done' : inBook ? 'doing' : 'todo', b.approved_hash ? `부모님 최종 확인 기록됨 · 이야기 ${inBook}편` : inBook ? `책에 담은 이야기 ${inBook}편 · 최종 확인 전` : '책 제작실에서 이야기를 담아 주세요', 'studio'),
    S('인쇄·인도', c.delivered_at ? 'done' : b.print_requested_at ? 'doing' : 'todo', c.delivered_at ? `인도일 ${c.delivered_at}` : b.print_requested_at ? '인쇄 준비 완료 · 인도일 미입력' : '원고 확인 뒤 진행합니다', 'info'),
    S('보관·파기', d === null || d <= 30 ? 'warn' : 'done', d === null ? '보관 기한이 없습니다. 기한을 정해 주세요' : d < 0 ? `기한이 ${-d}일 지났습니다. 파기해 주세요` : `${c.delete_after}까지 · ${d}일 남음`, d !== null && d <= 30 ? 'manage' : 'info'),
  ];
}
const stepHref = (c, s) => s.tab === 'studio' ? `#/studio/${c.id}` : `#/customer/${c.id}/${s.tab}`;
function progressOf(c) {
  const all = steps(c), work = all.slice(0, 8);
  const done = work.filter(s => s.state === 'done').length;
  const next = all.find(s => s.state === 'warn' && s.title === '보관·파기' && daysLeft(c.delete_after) !== null && daysLeft(c.delete_after) < 0) || work.find(s => s.state !== 'done') || all[8];
  return { all, work, done, next, warn: all.some(s => s.state === 'warn') };
}
/* 목록에서 한 줄로 보는 진행 상황: 8칸 막대 + 다음 할 일 */
function progressCell(c) {
  const p = progressOf(c);
  return `<div class="prog" aria-label="8단계 중 ${p.done}단계 완료">${p.work.map(s => `<i class="p-${s.state}"></i>`).join('')}</div>
    <span class="prog-text"><b>${p.done}/8</b> · 다음: ${esc(p.next.title)}</span>${p.all[8].state === 'warn' ? ' ' + tag('warn') : ''}`;
}
function customerRow(c) {
  const q = [c.code, c.guardian_name, c.parent_name, c.hometown].join(' ').toLowerCase();
  const d = daysLeft(c.delete_after), p = progressOf(c);
  return `<tr class="click" data-href="#/customer/${c.id}" data-q="${esc(q)}" data-status="${esc(c.status)}" data-owner="${c.owner_id || ''}" data-soon="${d !== null && d <= 30 ? 1 : 0}" data-warn="${p.warn ? 1 : 0}">
    <td><a class="row-link" href="#/customer/${c.id}"><b>${esc(c.parent_name) || '(성함 미입력)'}</b></a>${personMeta(c.parent_gender, c.parent_birthday, c.parent_birth) ? ` <span class="meta">${esc(personMeta(c.parent_gender, c.parent_birthday, c.parent_birth))}</span>` : ''}<span class="sub-line">${esc(c.code)} · 보호자 ${esc(c.guardian_name) || '-'}</span></td>
    <td>${progressCell(c)}</td><td>${statusPill(c.status)}</td><td>${esc(c.owner_name) || '<span class="muted">미배정</span>'}</td>
    <td class="num">${c.delete_after ? esc(c.delete_after) + '<span class="sub-line">' + (d < 0 ? `<b class="warn-text">${-d}일 지남</b>` : `${d}일 남음`) + '</span>' : '<span class="warn-text">미설정</span>'}</td></tr>`;
}
const customerTable = (list, id) => `<table${id ? ` id="${id}"` : ''}><tr><th scope="col">고객</th><th scope="col">진행</th><th scope="col">상태</th><th scope="col">담당</th><th scope="col">보관 기한</th></tr>${list.map(customerRow).join('')}</table>`;

/* ---------- 오늘의 업무 = 한 바퀴 처리 ----------
   녹음이 오면 AI가 글로 옮기고(STT) → 정리본 초안 → 다음 주 질문 초안을 만든다.
   사람은 여기서 위에서부터: ① 질문 초안 승인 ② 정리본 확인 ③ 막힌 녹음 처리. 모든 AI 결과는 사람이 확인하기 전까지 '초안'이다. */
const LOOP_TAG = { '대기': ['doing', '자동 정리 대기'], '교정': ['doing', '사투리 교정 중'], '정리': ['doing', '정리본 만드는 중'], '질문': ['doing', '질문 만드는 중'], '완료': ['done', '자동 정리 완료'], '실패': ['warn', '자동 정리 실패'], '건너뜀': ['todo', '자동 정리 건너뜀'] };
const STT_TAG = { '대기': ['doing', '글로 옮기기 대기'], '진행 중': ['doing', '글로 옮기는 중'], '완료': ['done', '글로 옮김'], '실패': ['warn', '글로 옮기기 실패'] };
const loopTag = t => LOOP_TAG[t.loop_status] ? tagL(...LOOP_TAG[t.loop_status]) : '';
const sttTag = t => STT_TAG[t.stt_status] ? tagL(...STT_TAG[t.stt_status]) : '';
/* 막힌 이유를 쉬운 말 한 줄로 */
function problemText(t) {
  if (t.stt_status === '실패') return t.stt_note || '음성을 글로 옮기지 못했습니다.';
  if (t.loop_status === '실패') return t.loop_note || '자동 정리 중 오류가 났습니다.';
  if (t.loop_status === '건너뜀') return t.loop_note || '자동 정리를 건너뛰었습니다.';
  if (t.stt_status === '건너뜀') return t.stt_note || '음성을 글로 옮기지 않았습니다.';
  return '음성은 있지만 아직 글로 옮기지 않았습니다.';
}
const loopButtons = (cid, t) => `${t.has_audio ? `<button class="btn small" data-act="loop-stt" data-cid="${cid}" data-tid="${t.id}">글로 옮기기</button>` : ''}
  <button class="btn small sub-btn" data-act="loop-again" data-cid="${cid}" data-tid="${t.id}">다시 정리</button>`;
const whoLine = r => `<a href="#/customer/${r.customer_id}"><b>${esc(r.parent_name) || '(성함 미입력)'}</b></a> <span class="code">${esc(r.code)}</span>`;

function proposalGroups(list) {
  const admin = ME.role === 'admin';
  const groups = {};
  list.forEach(p => { const k = p.customer_id + ':' + (p.from_transcript_id || 0); (groups[k] = groups[k] || []).push(p); });
  return Object.values(groups).sort((a, b) => (b[0].source === 'ai') - (a[0].source === 'ai')).map(g => {
    const f = g[0], ids = g.map(p => p.id).join(',');
    return `<section class="card loop-card" data-group="${ids}"><div class="row between"><h3 class="card-title">${whoLine(f)}</h3>
        <span class="muted">${f.from ? `출처: <a href="#/customer/${f.customer_id}/tr">${esc(f.from.title || '녹취')}</a> · ${esc((f.from.created || '').slice(0, 10))}` : f.source === 'ai' ? 'AI 제안' : '팀원이 추가'}</span></div>
      <ol class="proposals">${g.map(p => `<li data-pid="${p.id}"><div class="prop-main">
          <label class="sr" for="pt_${p.id}">${p.week}주차 질문</label>
          <input id="pt_${p.id}" type="text" maxlength="500" value="${esc(p.text)}" data-orig="${esc(p.text)}" data-prop-text>
          ${p.reason ? `<p class="reason"><b>근거</b> ${esc(p.reason)}</p>` : ''}
          <span class="sub-line">${p.week}주차 · ${p.source === 'ai' ? 'AI 제안' : '팀원 추가'} · 문장을 고친 뒤 승인하면 고친 문장으로 저장됩니다</span></div>
        <div class="prop-act">${admin ? `<button class="btn small" data-act="prop-ok" data-id="${p.id}">승인</button>` : ''}<button class="btn small sub-btn" data-act="plan-status" data-id="${p.id}" data-status="건너뜀">건너뜀</button></div></li>`).join('')}</ol>
      ${admin ? (g.length > 1 ? `<p class="row"><button class="btn" data-act="prop-all">이 ${g.length}개 모두 승인</button><span class="muted">승인하면 발송 대기열과 녹음 링크에 바로 나타납니다.</span></p>` : '')
        : '<p class="muted">승인은 관리자만 할 수 있습니다. 관리자에게 승인을 요청해 주세요.</p>'}</section>`;
  }).join('');
}
function reviewCards(list) {
  return list.map(t => `<section class="card loop-card" data-tid="${t.id}"><div class="row between"><h3 class="card-title">${whoLine(t)} · ${esc(t.title || '(제목 없음)')}</h3>
      <span>${srcPill(sourceOf(t.audio_name))} ${loopTag(t)}</span></div>
    <div class="side-by-side"><div><h4 class="fs">원문 <span class="muted">${t.has_audio ? '음성을 글로 옮긴 그대로' : ''}</span></h4><div class="raw-box prose">${esc(t.raw)}</div></div>
      <div><h4 class="fs">AI 정리본 초안 <span class="muted">${esc((t.draft_at || '').slice(0, 16))}</span></h4><label class="sr" for="rv_${t.id}">정리본</label><textarea id="rv_${t.id}" class="prose" data-review>${esc(t.draft)}</textarea></div></div>
    <p class="row"><button class="btn" data-act="review-ok" data-id="${t.id}">확인하고 저장</button><a class="btn sub-btn" href="#/customer/${t.customer_id}/tr">녹취 탭에서 자세히</a>
      <span class="muted">저장하면 사람이 확인한 정리본이 되고 녹취는 '정리 완료'가 됩니다.</span></p></section>`).join('');
}
function problemCards(list) {
  return list.map(t => `<section class="card loop-card problem" data-tid="${t.id}"><div class="row between"><h3 class="card-title">${whoLine(t)} · ${esc(t.title || '(제목 없음)')}</h3>
      <span>${srcPill(sourceOf(t.audio_name))} ${sttTag(t)} ${loopTag(t)}</span></div>
    <p class="problem-why"><i aria-hidden="true">!</i> ${esc(problemText(t))}</p>
    ${t.loop_attempts && t.loop_status !== '실패' ? `<p class="muted">일시 오류로 ${t.loop_attempts}번 다시 시도했습니다.</p>` : ''}
    <p class="row">${loopButtons(t.customer_id, t)}<a class="btn small sub-btn" href="#/customer/${t.customer_id}/tr">직접 글로 옮기기</a>
      <span class="muted">동의나 설정이 빠져 건너뛴 경우에는 먼저 그 부분을 채워 주세요.</span></p></section>`).join('');
}

async function pageDashboard() {
  const [d, list, today, usage] = await Promise.all([api('GET', '/dashboard'), api('GET', '/customers'), api('GET', '/today'), ME.role === 'admin' ? api('GET', '/usage/summary').catch(() => null) : null]);
  const pct = usage && !usage.hidden && usage.cap ? usage.spend / usage.cap * 100 : 0;
  const costWarn = pct >= 80 ? `<div class="warnbox cost-warn"><b>! AI 비용이 이번 달 상한의 ${Math.round(pct)}%입니다</b> (추정 ${usd(usage.spend)} / 상한 ${usd(usage.cap)}). ${pct >= 100 ? '상한에 닿아 AI 자동 처리가 멈췄습니다.' : '상한에 닿으면 AI 자동 처리가 멈춥니다.'} <a href="#/usage">AI 비용 보기</a></div>` : '';
  const admin = ME.role === 'admin';
  // '#step1'처럼 쓰면 화면 이동(라우팅)이 되므로, 같은 화면 안 이동은 data-act="jump"로 한다
  const todo = (n, label, href, hint) => `<a class="todo ${n ? 'has' : ''}" href="${href.startsWith('#step') ? '#/' : href}"${href.startsWith('#step') ? ` data-act="jump" data-target="${href.slice(1)}"` : ''}><b>${n}</b><span>${label}</span><small>${n ? hint : '없음'}</small></a>`;
  const total = META.customerStatus.reduce((s, k) => s + (d.byStatus[k] || 0), 0);
  const bar = total ? META.customerStatus.map((s, i) => d.byStatus[s] ? `<i class="seg s${i}" style="flex:${d.byStatus[s]}" title="${esc(s)} ${d.byStatus[s]}명"></i>` : '').join('') : '';
  const legend = META.customerStatus.map((s, i) => `<li><i class="sw s${i}"></i>${esc(s)}<b>${d.byStatus[s] || 0}</b></li>`).join('');
  const ranked = list.map(c => ({ c, p: progressOf(c) })).sort((a, b) => (b.p.warn - a.p.warn) || (a.p.done - b.p.done)).slice(0, 8).map(x => x.c);
  const P = today.proposals, R = today.reviews, X = today.problems;
  const step = (n, title, count, hint) => `<h2 class="loop-step" id="step${n}"><span class="task-no">${n}</span>${title} <span class="muted">${count ? count + '건' : '없음'}</span></h2>${count ? '' : `<p class="empty small">${hint}</p>`}`;
  return `<header class="page-head row between"><div><h1>오늘의 업무</h1><p class="sub">${admin ? '전체 고객' : '내가 맡은 고객'} ${d.total}명 · ${esc(META.today)}</p></div><a class="btn sub-btn" href="#/queue">발송 대기열</a></header>
    <div class="todos">${todo(P.length, '승인할 질문 초안', '#step1', admin ? '근거 보고 승인하기' : '관리자 승인 대기')}${todo(R.length, '확인할 정리본', '#step2', '원문과 나란히 보기')}${todo(X.length, '막힌 녹음', '#step3', '이유 보고 다시 하기')}
      ${todo(d.readyToSend, '보낼 수 있는 질문', '#/queue', '문안 복사해 보내기')}${todo(d.soon.length, '보관 기한 30일 이내', admin ? '#/destruction' : '#/customers', '파기 또는 기한 확인')}</div>
    ${costWarn}${today.running ? `<p class="infobox">${tagL('doing', '자동 처리 중')} 녹음 ${today.running}건을 AI가 글로 옮기고 정리하는 중입니다. 끝나면 아래 목록에 나타납니다.</p>` : ''}
    ${step(1, '다음 주 질문 초안 승인', P.length, '승인을 기다리는 질문이 없습니다.')}${proposalGroups(P)}
    ${step(2, '정리본 확인', R.length, '확인할 AI 정리본이 없습니다.')}${reviewCards(R)}
    ${step(3, '막힌 녹음 처리', X.length, '글로 옮기지 못했거나 건너뛴 녹음이 없습니다.')}${problemCards(X)}
    <div class="row between"><h2>고객별 진행</h2><a href="#/customers">전체 고객 보기</a></div>
    ${list.length ? customerTable(ranked) : '<p class="empty">고객이 없습니다.</p>'}
    <h2>진행 상태별 고객 수</h2>
    <div class="card">${total ? `<div class="funnel" role="img" aria-label="진행 상태별 고객 수">${bar}</div>` : '<p class="empty">고객이 없습니다.</p>'}<ul class="legend">${legend}</ul></div>`;
}

/* ---------- 고객 목록 ----------
   목록 위에 필터, 아래에 표 (Polaris resource index). 줄 전체를 누르면 고객 화면으로 간다. */
async function pageCustomers() {
  const list = await api('GET', '/customers');
  return `<header class="page-head"><h1>고객</h1><p class="sub">고객마다 8단계 진행 상황과 다음 할 일을 보여 줍니다. 줄을 누르면 그 고객의 '한눈에' 화면이 열립니다. 총 ${list.length}명</p></header>
    <details class="card"><summary>새 고객 등록</summary><form data-form="cust-new">${customerFields({}, true)}<p><button class="btn" type="submit">등록</button></p></form></details>
    <div class="row fill card filters"><div><label for="fq">검색</label><input id="fq" type="text" data-filter placeholder="번호, 이름, 고향"></div>
      <div><label for="fs">상태</label><select id="fs" data-filter><option value="">전체</option>${options(META.customerStatus)}</select></div>
      ${ME.role === 'admin' ? `<div><label for="fo">담당자</label><select id="fo" data-filter><option value="">전체</option>${TEAM.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>` : ''}
      <div><label for="fd">살펴볼 고객</label><select id="fd" data-filter><option value="">전체</option><option value="warn">확인 필요</option><option value="soon">보관 기한 30일 이내</option></select></div></div>
    <p class="muted" id="fcount" aria-live="polite"></p>
    ${list.length ? customerTable(list, 'ctable') : '<p class="empty">아직 고객이 없습니다. 위에서 등록해 주세요.</p>'}`;
}

/* ---------- 고객 한눈에 ----------
   본문에는 진행 단계, 옆에는 요약 정보 (Polaris resource details: 상태·요약은 보조 칸에). */
function tabOverview(c) {
  const p = progressOf(c), b = c.book || {}, d = daysLeft(c.delete_after);
  const recent = [...(c.transcripts || []).map(t => ({ k: '녹취', t: t.title || '(제목 없음)', s: t.status, at: t.created || '', tab: 'tr' })),
    ...(c.stories || []).map(s => ({ k: '이야기', t: s.title || '(제목 없음)', s: s.status, at: s.updated || '', tab: 'story' }))]
    .sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 5);
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const sub = s => s ? `<small class="sub-line">${esc(s)}</small>` : '';
  return `<div class="detail-layout"><div>
    <section class="next-box"><p class="eyebrow">다음 할 일</p><h2>${esc(p.next.title)}</h2><p>${esc(p.next.hint)}</p><a class="btn" href="${stepHref(c, p.next)}">${esc(p.next.title)} 화면으로</a></section>
    <h2 class="sec">제작 단계 <span class="muted">${p.done}/8 완료</span></h2>
    <ol class="task-list">${p.all.map((s, i) => `<li><a href="${stepHref(c, s)}"><span class="task-no">${i + 1}</span><span class="task-main"><b>${esc(s.title)}</b><small>${esc(s.hint)}</small></span>${tag(s.state)}</a></li>`).join('')}</ol>
  </div><aside>
    <div class="card"><h2 class="card-title">고객 요약</h2><dl class="summary">
      ${row('부모님', (esc(c.parent_name) || '<span class="warn-text">미입력</span>') + sub(personMeta(c.parent_gender, c.parent_birthday, c.parent_birth)))}${row('부모님 휴대폰', maskedPhone(c.parent_phone))}
      ${row('생년월일', c.parent_birthday ? esc(c.parent_birthday) : c.parent_birth ? `${esc(c.parent_birth)}년생 <small class="muted">(대략)</small>` : '-')}${row('고향', esc(c.hometown) || '-')}
      ${row('보호자', (esc(c.guardian_name) || '-') + sub(personMeta(c.guardian_gender, c.guardian_birthday)))}${row('보호자 휴대폰', maskedPhone(c.guardian_contact))}
      ${row('담당자', esc(c.owner_name) || '<span class="warn-text">미배정</span>')}${row('진행 상태', statusPill(c.status))}
      ${row('보관 기한', c.delete_after ? `${esc(c.delete_after)}<br><small class="${d <= 30 ? 'warn-text' : 'muted'}">${d < 0 ? -d + '일 지남' : d + '일 남음'}</small>` : '<span class="warn-text">미설정</span>')}
      ${row('공유 범위', esc(b.share_scope) || '미설정')}${row('신청 경로', c.source === 'signup' ? '사전 예약 페이지' : '직접 등록')}</dl>
      <p class="row"><a class="btn small sub-btn" href="#/customer/${c.id}/info">정보 고치기</a><a class="btn small sub-btn" href="#/studio/${c.id}">책 제작실</a><a class="btn small sub-btn" href="#/customer/${c.id}/plan">녹음 링크 · AI 인터뷰</a></p></div>
    <div class="card"><h2 class="card-title">최근 자료</h2>${recent.length ? `<ul class="plain">${recent.map(r => `<li><a href="#/customer/${c.id}/${r.tab}">${esc(r.t)}</a><small>${r.k} · ${esc(r.s)}${r.at ? ' · ' + esc(r.at.slice(0, 10)) : ''}</small></li>`).join('')}</ul>` : '<p class="muted">아직 자료가 없습니다.</p>'}</div>
    ${c.notes ? `<div class="card"><h2 class="card-title">메모</h2><p class="pre">${esc(c.notes)}</p></div>` : ''}
  </aside></div>`;
}

function customerFields(c, isNew) {
  const f = (name, label, type, hint, extra) => `<div><label for="c_${name}">${label}</label><input id="c_${name}" name="${name}" type="${type || 'text'}" value="${esc(c[name])}"${extra || ''}>${hint ? `<small class="hint">${hint}</small>` : ''}</div>`;
  const tel = (name, label, hint) => f(name, label, 'tel', hint, ' inputmode="tel" autocomplete="off" placeholder="010-0000-0000" pattern="[0-9+\\(\\) \\-]{9,20}" title="숫자와 - 만 입력해 주세요"');
  const g = (name) => `<div><label for="c_${name}">성별</label><select id="c_${name}" name="${name}"><option value="">선택 안 함</option>${['여성', '남성', '기타'].map(v => `<option${c[name] === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>`;
  const day = (name) => f(name, '생년월일', 'date', '', ` min="1900-01-01" max="${esc(META.today)}"`);
  return `<h3 class="fs">보호자 (신청한 자녀)</h3><div class="row fill">${f('guardian_name', '이름')}${tel('guardian_contact', '휴대폰 번호')}${g('guardian_gender')}${day('guardian_birthday')}</div>
    <h3 class="fs">부모님</h3><div class="row fill">${f('parent_name', '성함')}${tel('parent_phone', '휴대폰 번호', 'AI 전화 인터뷰를 이 번호로 겁니다')}${g('parent_gender')}${day('parent_birthday')}</div>
    <div class="row fill">${f('parent_birth', '생년 (정확한 날짜를 모를 때)', 'text', '예: 1948')}${f('hometown', '고향')}${f('job', '직업')}</div>
    ${f('family', '가족 관계')}
    <label for="c_notes">메모</label><textarea id="c_notes" name="notes">${esc(c.notes)}</textarea>`;
}
/* 만 나이와 '여성 · 만 78세' 같은 짧은 설명 */
const ageOf = d => { if (!d) return null; const b = new Date(d + 'T00:00:00'), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a >= 0 && a < 130 ? a : null; };
const personMeta = (gender, birthday, roughYear) => { const a = ageOf(birthday); return [gender, a != null ? `만 ${a}세` : roughYear ? `${roughYear}년생` : ''].filter(Boolean).join(' · '); };
const maskedPhone = v => v ? `<span data-masked="${esc(v)}">${esc(maskContact(v))}</span> <button type="button" class="link-btn" data-act="reveal">보기</button>` : '<span class="warn-text">미입력</span>';

/* ---------- 고객 상세 ---------- */
async function pageCustomer(id, tab) {
  CUR = await api('GET', '/customers/' + id);
  QUESTIONS = await api('GET', '/questions');
  const c = CUR;
  if (tab === 'plan') {
    const [links, ai] = await Promise.all([api('GET', `/customers/${id}/links`).catch(() => null), API.interview({ action: 'config' }).catch(e => ({ error: e.message }))]);
    c.links = links; c.ai = ai;
  }
  const tabs = [['overview', '한눈에'], ['info', '정보'], ['consent', '동의'], ['plan', '질문'], ['tr', '녹취'], ['story', '이야기'], ['manage', '내려받기·파기']]
    .map(([k, l]) => `<a href="#/customer/${id}/${k}" class="${tab === k ? 'on' : ''}"${tab === k ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  let body = '';
  if (tab === 'overview') body = tabOverview(c);
  else if (tab === 'info') body = tabInfo(c);
  else if (tab === 'consent') body = tabConsent(c);
  else if (tab === 'plan') body = tabPlan(c);
  else if (tab === 'tr') body = tabTranscripts(c);
  else if (tab === 'story') body = tabStories(c);
  else body = tabManage(c);
  const warn = c.delete_after && c.delete_after < META.today ? `<div class="warnbox">보관 기한(${esc(c.delete_after)})이 지났습니다. '내려받기·파기' 탭에서 파기해 주세요.</div>` : '';
  return `<nav class="crumb" aria-label="위치"><a href="#/customers">고객</a> <span aria-hidden="true">›</span> ${esc(c.parent_name || c.code)}</nav>
    <header class="page-head row between"><div><h1>${esc(c.parent_name) || '(성함 미입력)'} <span class="code">${esc(c.code)}</span> ${statusPill(c.status)}</h1>
    <p class="sub">보호자 ${esc(c.guardian_name) || '-'} · 담당 ${esc(c.owner_name) || '<b class="warn-text">미배정</b>'}</p></div><a class="btn sub-btn" href="#/studio/${id}">이 고객의 책 제작실</a></header>${warn}<nav class="tabs" aria-label="고객 정보 탭">${tabs}</nav>${body}`;
}

function tabInfo(c) {
  const isAdmin = ME.role === 'admin';
  return `<form class="card" data-form="cust-info" data-id="${c.id}">${customerFields(c)}
    <div class="row fill"><div><label for="c_status">진행 상태</label><select id="c_status" name="status">${options(META.customerStatus, c.status)}</select></div>
    ${isAdmin ? `<div><label for="c_owner">담당자</label><select id="c_owner" name="owner_id"><option value=""${c.owner_id ? '' : ' selected'}>미배정</option>${TEAM.map(u => `<option value="${u.id}"${u.id === c.owner_id ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>` : ''}
    <div><label for="c_delivered">책 인도일</label><input id="c_delivered" name="delivered_at" type="date" value="${esc(c.delivered_at)}"></div>
    <div><label for="c_delete">보관 기한(파기 예정일)</label><input id="c_delete" name="delete_after" type="date" value="${esc(c.delete_after)}"></div></div>
    <p class="muted">인도일을 입력하고 아래 버튼을 누르면 보관 기한이 인도일 1년 뒤로 채워집니다. 저장해야 반영됩니다.</p>
    <p class="row"><button class="btn" type="submit">저장</button><button class="btn sub-btn" type="button" data-act="year-rule">인도일 + 1년으로 보관 기한 채우기</button></p></form>`;
}

function tabConsent(c) {
  const map = Object.fromEntries(c.consents.map(r => [r.item, r]));
  const rows = META.consentItems.map((item, i) => {
    const r = map[item] || {};
    return `<label style="display:flex"><input type="checkbox" name="agree_${i}"${r.agreed ? ' checked' : ''}> <span>${esc(item)}</span>
      <input type="date" name="date_${i}" value="${esc(r.agreed_on)}" aria-label="${esc(item)} 동의 날짜"></label>`;
  }).join('');
  return `<form class="card checks" data-form="consents" data-id="${c.id}"><p class="muted">동의서를 받은 날짜를 적어 주세요. 비워 두고 체크하면 오늘 날짜로 저장됩니다.</p>${rows}
    <p><button class="btn" type="submit">저장</button></p></form>`;
}

/* ---------- 살아온 순서대로 (인생 단계 stage 1~7) ---------- */
const STAGES = { 1: '태어남·어린 시절', 2: '학창 시절', 3: '청년·첫 일', 4: '만남·결혼', 5: '자녀를 키우던 시절', 6: '중년의 일과 가족', 7: '지금과 앞으로' };
const stageName = n => STAGES[n] || '';
const stagePill = n => STAGES[n] ? `<span class="pill stage">${n}. ${esc(STAGES[n])}</span>` : '';
const optionalQ = q => /원할 때만/.test(q.topic || '');
const hasStages = () => QUESTIONS.some(q => 'stage' in q);
/* 녹음 페이지와 같은 순서: stage → week → id (stage 없는 것은 뒤) */
const lifeOrder = (a, b) => ((a.stage || 99) - (b.stage || 99)) || (a.week - b.week) || (a.id - b.id);
function lifeCard(c) {
  const used = new Set(c.plans.map(p => p.question_id).filter(Boolean));
  const head = `<section class="card" id="life"><h3 class="card-title">살아온 순서대로 질문 담기</h3>`;
  if (!hasStages() || !QUESTIONS.some(q => q.stage)) return `${head}<p class="muted">질문 은행에 인생 단계가 아직 없습니다. 단계가 들어간 질문 은행이 배포되면 여기서 어린 시절부터 순서대로 담을 수 있습니다.</p></section>`;
  const byStage = Object.keys(STAGES).map(Number).map(n => ({ n, all: QUESTIONS.filter(q => q.stage === n && q.active), left: QUESTIONS.filter(q => q.stage === n && q.active && !used.has(q.id)) }));
  const left = byStage.reduce((x, g) => x + g.left.length, 0);
  if (!left) return `${head}<p class="muted">질문 은행의 단계별 질문을 모두 담았습니다.</p></section>`;
  const firstOpen = byStage.find(g => g.left.length);
  return `${head}<p class="muted">질문 은행의 질문을 어린 시절부터 지금까지 순서대로 초안에 담습니다. 이미 담은 질문은 빠집니다. 녹음 링크에서는 하루 최대 5개씩 이 순서대로 여쭙고, 답하지 못한 질문은 다음 날 이어서 나옵니다.</p>
    <p class="infobox"><b>'원할 때만' 질문은 처음에 빼 두었습니다.</b> 힘든 기억일 수 있는 질문입니다. 부모님과 가족이 괜찮다고 할 때만 골라 주세요.</p>
    <form data-form="plan-bulk" data-id="${c.id}">
      <p class="row"><button type="button" class="btn small sub-btn" data-act="life-pick" data-mode="safe">'원할 때만' 빼고 모두 고르기</button><button type="button" class="btn small sub-btn" data-act="life-pick" data-mode="all">모두 고르기</button><button type="button" class="btn small sub-btn" data-act="life-pick" data-mode="none">모두 빼기</button></p>
      ${byStage.map(g => `<details class="stage-box"${g === firstOpen ? ' open' : ''}><summary><b>${g.n}. ${esc(STAGES[g.n])}</b> <span class="muted" data-stage-count="${g.n}"></span></summary>
        ${g.left.length ? g.left.map(q => `<label class="check-line"><input type="checkbox" name="q" value="${q.id}" data-life data-stage="${g.n}"${optionalQ(q) ? ' data-optional' : ' checked'}><span>${esc(q.text)}${optionalQ(q) ? ' <span class="pill warn">원할 때만</span>' : ''}</span></label>`).join('')
          : '<p class="muted">이 시절 질문은 모두 담았습니다.</p>'}
        ${g.all.length - g.left.length ? `<p class="muted small-note">이미 담은 질문 ${g.all.length - g.left.length}개</p>` : ''}</details>`).join('')}
      <p class="row"><button class="btn" type="submit">고른 질문 <span data-life-total>0</span>개 담기</button><span class="muted">담으면 '초안'입니다. 관리자가 승인해야 녹음 링크에 나옵니다.</span></p></form></section>`;
}
function lifeCount(form) {
  if (!form) return;
  const boxes = [...form.querySelectorAll('[data-life]')];
  form.querySelectorAll('[data-stage-count]').forEach(el => { const mine = boxes.filter(b => b.dataset.stage === el.dataset.stageCount); el.textContent = mine.length ? `고른 ${mine.filter(b => b.checked).length} / 남은 ${mine.length}` : '모두 담음'; });
  $('[data-life-total]', form).textContent = boxes.filter(b => b.checked).length;
}
function tabPlan(c) {
  const used = new Set(c.plans.map(p => p.question_id).filter(Boolean));
  const avail = QUESTIONS.filter(q => q.active && !used.has(q.id));
  const nextWeek = c.plans.reduce((m, p) => Math.max(m, p.week), 0) + 1;
  const drafts = c.plans.filter(p => p.status === '초안').sort(lifeOrder);
  const rowsHtml = c.plans.slice().sort(lifeOrder).map(p => {
    const act = [];
    if (p.status === '초안' && ME.role === 'admin') act.push(`<button class="btn small" data-act="plan-status" data-id="${p.id}" data-status="승인">승인</button>`);
    if (p.status === '승인') act.push(`<button class="btn small" data-act="plan-status" data-id="${p.id}" data-status="보냄">보냈어요</button>`);
    if (p.status === '보냄') act.push(`<button class="btn small" data-act="plan-status" data-id="${p.id}" data-status="답변 도착">답변 도착</button>`);
    if (['초안', '승인', '보냄'].includes(p.status)) act.push(`<button class="btn small sub-btn" data-act="plan-status" data-id="${p.id}" data-status="건너뜀">건너뜀</button>`);
    if (['초안', '승인', '건너뜀'].includes(p.status)) act.push(`<button class="btn small sub-btn" data-act="plan-del" data-id="${p.id}">삭제</button>`);
    return `<tr><td>${p.stage ? `${p.stage}. ${esc(stageName(p.stage))}` : '<span class="muted">-</span>'}<span class="sub-line">${p.week}주차</span></td><td>${esc(p.text)}${p.source === 'ai' ? ' ' + pill('AI 제안', 'src') : ''}</td><td>${pill(p.status, p.status === '초안' ? 'gray' : '')}${p.sent_at ? '<br><span class="muted">' + esc(p.sent_at.slice(0, 10)) + '</span>' : ''}</td><td class="row">${act.join('')}</td></tr>`;
  }).join('');
  const approveAll = drafts.length ? (ME.role === 'admin'
    ? `<p class="row approve-all"><button class="btn" data-act="plans-approve-all">담은 질문 모두 승인 (${drafts.length}개)</button><span class="muted">누르면 승인할 목록을 먼저 보여 드립니다.</span></p>`
    : `<p class="muted approve-all">초안 ${drafts.length}개가 관리자 승인을 기다립니다. 관리자에게 승인을 요청해 주세요.</p>`) : '';
  return `${aiCard(c)}${memoryCard(c)}${recordLinkCard(c)}${lifeCard(c)}<form class="card" data-form="plan-add" data-id="${c.id}"><h3 class="card-title">질문 추가</h3>
    <div class="row fill"><div style="flex:3 1 260px"><label for="p_q">질문 은행에서 고르기</label><select id="p_q" name="question_id"><option value="">직접 입력</option>${avail.map(q => `<option value="${q.id}">${esc(q.topic ? '[' + q.topic + '] ' : '')}${esc(q.text)}</option>`).join('')}</select></div>
    <div style="flex:0 1 110px"><label for="p_w">주차</label><input id="p_w" name="week" type="number" min="1" value="${nextWeek}"></div></div>
    <label for="p_t">직접 입력하거나 고른 질문을 고쳐서 쓰기</label><input id="p_t" name="text" type="text" maxlength="500">
    <p><button class="btn" type="submit">계획에 추가</button> <span class="muted">추가하면 '초안'입니다. 관리자가 승인해야 보낼 수 있습니다.</span></p></form>
    <h3 class="plan-head">질문 계획 <span class="muted">살아온 순서대로 (녹음 링크에 나오는 순서)</span></h3>${approveAll}
    ${c.plans.length ? `<table><tr><th>시절</th><th>질문</th><th>상태</th><th></th></tr>${rowsHtml}</table>` : '<p class="empty">계획된 질문이 없습니다.</p>'}
    <dialog id="list-dialog" aria-labelledby="list-dialog-title"></dialog>`;
}

/* 녹음 링크: 자녀용(자녀가 부모님 곁에서 녹음)과 부모님용(부모님이 직접 녹음)을 따로 만든다.
   어느 쪽이든 '승인'된 질문만 보이고, 보낸 녹음은 '녹취 도착'으로 들어온다. */
const AUD = { child: { name: '자녀용', to: '보호자(자녀)에게' }, parent: { name: '부모님용', to: '부모님께' } };
const audOf = a => AUD[a] || AUD.child;
const linkState = (l, now) => l.revoked_at ? pill('중지됨', 'gray') : l.expires_at < now ? pill('기한 지남', 'gray') : pill('사용 중');
function recordLinkCard(c) {
  if (c.links === null) return '';
  const consent = hasConsent(c, '음성 녹음과 보관');
  const ready = c.plans.filter(p => ['승인', '보냄'].includes(p.status)).length;
  const now = new Date().toISOString();
  const rows = (c.links || []).map(l => `<tr><td><b>${audOf(l.audience).name}</b></td><td class="num">${esc(l.created_at.slice(0, 10))}</td><td class="num">${esc(l.expires_at.slice(0, 10))}</td>
    <td class="num">${l.upload_count}개${l.last_used_at ? `<span class="sub-line">마지막 ${esc(l.last_used_at.slice(0, 10))}</span>` : ''}</td><td>${linkState(l, now)}</td>
    <td>${!l.revoked_at && l.expires_at >= now ? `<button class="btn small sub-btn" data-act="link-revoke" data-id="${l.id}">중지</button>` : ''}</td></tr>`).join('');
  return `<section class="card" id="links"><h3 class="card-title">녹음 링크 (직접 녹음)</h3>
    <p class="muted">링크를 휴대폰에서 열면 관리자가 <b>승인한 질문</b>을 보며 녹음해 보낼 수 있습니다. 보낸 녹음은 '녹취' 탭과 '녹음 도착' 화면에 <b>녹취 도착</b>으로 들어오고, 질문은 '답변 도착'으로 바뀝니다. 링크로는 녹음 올리기만 되고 다른 정보는 볼 수 없습니다.</p>
    ${consent ? '' : `<div class="warnbox">'동의' 탭에서 <b>음성 녹음과 보관</b> 동의를 먼저 기록해야 링크로 녹음을 보낼 수 있습니다.</div>`}
    <p>지금 녹음할 수 있는 질문 <b>${ready}개</b>${ready ? '' : ' <span class="muted">· 아래에서 질문을 추가하고 승인해 주세요</span>'}</p>
    <div class="choice-grid">
      <div class="choice"><h4>자녀용 링크</h4><p>보호자(자녀)가 부모님 곁에서 질문을 읽어 드리고, 대답을 녹음해 보냅니다.</p><button class="btn" data-act="link-new" data-id="${c.id}" data-aud="child">자녀용 링크 만들기</button></div>
      <div class="choice"><h4>부모님용 링크</h4><p>부모님이 직접 링크를 열어 큰 글자로 질문을 보고 녹음합니다. 위 AI 인터뷰 카드에서 만드는 링크와 같은 링크입니다.</p><button class="btn" data-act="link-new" data-id="${c.id}" data-aud="parent">부모님용 링크 만들기</button></div>
    </div>
    <div class="new-link" aria-live="polite"></div>
    <p class="muted">링크는 90일 동안 쓸 수 있고, 주소는 만든 순간에만 보여 줍니다. 잃어버리면 새로 만들고 이전 링크는 중지해 주세요.</p>
    ${rows ? `<table><tr><th>받는 사람</th><th>만든 날</th><th>사용 기한</th><th>받은 녹음</th><th>상태</th><th></th></tr>${rows}</table>` : ''}</section>`;
}

/* AI 인터뷰 (AI 전화): 서버 함수 interview 의 config · call · fetch_audio 를 부른다.
   전화를 걸기 전에 동의 2가지 · 부모님 휴대폰 · 승인된 질문 · 사전 안내를 모두 확인한다. */
const AI_CONSENTS = ['음성 녹음과 보관', 'AI 처리 위탁(국외 이전 포함)'];
const AI_SETUP = [['key', 'ElevenLabs API 키'], ['agent', 'AI 인터뷰 에이전트'], ['phone', '발신 전화번호 연결'], ['webhook', '통화 결과 받기 (웹훅 서명 키)'], ['policy', '통화 운영 정책 확인 (사전 안내 · 녹음 고지)']];
const checkItem = (ok, label, fix) => `<li>${ok ? tagL('done', '완료') : tagL('warn', '필요')}<span>${label}${!ok && fix ? `<small>${fix}</small>` : ''}</span></li>`;
function aiSessionRows(c, sessions) {
  return sessions.map(s => {
    const stale = s.status === '거는 중' && Date.now() - new Date(s.created_at).getTime() > 30 * 60e3;
    const result = s.status === '실패' ? `<span class="warn-text">${esc(s.failure || '이유가 기록되지 않았습니다')}</span>`
      : stale ? '<span class="warn-text">30분이 지나도 결과가 오지 않았습니다. 웹훅 설정을 확인해 주세요.</span>'
      : s.status === '거는 중' ? '<span class="muted">연결을 확인하는 중입니다. 바로 다시 걸지 말고 몇 분 뒤 새로고침해 주세요.</span>'
      : s.transcript_id ? `<a href="#/customer/${s.customer_id}/tr">녹취 보기</a>` : `<span class="muted">${s.channel === 'phone' ? '통화' : '대화'}가 끝나면 녹취가 들어옵니다</span>`;
    const fetchBtn = s.audio_pending ? `<span class="sub-line">녹음을 아직 받지 못했습니다</span><button class="btn small sub-btn" data-act="ai-fetch" data-cid="${s.customer_id}" data-sid="${esc(s.id)}">녹음 다시 가져오기</button>` : '';
    // AI가 대화 중 걱정되는 말을 들었을 때 남기는 메모 (ai_sessions.safety_note)
    const safety = s.safety_note ? `<div class="safety"><span class="tag t-warn"><i aria-hidden="true">⚠</i>주의 · 담당자 확인 필요</span><p>${esc(s.safety_note)}</p></div>` : '';
    return `<tr>${c ? '' : `<td><a href="#/customer/${s.customer_id}/plan"><b>${esc(s.parent_name) || '(성함 미입력)'}</b></a><span class="sub-line">${esc(s.code)}</span></td>`}
      <td>${s.channel === 'phone' ? 'AI 전화' : 'AI 대화(링크)'}<span class="sub-line">질문 ${(s.plan_ids || []).length}개</span></td><td class="num">${esc((s.created || '').slice(0, 16))}</td>
      <td class="num">${lengthText(s.duration_secs)}</td><td>${aiTag(s.status)}${s.safety_note ? '<span class="sub-line warn-text">⚠ 주의</span>' : ''}</td><td>${safety}${result}${fetchBtn}</td></tr>`;
  }).join('');
}
const aiSessionTable = (c, sessions) => `<table><tr>${c ? '' : '<th>고객</th>'}<th>방식</th><th>시작</th><th>길이</th><th>상태</th><th>결과</th></tr>${aiSessionRows(c, sessions)}</table>`;
function aiCard(c) {
  const cfg = c.ai;
  if (!cfg) return '';
  const admin = ME.role === 'admin';
  const sessions = c.ai_sessions || [];
  const history = `<h4 class="fs">AI 인터뷰 기록</h4>${sessions.length ? aiSessionTable(c, sessions) : '<p class="muted">아직 AI 인터뷰 기록이 없습니다.</p>'}`;
  const plans = c.plans.filter(p => ['승인', '보냄'].includes(p.status));
  const consentOk = AI_CONSENTS.every(i => hasConsent(c, i));
  const keepOk = c.delete_after && c.delete_after >= META.today;
  const webOk = !cfg.error && cfg.web_ready && consentOk && plans.length && keepOk;

  // 1) 주 기능: 부모님용 AI 대화 링크
  const top = `<section class="card ai-card" id="ai"><h3 class="card-title">AI 인터뷰 · 부모님용 AI 대화 링크</h3>
    <p>부모님용 링크를 보내 드리면, 부모님이 휴대폰에서 링크를 열어 <b>AI와 대화하며</b> 승인된 질문에 답하실 수 있어요. 대화가 끝나면 내용과 음성이 '녹취' 탭에 <b>AI 대화(링크)</b>로 들어옵니다. AI 대화가 어려우시면 같은 링크에서 직접 녹음해 보내셔도 됩니다.</p>
    <p class="row"><button class="btn" data-act="link-new" data-id="${c.id}" data-aud="parent">부모님용 링크 만들기</button>${webOk ? tagL('done', 'AI 대화 가능') : tagL('warn', 'AI 대화 준비 필요')}</p>
    <div class="new-link" aria-live="polite"></div>
    <p class="muted">대화는 ElevenLabs(국외)에서 처리되며, 기본 설정에서는 음성을 우리 저장소로 옮긴 뒤 ElevenLabs 쪽 대화 기록을 지웁니다. 링크는 90일 동안 쓸 수 있고, 만든 링크는 아래 '녹음 링크' 표에서 중지할 수 있습니다.</p>`;
  if (cfg.error) return `${top}<div class="warnbox">AI 인터뷰 서버에 연결하지 못했습니다. ${esc(cfg.error)}<br>링크는 지금도 만들 수 있지만, 서버가 배포되기 전에는 부모님이 직접 녹음하는 화면만 보입니다.</div>${history}</section>`;

  // 2) AI 설정 상태 (web_ready = 키 · 에이전트 · 운영 정책)
  const setupList = `<ul class="checklist">${AI_SETUP.filter(([k]) => k !== 'phone').map(([k, label]) => checkItem(!!cfg[k], label)).join('')}</ul>`;
  const guide = admin ? `<div class="guide"><b>AI 대화를 쓰려면 먼저 설정이 필요합니다.</b><ol>
      <li>ElevenLabs에서 AI 인터뷰 에이전트를 만들고, 대화가 끝나면 결과를 보낼 웹훅 주소로 <code>${esc(SUPABASE_URL + '/functions/v1/interview')}</code> 를 등록합니다.</li>
      <li>Supabase 대시보드 → Edge Functions → Secrets 에 <code>ELEVENLABS_API_KEY</code>, <code>ELEVENLABS_AGENT_ID</code>, <code>ELEVENLABS_WEBHOOK_SECRET</code> 를 넣습니다. 키는 채팅이나 문서에 붙여 넣지 말고 이 화면에만 넣어 주세요.</li>
      <li>통화 첫머리의 녹음 안내 문구를 팀에서 정한 뒤 <code>AI_CALL_POLICY_CONFIRMED</code> 를 <code>true</code> 로 넣습니다.</li></ol>
      <p class="muted">자세한 순서는 관리자 안내서(README)의 'AI 인터뷰 설정'에 있습니다.</p></div>`
    : `<div class="guide"><b>AI 대화가 아직 설정되지 않았습니다.</b> 관리자에게 설정을 요청해 주세요. 그동안 부모님용 링크로는 직접 녹음만 할 수 있습니다.</div>`;
  const setup = `<h4 class="fs">AI 설정 ${cfg.web_ready ? tagL('done', '설정 완료') : tagL('warn', '설정 필요')}</h4>
    ${cfg.web_ready ? `<details><summary>설정 항목 보기</summary>${setupList}</details>` : setupList + guide}
    ${cfg.web_ready && !cfg.webhook ? '<p class="warnbox">웹훅 서명 키가 없어 대화가 끝나도 녹취가 들어오지 않습니다. 관리자에게 알려 주세요.</p>' : ''}`;
  const cust = `<h4 class="fs">이 고객 준비</h4><ul class="checklist">
    ${AI_CONSENTS.map(i => checkItem(hasConsent(c, i), `동의: ${esc(i)}`, `<a href="#/customer/${c.id}/consent">'동의' 탭에서 기록하기</a>`)).join('')}
    ${checkItem(plans.length, `승인된 질문 ${plans.length}개`, '아래 질문 계획에서 질문을 추가하고 승인해 주세요')}
    ${checkItem(keepOk, '보관 기한 안에 있음', `<a href="#/customer/${c.id}/info">'정보' 탭에서 보관 기한 확인하기</a>`)}</ul>`;

  // 3) AI 전화: 전화번호가 생기면 켠다. 그전에는 회색 안내만 보여 준다.
  let phone;
  if (!cfg.phone_ready) phone = '<p class="later-note">AI 전화 걸기는 나중에 켤 예정입니다 (발신용 전화번호 필요).</p>';
  else {
    const phoneOk = /^(\+[1-9][0-9]{7,14}|0[0-9]{8,10})$/.test(String(c.parent_phone || '').replace(/[^0-9+]/g, ''));
    const canCall = consentOk && phoneOk && plans.length && keepOk;
    phone = `<details class="phone-box"><summary>AI 전화 걸기</summary>
      <ul class="checklist">${checkItem(phoneOk, `부모님 휴대폰 ${phoneOk ? maskedPhone(c.parent_phone) : ''}`, `<a href="#/customer/${c.id}/info">'정보' 탭에서 ${c.parent_phone ? '번호 확인하기 (010-0000-0000 형식)' : '입력하기'}</a>`)}</ul>
      ${plans.length ? `<form data-form="ai-call" data-id="${c.id}"><fieldset class="picks"><legend>여쭐 질문 고르기 <span class="muted">(최대 3개)</span></legend>
        ${plans.map((p, i) => `<label class="check-line"><input type="checkbox" name="plan" value="${p.id}" data-ai-pick${i < 3 ? ' checked' : ''}><span>${p.week}주차 · ${esc(p.text)}</span></label>`).join('')}</fieldset>
        <p class="row"><button class="btn" type="submit"${canCall ? '' : ' disabled'}>부모님께 AI 전화 걸기</button><span class="muted">${canCall ? '한 고객에게 하루 3번까지 걸 수 있습니다.' : '위 항목과 \'이 고객 준비\'를 모두 마치면 걸 수 있습니다.'}</span></p></form>` : ''}
      </details>`;
  }
  return `${top}<div class="ai-grid"><div>${setup}</div><div>${cust}</div></div>${phone}${history}
    <dialog id="ai-dialog" aria-labelledby="ai-dialog-title"></dialog></section>`;
}

/* 지난 이야기 요약 (AI 이어 듣기, ai-intro interview_memory)
   AI 초안(draft)은 담당자가 확인해야 요약(summary)이 되고, 확인된 요약만 다음 AI 대화에 전달된다. */
function memoryCard(c) {
  const m = c.memory;
  if (!m) return '';
  const tr = id => (c.transcripts || []).find(t => t.id === id);
  const basis = (m.draft_from || []).map(id => { const t = tr(id); return t ? `<a href="#/customer/${c.id}/tr">${esc(t.title || '녹취 ' + id)}</a> <small class="muted">${esc(t.created.slice(0, 10))}</small>` : `<span class="muted">녹취 ${id} (지워짐)</span>`; });
  const box = (text, label) => `<label for="mem_${c.id}">${label} <span class="muted" data-mem-count>${String(text || '').length}/600자</span></label><textarea id="mem_${c.id}" maxlength="600" rows="5" data-mem-text>${esc(text || '')}</textarea>`;
  return `<section class="card" id="memory"><div class="row between"><h3 class="card-title">지난 이야기 요약 <span class="muted">AI 이어 듣기</span></h3>
      <span>${m.enabled ? tagL('done', '이 고객 켜짐') : tagL('todo', '이 고객 꺼짐')} <button class="btn small sub-btn" data-act="mem-toggle" data-cid="${c.id}" data-on="${m.enabled ? 0 : 1}">${m.enabled ? '이 고객 이어 듣기 끄기' : '이 고객 이어 듣기 켜기'}</button></span></div>
    ${m.global ? '' : `<div class="warnbox"><b>이어 듣기는 아직 꺼져 있습니다.</b> 법률 검토가 끝나면 관리자가 'AI 설정·비용'에서 켭니다. 꺼져 있는 동안에는 요약이 AI에 전달되지 않고, AI 초안도 만들어지지 않습니다.</div>`}
    <p class="muted">AI 대화를 시작할 때 지난번 이야기를 짧게 기억해 이어서 여쭙습니다. AI가 만든 초안은 담당자가 확인해야 쓰이고, <b>확인한 요약만</b> 다음 대화에 전달됩니다. 장면과 아직 듣지 못한 부분만 적고, 건강·돈·가족 갈등·다른 사람의 실명·연락처는 넣지 마세요.</p>
    ${m.forget_note ? `<div class="problem-why"><i aria-hidden="true">!</i><span>부모님이 기억하지 말라고 하심${m.forget_when ? ` <small>(${esc(m.forget_when.slice(0, 16))})</small>` : ''}<br><span class="forget-text">${esc(m.forget_note)}</span><br><small>요약과 초안에 이 내용을 넣지 마세요.</small></span></div>` : ''}
    ${m.draft ? `<div class="mem-block draft"><h4 class="fs">${tagL('todo', 'AI 초안 · 확인 전')} <span class="muted">${esc((m.draft_when || '').slice(0, 16))}</span></h4>
        ${basis.length ? `<p class="mem-basis"><b>근거 녹취</b> ${basis.join(' · ')}</p>` : ''}
        ${box(m.draft, '고칠 곳을 고친 뒤 확인해 주세요')}
        <p class="row"><button class="btn" data-act="mem-confirm" data-cid="${c.id}">고쳐서 확인</button><button class="btn sub-btn" data-act="mem-drop" data-cid="${c.id}">초안 버리기</button></p></div>` : ''}
    <div class="mem-block"><h4 class="fs">확인된 요약 ${m.summary ? tagL('done', '다음 대화에 씀') : ''}</h4>
      ${m.summary ? `<div class="raw-box">${esc(m.summary)}</div><p class="muted">${esc(m.confirmed_name || '담당자')} 확인 · ${esc((m.confirmed || '').slice(0, 16))}</p>` : '<p class="muted">아직 확인된 요약이 없습니다. AI 대화에는 "처음 이야기 나누는 날"로 전달됩니다.</p>'}
      ${m.draft ? '' : `<details${m.summary ? '' : ' open'}><summary>${m.summary ? '요약 고치기' : '요약 직접 쓰기'}</summary>${box(m.summary, '요약')}<p class="row"><button class="btn" data-act="mem-confirm" data-cid="${c.id}">저장하고 확인</button></p></details>`}
      ${m.summary ? `<p><button class="btn small danger" data-act="mem-clear" data-cid="${c.id}">요약 지우기</button></p>` : ''}</div></section>`;
}

/* AI 대화 원문([AI 0:12] … / [어머님 0:20] …)을 말풍선처럼 나눠 보여 준다 */
function dialogue(raw) {
  const lines = String(raw || '').split(/\n+/).map(l => l.match(/^\[(.+?) (\d+:\d{2})\]\s*(.*)$/)).filter(Boolean);
  if (!lines.length) return '';
  return `<details class="talk-box"><summary>대화로 보기 (${lines.length}마디)</summary><ol class="talk">${lines.map(([, who, at, text]) =>
    `<li class="${who === 'AI' ? 'ai' : 'pa'}"><span class="who">${esc(who)} <small class="num">${esc(at)}</small></span><p>${esc(text)}</p></li>`).join('')}</ol></details>`;
}
/* AI 대화에서 부모님 말씀만 남긴 글 (정리본의 첫 바탕) */
const parentOnly = raw => String(raw || '').split(/\n+/).map(l => l.match(/^\[(.+?) \d+:\d{2}\]\s*(.*)$/)).filter(m => m && m[1] !== 'AI').map(m => m[2]).join('\n\n');
/* 이어 녹음에서 질문이 바뀐 시점. 시각을 누르면 그 자리부터 재생한다. */
function marksList(t, isAI) {
  const marks = Array.isArray(t.marks) ? t.marks : [];
  if (!marks.length) return '';
  if (isAI) return `<h3 class="fs">이 대화에서 여쭌 질문</h3><ol class="marks">${marks.map(m => `<li><span>${esc(m.text)}</span></li>`).join('')}</ol>`;
  return `<h3 class="fs">질문이 바뀐 시점</h3><ol class="marks">${marks.map(m => `<li>${t.has_audio
    ? `<button type="button" class="time-btn num" data-act="seek" data-aud="aud_${t.id}" data-at="${+m.at || 0}" aria-label="${mmss(m.at)}부터 듣기">${mmss(m.at)}</button>`
    : `<span class="time-btn num">${mmss(m.at)}</span>`}<span>${esc(m.text)}</span></li>`).join('')}</ol>`;
}
function tabTranscripts(c) {
  const planOpts = c.plans.map(p => `<option value="${p.id}">${p.week}주차 ${esc(p.text.slice(0, 40))}</option>`).join('');
  const sess = c.ai_sessions || [];
  const items = c.transcripts.map(t => {
    const latest = t.versions[0];
    const vers = t.versions.length ? t.versions.map(v => `<details><summary>${esc(v.created)} · ${esc(v.editor)}</summary><pre class="msg">${esc(v.clean)}</pre>
      <button class="btn small sub-btn" type="button" data-act="load-ver" data-tid="${t.id}" data-vid="${v.id}">이 버전 불러오기</button></details>`).join('') : '<p class="muted">저장된 정리본이 없습니다.</p>';
    const src = sourceOf(t.audio_name), isAI = src.startsWith('AI');
    const pending = sess.find(s => s.transcript_id === t.id && s.audio_pending);
    const audio = t.has_audio ? `<audio id="aud_${t.id}" controls preload="none" data-audio-path="${esc(t.audio_path)}"></audio><p class="muted">${esc(t.audio_name)}</p>`
      : pending ? `<p class="warnbox">AI 인터뷰 녹음을 아직 받지 못했습니다. 잠시 뒤 다시 가져와 주세요.</p><p><button class="btn small sub-btn" type="button" data-act="ai-fetch" data-cid="${c.id}" data-sid="${esc(pending.id)}">녹음 다시 가져오기</button></p>`
      : '<p class="muted">올린 음성이 없습니다.</p>';
    const note = isAI ? `<p class="infobox">${esc(src)}로 받은 대화입니다. 원문에는 AI 질문이 <b>[AI 0:12]</b>, 부모님 말씀이 <b>[${esc(c.parent_gender === '여성' ? '어머님' : c.parent_gender === '남성' ? '아버님' : '부모님')} 0:20]</b>처럼 표시되어 있습니다. 정리본 칸에는 부모님 말씀만 먼저 채워 두었습니다.</p>`
      : src && !t.raw ? `<p class="warnbox">${esc(src)} 링크로 받은 녹음입니다. 아래 음성을 듣고 원문 칸에 글로 옮긴 뒤 저장해 주세요.</p>` : '';
    const stuck = t.stt_status === '실패' || t.loop_status === '실패' || t.loop_status === '건너뜀';
    const loopBox = (t.loop_status || t.stt_status) ? `<div class="loop-box${stuck ? ' stuck' : ''}"><p>${sttTag(t)} ${loopTag(t)}${t.loop_attempts && t.loop_status !== '실패' ? ` <span class="muted">일시 오류로 ${t.loop_attempts}번 다시 시도</span>` : ''}</p>
        ${stuck ? `<p class="problem-why"><i aria-hidden="true">!</i> ${esc(problemText(t))}</p>` : ''}
        <p class="row">${loopButtons(c.id, { id: t.id, has_audio: t.has_audio })}<span class="muted">'글로 옮기기'는 음성을 다시 글로 바꾸고, '다시 정리'는 지금 원문으로 정리본과 질문 초안을 다시 만듭니다.</span></p></div>` : '';
    return `<details class="item"${(src && t.status === '녹취 도착') || stuck ? ' open' : ''}><summary><b>${esc(t.title || '(제목 없음)')}</b> ${pill(t.status)} ${srcPill(src)} ${stuck ? tagL('warn', '확인 필요') : LOOP_TAG[t.loop_status] && LOOP_TAG[t.loop_status][0] === 'doing' ? tagL('doing', '자동 처리 중') : ''} <span class="muted">${esc(t.created.slice(0, 10))}</span></summary><div class="body">
      ${loopBox}${note}
      <h2>음성</h2>${audio}
      ${marksList(t, isAI)}
      ${isAI ? dialogue(t.raw) : ''}
      <form data-form="tr-raw" data-id="${t.id}"><div class="row fill"><div><label for="trt_${t.id}">제목</label><input id="trt_${t.id}" name="title" type="text" value="${esc(t.title)}"></div>
        <div><label for="trs_${t.id}">상태</label><select id="trs_${t.id}" name="status">${options(META.transcriptStatus, t.status)}</select></div></div>
        <label for="trr_${t.id}">원문 (그대로 보관합니다)</label><textarea id="trr_${t.id}" name="raw" class="tall prose">${esc(t.raw)}</textarea>
        <p class="row"><button class="btn" type="submit">원문·상태 저장</button><button class="btn danger small" type="button" data-act="tr-del" data-id="${t.id}">녹취 삭제</button></p></form>
      <label for="tra_${t.id}">음성 ${t.has_audio ? '바꾸기' : '올리기'} (m4a, mp3, wav 등 · 50MB까지)</label><input id="tra_${t.id}" type="file" accept="audio/*,.m4a,.amr" data-audio="${t.id}">
      <h2>정리본 ${latest && latest.ai ? tagL('todo', 'AI 초안 · 확인 전') : ''}</h2>${latest && latest.ai ? '<p class="muted">AI가 만든 초안입니다. 원문과 비교해 고친 뒤 저장하면 사람이 확인한 버전이 됩니다.</p>' : ''}<form data-form="tr-clean" data-id="${t.id}"><textarea id="clean_${t.id}" name="clean" class="tall prose" aria-label="정리본">${esc(latest ? latest.clean : isAI ? parentOnly(t.raw) || t.raw : t.raw)}</textarea>
        <p><button class="btn" type="submit">새 버전으로 저장</button> <span class="muted">저장할 때마다 이전 버전이 남습니다.</span></p></form>
      <details><summary>이전 버전 ${t.versions.length}개</summary>${vers}</details></div></details>`;
  }).join('');
  return `<p class="muted">녹음 링크(자녀용·부모님용)와 AI 인터뷰로 받은 녹음이 여기에 들어옵니다. 링크와 AI 전화는 <a href="#/customer/${c.id}/plan">질문 탭</a>에서 다룹니다.</p>
    <details class="card"><summary>녹취 직접 추가</summary><form data-form="tr-new" data-id="${c.id}">
    <div class="row fill"><div><label for="trn_t">제목</label><input id="trn_t" name="title" type="text" maxlength="200"></div>
    <div><label for="trn_p">어떤 질문의 답인가요</label><select id="trn_p" name="plan_id"><option value="">선택 안 함</option>${planOpts}</select></div></div>
    <label for="trn_r">녹취 원문 (음성을 글로 바꾼 내용을 붙여 넣어요)</label><textarea id="trn_r" name="raw"></textarea>
    <label for="trn_a">음성 파일 (선택)</label><input id="trn_a" type="file" name="audio" accept="audio/*,.m4a,.amr">
    <p><button class="btn" type="submit">추가</button></p></form></details>
    ${c.transcripts.length ? items : '<p class="empty">녹취가 없습니다.</p>'}`;
}

/* ---------- 책 QR 음성 ----------
   이야기마다 원본 녹음에서 한 토막을 잘라 클립으로 저장하고, 클립마다 QR을 만든다.
   QR을 찍으면 공개 재생 페이지(VOICE_PAGE)에서 그 클립만 들을 수 있다. */
const clipUrl = cl => VOICE_PAGE + '#' + cl.token;
const parseTime = v => { v = String(v || '').trim(); if (!v) return null; const m = v.match(/^(\d+):([0-5]?\d)$/); if (m) return +m[1] * 60 + +m[2]; return /^\d+(\.\d+)?$/.test(v) ? +v : NaN; };
function clipState(c, cl) {
  if (cl.revoked_at) return tagL('todo', '중지됨');
  if (!c.delete_after || c.delete_after < META.today) return tagL('warn', '보관 기한 지남 · 재생 안 됨');
  return tagL('done', '재생 가능');
}
function clipTile(c, cl) {
  const story = (c.stories || []).find(s => s.id === cl.story_id);
  return `<article class="clip"><div class="qr" data-qr="${esc(clipUrl(cl))}" data-label="${esc(cl.title)}" aria-hidden="${cl.revoked_at ? 'true' : 'false'}"></div>
    <div class="clip-body"><b>${esc(cl.title) || '(제목 없음)'}</b> ${clipState(c, cl)}
      <span class="sub-line">${story ? '이야기: ' + esc(story.title || '(제목 없음)') + ' · ' : ''}길이 ${lengthText(cl.duration_secs)} · 재생 ${cl.play_count || 0}회${cl.last_played_at ? ' · 마지막 ' + esc(cl.last_played_at.slice(0, 10)) : ''}</span>
      <audio controls preload="none" data-audio-path="${esc(cl.audio_path)}" aria-label="${esc(cl.title)} 미리 듣기"></audio>
      ${cl.revoked_at ? '' : `<p class="row"><button class="btn small" data-act="clip-svg" data-id="${cl.id}">인쇄용 SVG</button><button class="btn small sub-btn" data-act="clip-png" data-id="${cl.id}">PNG</button>
        <button class="btn small sub-btn" data-act="copy-text" data-text="${esc(clipUrl(cl))}">주소 복사</button><button class="btn small sub-btn" data-act="clip-revoke" data-id="${cl.id}">중지</button></p>`}</div></article>`;
}
function clipsCard(c) {
  const clips = c.clips || [];
  if (!c.clips) return '';
  const live = clips.filter(cl => !cl.revoked_at);
  return `<section class="card" id="qr"><h3 class="card-title">책 QR 음성 <span class="muted">${live.length}개</span></h3>
    <p class="muted">이야기마다 부모님 목소리 한 토막을 잘라 QR로 책에 넣습니다. QR을 찍으면 <b>잘라 둔 그 토막만</b> 들을 수 있고, 원본 녹음이나 다른 정보는 볼 수 없습니다. 아래 이야기를 열고 'QR 음성 만들기'에서 만드세요.</p>
    <div class="warnbox">보관 기한이 지나면 QR이 재생되지 않습니다. 책에 남는 음성을 얼마나 보관할지 정해지기 전이니, 인쇄 전에 담당자와 확인해 주세요.</div>
    ${live.length ? `<p class="row"><button class="btn small sub-btn" data-act="clip-sheet">QR 모아서 인쇄하기</button></p>` : ''}
    ${clips.length ? `<div class="clip-grid">${clips.slice().sort((x, y) => (!!x.revoked_at - !!y.revoked_at) || (y.id - x.id)).map(cl => clipTile(c, cl)).join('')}</div>` : '<p class="empty">아직 만든 QR 음성이 없습니다.</p>'}</section>`;
}
function clipMaker(c, s) {
  const srcs = (c.transcripts || []).filter(t => t.has_audio);
  const mine = (c.clips || []).filter(cl => cl.story_id === s.id && !cl.revoked_at);
  if (!srcs.length) return `<div class="clip-maker"><h3 class="fs">QR 음성</h3><p class="muted">음성이 있는 녹취가 아직 없습니다. 녹음이 도착하면 여기서 한 토막을 잘라 QR을 만들 수 있습니다.</p></div>`;
  const def = srcs.find(t => t.id === s.transcript_id) || srcs[0];
  const chips = srcs.map(t => {
    const ms = Array.isArray(t.marks) ? t.marks : [];
    if (!ms.length) return '';
    return `<div class="chips" data-tid="${t.id}"${t.id === def.id ? '' : ' hidden'}><span class="muted">질문으로 구간 채우기:</span>${ms.map((m, i) => `<button type="button" class="chip" data-act="clip-mark" data-start="${+m.at || 0}" data-end="${ms[i + 1] ? +ms[i + 1].at : ''}">${mmss(m.at)} ${esc(String(m.text || '').slice(0, 24))}</button>`).join('')}</div>`;
  }).join('');
  return `<div class="clip-maker" data-story="${s.id}" data-cid="${c.id}"><h3 class="fs">QR 음성 ${mine.length ? `<span class="muted">이 이야기에 ${mine.length}개 · 위 '책 QR 음성'에서 보기</span>` : ''}</h3>
    <div class="row fill"><div style="flex:3 1 260px"><label for="cs_${s.id}">원본 녹음</label><select id="cs_${s.id}" data-clip-src>${srcs.map(t => `<option value="${t.id}"${t.id === def.id ? ' selected' : ''}>${esc(t.title || '녹취 ' + t.id)} · ${esc(t.created.slice(0, 10))}</option>`).join('')}</select></div>
      <div style="flex:1 1 110px"><label for="ca_${s.id}">시작 (분:초)</label><input id="ca_${s.id}" type="text" inputmode="numeric" data-clip-start value="0:00" placeholder="0:00"></div>
      <div style="flex:1 1 110px"><label for="cb_${s.id}">끝 (분:초)</label><input id="cb_${s.id}" type="text" inputmode="numeric" data-clip-end placeholder="비우면 끝까지"></div></div>
    ${chips}
    <label for="ct_${s.id}">QR 제목 (재생 화면에 보입니다)</label><input id="ct_${s.id}" type="text" maxlength="200" data-clip-title value="${esc(s.title)}">
    <audio controls preload="none" data-clip-audio aria-label="원본 녹음 미리 듣기"></audio>
    <p class="row"><button type="button" class="btn sub-btn" data-act="clip-preview">이 구간 미리 듣기</button><button type="button" class="btn" data-act="clip-make">잘라서 QR 만들기</button>
      <span class="muted">10분까지. 이 컴퓨터에서 잘라 올립니다.</span></p></div>`;
}
/* 원본 녹음을 브라우저에서 읽어 [시작, 끝] 구간만 22.05kHz 모노 WAV로 만든다 */
async function cutClip(srcUrl, start, end) {
  const buf = await (await fetch(srcUrl)).arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
  let audio;
  try { audio = await ctx.decodeAudioData(buf); } catch (e) { throw new Error('이 녹음 형식은 브라우저에서 자를 수 없습니다. m4a·mp3·wav로 바꿔 올려 주세요.'); } finally { ctx.close(); }
  const s = Math.max(0, start), e = Math.min(audio.duration, end == null ? audio.duration : end);
  if (!(e - s >= 1)) throw new Error('구간이 너무 짧습니다. 시작과 끝을 확인해 주세요.');
  if (e - s > 600) throw new Error('QR 음성은 10분까지 만들 수 있습니다.');
  const rate = 22050, off = new OfflineAudioContext(1, Math.ceil((e - s) * rate), rate);
  const node = off.createBufferSource(); node.buffer = audio; node.connect(off.destination); node.start(0, s, e - s);
  const d = (await off.startRendering()).getChannelData(0);
  const fade = Math.min(d.length / 2, rate * 0.04); // 앞뒤 0.04초 부드럽게
  for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[d.length - 1 - i] *= i / fade; }
  const v = new DataView(new ArrayBuffer(44 + d.length * 2)), str = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 0x7fff, true);
  return { blob: new Blob([v], { type: 'audio/wav' }), start: s, end: e, duration: e - s };
}
let QR_MOD = null;
const qrLib = () => QR_MOD || (QR_MOD = import('./qr.mjs'));
function hydrateQR() {
  const els = document.querySelectorAll('[data-qr]');
  if (!els.length) return;
  qrLib().then(q => els.forEach(el => { el.innerHTML = q.qrSvg(el.dataset.qr, { label: el.dataset.label }); })).catch(e => toast('QR을 그리지 못했습니다: ' + e.message));
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const clipFileName = (cl, ext) => `QR-${CUR.code}-${String(cl.title || cl.id).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)}.${ext}`;

function tabStories(c) {
  const trOpts = c.transcripts.map(t => `<option value="${t.id}">${esc(t.title || '녹취 ' + t.id)}</option>`).join('');
  const storyForm = (s, isNew) => `<form data-form="${isNew ? 'story-new' : 'story-edit'}" data-id="${isNew ? c.id : s.id}">
    <div class="row fill"><div><label>제목</label><input name="title" type="text" value="${esc(s.title)}"></div>
    <div><label>시기</label><input name="era" type="text" value="${esc(s.era)}" placeholder="예: 1968~1972"></div>
    <div><label>태그</label><input name="tags" type="text" value="${esc(s.tags)}" placeholder="쉼표로 구분"></div>
    ${isNew ? `<div><label>바탕이 된 녹취</label><select name="transcript_id"><option value="">선택 안 함</option>${trOpts}</select></div>` : `<div><label>상태</label><select name="status">${options(META.storyStatus, s.status)}</select></div>`}</div>
    <label>본문</label><textarea name="body" class="tall prose">${esc(s.body)}</textarea>
    <label>민감 정보 표시 (건강, 제3자 실명, 주민번호 등. 가릴 문장을 적어 두세요)</label><textarea name="sensitive_note">${esc(s.sensitive_note)}</textarea>
    <p class="row"><button class="btn" type="submit">${isNew ? '추가' : '저장'}</button>${isNew ? '' : `<button class="btn danger small" type="button" data-act="story-del" data-id="${s.id}">삭제</button>`}</p></form>`;
  const qrCount = s => (c.clips || []).filter(cl => cl.story_id === s.id && !cl.revoked_at).length;
  return `${clipsCard(c)}<details class="card"><summary>이야기 추가</summary>${storyForm({}, true)}</details>
    ${c.stories.length ? c.stories.map(s => `<details class="item"><summary><b>${esc(s.title || '(제목 없음)')}</b> ${pill(s.status)} <span class="muted">${esc(s.era)} ${esc(s.tags)}</span>${s.sensitive_note ? ' ' + pill('민감 표시', 'warn') : ''}${qrCount(s) ? ' ' + pill('QR ' + qrCount(s), 'src') : ''}</summary><div class="body">${storyForm(s)}${clipMaker(c, s)}</div></details>`).join('') : '<p class="empty">이야기가 없습니다.</p>'}`;
}

function tabManage(c) {
  const admin = ME.role === 'admin';
  return `<div class="card"><h3 class="card-title">파일로 내려받기</h3><p class="muted">이 고객의 정보, 동의, 질문 계획, 녹취 원문·정리본, 이야기를 마크다운 파일 하나(<code>${esc(c.code)}.md</code>)로 내려받습니다. 에이전트 스킬로 작업할 때 쓰세요. 음성 파일은 포함되지 않고, 내려받은 파일은 내 컴퓨터에 남으니 작업이 끝나면 지워 주세요. 내려받은 기록이 남습니다.</p>
    <p><button class="btn" data-act="export" data-id="${c.id}">내려받기</button></p></div>
    <div class="card danger-zone"><h3 class="card-title">파기</h3>
    ${admin ? `<p>고객 정보, 녹취, 정리본, 이야기, 질문 계획, 올려 둔 음성 파일을 모두 지웁니다. <b>되돌릴 수 없습니다.</b> 고객 번호와 파기 날짜, 담당자만 파기 기록에 남습니다. 내려받거나 따로 복사해 둔 파일이 있다면 그 파일도 직접 지워 주세요.</p>
    <form data-form="destroy" data-id="${c.id}"><label>확인을 위해 고객 번호(${esc(c.code)})를 입력해 주세요</label><input name="confirm" type="text" autocomplete="off">
    <p><button class="btn danger" type="submit">파기</button></p></form>` : '<p class="muted">파기는 관리자만 할 수 있습니다. 관리자에게 요청해 주세요.</p>'}</div>`;
}

/* ---------- 질문 은행 ---------- */
async function pageQuestions() {
  QUESTIONS = await api('GET', '/questions');
  const tpl = await api('GET', '/settings');
  const admin = ME.role === 'admin', st = hasStages();
  const stageSel = (v, label) => st ? `<select name="stage" aria-label="${label}" style="max-width:170px"><option value="">단계 없음</option>${Object.entries(STAGES).map(([n, t]) => `<option value="${n}"${+n === v ? ' selected' : ''}>${n}. ${esc(t)}</option>`).join('')}</select>` : '';
  const rowsHtml = QUESTIONS.map(q => admin ? `<tr><td><form data-form="q-edit" data-id="${q.id}" class="row fill">
      ${stageSel(q.stage, '인생 단계')}<input name="topic" type="text" value="${esc(q.topic)}" aria-label="주제" style="max-width:150px"><input name="era" type="text" value="${esc(q.era)}" aria-label="시기" style="max-width:110px">
      <input name="text" type="text" value="${esc(q.text)}" aria-label="질문" style="flex:3 1 280px">
      <button class="btn small" type="submit">저장</button>
      <button class="btn small sub-btn" type="button" data-act="q-move" data-id="${q.id}" data-dir="up" aria-label="위로">↑</button>
      <button class="btn small sub-btn" type="button" data-act="q-move" data-id="${q.id}" data-dir="down" aria-label="아래로">↓</button>
      <button class="btn small sub-btn" type="button" data-act="q-toggle" data-id="${q.id}" data-on="${q.active ? 0 : 1}">${q.active ? '사용 중지' : '다시 사용'}</button>
      <button class="btn small sub-btn" type="button" data-act="q-del" data-id="${q.id}">삭제</button></form></td></tr>`
    : `<tr><td>${stagePill(q.stage)} ${pill(q.topic || '-', 'gray')} ${esc(q.text)} ${q.active ? '' : pill('중지', 'warn')}</td></tr>`).join('');
  return `<header class="page-head"><h1>질문 은행</h1><p class="sub">고객에게 여쭐 질문을 살아온 순서(인생 단계 → 시간)대로 모아 둡니다. 주제에 '원할 때만'이 붙은 질문은 힘든 기억일 수 있어 담을 때 처음에는 빠집니다. ${admin ? '' : '수정은 관리자만 할 수 있습니다.'}</p></header>
    ${admin ? `<form class="card" data-form="q-new"><h3 class="card-title">질문 추가</h3><div class="row fill">${st ? `<div style="flex:0 1 190px"><label for="qn_stage">인생 단계</label>${stageSel(null, '인생 단계').replace('<select', '<select id="qn_stage"')}</div>` : ''}<div style="flex:0 1 140px"><label>주제</label><input name="topic" type="text" placeholder="어린 시절"></div>
      <div style="flex:0 1 140px"><label>시기</label><input name="era" type="text" placeholder="1950년대"></div>
      <div style="flex:3 1 300px"><label>질문 문장</label><input name="text" type="text" maxlength="500" required></div></div>
      <p><button class="btn" type="submit">추가</button></p></form>` : ''}
    ${QUESTIONS.length ? `<table>${rowsHtml}</table>` : '<p class="empty">질문이 없습니다.</p>'}
    ${admin ? `<h2>보내는 문안 템플릿</h2><form class="card" data-form="tpl"><p class="muted"><code>{보호자}</code> <code>{부모님}</code> <code>{질문}</code> <code>{링크}</code> 자리에 고객 정보, 고른 질문, 링크 안내가 들어갑니다. <code>{링크}</code>를 빼면 문안 맨 끝에 붙습니다.</p>
      <label for="tpl_c">보호자(자녀)에게 보낼 때</label><textarea id="tpl_c" name="message_template" rows="8">${esc(tpl.message_template)}</textarea>
      <label for="tpl_p">부모님께 직접 보낼 때</label><textarea id="tpl_p" name="parent_message_template" rows="8">${esc(tpl.parent_message_template)}</textarea>
      <p><button class="btn" type="submit">저장</button></p></form>` : ''}`;
}

/* ---------- 발송 대기열 ----------
   고객마다 한 장: 보낼 질문 고르기 → 받는 사람(보호자/부모님) → 링크 → 문안 복사 → '보냈어요'.
   링크 주소는 만든 순간에만 알 수 있으므로, 사용 중인 링크가 있으면 '받은 링크를 다시 열어 주세요'로 안내한다. */
let QUEUE = {};
const fillTpl = (tpl, v) => { let t = tpl; Object.entries(v).forEach(([k, x]) => { t = t.split(`{${k}}`).join(x); }); return t; };
const questionText = qs => qs.length === 1 ? qs[0] : qs.map((q, i) => `${i + 1}. ${q}`).join('\n');
function linkText(aud, url, active) {
  if (url) return aud === 'parent' ? `아래 링크를 누르시면 질문이 보이고, 말씀하시면 녹음됩니다.\n${url}` : `아래 링크를 부모님 곁에서 열어 녹음해 주세요.\n${url}`;
  if (active) return aud === 'parent' ? '지난번에 받으신 링크를 다시 누르시면 이번 주 질문이 먼저 나옵니다.' : '지난번에 보내 드린 녹음 링크를 다시 열면 이번 주 질문이 맨 앞에 보입니다.';
  return '[링크 자리: 위에서 새 링크를 만들어 주세요]';
}
function sendCard(c) {
  const admin = ME.role === 'admin';
  const aud0 = c.links.parent && !c.links.child ? 'parent' : 'child';
  const drafts = c.drafts.length ? `<details class="drafts"${c.ready.length ? '' : ' open'}><summary>승인 대기 질문 ${c.drafts.length}개</summary><ul class="plain">${c.drafts.map(p => `<li><span>${p.week}주차 · ${esc(p.text)} ${p.source === 'ai' ? pill('AI 제안', 'src') : ''}</span>
      ${p.reason ? `<small>근거: ${esc(p.reason)}</small>` : ''}${admin ? `<span class="row"><button class="btn small" data-act="plan-status" data-id="${p.id}" data-status="승인">승인</button><a class="btn small sub-btn" href="#/customer/${c.id}/plan">고치기</a></span>` : '<small>관리자가 승인하면 보낼 수 있습니다.</small>'}</li>`).join('')}</ul></details>` : '';
  const who = (aud, label, name, phone) => `<label class="check-line"><input type="radio" name="aud_${c.id}" value="${aud}" data-q-aud${aud === aud0 ? ' checked' : ''}><span><b>${label}</b> ${esc(name) || ''} <small>${phone ? `<span data-masked="${esc(phone)}">${esc(maskContact(phone))}</span> <button type="button" class="link-btn" data-act="reveal">보기</button>` : '휴대폰 번호 미입력'}</small></span></label>`;
  const send = c.ready.length ? `<div class="send-grid"><div>
      <fieldset class="picks"><legend>보낼 질문 <span class="muted">(체크한 것만 문안에 들어갑니다)</span></legend>${c.ready.map((p, i) => `<label class="check-line"><input type="checkbox" value="${p.id}" data-q-pick${i < 3 ? ' checked' : ''}><span>${p.week}주차 · ${esc(p.text)}</span></label>`).join('')}</fieldset>
      <fieldset class="picks"><legend>받는 사람</legend>${who('child', '보호자(자녀)', c.guardian_name, c.guardian_contact)}${who('parent', '부모님', c.parent_name, c.parent_phone)}</fieldset>
      <div class="link-line" data-link-line></div></div>
    <div><label for="msg_${c.id}">보낼 문안 <span class="muted">(고쳐도 됩니다. 질문이나 받는 사람을 바꾸면 새로 만들어집니다)</span></label><textarea id="msg_${c.id}" class="msg-edit" data-msg rows="11"></textarea>
      <p class="row"><button class="btn" data-act="q-copy">문안 복사</button><button class="btn sub-btn" data-act="q-sent">보냈어요</button></p>
      <p class="muted">카카오톡이나 문자로 보낸 뒤 '보냈어요'를 누르면 체크한 질문이 '보냄'으로 바뀝니다.</p></div></div>` : '';
  return `<section class="card send-card" data-cid="${c.id}"><div class="row between"><h2 class="card-title"><a href="#/customer/${c.id}/plan">${esc(c.parent_name) || '(성함 미입력)'}</a> <span class="code">${esc(c.code)}</span></h2>
    <span class="row">${c.ready.length ? tagL('done', `보낼 질문 ${c.ready.length}개`) : ''}${c.drafts.length ? tagL('todo', `승인 대기 ${c.drafts.length}개`) : ''}</span></div>${drafts}${send}</section>`;
}
/* 고른 질문·받는 사람·링크로 문안과 링크 안내를 다시 그린다 */
function paintSend(card) {
  const st = QUEUE[card.dataset.cid]; if (!st || !$('[data-msg]', card)) return;
  const c = st.c, aud = ($('[data-q-aud]:checked', card) || {}).value || 'child', A = audOf(aud);
  const qs = [...card.querySelectorAll('[data-q-pick]:checked')].map(i => c.ready.find(p => p.id === +i.value).text);
  const active = c.links[aud], url = st.url[aud];
  $('[data-link-line]', card).innerHTML = url ? `<p class="success-note">새 ${A.name} 링크를 문안에 넣었습니다. 이 화면을 벗어나면 링크 주소를 다시 볼 수 없습니다.</p>`
    : active ? `<p>${tagL('done', `${A.name} 링크 사용 중`)} <span class="muted">기한 ${esc(active.expires_at.slice(0, 10))}${active.last_used_at ? ' · 마지막 사용 ' + esc(active.last_used_at.slice(0, 10)) : ''}</span><br><span class="muted">문안에 '받은 링크를 다시 열어 달라'는 안내가 들어갑니다.</span> <button type="button" class="link-btn" data-act="q-newlink">링크를 잃어버렸다면 새로 만들어 넣기</button></p>`
    : `<p class="warnbox">사용 중인 ${A.name} 링크가 없습니다. <button type="button" class="btn small" data-act="q-newlink">새 ${A.name} 링크 만들어 넣기</button></p>`;
  const tpl = st.tpl[aud === 'parent' ? 'parent_message_template' : 'message_template'];
  const link = linkText(aud, url, active);
  const nm = v => String(v || '').trim().replace(/님$/, ''); // 템플릿이 '{부모님}님'처럼 님을 붙이므로
  let msg = fillTpl(tpl, { 보호자: nm(c.guardian_name) || '보호자', 부모님: nm(c.parent_name) || '부모',  질문: qs.length ? questionText(qs) : '[보낼 질문을 골라 주세요]', 링크: link });
  if (!tpl.includes('{링크}')) msg += '\n\n' + link;
  $('[data-msg]', card).value = msg;
}
async function pageQueue() {
  const d = await api('GET', '/queue');
  QUEUE = Object.fromEntries(d.customers.map(c => [c.id, { c, tpl: d.templates, url: {} }]));
  const ready = d.customers.filter(c => c.ready.length).length, waiting = d.customers.reduce((n, c) => n + c.drafts.length, 0);
  setTimeout(() => document.querySelectorAll('.send-card').forEach(paintSend));
  return `<header class="page-head"><h1>발송 대기열</h1><p class="sub">고객마다 보낼 질문을 고르고, 받는 사람을 정한 뒤 문안을 복사해 카카오톡이나 문자로 보냅니다. 보낸 뒤 '보냈어요'를 눌러 주세요.</p></header>
    <div class="todos"><span class="todo ${ready ? 'has' : ''}"><b>${ready}</b><span>보낼 고객</span><small>${ready ? '아래에서 문안 복사' : '없음'}</small></span>
      <span class="todo ${waiting ? 'has' : ''}"><b>${waiting}</b><span>승인 대기 질문</span><small>${waiting ? (ME.role === 'admin' ? '승인하면 보낼 수 있음' : '관리자 승인 대기') : '없음'}</small></span></div>
    ${d.customers.length ? d.customers.map(sendCard).join('') : '<p class="empty">보낼 질문이 없습니다. 고객 화면의 \'질문\' 탭에서 질문을 추가하고 승인해 주세요.</p>'}`;
}

/* ---------- 녹음 도착 ----------
   녹음 링크(자녀용·부모님용)와 AI 전화·AI 대화로 들어온 녹음, AI 인터뷰 기록, 링크 상태를 한곳에서 본다. */
async function pageRecordings() {
  const d = await api('GET', '/recordings');
  const now = new Date().toISOString();
  const sessions = d.sessions || [];
  const active = d.links.filter(l => !l.revoked_at && l.expires_at >= now);
  const who = r => `<b>${esc(r.parent_name) || '(성함 미입력)'}</b><span class="sub-line">${esc(r.code)} · 보호자 ${esc(r.guardian_name) || '-'}</span>`;
  const fresh = d.arrivals.filter(t => t.status === '녹취 도착').length;
  const week = Date.now() - 7 * 864e5;
  const failed = sessions.filter(s => s.status === '실패' && new Date(s.created_at).getTime() > week).length;
  const waiting = sessions.filter(s => s.audio_pending).length;
  const careful = sessions.filter(s => s.safety_note).length;
  const todo = (n, label, href, hint) => `<a class="todo ${n ? 'has' : ''}" href="${href}"><b>${n}</b><span>${label}</span><small>${n ? hint : '없음'}</small></a>`;
  const counts = SOURCES.map(k => [k, d.arrivals.filter(t => t.source === k).length]);
  return `<header class="page-head"><h1>녹음 도착</h1><p class="sub">자녀용·부모님용 녹음 링크와 AI 전화·AI 대화로 들어온 녹음이 여기 모입니다. 줄을 누르면 그 고객의 '녹취' 탭이 열립니다. 링크와 AI 전화는 고객 화면의 '질문' 탭에서 다룹니다.</p></header>
    <div class="todos">${todo(fresh, '정리할 녹음', '#/recordings', '아래에서 열어 글로 옮기기')}${careful ? todo(careful, '⚠ 주의 표시된 AI 인터뷰', '#/recordings', '아래 기록에서 내용 확인') : ''}${todo(failed, '실패한 AI 인터뷰 (7일)', '#/recordings', '사유를 확인하고 다시 걸기')}${todo(waiting, '녹음을 기다리는 AI 인터뷰', '#/recordings', '아래에서 녹음 다시 가져오기')}
      <a class="todo" href="#/customers"><b>${active.length}</b><span>사용 중인 녹음 링크</span><small>고객별 질문 탭에서 관리</small></a></div>
    <div class="row between"><h2>최근 도착한 녹음</h2>
      <div class="inline-filter"><label for="rsrc">출처</label><select id="rsrc" data-rfilter><option value="">전체 (${d.arrivals.length})</option>${counts.map(([k, n]) => `<option value="${esc(k)}">${esc(k)} (${n})</option>`).join('')}</select></div></div>
    ${d.arrivals.length ? `<table id="rtable"><tr><th>고객</th><th>출처</th><th>질문</th><th>도착</th><th>상태</th></tr>${d.arrivals.map(t => `<tr class="click" data-href="#/customer/${t.customer_id}/tr" data-src="${esc(t.source)}"><td>${who(t)}</td><td>${srcPill(t.source)}${t.has_audio ? '' : '<span class="sub-line">음성 없음</span>'}</td><td><a class="row-link" href="#/customer/${t.customer_id}/tr">${esc(t.title) || '(제목 없음)'}</a></td><td class="num">${esc(t.created.slice(0, 16))}</td><td>${t.status === '녹취 도착' ? tagL('warn', '정리 필요') : pill(t.status)}</td></tr>`).join('')}</table>
      <p class="muted" id="rcount" aria-live="polite"></p>`
      : '<p class="empty">아직 도착한 녹음이 없습니다. 고객 화면의 \'질문\' 탭에서 녹음 링크를 만들어 보내거나 AI 전화를 걸어 보세요.</p>'}
    <h2>AI 인터뷰 기록</h2>
    ${sessions.length ? aiSessionTable(null, sessions) : '<p class="empty">아직 AI 인터뷰 기록이 없습니다.</p>'}
    <h2>녹음 링크</h2>
    ${d.links.length ? `<table><tr><th>고객</th><th>받는 사람</th><th>사용 기한</th><th>받은 녹음</th><th>상태</th><th></th></tr>${d.links.map(l => `<tr><td>${who(l)}</td><td>${audOf(l.audience).name}</td><td class="num">${esc(l.expires_at.slice(0, 10))}</td>
      <td class="num">${l.upload_count}개${l.last_used_at ? `<span class="sub-line">마지막 ${esc(l.last_used_at.slice(0, 10))}</span>` : ''}</td>
      <td>${linkState(l, now)}</td><td><a class="btn small sub-btn" href="#/customer/${l.customer_id}/plan">관리</a></td></tr>`).join('')}</table>`
      : '<p class="empty">만든 링크가 없습니다.</p>'}`;
}

/* ---------- AI 비용 (관리자) ----------
   ai_usage_monthly(한국 시간 달·고객·종류별 합계)와 월 상한. 모두 가격표로 계산한 추정치다. */
const KIND = { llm: '글 정리 (Claude)', stt: '음성 → 글', voice: 'AI 음성 대화' };
const usd = v => '$' + (Number(v) || 0).toFixed(2);
function capMeter(spend, cap) {
  const pct = cap ? spend / cap * 100 : 0, w = Math.min(100, pct);
  const st = pct >= 100 ? ['warn', '상한 도달'] : pct >= 80 ? ['warn', '상한 가까움'] : ['done', '여유 있음'];
  return `<div class="meter-tile"><div class="meter-head"><span class="meter-num">${usd(spend)}</span><span class="muted">/ 상한 ${usd(cap)}</span> ${tagL(...st)}</div>
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${spend.toFixed(2)}" aria-label="이번 달 추정 비용 ${usd(spend)}, 상한 ${usd(cap)}의 ${Math.round(pct)}%"><i class="${pct >= 80 ? 'hot' : ''}" style="width:${w}%"></i><b style="left:80%" aria-hidden="true"></b></div>
    <p class="muted meter-note">상한의 ${Math.round(pct)}% 사용 · 80% 표시선을 넘으면 '오늘의 업무'에 알림이 뜹니다. 상한에 닿으면 AI 자동 처리(글로 옮기기·정리·질문 제안·AI 대화)가 멈춥니다.</p></div>`;
}
const capNote = d => d.cap_set ? '' : `<p class="muted">상한을 따로 정하지 않아 기본값 ${usd(d.cap)}가 적용되고 있습니다. 여기서 저장하면 그 값이 적용됩니다.</p>`;
async function pageUsage() {
  const [d, mem] = await Promise.all([api('GET', '/usage'), api('GET', '/settings/memory').catch(() => ({ enabled: false }))]);
  const memCard = `<section class="card"><div class="row between"><h2 class="card-title">인터뷰 이어 듣기 (전체 스위치)</h2>${mem.enabled ? tagL('done', '켜짐') : tagL('todo', '꺼짐')}</div>
    <p>켜면 AI 대화·전화가 지난번에 확인한 이야기 요약을 기억해 이어서 여쭙고, AI가 새 요약 초안을 만듭니다. 고객별 끄기와 요약 확인은 고객 화면의 '질문' 탭에서 합니다.</p>
    <p class="warnbox"><b>법률 검토 후 켜세요.</b> 지난 대화를 기억하는 것은 개인정보 처리 범위가 넓어지는 일입니다. 개인정보 처리방침과 동의서에 반영한 뒤 켜 주세요.</p>
    <p><button class="btn${mem.enabled ? ' sub-btn' : ''}" data-act="mem-global" data-on="${mem.enabled ? 0 : 1}">${mem.enabled ? '이어 듣기 끄기' : '이어 듣기 켜기'}</button></p></section>`;
  const head = `<header class="page-head"><h1>AI 설정과 비용</h1><p class="sub">${esc(d.month)} (한국 시간) · AI로 글을 옮기고 정리하고 대화한 비용을 가격표로 계산한 값입니다.</p></header>
    <h2>설정</h2>${memCard}<h2>비용</h2>
    <p class="infobox"><b>추정 비용이며 실제 청구서와 다를 수 있습니다.</b> 실제 금액은 Anthropic·ElevenLabs 청구서에서 확인해 주세요.</p>`;
  const capForm = `<form class="card" data-form="usage-cap"><h2 class="card-title">월 상한</h2>${capNote(d)}
    <div class="row fill"><div style="flex:0 1 220px"><label for="cap">한 달 상한 (달러)</label><input id="cap" name="cap" type="number" min="1" max="10000" step="1" value="${esc(d.cap)}" inputmode="decimal"></div></div>
    <p><button class="btn" type="submit">저장</button> <span class="muted">바꾸면 다음 AI 작업부터 바로 적용됩니다.</span></p></form>`;
  if (d.missing) return `${head}<div class="warnbox">AI 사용 기록 표가 아직 없습니다. ai-intro의 사용량 기록(migration)이 배포되면 여기에 비용이 나타납니다.</div>${capForm}`;
  const now = d.rows.filter(r => r.month === d.month), spend = now.reduce((s, r) => s + r.cost_usd, 0);
  const byKind = Object.keys(KIND).map(k => { const rs = now.filter(r => r.kind === k); return { k, calls: rs.reduce((s, r) => s + (+r.calls || 0), 0), secs: rs.reduce((s, r) => s + r.seconds, 0), tok: rs.reduce((s, r) => s + (+r.input_tokens || 0) + (+r.output_tokens || 0), 0), cost: rs.reduce((s, r) => s + r.cost_usd, 0) }; });
  const cust = {};
  now.forEach(r => { const k = r.customer_id || 0, x = cust[k] = cust[k] || { id: r.customer_id, code: r.code, name: r.parent_name, llm: 0, stt: 0, voice: 0, total: 0 }; x[r.kind] = (x[r.kind] || 0) + r.cost_usd; x.total += r.cost_usd; });
  const custRows = Object.values(cust).sort((a, b) => b.total - a.total);
  const monthTotals = d.months.map(m => [m, d.rows.filter(r => r.month === m).reduce((s, r) => s + r.cost_usd, 0)]);
  const amount = k => k.k === 'llm' ? `${k.tok.toLocaleString()} 토큰` : `${Math.round(k.secs / 60).toLocaleString()}분`;
  return `${head}<h2>이번 달 추정 비용</h2>${capMeter(spend, d.cap)}
    <h2>종류별</h2><table><tr><th>종류</th><th>호출</th><th>사용량</th><th>추정 비용</th></tr>${byKind.map(k => `<tr><td>${KIND[k.k]}</td><td class="num">${k.calls.toLocaleString()}회</td><td class="num">${amount(k)}</td><td class="num"><b>${usd(k.cost)}</b></td></tr>`).join('')}</table>
    <h2>고객별</h2>${custRows.length ? `<table><tr><th>고객</th><th>글 정리</th><th>음성 → 글</th><th>AI 음성 대화</th><th>합계</th></tr>${custRows.map(x => `<tr><td>${x.id ? `<a href="#/customer/${x.id}"><b>${esc(x.name) || '(성함 미입력)'}</b></a><span class="sub-line">${esc(x.code)}</span>` : '<span class="muted">파기한 고객 (번호 없음)</span>'}</td>
      <td class="num">${usd(x.llm)}</td><td class="num">${usd(x.stt)}</td><td class="num">${usd(x.voice)}</td><td class="num"><b>${usd(x.total)}</b></td></tr>`).join('')}</table>` : '<p class="empty">이번 달 AI 사용 기록이 없습니다.</p>'}
    <h2>최근 석 달</h2><table><tr><th>달</th><th>추정 비용</th></tr>${monthTotals.map(([m, v]) => `<tr><td class="num">${esc(m)}</td><td class="num">${usd(v)}</td></tr>`).join('')}</table>
    ${capForm}`;
}

/* ---------- 파기 대기, 팀, 활동 ---------- */
async function pageDestruction() {
  const d = await api('GET', '/destruction');
  return `<header class="page-head"><h1>파기 대기</h1><p class="sub">보관 기한이 30일 안으로 다가왔거나 지난 고객입니다.</p></header>
    ${d.due.length ? `<table><tr><th>고객</th><th>파기 예정일</th><th></th></tr>${d.due.map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.delete_after)} ${c.overdue ? pill('기한 지남', 'warn') : ''}</td>
      <td><a class="btn small" href="#/customer/${c.id}/manage">파기 화면으로</a></td></tr>`).join('')}</table>` : '<p class="empty">대기 중인 고객이 없습니다.</p>'}
    <h2>파기 기록</h2>${d.log.length ? `<table><tr><th>고객 번호</th><th>파기 날짜</th><th>담당자</th></tr>${d.log.map(l => `<tr><td>${esc(l.code)}</td><td>${esc(l.destroyed_on)}</td><td>${esc(l.by_name)}</td></tr>`).join('')}</table>` : '<p class="muted">아직 없습니다.</p>'}`;
}

async function pageTeam() {
  const users = await api('GET', '/users');
  const label = r => r === 'admin' ? '관리자' : r === 'staff' ? '담당자' : '승인 대기';
  const pending = users.filter(u => u.role === 'pending').length;
  return `<header class="page-head"><h1>팀원</h1><p class="sub">담당자는 자기에게 배정된 고객만 볼 수 있습니다. 새 계정은 관리자가 여기서 만들어 줍니다.</p></header>
    ${pending ? `<div class="warnbox">승인 대기 계정이 ${pending}개 있습니다. 직접 만든 계정이 아니라면 역할을 정하지 말고 그대로 두세요.</div>` : ''}
    <form class="card" data-form="user-new"><h3 class="card-title">팀원 추가</h3><div class="row fill"><div><label>이름</label><input name="name" type="text" required></div>
      <div><label>이메일</label><input name="email" type="email" required autocomplete="off"></div>
      <div><label>임시 비밀번호 (6자 이상)</label><input name="password" type="password" required autocomplete="new-password"></div>
      <div><label>역할</label><select name="role"><option value="staff">담당자</option><option value="admin">관리자</option></select></div></div>
      <p><button class="btn" type="submit">추가</button></p></form>
    <table><tr><th>이름 / 이메일</th><th>역할</th><th>비밀번호 바꾸기 / 역할 변경</th></tr>${users.map(u => `<tr><td>${esc(u.name)}<br><span class="muted">${esc(u.email)}</span></td><td>${pill(label(u.role), u.role === 'pending' ? 'warn' : '')}</td>
      <td><form data-form="user-edit" data-id="${esc(u.id)}" class="row"><input name="password" type="password" placeholder="새 비밀번호" autocomplete="new-password" aria-label="새 비밀번호">
      <select name="role" aria-label="역할"><option value="staff"${u.role === 'staff' ? ' selected' : ''}>담당자</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>관리자</option><option value="pending"${u.role === 'pending' ? ' selected' : ''}>사용 중지(승인 대기)</option></select>
      <button class="btn small" type="submit">저장</button></form></td></tr>`).join('')}</table>`;
}

async function pageActivity() {
  const a = await api('GET', '/activity');
  return `<header class="page-head"><h1>활동 기록</h1><p class="sub">최근 300건입니다. 누가 무엇을 열고 고쳤는지 남습니다.</p></header>
    <table><tr><th>시각</th><th>사람</th><th>행동</th><th>대상</th><th>내용</th></tr>${a.map(r => `<tr><td>${esc(r.ts)}</td><td>${esc(r.user_name)}</td><td>${esc(r.action)}</td><td>${esc(r.target)}</td><td>${esc(r.detail)}</td></tr>`).join('')}</table>`;
}

/* ---------- 폼 처리 ---------- */
const fd = form => Object.fromEntries(new FormData(form).entries());
const FORMS = {
  async setup(f) { await api('POST', '/setup', fd(f)); await boot(); },
  async login(f) { await api('POST', '/login', fd(f)); await boot(); },
  async 'cust-new'(f) { const r = await api('POST', '/customers', fd(f)); toast(r.code + ' 등록했습니다.'); location.hash = '#/customer/' + r.id; },
  async 'cust-info'(f) {
    const b = fd(f);
    await api('PUT', '/customers/' + f.dataset.id, b); toast('저장했습니다.'); route();
  },
  async consents(f) {
    const consents = META.consentItems.map((item, i) => ({ item, agreed: f.elements['agree_' + i].checked, agreed_on: f.elements['date_' + i].value }));
    await api('PUT', `/customers/${f.dataset.id}/consents`, { consents }); toast('저장했습니다.'); route();
  },
  async 'plan-bulk'(f) {
    const ids = [...f.querySelectorAll('[data-life]:checked')].map(i => +i.value);
    if (!ids.length) return toast('담을 질문을 골라 주세요.');
    const r = await api('POST', `/customers/${f.dataset.id}/plans/bulk`, { question_ids: ids });
    toast(`질문 ${r.count}개를 초안으로 담았습니다.${r.skipped ? ` (이미 담긴 ${r.skipped}개는 뺐습니다)` : ''}`); route();
  },
  async 'plans-approve-go'(f) {
    const ids = JSON.parse(f.dataset.ids), btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try { const r = await api('POST', '/plans/approve', { items: ids.map(id => ({ id })) }); f.closest('dialog').close(); toast(`${r.count}개를 승인했습니다. 녹음 링크에 바로 나옵니다.`); route(); }
    finally { btn.disabled = false; }
  },
  async 'plan-add'(f) { const b = fd(f); b.question_id = b.question_id ? +b.question_id : null; await api('POST', `/customers/${f.dataset.id}/plans`, b); toast('추가했습니다.'); route(); },
  async 'tr-new'(f) {
    const b = fd(f), file = f.elements.audio.files[0]; delete b.audio;
    b.plan_id = b.plan_id ? +b.plan_id : null;
    const r = await api('POST', `/customers/${f.dataset.id}/transcripts`, b);
    if (file) await uploadAudio(r.id, file);
    toast('추가했습니다.'); route();
  },
  async 'tr-raw'(f) { await api('PUT', '/transcripts/' + f.dataset.id, fd(f)); toast('저장했습니다.'); route(); },
  async 'tr-clean'(f) { await api('POST', `/transcripts/${f.dataset.id}/versions`, fd(f)); toast('새 버전으로 저장했습니다.'); route(); },
  async 'story-new'(f) { const b = fd(f); b.transcript_id = b.transcript_id ? +b.transcript_id : null; await api('POST', `/customers/${f.dataset.id}/stories`, b); toast('추가했습니다.'); route(); },
  async 'story-edit'(f) { await api('PUT', '/stories/' + f.dataset.id, fd(f)); toast('저장했습니다.'); route(); },
  async 'q-new'(f) { await api('POST', '/questions', fd(f)); toast('추가했습니다.'); route(); },
  async 'q-edit'(f) { await api('PUT', '/questions/' + f.dataset.id, fd(f)); toast('저장했습니다.'); route(); },
  async tpl(f) { await api('PUT', '/settings', fd(f)); toast('저장했습니다.'); },
  async 'user-new'(f) { await api('POST', '/users', fd(f)); toast('추가했습니다.'); route(); },
  async 'user-edit'(f) { const b = fd(f); if (!b.password) delete b.password; await api('PUT', '/users/' + f.dataset.id, b); toast('저장했습니다.'); route(); },
  /* AI 전화: 질문을 고르면 먼저 '미리 알렸나요?' 확인 대화상자를 연다 */
  async 'ai-call'(f) {
    const ids = [...f.querySelectorAll('input[name=plan]:checked')].map(i => +i.value);
    if (!ids.length) return toast('여쭐 질문을 1개 이상 골라 주세요.');
    if (ids.length > 3) return toast('질문은 3개까지 고를 수 있습니다.');
    const c = CUR, dlg = $('#ai-dialog');
    const qs = c.plans.filter(p => ids.includes(p.id));
    dlg.innerHTML = `<form data-form="ai-call-go" data-id="${c.id}" data-plans="${esc(JSON.stringify(ids))}">
      <h2 id="ai-dialog-title">부모님께 AI 전화가 간다고 미리 알렸나요?</h2>
      <p>모르는 번호로 AI가 전화하면 부모님이 놀라거나 받지 않으실 수 있습니다. 보호자(자녀)나 담당자가 <b>오늘 AI가 전화드린다</b>는 것을 먼저 알려 드려 주세요.</p>
      <dl class="summary"><div><dt>받는 분</dt><dd>${esc(c.parent_name) || '부모님'}</dd></div><div><dt>번호</dt><dd>${esc(maskContact(c.parent_phone))}</dd></div>
        <div><dt>여쭐 질문</dt><dd><ol class="plain-ol">${qs.map(p => `<li>${esc(p.text)}</li>`).join('')}</ol></dd></div></dl>
      <label class="check-line confirm-line"><input type="checkbox" name="told" required><span>네, 부모님께 AI 전화가 간다고 미리 알렸습니다.</span></label>
      <p class="row"><button class="btn" type="submit">전화 걸기</button><button class="btn sub-btn" type="button" data-act="dialog-close">취소</button></p></form>`;
    dlg.showModal();
  },
  async 'ai-call-go'(f) {
    if (!f.elements.told.checked) return toast('부모님께 미리 알렸는지 확인해 주세요.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '거는 중…';
    try {
      try { await API.interview({ action: 'call', customer_id: +f.dataset.id, plan_ids: JSON.parse(f.dataset.plans), confirm: true }); }
      catch (e) {
        if (e.status !== 504) throw e;
        // 응답이 늦었을 뿐 전화는 걸렸을 수 있다: 실패가 아니라 '확인 중'
        f.closest('dialog').close(); toast('확인 중입니다. 바로 다시 걸지 말고 몇 분 뒤 통화 기록을 확인해 주세요.'); route(); return;
      }
      f.closest('dialog').close();
      toast('전화를 걸고 있습니다. 통화가 끝나면 녹취 탭에 들어옵니다.');
      route();
    } finally { btn.disabled = false; btn.textContent = '전화 걸기'; }
  },
  async 'usage-cap'(f) { const r = await api('PUT', '/usage/cap', fd(f)); toast(`월 상한을 ${usd(r.cap)}로 저장했습니다.`); route(); },
  async destroy(f) {
    if (!confirm('정말 파기할까요? 되돌릴 수 없습니다.')) return;
    await api('POST', `/customers/${f.dataset.id}/destroy`, fd(f)); toast('파기했습니다.'); location.hash = '#/customers';
  },
};

const uploadAudio = (tid, file) => API.uploadAudio(tid, file);
/* book-agent loop_restart: 원문이 있는데 다시 글로 옮기면 서버가 need_confirm으로 한 번 더 묻는다 */
async function loopRestart(el, redo) {
  const body = { action: 'loop_restart', customer_id: +el.dataset.cid, transcript_id: +el.dataset.tid };
  if (redo) body.redo_stt = true;
  el.disabled = true;
  try {
    let r = await API.agent(body);
    if (r.need_confirm) { if (!confirm(r.message || '지금 원문을 지우고 다시 글로 옮길까요?')) return; r = await API.agent({ ...body, confirm: true }); }
    toast(redo ? '글로 옮기기를 다시 요청했습니다. 몇 분 뒤 결과가 나타납니다.' : '자동 정리를 다시 요청했습니다. 몇 분 뒤 결과가 나타납니다.'); route();
  } finally { el.disabled = false; }
}

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  guard(FORMS[f.dataset.form])(f);
});

/* ---------- 버튼 처리 ---------- */
const ACTS = {
  'pw-toggle'(el) {
    const i = el.previousElementSibling, show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    el.textContent = show ? '숨기기' : '보기';
    el.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
  },
  reload() { boot(); },
  jump(el) { const t = document.getElementById(el.dataset.target); if (t) { t.scrollIntoView({ block: 'start' }); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } },
  skip() { const m = document.getElementById('main'); if (m) m.focus(); },
  /* 로그아웃하면 페이지를 새로 읽어 화면과 메모리에 남은 고객 정보를 모두 지운다 */
  async logout() { await api('POST', '/logout').catch(() => {}); ME = null; location.replace(location.pathname + location.search); },
  reveal(el) {
    const s = el.previousElementSibling; if (!s || !s.dataset.masked) return;
    const shown = el.textContent === '숨기기';
    s.textContent = shown ? maskContact(s.dataset.masked) : s.dataset.masked;
    el.textContent = shown ? '보기' : '숨기기';
  },
  'year-rule'() {
    const d = $('#c_delivered').value;
    if (!d) return toast('책 인도일을 먼저 입력해 주세요.');
    $('#c_delete').value = addYear(d);
  },
  async 'plan-status'(el) { await api('PUT', '/plans/' + el.dataset.id, { status: el.dataset.status }); route(); },
  async 'plan-del'(el) { if (confirm('이 질문을 계획에서 지울까요?')) { await api('DELETE', '/plans/' + el.dataset.id); route(); } },
  async 'tr-del'(el) { if (confirm('녹취와 정리본, 올린 음성을 모두 지웁니다. 계속할까요?')) { await api('DELETE', '/transcripts/' + el.dataset.id); route(); } },
  async 'story-del'(el) { if (confirm('이 이야기를 지울까요?')) { await api('DELETE', '/stories/' + el.dataset.id); route(); } },
  'load-ver'(el) {
    const t = CUR.transcripts.find(x => x.id === +el.dataset.tid), v = t && t.versions.find(x => x.id === +el.dataset.vid);
    if (v) { $('#clean_' + t.id).value = v.clean; toast('불러왔습니다. 저장하면 새 버전이 됩니다.'); }
  },
  async 'q-move'(el) { await api('POST', `/questions/${el.dataset.id}/move`, { direction: el.dataset.dir }); route(); },
  async 'q-toggle'(el) { await api('PUT', '/questions/' + el.dataset.id, { active: el.dataset.on === '1' }); route(); },
  async 'q-del'(el) { if (confirm('이 질문을 지울까요?')) { const r = await api('DELETE', '/questions/' + el.dataset.id); if (r.note) toast(r.note); route(); } },
  async export(el) {
    if (!confirm('이 파일에는 연락처와 녹취 원문 같은 개인정보가 들어 있습니다.\n공용 컴퓨터에 저장하지 말고, 작업이 끝나면 바로 지워 주세요.\n\n내려받을까요?')) return;
    const r = await api('POST', `/customers/${el.dataset.id}/export`, {}); toast('내려받았습니다: ' + r.path);
  },
  async 'link-new'(el) {
    const aud = el.dataset.aud === 'parent' ? 'parent' : 'child', A = audOf(aud);
    const r = await api('POST', `/customers/${el.dataset.id}/links`, { days: 90, audience: aud });
    const box = el.closest('section').querySelector('.new-link');
    box.innerHTML = `<div class="success-note"><b>${A.name} 링크를 만들었습니다.</b> 지금 복사해 ${A.to} 보내 주세요. 이 화면을 벗어나면 다시 볼 수 없습니다.
      <div class="msg" id="link-url-${r.id}">${esc(r.url)}</div><button class="btn small" data-act="copy" data-target="link-url-${r.id}">링크 복사</button></div>`;
    box.scrollIntoView({ block: 'nearest' });
    toast(`${A.name} 링크를 만들었습니다. 복사해서 보내 주세요.`);
  },
  /* 질문이 바뀐 시점부터 재생 */
  seek(el) {
    const a = document.getElementById(el.dataset.aud); if (!a) return;
    const go = () => { a.currentTime = +el.dataset.at || 0; a.play().catch(() => {}); };
    if (a.readyState >= 1) go(); else { a.preload = 'metadata'; a.addEventListener('loadedmetadata', go, { once: true }); a.load(); }
  },
  'dialog-close'(el) { el.closest('dialog').close(); },
  async 'ai-fetch'(el) {
    el.disabled = true;
    try { await API.interview({ action: 'fetch_audio', customer_id: +el.dataset.cid, session_id: el.dataset.sid }); toast('녹음을 가져왔습니다.'); route(); }
    finally { el.disabled = false; }
  },
  async 'link-revoke'(el) { if (confirm('이 링크를 중지할까요? 중지하면 다시 쓸 수 없습니다.')) { await api('POST', `/links/${el.dataset.id}/revoke`); toast('중지했습니다.'); route(); } },
  'life-pick'(el) {
    const form = el.closest('form'), mode = el.dataset.mode;
    form.querySelectorAll('[data-life]').forEach(b => { b.checked = mode === 'all' || (mode === 'safe' && !b.hasAttribute('data-optional')); });
    lifeCount(form);
  },
  /* 담은 질문 모두 승인: 승인할 목록을 대화상자로 먼저 보여 준다 */
  'plans-approve-all'() {
    const drafts = CUR.plans.filter(p => p.status === '초안').sort(lifeOrder), dlg = $('#list-dialog');
    dlg.innerHTML = `<form data-form="plans-approve-go" data-ids="${esc(JSON.stringify(drafts.map(p => p.id)))}"><h2 id="list-dialog-title">이 질문 ${drafts.length}개를 모두 승인할까요?</h2>
      <p>승인하면 녹음 링크에 이 순서대로 하루 최대 5개씩 나옵니다. 빼고 싶은 질문이 있으면 취소하고 표에서 '건너뜀'을 눌러 주세요.</p>
      <ol class="approve-list">${drafts.map(p => `<li>${p.stage ? `<small>${p.stage}. ${esc(stageName(p.stage))}</small>` : ''}${esc(p.text)}${p.source === 'ai' ? ' ' + pill('AI 제안', 'src') : ''}</li>`).join('')}</ol>
      <p class="row"><button class="btn" type="submit">${drafts.length}개 모두 승인</button><button class="btn sub-btn" type="button" data-act="dialog-close">취소</button></p></form>`;
    dlg.showModal();
  },
  async 'copy-text'(el) { await navigator.clipboard.writeText(el.dataset.text); toast('주소를 복사했습니다.'); },
  'clip-mark'(el) {
    const box = el.closest('.clip-maker');
    $('[data-clip-start]', box).value = mmss(+el.dataset.start);
    $('[data-clip-end]', box).value = el.dataset.end ? mmss(+el.dataset.end) : '';
    toast('구간을 채웠습니다. 미리 듣고 필요하면 고쳐 주세요.');
  },
  async 'clip-preview'(el) {
    const box = el.closest('.clip-maker'), t = CUR.transcripts.find(x => x.id === +$('[data-clip-src]', box).value);
    const a = $('[data-clip-audio]', box), start = parseTime($('[data-clip-start]', box).value) || 0, end = parseTime($('[data-clip-end]', box).value);
    if (Number.isNaN(start) || Number.isNaN(end)) return toast('시간은 1:05 처럼 분:초로 적어 주세요.');
    if (a.dataset.path !== t.audio_path) { a.src = await API.signedUrl(t.audio_path); a.dataset.path = t.audio_path; }
    const go = () => { a.currentTime = start; a.play().catch(() => {}); };
    a.ontimeupdate = end ? () => { if (a.currentTime >= end) { a.pause(); a.ontimeupdate = null; } } : null;
    if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
  },
  async 'clip-make'(el) {
    const box = el.closest('.clip-maker'), t = CUR.transcripts.find(x => x.id === +$('[data-clip-src]', box).value);
    const start = parseTime($('[data-clip-start]', box).value) || 0, end = parseTime($('[data-clip-end]', box).value);
    if (Number.isNaN(start) || Number.isNaN(end)) return toast('시간은 1:05 처럼 분:초로 적어 주세요.');
    if (end != null && end <= start) return toast('끝 시각이 시작보다 뒤여야 합니다.');
    const title = $('[data-clip-title]', box).value.trim();
    if (!title) return toast('QR 제목을 적어 주세요. 재생 화면에 보입니다.');
    if (!confirm(`'${title}' 구간(${mmss(start)} ~ ${end == null ? '끝' : mmss(end)})을 잘라 QR을 만듭니다.
QR을 가진 사람은 누구나 이 구간을 들을 수 있습니다. 계속할까요?`)) return;
    el.disabled = true; el.textContent = '자르는 중…';
    try {
      const cut = await cutClip(await API.signedUrl(t.audio_path), start, end);
      await API.createClip(CUR.id, { story_id: +box.dataset.story, transcript_id: t.id, title, start_sec: Math.round(cut.start * 10) / 10, end_sec: Math.round(cut.end * 10) / 10, duration_secs: cut.duration }, cut.blob);
      toast('QR 음성을 만들었습니다.'); route();
    } finally { el.disabled = false; el.textContent = '잘라서 QR 만들기'; }
  },
  async 'clip-svg'(el) {
    const cl = CUR.clips.find(x => x.id === +el.dataset.id), q = await qrLib();
    downloadBlob(new Blob([q.qrSvg(clipUrl(cl), { label: cl.title })], { type: 'image/svg+xml' }), clipFileName(cl, 'svg'));
  },
  async 'clip-png'(el) {
    const cl = CUR.clips.find(x => x.id === +el.dataset.id), m = (await qrLib()).qrMatrix(clipUrl(cl));
    const scale = 20, n = (m.length + 8) * scale, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, n, n); g.fillStyle = '#000';
    m.forEach((row, y) => row.forEach((dark, x) => { if (dark) g.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale); }));
    cv.toBlob(b => downloadBlob(b, clipFileName(cl, 'png')), 'image/png');
  },
  async 'clip-revoke'(el) {
    if (!confirm('이 QR을 중지할까요?\n이미 인쇄한 책의 QR도 더 이상 재생되지 않고, 다시 켤 수 없습니다.')) return;
    await api('POST', `/clips/${el.dataset.id}/revoke`); toast('중지했습니다.'); route();
  },
  /* QR 모아 인쇄: 새 창에 QR과 제목만 놓고 인쇄 대화상자를 연다 */
  async 'clip-sheet'() {
    const q = await qrLib(), live = CUR.clips.filter(cl => !cl.revoked_at);
    const w = window.open('', '_blank'); if (!w) return toast('팝업이 막혀 있습니다. 이 사이트의 팝업을 허용해 주세요.');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(CUR.code)} QR 모음</title><style>body{font:14px sans-serif;margin:16mm}h1{font-size:16px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm}figure{margin:0;text-align:center;break-inside:avoid}svg{width:35mm;height:35mm}figcaption{margin-top:2mm}</style>
      <h1>${esc(CUR.code)} · 책 QR 음성 ${live.length}개</h1><div class="g">${live.map(cl => `<figure>${q.qrSvg(clipUrl(cl), { label: cl.title })}<figcaption>${esc(cl.title)}</figcaption></figure>`).join('')}</div>`);
    w.document.close(); w.focus(); w.print();
  },
  async 'q-newlink'(el) {
    const card = el.closest('.send-card'), st = QUEUE[card.dataset.cid], aud = ($('[data-q-aud]:checked', card) || {}).value || 'child';
    const r = await api('POST', `/customers/${st.c.id}/links`, { days: 90, audience: aud });
    st.url[aud] = r.url; paintSend(card); toast(`${audOf(aud).name} 링크를 만들어 문안에 넣었습니다.`);
  },
  async 'q-copy'(el) {
    const card = el.closest('.send-card'), msg = $('[data-msg]', card).value;
    if (/\[링크 자리|\[보낼 질문을/.test(msg) && !confirm('문안에 아직 채우지 않은 자리가 있습니다. 그래도 복사할까요?')) return;
    await navigator.clipboard.writeText(msg); toast('문안을 복사했습니다. 보낸 뒤 \'보냈어요\'를 눌러 주세요.');
  },
  async 'q-sent'(el) {
    const card = el.closest('.send-card'), ids = [...card.querySelectorAll('[data-q-pick]:checked')].map(i => +i.value);
    if (!ids.length) return toast('보낸 질문을 체크해 주세요.');
    const aud = ($('[data-q-aud]:checked', card) || {}).value;
    const r = await api('POST', '/queue/sent', { plan_ids: ids, audience: aud }); toast(`질문 ${r.count}개를 '보냄'으로 바꿨습니다.`); route();
  },
  /* 한 바퀴: 질문 초안 승인(고친 문장 함께), 그룹 모두 승인, 정리본 확인, 글로 옮기기·다시 정리 */
  async 'prop-ok'(el) {
    const li = el.closest('li'), input = $('[data-prop-text]', li), text = input.value.trim();
    if (!text) return toast('질문 문장을 적어 주세요.');
    await api('POST', '/plans/approve', { items: [{ id: +el.dataset.id, text: text !== input.dataset.orig ? text : '' }] }); toast('승인했습니다.'); route();
  },
  async 'prop-all'(el) {
    const items = [...el.closest('.loop-card').querySelectorAll('li[data-pid]')].map(li => { const i = $('[data-prop-text]', li), t = i.value.trim(); return { id: +li.dataset.pid, text: t !== i.dataset.orig ? t : '' }; });
    if (items.some(it => !$('[data-prop-text]', el.closest('.loop-card').querySelector(`li[data-pid="${it.id}"]`)).value.trim())) return toast('비어 있는 질문이 있습니다.');
    const r = await api('POST', '/plans/approve', { items }); toast(`${r.count}개를 승인했습니다.`); route();
  },
  async 'review-ok'(el) {
    const text = $('[data-review]', el.closest('.loop-card')).value.trim();
    if (!text) return toast('정리본이 비어 있습니다.');
    await api('POST', `/transcripts/${el.dataset.id}/confirm`, { clean: text }); toast('확인한 정리본으로 저장했습니다.'); route();
  },
  async 'loop-stt'(el) { await loopRestart(el, true); },
  async 'loop-again'(el) { await loopRestart(el, false); },
  async 'mem-confirm'(el) {
    const t = $('[data-mem-text]', el.closest('.mem-block')).value.trim();
    if (!t) return toast('요약이 비어 있습니다. 지우려면 \'요약 지우기\'를 눌러 주세요.');
    await api('PUT', `/customers/${el.dataset.cid}/memory`, { summary: t, draft: null }); toast('확인한 요약으로 저장했습니다. 다음 AI 대화부터 쓰입니다.'); route();
  },
  async 'mem-drop'(el) { if (!confirm('AI 초안을 버릴까요? 확인된 요약은 그대로 둡니다.')) return; await api('PUT', `/customers/${el.dataset.cid}/memory`, { draft: null }); toast('초안을 버렸습니다.'); route(); },
  async 'mem-clear'(el) { if (!confirm('확인된 요약을 지울까요? 다음 AI 대화는 처음 이야기 나누는 날처럼 시작합니다.')) return; await api('PUT', `/customers/${el.dataset.cid}/memory`, { summary: null }); toast('요약을 지웠습니다.'); route(); },
  async 'mem-toggle'(el) { const on = el.dataset.on === '1'; await api('PUT', `/customers/${el.dataset.cid}/memory`, { enabled: on }); toast(on ? '이 고객의 이어 듣기를 켰습니다.' : '이 고객의 이어 듣기를 껐습니다. 요약이 AI에 전달되지 않습니다.'); route(); },
  async 'mem-global'(el) {
    const on = el.dataset.on === '1';
    if (on && !confirm('AI 이어 듣기를 모든 고객에게 켤까요?\n\n법률 검토(개인정보 처리방침·동의서 반영)가 끝났는지 먼저 확인해 주세요.\n켜면 확인된 요약이 AI 대화·전화에 전달되고, AI가 새 요약 초안을 만들기 시작합니다.')) return;
    await api('PUT', '/settings/memory', { enabled: on }); toast(on ? '이어 듣기를 켰습니다.' : '이어 듣기를 껐습니다.'); route();
  },
  async copy(el) { await navigator.clipboard.writeText(document.getElementById(el.dataset.target).textContent); toast('복사했습니다.'); },
};

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a) { e.preventDefault(); const fn = ACTS[a.dataset.act]; if (fn) guard(fn)(a); return; }
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button')) location.hash = tr.dataset.href;
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.audio) {
    const file = el.files[0];
    if (file) guard(async () => { await uploadAudio(el.dataset.audio, file); toast('음성을 올렸습니다.'); route(); })();
  }
  if (el.hasAttribute('data-filter')) applyFilter();
  if (el.hasAttribute('data-life')) lifeCount(el.closest('form'));
  // 발송 대기열: 질문·받는 사람을 바꾸면 문안을 새로 만든다
  if (el.hasAttribute('data-q-pick') || el.hasAttribute('data-q-aud')) paintSend(el.closest('.send-card'));
  // QR 음성: 원본 녹음을 바꾸면 그 녹음의 질문 표시만 보이게
  if (el.hasAttribute('data-clip-src')) {
    const box = el.closest('.clip-maker');
    box.querySelectorAll('.chips').forEach(ch => { ch.hidden = ch.dataset.tid !== el.value; });
    $('[data-clip-start]', box).value = '0:00'; $('[data-clip-end]', box).value = '';
  }
  // AI 전화 질문은 3개까지만 고를 수 있다
  if (el.hasAttribute('data-ai-pick') && el.checked && el.form.querySelectorAll('input[data-ai-pick]:checked').length > 3) { el.checked = false; toast('질문은 3개까지 고를 수 있습니다.'); }
  // 녹음 도착: 출처로 거르기
  if (el.hasAttribute('data-rfilter')) {
    let all = 0, shown = 0;
    document.querySelectorAll('#rtable tr[data-src]').forEach(tr => { const ok = !el.value || tr.dataset.src === el.value; tr.hidden = !ok; all++; if (ok) shown++; });
    $('#rcount').textContent = shown === all ? '' : `${all}건 중 ${shown}건을 보여 줍니다.`;
  }
});
document.addEventListener('input', e => {
  if (e.target.hasAttribute('data-filter')) applyFilter();
  if (e.target.hasAttribute('data-mem-text')) { const n = e.target.closest('.mem-block, details').querySelector('[data-mem-count]'); if (n) n.textContent = e.target.value.length + '/600자'; }
});

// 질문 은행에서 고르면 직접 입력 칸에 문장을 채운다
document.addEventListener('change', e => {
  if (e.target.id === 'p_q') {
    const q = QUESTIONS.find(x => x.id === +e.target.value);
    $('#p_t').value = q ? q.text : '';
  }
});

function applyFilter() {
  const q = ($('#fq') || {}).value.trim().toLowerCase(), s = $('#fs').value, o = ($('#fo') || {}).value || '', d = $('#fd').value;
  let shown = 0, all = 0;
  document.querySelectorAll('#ctable tr[data-q]').forEach(tr => {
    const ok = (!q || tr.dataset.q.includes(q)) && (!s || tr.dataset.status === s) && (!o || tr.dataset.owner === o)
      && (!d || (d === 'warn' ? tr.dataset.warn === '1' : tr.dataset.soon === '1'));
    tr.hidden = !ok; all++; if (ok) shown++;
  });
  const n = $('#fcount'); if (n) n.textContent = shown === all ? '' : `${all}명 중 ${shown}명을 보여 줍니다.`;
}

/* 30분 동안 아무 조작이 없으면 자동으로 로그아웃한다.
   개인정보 처리 화면을 켜 둔 채 자리를 비웠을 때 다른 사람이 보지 못하게 하기 위함이다. */
const IDLE_MS = 30 * 60e3, WARN_MS = 28 * 60e3;
let lastActive = Date.now(), idleWarned = false;
['click', 'keydown', 'pointermove', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastActive = Date.now(); idleWarned = false; }, { passive: true }));
setInterval(() => {
  if (!ME || window.MOAON_DEMO) return;
  const idle = Date.now() - lastActive;
  if (idle >= IDLE_MS) { try { sessionStorage.setItem('moaon-idle', '1'); } catch (e) {} ACTS.logout(); }
  else if (idle >= WARN_MS && !idleWarned) { idleWarned = true; toast('2분 뒤 자동으로 로그아웃됩니다. 계속하려면 화면을 눌러 주세요.'); }
}, 30e3);

boot().catch(e => { root.innerHTML = `<div class="login card"><p>서버에 연결할 수 없습니다.</p><p class="muted">${esc(e.message)}</p></div>`; });
