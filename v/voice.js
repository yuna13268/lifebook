'use strict';
/* 책 QR 음성 재생. 주소: /lifebook/v/#<토큰>
   토큰을 # 뒤에 두어 서버 기록이나 다른 사이트로 새지 않게 한다. */
(() => {
  const BASE = 'https://pxfwsjipjxvafefmgdbk.supabase.co';
  const KEY = 'sb_publishable_XUi0Id-De-VL6b2L6XDIsw_Xk9mg0Lk'; // 공개해도 되는 키 (권한은 서버 함수가 확인)
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  const TOKEN = decodeURIComponent((location.hash || '').replace(/^#(t=)?/, ''));
  const app = document.getElementById('app'), sr = document.getElementById('sr');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mmss = t => { t = Math.max(0, Math.floor(t || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const say = t => { sr.textContent = t; };

  // 체험용: 무음 40초 음성 (실제 목소리 아님)
  function demoUrl() {
    const rate = 8000, n = rate * 40, v = new DataView(new ArrayBuffer(44 + n));
    const s = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
  }

  async function fetchClip(count) {
    if (DEMO) {
      if (TOKEN === 'gone') { const e = new Error('보관 기간이 끝났거나 더 이상 들을 수 없는 음성입니다.'); e.status = 410; throw e; }
      return { title: '냇가에서 보낸 오후', duration: 40, url: demoUrl(), until: '2099-12-31' };
    }
    if (!/^[A-Za-z0-9_-]{22,64}$/.test(TOKEN)) { const e = new Error('QR 주소가 올바르지 않습니다. 책의 QR을 다시 찍어 주세요.'); e.status = 404; throw e; }
    let r;
    try { r = await fetch(BASE + '/functions/v1/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ token: TOKEN, count }) }); }
    catch (e) { const x = new Error('인터넷 연결을 확인한 뒤 다시 열어 주세요.'); x.status = 0; throw x; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || '잠시 후 다시 시도해 주세요.'); e.status = r.status; throw e; }
    return d;
  }

  function gone(e) {
    const ended = e.status === 410, missing = e.status === 404;
    app.innerHTML = `<section class="gone"><h1>${ended ? '더 이상 들을 수 없는 목소리예요' : missing ? 'QR을 다시 찍어 주세요' : '목소리를 불러오지 못했어요'}</h1>
      <p>${esc(e.message)}</p>${ended ? '<p>궁금한 점은 책을 만든 모아온에 문의해 주세요.</p>' : e.status === 0 || e.status >= 500 ? '<p><button class="again" id="retry">다시 시도</button></p>' : ''}</section>`;
    const b = document.getElementById('retry'); if (b) b.onclick = () => location.reload();
    say(e.message);
  }

  function render(c) {
    app.innerHTML = `${DEMO ? '<p class="demo">체험 화면입니다. 실제 목소리가 아닌 무음이 재생됩니다.</p>' : ''}
      <p class="eyebrow">책 속의 목소리</p><h1>${esc(c.title || '부모님의 목소리')}</h1>
      <section class="player" aria-label="목소리 재생">
        <button class="play" id="play" type="button"><i aria-hidden="true">▶</i><span>듣기</span></button>
        <div class="bar"><input type="range" id="seek" min="0" max="${Math.max(1, Math.round(c.duration || 1))}" step="1" value="0" aria-label="재생 위치"></div>
        <div class="times"><span id="cur">0:00</span><span id="dur">${mmss(c.duration)}</span></div>
        <button class="again" id="again" type="button">처음부터 다시 듣기</button>
      </section>
      ${c.until && c.until < '2090-01-01' ? `<p class="note">${esc(c.until)}까지 들을 수 있습니다.</p>` : ''}`;
    const audio = new Audio(); audio.preload = 'metadata'; audio.src = c.url;
    let refreshed = false;
    const $ = id => document.getElementById(id), btn = $('play'), seek = $('seek');
    const paint = () => { const on = !audio.paused; btn.innerHTML = on ? '<i aria-hidden="true">❚❚</i><span>멈춤</span>' : '<i aria-hidden="true">▶</i><span>듣기</span>'; btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    btn.onclick = () => { if (audio.paused) audio.play().catch(() => say('재생을 시작하지 못했어요. 한 번 더 눌러 주세요.')); else audio.pause(); };
    $('again').onclick = () => { audio.currentTime = 0; audio.play().catch(() => {}); };
    seek.oninput = () => { audio.currentTime = +seek.value; };
    audio.onplay = () => { paint(); say('재생합니다'); };
    audio.onpause = paint;
    audio.onended = () => { paint(); say('끝까지 들었습니다'); };
    audio.onloadedmetadata = () => { if (isFinite(audio.duration)) { seek.max = Math.round(audio.duration); $('dur').textContent = mmss(audio.duration); } };
    audio.ontimeupdate = () => { seek.value = Math.floor(audio.currentTime); $('cur').textContent = mmss(audio.currentTime); };
    // 서명 주소(10분)가 끝났으면 조용히 새로 받는다
    audio.onerror = async () => {
      if (refreshed) return say('목소리를 재생하지 못했어요. 페이지를 새로 열어 주세요.');
      refreshed = true;
      try { const at = audio.currentTime, n = await fetchClip(false); audio.src = n.url; audio.currentTime = at; } catch (e) { gone(e); }
    };
  }

  fetchClip(true).then(render, gone);
})();
