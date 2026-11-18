// Pure, offline helpers shared by the Edge Function and regression tests.
export const VERSION = '2026-11-19.1';
const patterns = [
  ['주민등록번호', /\b\d{6}\s*-?\s*[1-8]\d{6}\b/g],
  ['연락처', /\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g],
  ['이메일', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ['계좌 확인', /\b\d{3,6}-\d{2,6}-\d{3,8}\b/g],
  ['주소 확인', /[가-힣]+(?:로|길)\s?\d+(?:-\d+)?(?:\s?\d+동\s?\d+호)?/g],
];
export function maskPII(text, names = []) {
  let result = String(text || '');
  for (const [label, rx] of patterns) result = result.replace(rx, `[${label} 가림]`);
  for (const name of names.filter(n => n && n.length > 1).sort((a,b)=>b.length-a.length)) result = result.split(name).join('[이름 가림]');
  return result;
}
export function inspect(text) {
  const flags = [];
  for (const [label, rx] of patterns) if (new RegExp(rx.source, rx.flags).test(text)) flags.push(`${label}: 공개 범위를 확인하고 필요 없으면 가려 주세요.`);
  if (/암|수술|병원|치매|우울|진단|병력/.test(text)) flags.push('건강 관련 표현: 본인 및 제3자의 민감정보 포함 여부를 확인해 주세요.');
  if (/이혼|폭력|불륜|갈등|빚/.test(text)) flags.push('사적인 가족 이야기: 당사자가 남기고 싶은 내용인지 확인해 주세요.');
  if (/기억이 안|모르겠|아마|쯤|정확하지/.test(text)) flags.push('불확실한 기억: 날짜·인명·지명을 임의로 확정하지 마세요.');
  const years = [...text.matchAll(/\b(18\d{2}|19\d{2}|20\d{2})년/g)].map(m=>+m[1]);
  if (years.some(y=>y>new Date().getFullYear())) flags.push('현재보다 뒤의 연도가 있습니다. 전사 오류인지 확인해 주세요.');
  return flags;
}
export function localRun(skill, sources, questions) {
  const raw = sources.map(s=>s.body || '').join('\n\n').trim();
  const flags = inspect(raw);
  const result = {title:sources[0]?.title || '이야기 한 편',body:raw,questions:[],flags,outline:[]};
  if (skill === 'interview') {
    result.title='대화를 여는 질문'; result.body=raw ? '방금 들은 답에서 한 장면만 더 들어보세요. 원하지 않는 질문은 건너뛰어도 됩니다.' : '질문 하나만 골라 편하게 시작해 주세요. 모두 답하지 않아도 됩니다.';
    result.questions=raw ? ['그다음엔 어떻게 됐어요?', '그때 가장 또렷하게 떠오르는 장면 하나를 더 들려주실래요?'] : questions.slice(0,3).map(q=>q.text);
  } else if (skill === 'clean') {
    result.body=raw.replace(/\b(음|어|그니까)[,，]\s*/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');
    result.flags.push('기본 정리: 띄어쓰기와 반복된 공백만 정리했습니다. 원문과 대조해 주세요.');
  } else if (skill === 'story') {
    result.flags.push('기본 편집: 원문을 보존한 초고입니다. 제목과 문단을 다듬고 부모님께 확인해 주세요.');
  } else if (skill === 'structure') {
    result.title='책의 차례'; result.outline=sources.map(s=>s.title||'제목 없는 이야기'); result.body='이야기 순서를 직접 조정한 뒤 책 제작 탭에서 원고를 조립해 주세요.';
  } else if (skill === 'privacy' || skill === 'preflight') {
    result.title=skill==='privacy'?'민감정보 점검':'출판 전 점검'; result.body='규칙 기반 점검 결과입니다. 제3자 실명·맥락 오류·사진 권리는 사람이 추가 확인해야 합니다.';
    result.flags.push('당사자의 최종 원고 승인, 사진 사용 권한, 공유 범위를 확인해 주세요.');
  }
  return result;
}
export function validateResult(v) {
  if (!v || typeof v.title !== 'string' || typeof v.body !== 'string') throw new Error('결과 형식이 올바르지 않습니다.');
  for (const k of ['questions','flags','outline']) if (!Array.isArray(v[k]) || !v[k].every(x=>typeof x==='string')) throw new Error('결과 형식이 올바르지 않습니다.');
  if (v.body.length>100000 || v.title.length>250) throw new Error('결과가 너무 깁니다.');
  return {title:v.title,body:v.body,questions:v.questions.slice(0,3),flags:v.flags.slice(0,30),outline:v.outline.slice(0,100)};
}
