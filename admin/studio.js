'use strict';
const Studio = (() => {
  let cfg, customer, ws, pane='agent', picked='interview', result=null, busy=false, chosenSource='', chosenMode='local';
  const E = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const call = body => API.agent(body);
  const skillName = id => cfg?.skills.find(s=>s.id===id)?.name || id;
  const button = (label,act,extra='')=>`<button type="button" class="btn sub-btn small" data-st="${act}" ${extra}>${label}</button>`;
  const SOURCE='https://docs.google.com/document/d/15kdoje7Na4k2ST8BTHoIg7W0CL5r5opaJSEOQOuS3ME/edit?tab=t.xroqalvzuxf4';
  async function config(){if(!cfg)cfg=await call({action:'config'});return cfg;}
  async function page(id){
    await config();
    const customers=await API.call('GET','/customers');
    if(!id){
      return `<header class="page-head"><p class="eyebrow">BOOK STUDIO</p><h1>한 편의 기억에서, 한 권으로</h1><p class="sub">함께 기록할 고객을 선택하세요. 자료와 작업은 고객별로 분리됩니다.</p></header><div class="customer-grid">${customers.map(c=>`<a class="customer-tile" href="#/studio/${c.id}"><span class="pill">${E(c.status)}</span><div class="mini-book" aria-hidden="true">모아온</div><h2>${E(c.parent_name)||'새로운 이야기'}</h2><p>${E(c.code)} · ${E(c.guardian_name)||'신청자 미입력'}</p><span>책 제작실 열기</span></a>`).join('')||'<p class="empty">고객을 먼저 등록해 주세요. <a href="#/customers">고객 등록</a></p>'}</div>`;
    }
    const record=await API.call('GET','/customers/'+Number(id));
    const workspace=await call({action:'workspace',customer_id:record.id});
    if(!location.hash.startsWith('#/studio/'+id))return '';
    if(customer?.id!==record.id){chosenSource='';chosenMode='local';pane='agent';}
    customer=record;ws=workspace;
    if(result?.customer_id!==customer.id)result=null;
    return `<header class="studio-head"><div><p class="eyebrow">BOOK STUDIO / ${E(customer.code)}</p><h1>${E(customer.parent_name)||'부모님'}의 이야기</h1><p class="sub">한 질문, 한 장면. 서두르지 않고 한 권을 완성해요.</p></div><a class="btn sub-btn" href="#/customer/${customer.id}">고객 정보</a></header>
    ${window.MOAON_DEMO?'<div class="demo-banner">체험 공간 · 모든 이름과 이야기는 가상이며, 새로고침하면 초기화됩니다. <a href="./">실제 관리자로 로그인</a></div>':''}
    <div class="studio-status"><span>${ws.book?.parent_agreed?'참여 동의 기록됨':'부모님 참여 동의 필요'}</span><span>${ws.approval_current?'현재 원고 최종 확인됨':'최종 확인 전'}</span><span>${cfg.ai_enabled?'외부 AI 사용 가능':'기본 편집 도구 사용 중'}</span></div>
    ${ws.expired?'<div class="warnbox">보관 기한이 없거나 지났습니다. 고객 정보에서 기한을 확인한 뒤 작업해 주세요.</div>':''}
    <div class="studio-layout"><div><nav class="studio-tabs" aria-label="제작 단계">${[['agent','제작 에이전트'],['book','책 만들기'],['review','확인·내보내기']].map(([k,v])=>`<button type="button" data-st="pane" data-pane="${k}" class="${pane===k?'on':''}" aria-pressed="${pane===k}">${v}</button>`).join('')}</nav><div id="studio-content">${content()}</div></div><aside class="studio-aside">${sidebar()}</aside></div>`;
  }
  function sidebar(){
    const b=ws.book||{},done=customer.stories.filter(s=>s.status==='확정').length;
    return `<div class="card"><p class="eyebrow">이 책의 진행</p><h3 class="card-title">${E(b.title)||'내가 기억하기 전의 이야기'}</h3><dl class="studio-facts"><div><dt>녹취</dt><dd>${customer.transcripts.length}편</dd></div><div><dt>이야기 / 확정</dt><dd>${customer.stories.length} / ${done}편</dd></div><div><dt>책에 담은 이야기</dt><dd>${b.story_ids?.length||0}편</dd></div><div><dt>보관 기한</dt><dd>${E(customer.delete_after)||'설정 필요'}</dd></div><div><dt>공유 범위</dt><dd>${E(b.share_scope)||'미설정'}</dd></div></dl><a href="#/customer/${customer.id}/tr">녹취·음성 관리</a><br><a href="#/customer/${customer.id}/story">이야기 수정·확정</a></div>
    <div class="card quiet-card"><p class="eyebrow">기록의 원칙</p><p>기억을 채워 넣지 않습니다.<br>부모님의 말과 뜻을 지킵니다.</p><small>AI 결과는 초안입니다. 원문 대조와 부모님 확인을 거쳐 책에 담아 주세요.</small></div>
    <details class="card" ${b.parent_agreed?'':'open'}><summary>부모님 동의 기록</summary><p class="hint">부모님께 직접 안내하고 받은 동의를 담당자가 기록합니다. 자동 서명이나 전자 동의 수집 기능은 아닙니다.</p><form data-st-form="consent"><label>동의한 부모님 성함<input name="name" required value="${E(b.consent_name)}"></label><label>확인 방법·일자<textarea name="evidence" required placeholder="예: 11월 19일 전화로 제작 목적·보관 기간을 안내하고 동의 확인">${E(b.consent_evidence)}</textarea></label><label>공유 범위<select name="share_scope">${['가족 비공개','부모님만','별도 지정한 가족'].map(v=>`<option ${b.share_scope===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="check-line"><input name="parent_agreed" type="checkbox" ${b.parent_agreed?'checked':''}>부모님이 기록 참여에 동의함</label><label class="check-line"><input name="ai_agreed" type="checkbox" ${b.ai_agreed?'checked':''}>외부 AI 처리 범위를 안내하고 동의받음</label><p class="hint">외부 AI 동의 없이 기본 편집은 가능합니다. 철회하면 제작 에이전트 실행이 중지됩니다.</p><button class="btn" type="submit">동의 기록 저장</button></form></details>`;
  }
  function content(){return pane==='book'?bookForm():pane==='review'?review():agent();}
  function agent(){
    return `<section class="card"><div class="section-heading"><div><p class="eyebrow">함께 만드는 편집자</p><h2>지금 어떤 도움이 필요한가요?</h2></div><span class="pill gray">스킬 ${cfg.skills.length}개</span></div><div class="skill-grid">${cfg.skills.map((s,i)=>`<button class="skill-choice ${picked===s.id?'selected':''}" data-st="skill" data-skill="${s.id}" aria-pressed="${picked===s.id}"><span class="skill-icon">${['말','글','편','책','보','검'][i]}</span><b>${E(s.name)}</b><small>${E(s.description)}</small></button>`).join('')}</div>
    <form data-st-form="run"><label for="source">작업할 자료</label><select id="source" name="source"><option value="">자료 없이 질문부터 시작</option>${customer.transcripts.map(t=>`<option value="t:${t.id}">녹취 · ${E(t.title)||'제목 없음'}</option>`).join('')}${customer.stories.length?'<option value="stories">저장된 이야기 전체</option>':''}</select><div class="row fill"><div><label for="mode">실행 방식</label><select id="mode" name="mode"><option value="local">기본 편집 · 외부 전송 없음</option><option value="ai" ${cfg.ai_enabled?'':'disabled'}>AI 맞춤 편집${cfg.ai_enabled?'':' · 연결 필요'}</option></select></div><div class="run-action"><button class="btn" type="submit" ${ws.expired?'disabled':''}>${E(skillName(picked))} 실행</button></div></div><p class="hint">기본 편집은 규칙과 문서의 질문을 사용합니다. AI 맞춤 편집은 선택한 자료만 서버를 통해 처리합니다.</p></form></section>
    <div id="agent-result" aria-live="polite">${result?resultHTML(result):'<div class="studio-welcome"><span class="leaf-mark" aria-hidden="true">✳</span><h2>이야기를 기다리고 있어요</h2><p>스킬을 고르고 자료를 선택해 주세요.<br>결과를 검토한 뒤 정리본이나 이야기 초안으로 저장할 수 있어요.</p></div>'}</div>
    <details class="card"><summary>최근 작업 ${ws.runs.length}건</summary>${ws.runs.map(r=>`<button type="button" class="run-history" data-st="history" data-id="${r.id}"><span>${E(skillName(r.skill))} <small>${r.mode==='ai'?'AI':'기본 편집'}</small></span><time>${new Date(r.created_at).toLocaleString('ko-KR')}</time></button>`).join('')||'<p class="hint">아직 실행한 작업이 없습니다.</p>'}</details>
    <details class="card"><summary>문서의 질문 은행</summary><p class="hint"><a href="${SOURCE}" target="_blank" rel="noopener">책 제작용 질문 리스트(안정환)</a>의 원문입니다.</p>${cfg.questions.map(q=>`<div class="question-source"><small>${E(q.topic)}</small><p>${E(q.text)}</p><p class="hint">이어 묻기 · ${E(q.followup)}</p></div>`).join('')}</details>`;
  }
  function resultHTML(r){
    const v=r.result;
    return `<section class="card result-card"><div class="section-heading"><h2>${E(skillName(r.skill))} 결과</h2><span class="pill">${r.mode==='ai'?'AI 초안':'기본 편집 결과'}</span></div><p class="hint">작업 버전 ${E(r.version||cfg.version)} · ${new Date(r.created_at).toLocaleString('ko-KR')}</p>${r.source_refs?.some(s=>s.type==='transcript')?`<details class="source-compare"><summary>원문과 대조하기</summary><p class="msg">${E(customer.transcripts.find(t=>t.id===r.source_refs.find(s=>s.type==='transcript').id)?.raw||'원문이 삭제되었습니다.')}</p></details>`:''}<label for="result-title">제목</label><input id="result-title" value="${E(v.title)}"><label for="result-body">검토·수정할 내용</label><textarea id="result-body" class="prose tall">${E(v.body)}</textarea>${v.questions.length?`<div class="result-questions"><h3>이어갈 질문</h3>${v.questions.map((q,i)=>`<div class="question-action"><p>${E(q)}</p>${button('질문 계획에 추가','add-question',`data-index="${i}"`)}</div>`).join('')}</div>`:''}${v.outline.length?`<h3>차례 제안</h3><ol>${v.outline.map(q=>`<li>${E(q)}</li>`).join('')}</ol>`:''}${v.flags.length?`<div class="review-flags"><h3>사람이 확인할 내용</h3><ul>${v.flags.map(q=>`<li>${E(q)}</li>`).join('')}</ul></div>`:''}<div class="row">${button('내용 복사','copy-result')}${r.skill==='clean'&&r.source_refs?.some(s=>s.type==='transcript')?button('정리본 새 버전으로 저장','save-clean'):''}${['clean','story'].includes(r.skill)?'<button type="button" class="btn" data-st="save-story">이야기 초안으로 저장</button>':''}</div><small class="hint">결과는 기존 원문을 덮어쓰지 않습니다. 저장 후 이야기 탭에서 수정·확정할 수 있습니다.</small></section>`;
  }
  function bookForm(){
    const b=ws.book||{};const ids=b.story_ids||[];
    const stories=[...ids.map(id=>customer.stories.find(s=>s.id===id)).filter(Boolean),...customer.stories.filter(s=>!ids.includes(s.id))];
    return `<form class="card" data-st-form="book"><p class="eyebrow">MANUSCRIPT</p><h2>우리 가족의 책 만들기</h2><label>책 제목<input name="title" maxlength="200" value="${E(b.title)||'내가 기억하기 전의 이야기'}" required></label><label>부제<input name="subtitle" value="${E(b.subtitle)}" placeholder="엄마가 들려준, 내가 몰랐던 날들"></label><label>이야기를 들려준 분<input name="author" value="${E(b.author)||E(customer.parent_name)}"></label><label>책 앞에 전할 말<textarea name="dedication" placeholder="직접 적은 선물 메시지를 담아 주세요.">${E(b.dedication)}</textarea></label><h3>책에 담을 이야기</h3><p class="hint">체크한 순서대로 담깁니다. 위·아래 버튼으로 차례를 바꾸세요.</p><div id="story-order">${stories.map(s=>`<div class="story-order" data-story="${s.id}"><label class="check-line"><input type="checkbox" name="story" value="${s.id}" ${ids.includes(s.id)?'checked':''}><span>${E(s.title)||'제목 없는 이야기'}<small>${E(s.status)} · ${(s.body||'').length.toLocaleString()}자</small></span></label>${button('위','up','aria-label="이야기를 위로"')}${button('아래','down','aria-label="이야기를 아래로"')}</div>`).join('')||'<p class="empty">먼저 이야기 초안을 저장해 주세요.</p>'}</div><p><button class="btn" type="submit">책 원고 저장</button></p><p class="hint">저장 후 확인·내보내기에서 미리보기와 PDF 저장을 할 수 있습니다.</p></form>`;
  }
  function review(){
    const b=ws.book||{}, current=ws.approval_current;
    return `<section class="card"><div class="section-heading"><div><p class="eyebrow">FINAL REVIEW</p><h2>마지막으로, 함께 읽어 주세요</h2></div><span class="pill ${current?'':'warn'}">${current?'현재 원고 확인됨':'검토용 원고'}</span></div><p>부모님의 말과 뜻이 맞는지 확인하고, 빼고 싶은 대목과 공유 범위를 여쭤봐 주세요.</p><div class="row">${button('책 미리보기','preview')}${button('검토용 PDF 저장','print')}${button('원고 내려받기 (.md)','download')}</div><p class="hint">PDF 버튼은 브라우저 인쇄 창을 엽니다. 대상을 ‘PDF로 저장’, 배율 100%, 머리글·바닥글 끄기로 설정해 주세요. A5 판형이며 인쇄소 규격에 맞춘 최종 조판은 별도 확인이 필요합니다.</p></section>
    <form class="card" data-st-form="approve"><h3>부모님 최종 확인 기록</h3><p class="hint">담당자가 실제 확인 사실을 기록합니다. 책 내용이나 공유 범위를 바꾸면 다시 확인해야 합니다.</p><label>최종 확인한 부모님 성함<input name="name" value="${E(b.review_name)}" required></label><label>확인 날짜·방법·수정 의견<textarea name="evidence" required>${E(b.review_evidence)}</textarea></label><button class="btn" type="submit">현재 원고 확인 기록</button>${b.approved_at?`<p class="hint">마지막 기록 ${new Date(b.approved_at).toLocaleString('ko-KR')}</p>`:''}</form>
    <form class="card" data-st-form="print-ready"><h3>인쇄 전 확인</h3>${[['names','인명·날짜·지명과 문장 오탈자 확인'],['rights','사진·인용·제3자 정보 사용 범위 확인'],['layout','PDF의 페이지·차례·잘림·빈 페이지 확인'],['scope','부모님의 최종 원고와 공유 범위 확인'],['delivery','권수·납기·배송·수정 범위 확인']].map(([k,v])=>`<label class="check-line"><input name="${k}" type="checkbox" ${b.print_checks?.[k]?'checked':''}>${v}</label>`).join('')}<p><button class="btn" type="submit" ${current?'':'disabled'}>인쇄 준비 완료로 기록</button></p>${b.print_requested_at&&current?'<p class="success-note">인쇄 준비 완료 · 인쇄소에 자동 발주되지는 않습니다.</p>':''}</form><div id="book-preview"></div>`;
  }
  async function skills(){await config();return `<header class="page-head"><p class="eyebrow">SKILL LIBRARY</p><h1>일관된 기록을 위한 제작 스킬</h1><p class="sub">질문부터 최종 검수까지, 같은 편집 원칙으로 작업합니다. 버전 ${E(cfg.version)}</p></header><div class="grid g2">${cfg.skills.map(s=>`<article class="card"><span class="pill">${E(s.id)}</span><h2>${E(s.name)}</h2><p>${E(s.description)}</p></article>`).join('')}</div><div class="card"><h2>모든 스킬이 지키는 원칙</h2><p>원문에 없는 사실과 감정을 만들지 않습니다. 원음·원문·편집본을 구분합니다. 결과는 검토용 초안이며, 부모님 확인을 대신하지 않습니다.</p><a href="${SOURCE}" target="_blank" rel="noopener">질문·편집 기준이 담긴 원문</a></div>`;}
  async function security(){await config();return `<header class="page-head"><p class="eyebrow">DATA & PRIVACY</p><h1>이야기는 고객의 것입니다</h1><p class="sub">실제 연결 상태와 처리 범위를 확인하세요.</p></header><div class="card"><h2>현재 운영 상태</h2><dl class="studio-facts"><div><dt>기본 편집</dt><dd>외부 AI 전송 없음</dd></div><div><dt>외부 AI</dt><dd>${cfg.ai_enabled?'사용 가능':'연결 대기'}</dd></div><div><dt>서버 API 키</dt><dd>${cfg.key_configured?'설정됨':'미설정'}</dd></div><div><dt>운영자 데이터 정책 확인</dt><dd>${cfg.policy_confirmed?'기록됨':'설정 필요'}</dd></div></dl></div><div class="grid g2"><article class="card"><h2>외부 AI로 보내는 자료</h2><p>실행할 때 선택한 고객의 녹취 또는 이야기만 전달합니다. 프로필의 성함·연락처는 첨부하지 않으며, 본문 속 일부 식별정보를 규칙으로 가립니다. 문맥 속 제3자 실명은 완전히 가리지 못할 수 있으므로 사전 검토가 필요합니다.</p></article><article class="card"><h2>학습과 보관</h2><p>OpenAI API를 사용하는 경로는 store:false로 호출합니다. API 데이터는 기본적으로 모델 학습에 사용되지 않지만 조직의 데이터 공유 설정을 별도 확인해야 합니다. 보안 목적 로그 보관과 무보관(ZDR) 승인은 별개입니다.</p><a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener">OpenAI 공식 데이터 정책</a></article><article class="card"><h2>고객별 접근 권한</h2><p>관리자는 전체, 담당자는 배정받은 고객만 접근합니다. 서버와 DB 양쪽에서 권한을 확인합니다. AI 결과도 고객별로 보관되며 고객 파기 시 함께 삭제됩니다.</p></article><article class="card"><h2>자료를 남기는 기간</h2><p>고객별 보관 기한이 없거나 지났다면 새 제작 작업을 막습니다. 녹음은 비공개 저장소에서 짧게 유효한 링크로 재생합니다. 내려받은 파일과 외부 백업은 담당자가 별도로 관리해야 합니다.</p></article></div><div class="card"><h2>외부 AI 연결</h2><p>운영자가 Supabase Edge Function의 비밀값에 OPENAI_API_KEY를 설정하고, OpenAI 조직의 데이터 공유가 꺼져 있는지 확인한 뒤 AI_DATA_POLICY_CONFIRMED=true를 설정합니다. 키는 이 웹사이트에 입력하거나 저장하지 않습니다.</p><a href="https://supabase.com/dashboard/project/pxfwsjipjxvafefmgdbk/functions/secrets" target="_blank" rel="noopener">서버 비밀값 설정 열기</a></div>`;}
  function mount(){document.querySelectorAll('[data-st="pane"]').forEach(x=>{x.classList.toggle('on',x.dataset.pane===pane);x.setAttribute('aria-pressed',String(x.dataset.pane===pane));});}
  function rerender(){const s=document.getElementById('source'),m=document.getElementById('mode');if(s)chosenSource=s.value;if(m)chosenMode=m.value;document.getElementById('studio-content').innerHTML=content();document.querySelector('.studio-aside').innerHTML=sidebar();mount();const s2=document.getElementById('source'),m2=document.getElementById('mode');if(s2)s2.value=chosenSource;if(m2)m2.value=chosenMode;}
  async function refresh(){ws=await call({action:'workspace',customer_id:customer.id});customer=await API.call('GET','/customers/'+customer.id);await route();}
  function outputBody(){return document.getElementById('result-body')?.value||'';}
  async function action(el){
    const act=el.dataset.st;
    if(act==='pane'){if(busy)return;pane=el.dataset.pane;rerender();return;}
    if(act==='skill'){picked=el.dataset.skill;rerender();return;}
    if(act==='history'){const r=ws.runs.find(r=>r.id===el.dataset.id);result={...r,customer_id:customer.id};rerender();return;}
    if(act==='up'||act==='down'){const row=el.closest('.story-order'),peer=act==='up'?row.previousElementSibling:row.nextElementSibling;if(peer){if(act==='up')peer.before(row);else peer.after(row);}return;}
    if(act==='add-question'){const question=result.result.questions[+el.dataset.index];if(!question)return;await API.call('POST',`/customers/${customer.id}/plans`,{text:question});el.disabled=true;el.textContent='계획에 추가됨';toast('질문 계획 초안에 추가했습니다. 발송 전 승인이 필요합니다.');return;}
    if(act==='copy-result'){await navigator.clipboard.writeText(outputBody());toast('내용을 복사했습니다.');return;}
    if(act==='save-clean'){
      const ref=result.source_refs.find(s=>s.type==='transcript');
      await call({action:'save_result',customer_id:customer.id,run_id:result.id,target:'clean',body:outputBody()});toast('정리본 새 버전으로 저장했습니다.');return;
    }
    if(act==='save-story'){
      await call({action:'save_result',customer_id:customer.id,run_id:result.id,target:'story',title:document.getElementById('result-title').value,body:outputBody()});toast('이야기 초안으로 저장했습니다.');await refresh();return;
    }
    if(['preview','print','download'].includes(act)){
      ws=await call({action:'workspace',customer_id:customer.id});
      if(!ws.book?.story_ids?.length)throw new Error('책 만들기에서 이야기를 선택하고 저장해 주세요.');
      if(act==='download'){const b=ws.book;saveFile(`${customer.code}-원고.md`,[`# ${b.title}`,b.subtitle,b.author,b.dedication,...ws.stories.map(s=>`## ${s.title}\n\n${s.body}`)].join('\n\n'),'text/markdown');return;}
      const html=bookHTML();
      if(act==='preview'){const box=document.getElementById('book-preview');box.innerHTML='<h2>책 미리보기</h2><iframe title="A5 책 미리보기" class="book-frame"></iframe>';box.querySelector('iframe').srcdoc=html;box.scrollIntoView({behavior:'smooth'});return;}
      const frame=document.createElement('iframe');frame.className='print-frame';frame.title='인쇄용 책';frame.srcdoc=html;document.body.appendChild(frame);frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};setTimeout(()=>frame.remove(),120000);
    }
  }
  function saveFile(name,data,type){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([data],{type:type+';charset=utf-8'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
  function bookHTML(){const b=ws.book,approved=ws.approval_current;
    return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${E(b.title)}</title><style>@page{size:A5;margin:18mm}*{box-sizing:border-box}body{margin:0;background:#f0f1ee;color:#202921;font:12pt/1.9 "AppleMyungjo","Batang",serif;word-break:keep-all;overflow-wrap:anywhere}.page{background:white;max-width:148mm;min-height:210mm;padding:18mm;margin:16px auto;break-after:page}.cover{display:flex;flex-direction:column;justify-content:center;text-align:center;border-top:8px solid #2e5a4c}.cover h1{font-size:28pt;line-height:1.6}.cover small{margin-top:30mm;letter-spacing:4px}h2{font-size:20pt;line-height:1.5;margin:10mm 0 12mm}p{white-space:pre-wrap;orphans:3;widows:3}li{margin:6mm 0}.draft{font:10pt sans-serif;color:#87563e;text-align:center}footer{font-size:10pt;color:#666;margin-top:20mm}.page:last-child{break-after:auto}@media print{body{background:white}.page{margin:0;min-height:auto;max-width:none;padding:0}.cover{min-height:165mm}.draft{display:block}}@media(max-width:500px){.page{padding:24px;min-height:650px}}</style><section class="page cover">${approved?'':'<p class="draft">검토용 원고 · 부모님 최종 확인 전</p>'}<small>모아온</small><h1>${E(b.title)}</h1><p>${E(b.subtitle)}</p><p>${E(b.author)}의 이야기</p></section>${b.dedication?`<section class="page"><h2>전하는 말</h2><p>${E(b.dedication)}</p></section>`:''}<section class="page"><h2>차례</h2><ol>${ws.stories.map(s=>`<li>${E(s.title)}</li>`).join('')}</ol></section>${ws.stories.map(s=>`<section class="page"><h2>${E(s.title)}</h2><p>${E(s.body)}</p></section>`).join('')}<section class="page"><h2>이 책에 대하여</h2><p>부모님이 들려주신 이야기를 가족이 함께 기록했습니다.</p><footer>공유 범위: ${E(b.share_scope)}<br>${approved?'부모님 최종 확인이 기록된 원고':'검토용 원고'}<br>모아온 · 한 편에서 한 권으로</footer></section></html>`;
  }
  async function submit(f){
    const data=Object.fromEntries(new FormData(f)),base={customer_id:customer.id,revision:ws.book?.revision||0};
    const kind=f.dataset.stForm;
    if(kind==='consent')await call({...base,action:'consent',...data,parent_agreed:f.elements.parent_agreed.checked,ai_agreed:f.elements.ai_agreed.checked});
    if(kind==='book')await call({...base,action:'save_book',...data,story_ids:[...f.querySelectorAll('input[name=story]:checked')].map(x=>+x.value)});
    if(kind==='approve')await call({...base,action:'approve',...data});
    if(kind==='print-ready')await call({...base,action:'print_ready',checks:Object.fromEntries(['names','rights','layout','scope','delivery'].map(k=>[k,f.elements[k].checked]))});
    if(kind==='run'){
      const source=data.source,activeCustomer=customer.id;chosenSource=source;chosenMode=data.mode;
      const r=await call({...base,action:'run',skill:picked,mode:data.mode,transcript_id:source.startsWith('t:')?+source.slice(2):null,use_stories:source==='stories'});
      if(customer.id!==activeCustomer||!location.hash.startsWith('#/studio/'+activeCustomer))return;
      result={...r.run,customer_id:activeCustomer};ws.runs.unshift(r.run);rerender();toast('결과를 검토해 주세요.');return;
    }
    toast('저장했습니다.');await refresh();
  }
  document.addEventListener('click',async e=>{const el=e.target.closest('[data-st]');if(!el)return;e.preventDefault();if(busy)return;try{await action(el);}catch(e){toast(e.message);}});
  document.addEventListener('submit',async e=>{const f=e.target.closest('form[data-st-form]');if(!f)return;e.preventDefault();if(busy)return;busy=true;const b=f.querySelector('button[type=submit]'),old=b.textContent;b.disabled=true;b.textContent='작업 중…';try{await submit(f);}catch(e){toast(e.message);}finally{busy=false;if(b.isConnected){b.disabled=false;b.textContent=old;}}});
  return {page,skills,security,mount};
})();
