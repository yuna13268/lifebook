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
  root.innerHTML = `<div class="login card"><h1>모아온 관리자</h1>
    <p class="sub">${setup ? '처음 실행입니다. 설정 코드로 관리자 계정을 만들어 주세요.' : '이메일과 비밀번호로 로그인해 주세요.'}</p>
    <form data-form="${setup ? 'setup' : 'login'}">
      ${setup ? '<label for="sc">설정 코드</label><input id="sc" name="code" type="text" required autocomplete="off"><label for="sn">이름</label><input id="sn" name="name" type="text" required autocomplete="name">' : ''}
      <label for="e">이메일</label><input id="e" name="email" type="email" required autocomplete="username">
      <label for="p">비밀번호${setup ? ' (6자 이상)' : ''}</label><input id="p" name="password" type="password" required autocomplete="${setup ? 'new-password' : 'current-password'}">
      <p><button class="btn" type="submit">${setup ? '계정 만들기' : '로그인'}</button></p>
    </form>
    <p class="muted">계정은 관리자가 만들어 줍니다. 허가된 팀원만 쓸 수 있습니다.</p></div>`;
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
function route() {
  const h = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  const [a, b, c] = h;
  const go = guard(async () => {
    if (!a) return view(await pageDashboard(), 'dashboard');
    if (a === 'customers') return view(await pageCustomers(), 'customers');
    if (a === 'customer') return view(await pageCustomer(+b, c || 'info'), 'customers');
    if (a === 'questions') return view(await pageQuestions(), 'questions');
    if (a === 'queue') return view(await pageQueue(), 'queue');
    if (a === 'destruction') return view(await pageDestruction(), 'destruction');
    if (a === 'team') return view(await pageTeam(), 'team');
    if (a === 'activity') return view(await pageActivity(), 'activity');
    view('<p class="empty">없는 화면입니다.</p>', '');
  });
  go();
}

