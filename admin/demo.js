'use strict';
// Fictional, memory-only demo. Never reads or writes production customer data.
if (new URLSearchParams(location.search).get('demo') === '1') {
  const now=()=>new Date().toISOString();
  const c={id:1,code:'DEMO-001',guardian_name:'가상 자녀',guardian_contact:'체험용 · 실제 연락처 없음',parent_name:'가상 부모님',parent_birth:'1958',hometown:'이야기 마을',job:'',family:'',notes:'서비스를 둘러보기 위한 창작 예시입니다.',status:'원고 작성',owner_id:'demo',owner_name:'체험 담당자',delete_after:'2099-12-31',consents:[],plans:[],transcripts:[{id:1,title:'학교가 끝나면',raw:'학교가 끝나면 친구랑 냇가로 갔어. 다리 밑에 앉아서 발을 담그곤 했지. 집에 돌아오면 어머니가 저녁 먹으라고 부르셨어.',versions:[],created:now(),status:'녹취 도착',has_audio:false}],stories:[{id:1,title:'냇가에서 보낸 오후',body:'학교가 끝나면 친구랑 냇가로 갔어. 다리 밑에 앉아서 발을 담그곤 했지. 집에 돌아오면 어머니가 저녁 먹으라고 부르셨어.',status:'확정',era:'학창 시절',tags:'',sensitive_note:'',updated:now(),transcript_id:1}]};
  let book={customer_id:1,title:'내가 기억하기 전의 이야기',subtitle:'학교가 끝나면 시작되던 작은 모험',author:'가상 부모님',dedication:'엄마의 이야기를 함께 듣는 이 시간이 오래 남기를.',story_ids:[1],revision:1,parent_agreed:true,ai_agreed:false,consent_name:'가상 부모님',consent_evidence:'체험용 가상 동의 기록',consent_at:now(),share_scope:'가족 비공개',print_checks:{}},runs=[],approved=false;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const meta={customerStatus:['신청','동의 완료','인터뷰 중','원고 작성','고객 확인','인쇄','배송','보관'],planStatus:['초안','승인','보냄','답변 도착','건너뜀'],transcriptStatus:['녹취 도착','정리 중','정리 완료','고객 확인','확정'],storyStatus:['초안','고객 확인','확정'],consentItems:['개인정보 수집·이용','음성 녹음과 보관','AI 처리 위탁(국외 이전 포함)','책 제작 업체에 원고 제공','오픈·진행 안내 수신'],today:now().slice(0,10)};
  const catalog=Promise.all([fetch('skills.json').then(r=>r.json()),fetch('questions.json').then(r=>r.json()),import('./engine.mjs')]);
  window.MOAON_DEMO={
    async agent(b){
      const [skills,questions,engine]=await catalog;
      if(b.action==='config')return {version:engine.VERSION,ai_enabled:false,key_configured:false,policy_confirmed:false,skills,questions};
      if(b.action==='workspace')return clone({book,runs,stories:book.story_ids.map(id=>c.stories.find(s=>s.id===id)).filter(Boolean),approval_current:approved,expired:false});
      if(b.action==='run'){
        if(!book.parent_agreed)throw new Error('부모님 참여 동의를 기록해 주세요.');
        const sources=b.transcript_id?c.transcripts.map(t=>({id:t.id,type:'transcript',title:t.title,body:t.raw})):b.use_stories?c.stories.map(s=>({...s,type:'story'})):[];
        if(b.skill!=='interview'&&!sources.length)throw new Error('작업할 자료를 선택해 주세요.');
        const r={id:crypto.randomUUID(),customer_id:1,skill:b.skill,mode:'local',created_at:now(),result:engine.localRun(b.skill,sources,questions),source_refs:sources.map(s=>({id:s.id,type:s.type}))};runs.unshift(r);return clone({run:r});
      }
      if(b.action==='save_result'){if(b.target==='clean'){c.transcripts[0].versions.unshift({id:Date.now(),clean:b.body,created:now(),editor:'체험 담당자'});}else{c.stories.push({id:c.stories.length+1,title:b.title,body:b.body,status:'초안',era:'',tags:'',sensitive_note:'',updated:now()});}return {ok:true};}
      if(b.action==='consent'){book={...book,parent_agreed:b.parent_agreed,ai_agreed:b.ai_agreed,consent_name:b.name,consent_evidence:b.evidence,share_scope:b.share_scope};approved=false;}
      if(b.action==='save_book'){book={...book,title:b.title,subtitle:b.subtitle,author:b.author,dedication:b.dedication,story_ids:b.story_ids};approved=false;}
      if(b.action==='approve'){if(book.story_ids.some(id=>c.stories.find(s=>s.id===id)?.status!=='확정'))throw new Error('이야기를 먼저 확정해 주세요.');book={...book,review_name:b.name,review_evidence:b.evidence,approved_at:now()};approved=true;}
      if(b.action==='print_ready'){if(!approved||Object.values(b.checks).some(v=>!v))throw new Error('원고 승인과 확인 항목을 완료해 주세요.');book={...book,print_checks:b.checks,print_requested_at:now()};}
      book.revision++;return clone({book});
    },
    async call(method,path,b={}){
      if(path==='/state')return {loggedIn:true,needsSetup:false};
      if(path==='/me')return {id:'demo',name:'체험 담당자',role:'admin'};
      if(path==='/meta')return meta;
      if(path==='/team'||path==='/users')return [{id:'demo',name:'체험 담당자',role:'admin',email:'가상 계정'}];
      if(path==='/logout'){location.href='./';return {};}
      if(path==='/dashboard')return {total:1,byStatus:{'원고 작성':1},soon:[],readyToSend:0,draftPlans:0,newTranscripts:1,unassigned:0};
      if(path==='/customers'&&method==='GET')return clone([c]);
      if(path==='/customers/1'&&method==='GET')return clone(c);
      if(path==='/questions')return (await catalog)[1].map((q,i)=>({...q,id:i+1,era:q.topic,sort:i,active:true}));
      if(path==='/settings')return {message_template:'{부모님}님, {질문}'};
      if(path==='/queue'||path==='/activity')return [];
      if(path==='/destruction')return {due:[],log:[]};
      if(method==='POST'&&path==='/customers/1/plans'){c.plans.push({id:c.plans.length+1,week:c.plans.length+1,text:b.text,status:'초안'});return {ok:true};}
      if(method==='POST'&&path==='/customers/1/stories'){c.stories.push({...b,id:c.stories.length+1,status:'초안',updated:now()});approved=false;return {ok:true};}
      if(method==='PUT'&&/^\/stories\/\d+$/.test(path)){Object.assign(c.stories.find(s=>s.id===+path.split('/')[2]),b);approved=false;return {ok:true};}
      if(method==='POST'&&/^\/transcripts\/\d+\/versions$/.test(path)){const t=c.transcripts.find(t=>t.id===+path.split('/')[2]);t.versions.unshift({id:Date.now(),clean:b.clean,created:now(),editor:'체험 담당자'});return {ok:true};}
      throw new Error('이 기능은 실제 관리자로 로그인한 뒤 사용할 수 있습니다.');
    }
  };
}
