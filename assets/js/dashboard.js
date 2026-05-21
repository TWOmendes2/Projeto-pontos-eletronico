(async function(){
  const {
    $, api, requireAuth, renderShell, fmtMoneyBR, Icons,
    getMonthBoundsFromDate, computeOvertimeSnapshot, minsToHHmm, getDailyContractedHours
  } = window.Deepontus;
  const user = requireAuth();
  if (!user) return;
  const isAdmin = user.role === 'admin';

  // Nesta versão, o cadastro CLT continua existindo em "Meu cadastro",
  // mas não bloqueia mais o acesso ao painel de ponto. Isso libera o admin
  // e evita travar operação quando o RLS do employee_profiles ainda não foi ajustado.
  renderShell({ active:'dashboard', title:'Painel', subtitle:'Ponto, horas do dia e pendências.', user, isAdmin });
  const root = $('#page');

  const dailyHours = getDailyContractedHours(user);

  function weekStripHtml(){
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    let html = '<div class="week-strip" aria-label="Dias da semana">';
    for (let i=0;i<7;i++){
      const d = new Date(start);
      d.setDate(start.getDate()+i);
      const active = d.toDateString() === today.toDateString();
      html += `<div class="week-day ${active?'active':''}"><span>${dias[d.getDay()]}</span><b>${String(d.getDate()).padStart(2,'0')}</b></div>`;
    }
    html += '</div>';
    return html;
  }

  root.innerHTML = `
    ${weekStripHtml()}

    <div class="grid cols-2 dashboard-grid">
      <div class="card timer-card" id="card-timer">
        <div class="timer-head">
          <div class="stat">
            <div class="label">Hora atual</div>
            <div class="value clock-value" id="clock">--:--:--</div>
          </div>
          <div class="stat">
            <div class="label">Status</div>
            <div class="value status-value" id="status">--</div>
          </div>
        </div>

        <div class="overtime-live" id="overtime-live" aria-live="polite">
          <div class="overtime-live__head">
            <div>
              <strong id="overtime-title">Hora extra</strong>
              <p id="overtime-copy">A hora extra aparece quando a carga diária é ultrapassada.</p>
            </div>
            <span class="badge dot" id="overtime-badge">Normal</span>
          </div>
          <div class="overtime-live__grid">
            <div><span>Trabalhado hoje</span><b id="ot-day">00:00</b></div>
            <div><span>Extra do dia</span><b id="ot-total">00:00</b></div>
            <div><span>Extra após tolerância</span><b id="ot-billable">00:00</b></div>
            <div><span>Valor estimado</span><b id="ot-value">R$ 0,00</b></div>
          </div>
        </div>

        <div class="action-row point-actions" style="margin-top:14px">
          <button class="btn success" id="btn-start">${Icons.play}Iniciar ponto</button>
          <button class="btn warning" id="btn-break">${Icons.coffee}Iniciar intervalo</button>
          <button class="btn warning" id="btn-break-end">${Icons.pause}Encerrar intervalo</button>
          <button class="btn danger" id="btn-end">${Icons.stop}Encerrar ponto</button>
          <button class="btn ghost" id="btn-correction">${Icons.edit}Solicitar correção</button>
        </div>
        <p class="help" style="margin-top:10px">Tolerância: <b>10 minutos</b>. Acima disso, a justificativa é obrigatória.</p>
      </div>

      <div class="card employee-summary-card">
        <h3 style="margin:0 0 6px">Resumo do colaborador</h3>
        <p class="help" style="margin:0 0 12px">Base usada nos cálculos.</p>
        <div class="metric-list">
          <div class="metric-pill"><span>ID</span><b>${user.employee_id}</b></div>
          <div class="metric-pill"><span>Função</span><b>${user.job_function || '—'}</b></div>
          <div class="metric-pill"><span>Modo</span><b>${user.pay_mode === 'salaried' ? 'Mensal' : 'Horista'}</b></div>
          <div class="metric-pill"><span>Horas/dia</span><b>${Number(dailyHours||0).toFixed(2).replace('.', ',')}h</b></div>
          <div class="metric-pill"><span>Horas/mês</span><b>${Number(user.contracted_hours_month||0)}h</b></div>
          <div class="metric-pill"><span>Valor HE</span><b>${fmtMoneyBR(user.overtime_rate || user.hourly_rate || 0)}/h</b></div>
        </div>
      </div>
    </div>

    <div class="grid cols-3 month-overview" style="margin-top:14px">
      <div class="card mini-card"><span>Trabalhado no mês</span><b id="month-worked">00:00</b></div>
      <div class="card mini-card"><span>Carga mensal configurada</span><b>${minsToHHmm(Number(user.contracted_hours_month||0)*60)}</b></div>
      <div class="card mini-card"><span>Atualização</span><b id="last-refresh">agora</b></div>
    </div>
  `;

  function tickClock(){
    const now = new Date();
    $('#clock').textContent = now.toLocaleTimeString('pt-BR');
  }
  setInterval(tickClock, 1000); tickClock();

  let currentSession = null;
  let dayBaseMinutes = 0;
  let monthBaseMinutes = 0;

  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `
    <div class="modal light">
      <h3 style="margin:0 0 8px">Solicitar correção de ponto</h3>
      <p class="help" style="margin:0 0 12px">Use quando você esqueceu de bater ponto ou houve erro no registro. O admin aprova/rejeita.</p>
      <div class="field"><label>Data</label><input type="date" id="c_date"></div>
      <div class="field"><label>Minutos (+ / -)</label><input type="number" id="c_minutes" placeholder="Ex.: 30 ou -15"></div>
      <div class="field"><label>Motivo</label><textarea id="c_reason" rows="3" placeholder="Explique o que aconteceu..."></textarea></div>
      <div class="actions">
        <button class="btn" id="c_cancel">Cancelar</button>
        <button class="btn primary" id="c_send">Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(bd);
  function openCorrection(){ bd.classList.add('open'); }
  function closeCorrection(){ bd.classList.remove('open'); }
  bd.addEventListener('click', (e)=>{ if (e.target===bd) closeCorrection(); });
  bd.querySelector('#c_cancel').addEventListener('click', closeCorrection);

  const otBd = document.createElement('div');
  otBd.className = 'backdrop';
  otBd.innerHTML = `
    <div class="modal light overtime-modal">
      <h3>Justificativa de hora extra</h3>
      <p class="help" style="margin:0 0 12px">Você passou da sua carga diária e ultrapassou a tolerância de 10 minutos. Para encerrar o ponto, explique o motivo.</p>

      <div class="overtime-summary">
        <div><span>Extra total do dia</span><strong id="otm-total">00:00</strong></div>
        <div><span>Tolerância</span><strong id="otm-tolerance">00:10</strong></div>
        <div><span>Extra contabilizada</span><strong id="otm-billable">00:00</strong></div>
        <div><span>Valor estimado</span><strong id="otm-value">R$ 0,00</strong></div>
      </div>

      <div class="field">
        <label>Por que você fez hora extra?</label>
        <textarea id="ot_reason" rows="4" placeholder="Ex.: finalizei atendimento de aluno, fechamento de sala, demanda urgente do setor..."></textarea>
      </div>

      <p class="help">Essa justificativa ficará pendente para conferência do administrador em <b>Pendências</b>.</p>

      <div class="actions">
        <button class="btn" id="ot_cancel">Voltar</button>
        <button class="btn primary" id="ot_finish">Encerrar e enviar justificativa</button>
      </div>
    </div>
  `;
  document.body.appendChild(otBd);

  const pendingOtBd = document.createElement('div');
  pendingOtBd.className = 'backdrop';
  pendingOtBd.innerHTML = `
    <div class="modal light overtime-modal">
      <h3>Justificar hora extra lançada</h3>
      <p class="help" style="margin:0 0 12px">Existe uma hora extra lançada no seu ponto. Explique o motivo para o administrador conseguir conferir.</p>

      <div class="overtime-summary">
        <div><span>Data</span><strong id="pot-date">—</strong></div>
        <div><span>Extra contabilizada</span><strong id="pot-billable">00:00</strong></div>
        <div><span>Trabalhado</span><strong id="pot-duration">00:00</strong></div>
        <div><span>Valor estimado</span><strong id="pot-value">R$ 0,00</strong></div>
      </div>

      <div class="field">
        <label>Por que teve essa hora extra?</label>
        <textarea id="pot_reason" rows="4" placeholder="Ex.: finalizei atendimento, demanda urgente, fechamento de sala..."></textarea>
      </div>

      <div class="actions">
        <button class="btn" id="pot_later">Responder depois</button>
        <button class="btn primary" id="pot_save">Enviar justificativa</button>
      </div>
    </div>
  `;
  document.body.appendChild(pendingOtBd);

  let pendingOvertimeSnapshot = null;
  function openOvertimeModal(snapshot){
    pendingOvertimeSnapshot = snapshot;
    otBd.querySelector('#otm-total').textContent = minsToHHmm(snapshot.overtime_minutes);
    otBd.querySelector('#otm-tolerance').textContent = minsToHHmm(snapshot.tolerance_minutes);
    otBd.querySelector('#otm-billable').textContent = minsToHHmm(snapshot.overtime_billable_minutes);
    otBd.querySelector('#otm-value').textContent = fmtMoneyBR(snapshot.overtime_value);
    otBd.querySelector('#ot_reason').value = '';
    otBd.classList.add('open');
    setTimeout(()=>otBd.querySelector('#ot_reason')?.focus(), 50);
  }
  function closeOvertimeModal(){ otBd.classList.remove('open'); pendingOvertimeSnapshot = null; }
  otBd.querySelector('#ot_cancel').addEventListener('click', closeOvertimeModal);

  let pendingOvertimeToJustify = null;
  function openPendingOvertimeJustification(session){
    pendingOvertimeToJustify = session;
    const date = String(session.date || '').slice(0,10);
    pendingOtBd.querySelector('#pot-date').textContent = date ? new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR') : '—';
    pendingOtBd.querySelector('#pot-billable').textContent = minsToHHmm(session.overtime_billable_minutes || 0);
    pendingOtBd.querySelector('#pot-duration').textContent = minsToHHmm(session.duration_minutes || 0);
    pendingOtBd.querySelector('#pot-value').textContent = fmtMoneyBR(session.overtime_value || 0);
    pendingOtBd.querySelector('#pot_reason').value = '';
    pendingOtBd.classList.add('open');
    setTimeout(()=>pendingOtBd.querySelector('#pot_reason')?.focus(), 80);
  }
  function closePendingOvertimeJustification(){ pendingOtBd.classList.remove('open'); pendingOvertimeToJustify = null; }
  pendingOtBd.querySelector('#pot_later').addEventListener('click', closePendingOvertimeJustification);
  pendingOtBd.addEventListener('click', (e)=>{ if (e.target === pendingOtBd) closePendingOvertimeJustification(); });
  pendingOtBd.querySelector('#pot_save').addEventListener('click', async ()=>{
    if (!pendingOvertimeToJustify) return;
    const reason = pendingOtBd.querySelector('#pot_reason').value.trim();
    if (reason.length < 8){ alert('Explique melhor o motivo da hora extra.'); return; }
    const btn = pendingOtBd.querySelector('#pot_save');
    try{
      btn.disabled = true;
      await api.saveOvertimeJustification(pendingOvertimeToJustify.id, reason);
      closePendingOvertimeJustification();
      alert('Justificativa enviada. Ela ficará pendente para o administrador conferir.');
    }catch(ex){ alert(ex.message || ex); }
    finally{ btn.disabled = false; }
  });

  async function maybeOpenPendingOvertimeJustification(){
    if (currentSession || pendingOtBd.classList.contains('open') || otBd.classList.contains('open')) return;
    try{
      const pending = await api.getPendingOvertimeJustification(user.employee_id);
      if (pending) openPendingOvertimeJustification(pending);
    }catch(ex){ console.warn('[Deepontus] Não foi possível carregar justificativa pendente:', ex); }
  }

  function getCurrentDateForCalc(){
    return currentSession?.date || new Date().toISOString().slice(0,10);
  }

  function getLiveOvertimeSnapshot(){
    return computeOvertimeSnapshot({ user, session: currentSession, dayBaseMinutes, monthBaseMinutes, now: new Date() });
  }

  function updateLiveOvertime(){
    const card = $('#card-timer');
    const live = $('#overtime-live');
    const clock = $('#clock');
    if (!card || !live) return;

    const sessionMinutes = currentSession ? window.Deepontus.computeSessionWorkedMinutes(currentSession, new Date()) : 0;
    const monthProjected = Math.max(0, monthBaseMinutes + sessionMinutes);
    $('#month-worked').textContent = minsToHHmm(monthProjected);
    $('#last-refresh').textContent = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

    if (!currentSession){
      const snap = computeOvertimeSnapshot({ user, session:null, dayBaseMinutes, monthBaseMinutes, now:new Date() });
      clock?.classList.remove('clock-warning','clock-danger');
      $('#ot-day').textContent = minsToHHmm(snap.projected_day_minutes);
      $('#ot-total').textContent = minsToHHmm(snap.overtime_minutes);
      $('#ot-billable').textContent = minsToHHmm(snap.overtime_billable_minutes);
      $('#ot-value').textContent = fmtMoneyBR(snap.overtime_value);

      if (snap.overtime_billable_minutes > 0){
        card.classList.add('overtime-warning');
        card.classList.remove('overtime-active');
        $('#overtime-title').textContent = 'Hora extra registrada hoje';
        $('#overtime-copy').textContent = 'Há extra no dia. Se estiver pendente, o sistema solicitará a justificativa.';
        $('#overtime-badge').className = 'badge dot warning';
        $('#overtime-badge').textContent = 'Extra no dia';
      } else {
        card.classList.remove('overtime-warning','overtime-active');
        $('#overtime-title').textContent = 'Hora extra';
        $('#overtime-copy').textContent = 'A hora extra aparece quando a carga diária é ultrapassada.';
        $('#overtime-badge').className = 'badge dot success';
        $('#overtime-badge').textContent = 'Normal';
      }
      return;
    }

    const snap = getLiveOvertimeSnapshot();
    $('#ot-day').textContent = minsToHHmm(snap.projected_day_minutes);
    $('#ot-total').textContent = minsToHHmm(snap.overtime_minutes);
    $('#ot-billable').textContent = minsToHHmm(snap.overtime_billable_minutes);
    $('#ot-value').textContent = fmtMoneyBR(snap.overtime_value);

    if (snap.overtime_billable_minutes > 0){
      card.classList.add('overtime-active');
      card.classList.remove('overtime-warning');
      clock?.classList.add('clock-danger');
      clock?.classList.remove('clock-warning');
      $('#overtime-title').textContent = 'Hora extra ativa';
      $('#overtime-copy').textContent = 'Você ultrapassou a tolerância de 10 minutos. Ao encerrar, será obrigatório justificar.';
      $('#overtime-badge').className = 'badge dot danger';
      $('#overtime-badge').textContent = 'Justificativa obrigatória';
    } else if (snap.overtime_minutes > 0){
      card.classList.add('overtime-warning');
      card.classList.remove('overtime-active');
      clock?.classList.add('clock-warning');
      clock?.classList.remove('clock-danger');
      $('#overtime-title').textContent = 'Dentro da tolerância';
      $('#overtime-copy').textContent = `Você passou da carga diária, mas ainda está na tolerância de ${snap.tolerance_minutes} minutos.`;
      $('#overtime-badge').className = 'badge dot warning';
      $('#overtime-badge').textContent = 'Tolerância';
    } else {
      card.classList.remove('overtime-warning','overtime-active');
      clock?.classList.remove('clock-warning','clock-danger');
      $('#overtime-title').textContent = 'Hora extra';
      $('#overtime-copy').textContent = `Faltam ${minsToHHmm(snap.minutes_to_contract)} para atingir sua carga diária configurada.`;
      $('#overtime-badge').className = 'badge dot success';
      $('#overtime-badge').textContent = 'Normal';
    }
  }
  setInterval(updateLiveOvertime, 1000);

  async function loadTimeBases(){
    const date = getCurrentDateForCalc();
    const bounds = getMonthBoundsFromDate(date);
    dayBaseMinutes = await api.getDayWorkedMinutesForOvertime(user.employee_id, date, currentSession?.id || null);
    monthBaseMinutes = await api.getMonthWorkedMinutesForOvertime(user.employee_id, bounds.start, bounds.end, currentSession?.id || null);
  }

  async function refresh(){
    currentSession = await api.getLatestOpenSession(user.employee_id);
    if (currentSession){
      const today = new Date().toISOString().slice(0,10);
      if (String(currentSession.date) < today){
        const endIso = `${currentSession.date}T23:59:59.000Z`;
        try{ await api.forceCloseSessionAt(currentSession.id, endIso); }
        catch(_){ /* se falhar, seguimos e o admin pode ajustar */ }
        currentSession = await api.getLatestOpenSession(user.employee_id);
      }
    }

    await loadTimeBases();

    const st = $('#status');
    const startBtn = $('#btn-start');
    const breakBtn = $('#btn-break');
    const breakEndBtn = $('#btn-break-end');
    const endBtn = $('#btn-end');

    if (!currentSession){
      st.textContent = 'Sem ponto aberto';
      startBtn.disabled = false;
      breakBtn.disabled = true;
      breakEndBtn.disabled = true;
      endBtn.disabled = true;
      updateLiveOvertime();
      return;
    }

    const inBreak = !!currentSession.break_open_since;
    st.textContent = inBreak ? 'Em intervalo' : 'Ponto em andamento';
    startBtn.disabled = true;
    breakBtn.disabled = inBreak;
    breakEndBtn.disabled = !inBreak;
    endBtn.disabled = false;
    updateLiveOvertime();
  }

  async function finishShift(overtimeSnapshot=null){
    $('#btn-end').disabled = true;
    try{
      currentSession = await api.closeBreak(currentSession);
      await api.endShift(currentSession, overtimeSnapshot || {});
      closeOvertimeModal();
      await refresh();
    }catch(ex){
      alert(ex.message || ex);
    }finally{
      $('#btn-end').disabled = false;
    }
  }

  $('#btn-start').addEventListener('click', async ()=>{
    try{
      $('#btn-start').disabled=true;
      await api.startShift(user.employee_id);
      await refresh();
    }catch(ex){ alert(ex.message || ex); }
    finally{ $('#btn-start').disabled=false; }
  });

  $('#btn-break').addEventListener('click', async ()=>{
    if (!currentSession) return;
    try{
      $('#btn-break').disabled=true;
      await api.openBreak(currentSession.id);
      await refresh();
    }catch(ex){ alert(ex.message || ex); }
    finally{ $('#btn-break').disabled=false; }
  });

  $('#btn-break-end').addEventListener('click', async ()=>{
    if (!currentSession) return;
    try{
      $('#btn-break-end').disabled=true;
      currentSession = await api.closeBreak(currentSession);
      await refresh();
    }catch(ex){ alert(ex.message || ex); }
    finally{ $('#btn-break-end').disabled=false; }
  });

  $('#btn-end').addEventListener('click', async ()=>{
    if (!currentSession) return;
    try{
      $('#btn-end').disabled = true;
      currentSession = await api.closeBreak(currentSession);
      await loadTimeBases();
      const snap = getLiveOvertimeSnapshot();
      $('#btn-end').disabled = false;

      if (snap.overtime_billable_minutes > 0){
        openOvertimeModal(snap);
        return;
      }

      const basicSnapshot = snap.overtime_minutes > 0 ? { ...snap, reason:'Dentro da tolerância automática de 10 minutos.' } : {};
      if (!confirm('Encerrar o ponto agora?')) return;
      await finishShift(basicSnapshot);
    }catch(ex){
      $('#btn-end').disabled = false;
      alert(ex.message || ex);
    }
  });

  otBd.querySelector('#ot_finish').addEventListener('click', async ()=>{
    if (!currentSession || !pendingOvertimeSnapshot) return;
    const reason = otBd.querySelector('#ot_reason').value.trim();
    if (reason.length < 8){
      alert('Explique melhor o motivo da hora extra.');
      return;
    }
    const btn = otBd.querySelector('#ot_finish');
    try{
      btn.disabled = true;
      await finishShift({ ...pendingOvertimeSnapshot, reason });
    }finally{
      btn.disabled = false;
    }
  });

  $('#btn-correction').addEventListener('click', ()=>{
    const today = new Date().toISOString().slice(0,10);
    bd.querySelector('#c_date').value = today;
    bd.querySelector('#c_minutes').value = '';
    bd.querySelector('#c_reason').value = '';
    openCorrection();
  });

  bd.querySelector('#c_send').addEventListener('click', async ()=>{
    const date = bd.querySelector('#c_date').value;
    const mins = Number(bd.querySelector('#c_minutes').value||0);
    const reason = bd.querySelector('#c_reason').value.trim();
    if (!date) { alert('Selecione a data.'); return; }
    if (!mins || !Number.isFinite(mins)) { alert('Informe os minutos (ex.: 30 ou -15).'); return; }
    if (!reason) { alert('Explique o motivo.'); return; }
    const btn = bd.querySelector('#c_send');
    try{
      btn.disabled = true;
      await api.createAdjustment({ employee_id: user.employee_id, date, delta_minutes: mins, reason, type:'correction' });
      alert('Solicitação enviada.');
      closeCorrection();
      await refresh();
    }catch(ex){
      alert(ex.message || ex);
    }finally{ btn.disabled=false; }
  });

  await refresh();
  await maybeOpenPendingOvertimeJustification();
})();