function view(html, active) {
  const admin = ME.role === 'admin';
  const link = (k, label, href) => `<a href="${href}" class="${active === k ? 'on' : ''}"${active === k ? ' aria-current="page"' : ''}>${label}</a>`;
  root.innerHTML = `<a class="skip" href="#main" data-act="skip">본문으로 건너뛰기</a>
    <div class="shell"><nav class="side" aria-label="메뉴"><div class="brand">모아온<small>관리자</small></div>
    <div class="grp">일</div>${link('dashboard', '대시보드', '#/')}${link('customers', '고객', '#/customers')}${link('queue', '발송 대기열', '#/queue')}${link('questions', '질문 은행', '#/questions')}
    ${admin ? '<div class="grp">관리</div>' + link('destruction', '파기 대기', '#/destruction') + link('team', '팀원', '#/team') + link('activity', '활동 기록', '#/activity') : ''}
    <div class="who"><b>${esc(ME.name)}</b><span>${admin ? '관리자' : '담당자'}</span><a href="#" data-act="logout">로그아웃</a></div></nav>
    <main id="main" tabindex="-1">${html}</main></div>`;
  labelTables();
  hydrateAudio();
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

/* ---------- 대시보드 ---------- */
async function pageDashboard() {
  const d = await api('GET', '/dashboard');
  const admin = ME.role === 'admin';
  const todo = (n, label, href, hint) => `<a class="todo ${n ? 'has' : ''}" href="${href}"><b>${n}</b><span>${label}</span><small>${n ? hint : '없음'}</small></a>`;
  const total = META.customerStatus.reduce((s, k) => s + (d.byStatus[k] || 0), 0);
  const bar = total ? META.customerStatus.map((s, i) => d.byStatus[s] ? `<i class="seg s${i}" style="flex:${d.byStatus[s]}" title="${esc(s)} ${d.byStatus[s]}명"></i>` : '').join('') : '';
  const legend = META.customerStatus.map((s, i) => `<li><i class="sw s${i}"></i>${esc(s)}<b>${d.byStatus[s] || 0}</b></li>`).join('');
  const soon = d.soon.length
    ? `<table><tr><th>고객</th><th>파기 예정일</th></tr>${d.soon.map(s => `<tr class="click" data-href="#/customer/${s.id}/manage"><td><b>${esc(s.code)}</b></td><td>${esc(s.delete_after)} ${s.delete_after < META.today ? pill('기한 지남', 'warn') : pill('30일 이내', 'warn')}</td></tr>`).join('')}</table>`
    : '<p class="empty">30일 안에 파기할 고객이 없습니다.</p>';
  return `<header class="page-head"><h1>대시보드</h1><p class="sub">${admin ? '전체 고객' : '내가 맡은 고객'} ${d.total}명</p></header>
    <h2>지금 할 일</h2>
    <div class="todos">${todo(d.draftPlans, '승인을 기다리는 질문', '#/queue', admin ? '발송 대기열에서 승인' : '관리자 승인 대기')}${todo(d.readyToSend, '보낼 수 있는 질문', '#/queue', '문안을 복사해 보내기')}${todo(d.newTranscripts, '정리할 새 녹취', '#/customers', '고객을 열어 정리본 쓰기')}${admin ? todo(d.unassigned, '담당자 없는 고객', '#/customers', '담당자 정하기') : ''}</div>
    <h2>진행 현황</h2>
    <div class="card">${total ? `<div class="funnel" role="img" aria-label="진행 상태별 고객 수">${bar}</div>` : '<p class="empty">고객이 없습니다.</p>'}<ul class="legend">${legend}</ul></div>
    <h2>파기 예정</h2>${soon}`;
}

/* ---------- 고객 목록 ---------- */
async function pageCustomers() {
  const list = await api('GET', '/customers');
  const today = META.today, limit = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const rowsHtml = list.map(c => {
    const soon = c.delete_after && c.delete_after <= limit;
    const q = [c.code, c.guardian_name, c.parent_name, c.hometown].join(' ').toLowerCase();
    return `<tr class="click" data-href="#/customer/${c.id}" data-q="${esc(q)}" data-status="${esc(c.status)}" data-owner="${c.owner_id || ''}" data-soon="${soon ? 1 : 0}">
      <td><b>${esc(c.code)}</b></td><td>${esc(c.parent_name) || '<span class="muted">(성함 미입력)</span>'}<br><span class="muted">보호자 ${esc(c.guardian_name)}</span></td>
      <td>${statusPill(c.status)}</td><td>${esc(c.owner_name) || '<span class="muted">미배정</span>'}</td><td>${c.next_week ? c.next_week + '주차' : '-'}</td>
      <td>${c.delete_after ? esc(c.delete_after) + (c.delete_after < today ? ' ' + pill('기한 지남', 'warn') : soon ? ' ' + pill('임박', 'warn') : '') : '-'}</td></tr>`;
  }).join('');
  return `<header class="page-head"><h1>고객</h1><p class="sub">줄을 누르면 상세 화면으로 이동합니다. 총 ${list.length}명</p></header>
    <details class="card"><summary>새 고객 등록</summary><form data-form="cust-new">${customerFields({}, true)}<p><button class="btn" type="submit">등록</button></p></form></details>
    <div class="row fill card filters"><div><label for="fq">검색</label><input id="fq" type="text" data-filter placeholder="번호, 이름, 고향"></div>
      <div><label for="fs">상태</label><select id="fs" data-filter><option value="">전체</option>${options(META.customerStatus)}</select></div>
      ${ME.role === 'admin' ? `<div><label for="fo">담당자</label><select id="fo" data-filter><option value="">전체</option>${TEAM.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>` : ''}
      <div><label for="fd">파기 임박</label><select id="fd" data-filter><option value="">전체</option><option value="1">30일 이내</option></select></div></div>
    ${list.length ? `<table id="ctable"><tr><th>번호</th><th>부모님 / 보호자</th><th>상태</th><th>담당</th><th>다음 질문</th><th>파기 예정일</th></tr>${rowsHtml}</table>` : '<p class="empty">아직 고객이 없습니다. 위에서 등록해 주세요.</p>'}`;
}

function customerFields(c, isNew) {
  const f = (name, label, type, hint) => `<div><label for="c_${name}">${label}</label><input id="c_${name}" name="${name}" type="${type || 'text'}" value="${esc(c[name])}">${hint ? `<small class="hint">${hint}</small>` : ''}</div>`;
  return `<h3 class="fs">보호자 (신청한 자녀)</h3><div class="row fill">${f('guardian_name', '이름')}${f('guardian_contact', '연락처')}</div>
    <h3 class="fs">부모님</h3><div class="row fill">${f('parent_name', '성함')}${f('parent_birth', '생년', 'text', '예: 1948')}${f('hometown', '고향')}${f('job', '직업')}</div>
    ${f('family', '가족 관계')}
    <label for="c_notes">메모</label><textarea id="c_notes" name="notes">${esc(c.notes)}</textarea>`;
}

/* ---------- 고객 상세 ---------- */
async function pageCustomer(id, tab) {
  CUR = await api('GET', '/customers/' + id);
  QUESTIONS = await api('GET', '/questions');
  const c = CUR;
  const tabs = [['info', '정보'], ['consent', '동의'], ['plan', '질문'], ['tr', '녹취'], ['story', '이야기'], ['manage', '내려받기·파기']]
    .map(([k, l]) => `<a href="#/customer/${id}/${k}" class="${tab === k ? 'on' : ''}"${tab === k ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  let body = '';
  if (tab === 'info') body = tabInfo(c);
  else if (tab === 'consent') body = tabConsent(c);
  else if (tab === 'plan') body = tabPlan(c);
  else if (tab === 'tr') body = tabTranscripts(c);
  else if (tab === 'story') body = tabStories(c);
  else body = tabManage(c);
  const warn = c.delete_after && c.delete_after < META.today ? `<div class="warnbox">보관 기한(${esc(c.delete_after)})이 지났습니다. '내려받기·파기' 탭에서 파기해 주세요.</div>` : '';
  return `<p class="crumb"><a href="#/customers">← 고객 목록</a></p>
    <header class="page-head"><h1>${esc(c.code)}${c.parent_name ? ' · ' + esc(c.parent_name) : ''} ${statusPill(c.status)}</h1>
    <p class="sub">보호자 ${esc(c.guardian_name) || '-'} · ${esc(c.guardian_contact) || '-'}${c.owner_id ? '' : ' · <b class="warn-text">담당자 미배정</b>'}</p></header>${warn}<nav class="tabs" aria-label="고객 정보 탭">${tabs}</nav>${body}`;
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

function tabPlan(c) {
  const used = new Set(c.plans.map(p => p.question_id).filter(Boolean));
  const avail = QUESTIONS.filter(q => q.active && !used.has(q.id));
  const nextWeek = c.plans.reduce((m, p) => Math.max(m, p.week), 0) + 1;
  const rowsHtml = c.plans.map(p => {
    const act = [];
    if (p.status === '초안' && ME.role === 'admin') act.push(`<button class="btn small" data-act="plan-status" data-id="${p.id}" data-status="승인">승인</button>`);
    if (p.status === '승인') act.push(`<button class="btn small" data-act="plan-status" data-id="${p.id}" data-status="보냄">보냈어요</button>`);
    if (p.status === '보냄') act.push(`<button class="btn small" data-act="plan-status" data-id="${p.id}" data-status="답변 도착">답변 도착</button>`);
    if (['초안', '승인', '보냄'].includes(p.status)) act.push(`<button class="btn small sub-btn" data-act="plan-status" data-id="${p.id}" data-status="건너뜀">건너뜀</button>`);
    if (['초안', '승인', '건너뜀'].includes(p.status)) act.push(`<button class="btn small sub-btn" data-act="plan-del" data-id="${p.id}">삭제</button>`);
    return `<tr><td>${p.week}주차</td><td>${esc(p.text)}</td><td>${pill(p.status, p.status === '초안' ? 'gray' : '')}${p.sent_at ? '<br><span class="muted">' + esc(p.sent_at.slice(0, 10)) + '</span>' : ''}</td><td class="row">${act.join('')}</td></tr>`;
  }).join('');
  return `<form class="card" data-form="plan-add" data-id="${c.id}"><h3 class="card-title">질문 추가</h3>
    <div class="row fill"><div style="flex:3 1 260px"><label for="p_q">질문 은행에서 고르기</label><select id="p_q" name="question_id"><option value="">직접 입력</option>${avail.map(q => `<option value="${q.id}">${esc(q.topic ? '[' + q.topic + '] ' : '')}${esc(q.text)}</option>`).join('')}</select></div>
    <div style="flex:0 1 110px"><label for="p_w">주차</label><input id="p_w" name="week" type="number" min="1" value="${nextWeek}"></div></div>
    <label for="p_t">직접 입력하거나 고른 질문을 고쳐서 쓰기</label><input id="p_t" name="text" type="text" maxlength="500">
    <p><button class="btn" type="submit">계획에 추가</button> <span class="muted">추가하면 '초안'입니다. 관리자가 승인해야 보낼 수 있습니다.</span></p></form>
    ${c.plans.length ? `<table><tr><th>주차</th><th>질문</th><th>상태</th><th></th></tr>${rowsHtml}</table>` : '<p class="empty">계획된 질문이 없습니다.</p>'}`;
}

function tabTranscripts(c) {
  const planOpts = c.plans.map(p => `<option value="${p.id}">${p.week}주차 ${esc(p.text.slice(0, 40))}</option>`).join('');
  const items = c.transcripts.map(t => {
    const latest = t.versions[0];
    const vers = t.versions.length ? t.versions.map(v => `<details><summary>${esc(v.created)} · ${esc(v.editor)}</summary><pre class="msg">${esc(v.clean)}</pre>
      <button class="btn small sub-btn" type="button" data-act="load-ver" data-tid="${t.id}" data-vid="${v.id}">이 버전 불러오기</button></details>`).join('') : '<p class="muted">저장된 정리본이 없습니다.</p>';
    return `<details class="item"><summary><b>${esc(t.title || '(제목 없음)')}</b> ${pill(t.status)} <span class="muted">${esc(t.created.slice(0, 10))}</span></summary><div class="body">
      <form data-form="tr-raw" data-id="${t.id}"><div class="row fill"><div><label>제목</label><input name="title" type="text" value="${esc(t.title)}"></div>
        <div><label>상태</label><select name="status">${options(META.transcriptStatus, t.status)}</select></div></div>
        <label>원문 (그대로 보관합니다)</label><textarea name="raw" class="tall prose">${esc(t.raw)}</textarea>
        <p class="row"><button class="btn" type="submit">원문·상태 저장</button><button class="btn danger small" type="button" data-act="tr-del" data-id="${t.id}">녹취 삭제</button></p></form>
      <h2>음성</h2>${t.has_audio ? `<audio controls preload="none" data-audio-path="${esc(t.audio_path)}"></audio><p class="muted">${esc(t.audio_name)}</p>` : '<p class="muted">올린 음성이 없습니다.</p>'}
      <label>음성 올리기 (m4a, mp3, wav 등 · 50MB까지)</label><input type="file" accept="audio/*,.m4a,.amr" data-audio="${t.id}">
      <h2>정리본</h2><form data-form="tr-clean" data-id="${t.id}"><textarea id="clean_${t.id}" name="clean" class="tall prose">${esc(latest ? latest.clean : t.raw)}</textarea>
        <p><button class="btn" type="submit">새 버전으로 저장</button> <span class="muted">저장할 때마다 이전 버전이 남습니다.</span></p></form>
      <details><summary>이전 버전 ${t.versions.length}개</summary>${vers}</details></div></details>`;
  }).join('');
  return `<form class="card" data-form="tr-new" data-id="${c.id}"><h3 class="card-title">녹취 추가</h3>
    <div class="row fill"><div><label>제목</label><input name="title" type="text" maxlength="200"></div>
    <div><label>어떤 질문의 답인가요</label><select name="plan_id"><option value="">선택 안 함</option>${planOpts}</select></div></div>
    <label>녹취 원문 (음성을 글로 바꾼 내용을 붙여 넣어요)</label><textarea name="raw"></textarea>
    <label>음성 파일 (선택)</label><input type="file" name="audio" accept="audio/*,.m4a,.amr">
    <p><button class="btn" type="submit">추가</button></p></form>
    ${c.transcripts.length ? items : '<p class="empty">녹취가 없습니다.</p>'}`;
}

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
  return `<details class="card"><summary>이야기 추가</summary>${storyForm({}, true)}</details>
    ${c.stories.length ? c.stories.map(s => `<details class="item"><summary><b>${esc(s.title || '(제목 없음)')}</b> ${pill(s.status)} <span class="muted">${esc(s.era)} ${esc(s.tags)}</span>${s.sensitive_note ? ' ' + pill('민감 표시', 'warn') : ''}</summary><div class="body">${storyForm(s)}</div></details>`).join('') : '<p class="empty">이야기가 없습니다.</p>'}`;
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
  const admin = ME.role === 'admin';
  const rowsHtml = QUESTIONS.map(q => admin ? `<tr><td><form data-form="q-edit" data-id="${q.id}" class="row fill">
      <input name="topic" type="text" value="${esc(q.topic)}" aria-label="주제" style="max-width:110px"><input name="era" type="text" value="${esc(q.era)}" aria-label="시기" style="max-width:110px">
      <input name="text" type="text" value="${esc(q.text)}" aria-label="질문" style="flex:3 1 280px">
      <button class="btn small" type="submit">저장</button>
      <button class="btn small sub-btn" type="button" data-act="q-move" data-id="${q.id}" data-dir="up" aria-label="위로">↑</button>
      <button class="btn small sub-btn" type="button" data-act="q-move" data-id="${q.id}" data-dir="down" aria-label="아래로">↓</button>
      <button class="btn small sub-btn" type="button" data-act="q-toggle" data-id="${q.id}" data-on="${q.active ? 0 : 1}">${q.active ? '사용 중지' : '다시 사용'}</button>
      <button class="btn small sub-btn" type="button" data-act="q-del" data-id="${q.id}">삭제</button></form></td></tr>`
    : `<tr><td>${pill(q.topic || '-', 'gray')} ${esc(q.text)} ${q.active ? '' : pill('중지', 'warn')}</td></tr>`).join('');
  return `<header class="page-head"><h1>질문 은행</h1><p class="sub">고객에게 보낼 질문을 모아 둡니다. ${admin ? '' : '수정은 관리자만 할 수 있습니다.'}</p></header>
    ${admin ? `<form class="card" data-form="q-new"><h3 class="card-title">질문 추가</h3><div class="row fill"><div style="flex:0 1 140px"><label>주제</label><input name="topic" type="text" placeholder="어린 시절"></div>
      <div style="flex:0 1 140px"><label>시기</label><input name="era" type="text" placeholder="1950년대"></div>
      <div style="flex:3 1 300px"><label>질문 문장</label><input name="text" type="text" maxlength="500" required></div></div>
      <p><button class="btn" type="submit">추가</button></p></form>` : ''}
    ${QUESTIONS.length ? `<table>${rowsHtml}</table>` : '<p class="empty">질문이 없습니다.</p>'}
    ${admin ? `<h2>보내는 문안 템플릿</h2><form class="card" data-form="tpl"><p class="muted">{보호자} {부모님} {질문} 자리에 고객 정보가 들어갑니다.</p>
      <textarea name="message_template">${esc(tpl.message_template)}</textarea><p><button class="btn" type="submit">저장</button></p></form>` : ''}`;
}

/* ---------- 발송 대기열 ---------- */
async function pageQueue() {
  const items = await api('GET', '/queue');
  const html = items.map(it => `<div class="card"><div class="row"><b><a href="#/customer/${it.customer_id}/plan">${esc(it.code)}</a></b> ${it.week}주차 ${pill(it.status === '초안' ? '승인 대기' : '보낼 수 있음', it.status === '초안' ? 'gray' : '')}
      <span class="muted">${esc(it.guardian_name)} ${esc(it.guardian_contact)}</span></div>
    <div class="msg" id="msg_${it.plan_id}">${esc(it.message)}</div>
    <p class="row">${it.status === '승인'
      ? `<button class="btn small" data-act="copy" data-target="msg_${it.plan_id}">문안 복사</button><button class="btn small sub-btn" data-act="plan-status" data-id="${it.plan_id}" data-status="보냄">보냈어요</button>`
      : (ME.role === 'admin' ? `<button class="btn small" data-act="plan-status" data-id="${it.plan_id}" data-status="승인">승인</button>` : '<span class="muted">관리자가 승인하면 보낼 수 있습니다.</span>')}</p></div>`).join('');
  return `<header class="page-head"><h1>발송 대기열</h1><p class="sub">고객마다 다음 질문 3개까지 보여 줍니다. 문안을 복사해 카카오톡이나 문자로 보낸 뒤 '보냈어요'를 눌러 주세요.</p></header>
    ${items.length ? html : '<p class="empty">보낼 질문이 없습니다.</p>'}`;
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
  async destroy(f) {
    if (!confirm('정말 파기할까요? 되돌릴 수 없습니다.')) return;
    await api('POST', `/customers/${f.dataset.id}/destroy`, fd(f)); toast('파기했습니다.'); location.hash = '#/customers';
  },
};

const uploadAudio = (tid, file) => API.uploadAudio(tid, file);

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
  skip() { const m = document.getElementById('main'); if (m) m.focus(); },
  async logout() { await api('POST', '/logout'); ME = null; boot(); },
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
  async export(el) { const r = await api('POST', `/customers/${el.dataset.id}/export`, {}); toast('내려받았습니다: ' + r.path); },
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
});
document.addEventListener('input', e => { if (e.target.hasAttribute('data-filter')) applyFilter(); });

// 질문 은행에서 고르면 직접 입력 칸에 문장을 채운다
document.addEventListener('change', e => {
  if (e.target.id === 'p_q') {
    const q = QUESTIONS.find(x => x.id === +e.target.value);
    $('#p_t').value = q ? q.text : '';
  }
});

function applyFilter() {
  const q = ($('#fq') || {}).value.trim().toLowerCase(), s = $('#fs').value, o = ($('#fo') || {}).value || '', d = $('#fd').value;
  document.querySelectorAll('#ctable tr[data-q]').forEach(tr => {
    const ok = (!q || tr.dataset.q.includes(q)) && (!s || tr.dataset.status === s) && (!o || tr.dataset.owner === o) && (!d || tr.dataset.soon === '1');
    tr.hidden = !ok;
  });
}

boot().catch(e => { root.innerHTML = `<div class="login card"><p>서버에 연결할 수 없습니다.</p><p class="muted">${esc(e.message)}</p></div>`; });
