// ===== 잠금 화면 — 패스키 통과 전까지 페이지를 덮는다 =====
(() => {
  const cfg = window.PASSKEY_CONFIG || { credentials: [] };
  const hasCreds = cfg.credentials.length > 0 && cfg.credentials.every(c => c.id);

  // 페이지 본문을 가린다 — 정적 사이트라 DOM은 있지만, 열기 전엔 덮개 아래.
  document.documentElement.classList.add('locked');
  document.body.setAttribute('aria-busy', 'true');

  const overlay = document.createElement('div');
  overlay.className = 'lock-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'lockTitle');
  overlay.innerHTML = `
    <div class="lock-card">
      <p class="lock-icon" aria-hidden="true">🔐</p>
      <h1 id="lockTitle" class="lock-title">잠겨 있는 페이지</h1>
      <p class="lock-sub">비밀번호 없이, 소유자의 패스키로만 열립니다.<br>지문·얼굴·기기 PIN — 내 인증기만 통과합니다.</p>
      <button id="unlockBtn" class="lock-btn" type="button">패스키로 들어가기</button>
      <p class="lock-status" id="lockStatus" role="status" aria-live="polite"></p>
      <p class="lock-foot">김민기의 소개 페이지 · <a href="setup.html">패스키 등록(소유자용)</a></p>
    </div>`;
  document.body.prepend(overlay);

  const status = document.getElementById('lockStatus');
  const btn = document.getElementById('unlockBtn');

  const say = msg => { status.textContent = msg; };

  const reveal = () => {
    overlay.classList.add('gone');
    document.documentElement.classList.remove('locked');
    document.body.removeAttribute('aria-busy');
    setTimeout(() => overlay.remove(), 450);
    document.getElementById('main')?.focus();
  };

  if (!PK.supported()) {
    btn.disabled = true;
    say('이 브라우저는 패스키를 지원하지 않습니다 — 최신 크롬·엣지·사파리에서 열어 주세요.');
    return;
  }
  if (!hasCreds) {
    btn.disabled = true;
    say('아직 등록된 패스키가 없습니다. setup.html에서 소유자가 먼저 등록해야 합니다.');
    return;
  }

  // 이전 통과 기록이 있으면 바로 재도전 버튼만 보여준다
  const remembered = sessionStorage.getItem('pk-unlocked') === '1';
  if (remembered) btn.textContent = '계속 — 다시 패스키로 들어가기';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    say('인증기를 깨우는 중…');
    try {
      const r = await PK.unlock(cfg);
      sessionStorage.setItem('pk-unlocked', '1');
      say('통과했습니다 — 들어오세요.');
      setTimeout(reveal, 350);
    } catch (e) {
      const name = e.name || '';
      if (name === 'NotAllowedError') say('취소되었거나 시간이 지났습니다 — 다시 눌러 주세요.');
      else if (name === 'SecurityError') say('이 출처에서는 패스키를 쓸 수 없습니다.');
      else say(e.message || '실패했습니다 — 다시 눌러 주세요.');
    } finally {
      btn.disabled = false;
    }
  });
})();
