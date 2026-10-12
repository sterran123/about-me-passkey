// ===== 나만의 자리 — 공개 페이지 안의 패스키 잠금 구역 =====
(() => {
  const root = document.getElementById('vault');
  if (!root) return;
  const box = root.querySelector('.vault-box');

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const say = (el, msg, isErr) => { el.textContent = msg; el.style.color = isErr ? '#B23A24' : ''; };
  const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = on ? label : btn.dataset.label || btn.textContent; btn.dataset.label = btn.dataset.label || btn.textContent; };

  if (!PKC.supported()) {
    box.append(el('p', 'vault-status', '이 브라우저는 패스키를 지원하지 않습니다 — 최신 크롬·엣지·사파리에서 열어 주세요.'));
    return;
  }

  /* ---------- 화면 1: 잠금 ---------- */
  function viewLocked() {
    box.innerHTML = '';
    const card = el('div', 'vault-locked');
    card.append(
      el('p', 'vault-icon', '🔒'),
      el('p', 'vault-lead', '비밀번호 없이, 내 패스키로만 열립니다.'),
    );
    const row = el('div', 'vault-actions');
    const go = el('button', 'btn btn-primary', '패스키로 들어가기');
    const make = el('button', 'btn btn-ghost', '처음 — 계정 만들기');
    go.addEventListener('click', () => viewAccount('login'));
    make.addEventListener('click', () => viewAccount('register'));
    row.append(go, make);
    const st = el('p', 'vault-status');
    card.append(row, st);
    box.append(card);
    root.classList.add('is-locked');
    root.classList.remove('is-open');
  }

  /* ---------- 화면 2: 계정 입력 (로그인 or 등록) ---------- */
  function viewAccount(mode) {
    box.innerHTML = '';
    const isReg = mode === 'register';
    const card = el('div', 'vault-form');
    card.append(el('h3', 'vault-h3', isReg ? '계정 만들기' : '패스키로 들어가기'));
    card.append(el('p', 'vault-sub', isReg
      ? '계정 이름을 적고 패스키를 만듭니다 — 비밀번호는 쓰지 않습니다.'
      : '계정 이름을 적으면 등록된 패스키로 서명합니다.'));

    const acct = document.createElement('input');
    acct.className = 'vault-input';
    acct.placeholder = '계정 이름 — 예: 민기';
    acct.maxLength = 30;
    acct.value = PKC.account() || '';
    card.append(el('label', 'vault-label', '계정'), acct);

    let nameInput = null;
    if (isReg) {
      nameInput = document.createElement('input');
      nameInput.className = 'vault-input';
      nameInput.placeholder = '패스키 이름 — 예: 내 폰, 서피스';
      nameInput.maxLength = 24;
      card.append(el('label', 'vault-label', '이 패스키 별명'), nameInput);
    }

    const st = el('p', 'vault-status');
    const row = el('div', 'vault-actions');
    const go = el('button', 'btn btn-primary', isReg ? '패스키 만들고 등록' : '패스키로 서명');
    const back = el('button', 'btn btn-ghost', '돌아가기');
    row.append(go, back);
    card.append(row, st);
    box.append(card);

    back.addEventListener('click', viewLocked);
    go.addEventListener('click', async () => {
      const account = acct.value.trim();
      if (!/^[\w가-힣@.\-]{2,30}$/.test(account)) return say(st, '계정 이름은 2~30자 (한글·영문·@.-_)', true);
      busy(go, true, '인증기를 깨우는 중…');
      try {
        if (isReg) {
          const r = await PKC.register(account, (nameInput?.value.trim()) || '패스키');
          if (!r.ok) { say(st, r.error || '실패했습니다', true); return; }
          say(st, '등록 완료 — 바로 들어갑니다…');
          const l = await PKC.login(account);
          if (!l.ok) { say(st, `등록은 됐는데 로그인이 안 됐습니다: ${l.error}`, true); return; }
        } else {
          const l = await PKC.login(account);
          if (!l.ok) { say(st, l.error || '실패했습니다', true); return; }
        }
        viewOpen();
      } finally { busy(go, false); }
    });
    acct.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
  }

  /* ---------- 화면 3: 열린 상태 — 비공개 항목 + 패스키 관리 ---------- */
  async function viewOpen() {
    box.innerHTML = '';
    root.classList.remove('is-locked');
    root.classList.add('is-open');

    const head = el('div', 'vault-open-head');
    head.append(el('h3', 'vault-h3', `${PKC.account()}의 자리`));
    const out = el('button', 'btn btn-ghost', '로그아웃');
    out.addEventListener('click', async () => { await PKC.logout(); viewLocked(); });
    head.append(out);
    box.append(head);

    const st = el('p', 'vault-status', '비공개 항목을 불러오는 중…');
    box.append(st);

    /* 비공개 항목 */
    const itemsCard = el('div', 'vault-items');
    const itemsTitle = el('div', 'vault-row-head');
    itemsTitle.append(el('h4', null, '비공개 항목'));
    const addBtn = el('button', 'btn btn-ghost sm', '+ 항목 추가');
    itemsTitle.append(addBtn);
    itemsCard.append(itemsTitle);
    box.append(itemsCard);

    /* 패스키 목록 */
    const pkCard = el('div', 'vault-pks');
    const pkHead = el('div', 'vault-row-head');
    pkHead.append(el('h4', null, '등록된 패스키'));
    const addPk = el('button', 'btn btn-ghost sm', '+ 이 계정에 패스키 추가');
    pkHead.append(addPk);
    pkCard.append(pkHead);
    box.append(pkCard);

    async function loadItems() {
      const r = await PKC.privateGet();
      if (!r.ok) { say(st, `불러오기 실패 (${r.status}) — ${r.data.error || ''}`, true); return; }
      say(st, `서버에서 온 ${r.data.items.length}개 항목 — 소유: ${r.data.account}`);
      itemsCard.querySelectorAll('.vault-item').forEach(n => n.remove());
      for (const it of r.data.items) itemsCard.append(itemRow(it));
    }

    function itemRow(it) {
      const row = el('div', 'vault-item');
      const body = el('div', 'vault-item-body');
      const t = document.createElement('input'); t.value = it.title; t.maxLength = 60;
      const b = document.createElement('textarea'); b.value = it.body; b.rows = 2; b.maxLength = 2000;
      const save = el('button', 'btn btn-ghost sm', '저장');
      const del = el('button', 'btn btn-ghost sm danger', '삭제');
      save.addEventListener('click', async () => {
        const items = [...itemsCard.querySelectorAll('.vault-item')].map(row => ({
          id: row.dataset.id, title: row.querySelector('input').value.trim(), body: row.querySelector('textarea').value,
        }));
        const r = await PKC.privatePut(items);
        say(st, r.ok ? '저장됐습니다' : `저장 실패: ${r.data.error}`, !r.ok);
      });
      del.addEventListener('click', async () => {
        if (!confirm('이 항목을 지울까요?')) return;
        row.remove();
        const items = [...itemsCard.querySelectorAll('.vault-item')].map(r2 => ({
          id: r2.dataset.id, title: r2.querySelector('input').value.trim(), body: r2.querySelector('textarea').value,
        }));
        await PKC.privatePut(items); loadItems();
      });
      const acts = el('div', 'vault-item-acts');
      acts.append(save, del);
      body.append(t, b);
      row.append(body, acts);
      row.dataset.id = it.id;
      return row;
    }

    addBtn.addEventListener('click', () => {
      itemsCard.insertBefore(itemRow({ id: crypto.randomUUID(), title: '새 항목', body: '' }), itemsCard.children[1]);
    });

    async function loadPks() {
      const r = await PKC.passkeys();
      if (!r.ok) { return; }
      pkCard.querySelectorAll('.vault-pk').forEach(n => n.remove());
      for (const p of r.data.passkeys) {
        const row = el('div', 'vault-pk');
        row.append(
          el('span', 'pk-name', `🔑 ${p.name}`),
          el('span', 'pk-meta', `${new Date(p.createdAt).toLocaleDateString('ko-KR')} 등록 · 서명 ${p.counter}회`),
        );
        const del = el('button', 'btn btn-ghost sm danger', '지우기');
        del.addEventListener('click', async () => {
          if (!confirm(`"${p.name}" 패스키를 지울까요?`)) return;
          const d = await PKC.delPasskey(p.id);
          if (d.ok) { say(st, '지웠습니다 — 남은 패스키로 계속 들어갈 수 있습니다'); loadPks(); }
          else say(st, d.data.error || '실패', true);
        });
        row.append(del);
        pkCard.append(row);
      }
    }

    addPk.addEventListener('click', async () => {
      const name = prompt('새 패스키의 별명 (예: 두 번째 폰)', '패스키');
      if (name === null) return;
      say(st, '인증기를 깨우는 중…');
      const r = await PKC.register(PKC.account(), name.trim() || '패스키');
      say(st, r.ok ? '패스키를 추가했습니다' : `실패: ${r.error}`, !r.ok);
      loadPks();
    });

    loadItems();
    loadPks();
  }

  /* 세션 살아 있으면 바로 열린 화면 */
  if (PKC.token() && PKC.account()) viewOpen();
  else viewLocked();
})();
