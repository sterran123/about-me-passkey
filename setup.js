// ===== 소유자용 패스키 등록 도구 =====
(() => {
  const regBtn = document.getElementById('regBtn');
  const regStatus = document.getElementById('regStatus');
  const resultBox = document.getElementById('resultBox');
  const credOut = document.getElementById('credOut');
  const copyBtn = document.getElementById('copyBtn');
  const testBtn = document.getElementById('testBtn');
  const testStatus = document.getElementById('testStatus');

  const say = (el, msg) => { el.textContent = msg; };
  let last = null; // 방금 만든 자격증명

  if (!PK.supported()) {
    regBtn.disabled = true;
    say(regStatus, '이 브라우저는 패스키를 지원하지 않습니다.');
    return;
  }

  regBtn.addEventListener('click', async () => {
    regBtn.disabled = true;
    say(regStatus, '인증기를 깨우는 중… (폰 QR이나 기기 인증창이 뜹니다)');
    try {
      const cred = await PK.create({ userName: `mingi-${Date.now()}` });
      if (!cred.spki) {
        say(regStatus, '이 인증기는 공개키를 직접 주지 않는 타입입니다 — 다른 알고리즘/기기로 다시 시도해 주세요.');
        return;
      }
      last = cred;
      credOut.textContent = `    { id: '${cred.id}',\n      spki: '${cred.spki}' },`;
      resultBox.hidden = false;
      say(regStatus, '만들어졌습니다 — 공개키를 복사해 config에 붙인 뒤 바로 시험해 보세요.');
    } catch (e) {
      say(regStatus, e.name === 'NotAllowedError' ? '취소되었습니다 — 다시 눌러 주세요.' : `실패: ${e.message}`);
    } finally {
      regBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(credOut.textContent);
      say(testStatus, '복사했습니다 — passkey-config.js의 credentials 안에 붙이세요.');
    } catch {
      credOut.focus();
      document.execCommand?.('selectAll');
      say(testStatus, '자동 복사가 막혀 있습니다 — 상자를 눌러 수동으로 복사하세요.');
    }
  });

  // 방금 만든 패스키로 즉석 해제 시험 — config에 안 박아도 임시 목록으로 검증
  testBtn.addEventListener('click', async () => {
    if (!last) return;
    testBtn.disabled = true;
    say(testStatus, '인증기로 다시 서명합니다…');
    try {
      const r = await PK.unlock({ credentials: [{ id: last.id, spki: last.spki }] });
      say(testStatus, `✅ 통과 — 서명 검증 성공 (카운터 ${r.signCount}). 이제 config에 붙이면 실제 잠금이 켜집니다.`);
    } catch (e) {
      say(testStatus, `❌ ${e.message}`);
    } finally {
      testBtn.disabled = false;
    }
  });
})();
