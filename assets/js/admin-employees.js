(async function(){
  const { $, api, requireAuth, renderShell, initialsFromName, fmtMoneyBR, minsToHHmm, computeOvertimeSnapshot } = window.Deepontus;
  const user = requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = '../dashboard.html'; return; }

  renderShell({ active:'employees', title:'Funcionários', subtitle:'Equipe, jornadas e pontos.', user, isAdmin:true });
  const root = $('#page');

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0,10);
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth()+1, 1)).toISOString().slice(0,10);
  const monthLabel = now.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });

  function esc(s){
    return String(s ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }
  function formatTime(v){
    if (!v) return '—';
    try{ return new Date(v).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
    catch{ return '—'; }
  }
  function formatDate(v){
    if (!v) return '—';
    try{ return new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('pt-BR'); }
    catch{ return String(v); }
  }
  function jobOptions(value=''){
    const opts = ['', 'Financeiro', 'Marketing', 'Monitor', 'Recepcionista', 'Serviços Gerais', 'Suporte'];
    const current = String(value||'');
    const full = opts.includes(current) ? opts : [current, ...opts];
    return full.map(o=>`<option value="${esc(o)}" ${o===current?'selected':''}>${o ? esc(o) : 'Sem função definida'}</option>`).join('');
  }
  function calcSummary(sessions){
    let total = 0, heApprovedMin = 0, hePendingMin = 0, heApprovedValue = 0, hePendingValue = 0;
    for (const s of sessions){
      total += Number(s.duration_minutes||0);
      if (s.overtime_status === 'approved'){
        heApprovedMin += Number(s.overtime_billable_minutes||0);
        heApprovedValue += Number(s.overtime_value||0);
      } else if (s.overtime_status === 'pending'){
        hePendingMin += Number(s.overtime_billable_minutes||0);
        hePendingValue += Number(s.overtime_value||0);
      }
    }
    return { total, heApprovedMin, hePendingMin, heApprovedValue, hePendingValue };
  }

  root.innerHTML = `
    <div class="card paper employee-admin-card" style="background:#fff;color:var(--paper-text);border-color:rgba(17,17,19,.12)">
      <div class="section-head">
        <div>
          <h3 style="margin:0 0 6px">Lista de funcionários</h3>
          <p class="help" style="margin:0">Competência: <b>${monthLabel}</b>. Use "Ver pontos" para conferir e ajustar jornadas.</p>
        </div>
        <button class="btn primary" id="btn-new">+ Novo funcionário</button>
      </div>

      <div class="table-wrap" style="margin-top:14px">
        <table class="table responsive-table" id="tbl">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>ID</th>
              <th>Status</th>
              <th>Hora/dia</th>
              <th>Horas mês</th>
              <th>HE mês</th>
              <th>Valor HE</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="backdrop" id="bd">
      <div class="modal light modal-wide">
        <h3 id="mTitle">—</h3>
        <div id="mBody"></div>
        <div class="actions">
          <button class="btn" id="mClose">Fechar</button>
          <button class="btn primary" id="mSave" style="display:none">Salvar alterações</button>
        </div>
      </div>
    </div>
  `;

  const bd = $('#bd');
  const mTitle = $('#mTitle');
  const mBody = $('#mBody');
  const mClose = $('#mClose');
  const mSave = $('#mSave');

  function openModal({ title, bodyHtml, onSave, saveLabel='Salvar alterações' }){
    mTitle.textContent = title;
    mBody.innerHTML = bodyHtml;
    mSave.textContent = saveLabel;
    bd.classList.add('open');
    if (onSave){
      mSave.style.display='inline-flex';
      mSave.onclick = onSave;
    } else {
      mSave.style.display='none';
      mSave.onclick = null;
    }
  }
  function closeModal(){ bd.classList.remove('open'); }
  mClose.addEventListener('click', closeModal);
  bd.addEventListener('click', (e)=>{ if (e.target === bd) closeModal(); });

  async function getProfileHtml(emp){
    try{
      const pr = await api.getEmployeeProfile(emp.employee_id);
      if (pr.missingTable){
        return `<div class="badge dot warning">Tabela <b>employee_profiles</b> não existe. Rode a migration.</div>`;
      }
      if (!pr.profile){
        return `<div class="badge dot warning">Cadastro CLT ainda não preenchido pelo colaborador.</div>`;
      }
      const p = pr.profile;
      return `
        <div class="metric-list">
          <div class="metric-pill"><span>Nome completo</span><b>${esc(p.full_name||'—')}</b></div>
          <div class="metric-pill"><span>CPF</span><b>${esc(p.cpf||'—')}</b></div>
          <div class="metric-pill"><span>Nascimento</span><b>${esc(p.birth_date||'—')}</b></div>
          <div class="metric-pill"><span>WhatsApp</span><b>${esc(p.phone||'—')}</b></div>
          <div class="metric-pill wide"><span>Endereço</span><b>${esc([p.address_street,p.address_number,p.address_neighborhood,p.address_city,p.address_state].filter(Boolean).join(', ') || '—')}</b></div>
        </div>
      `;
    }catch(_){
      return `<div class="badge dot warning">Não foi possível carregar o cadastro CLT.</div>`;
    }
  }

  function sessionsTableHtml(sessions){
    if (!sessions.length){
      return `<div class="badge dot warning">Nenhum ponto aprovado encontrado neste mês.</div>`;
    }
    return `
      <div class="table-wrap point-table-wrap">
        <table class="table responsive-table">
          <thead><tr><th>Data</th><th>Entrada</th><th>Saída</th><th>Intervalo</th><th>Trabalhado</th><th>Hora extra</th><th>Status HE</th></tr></thead>
          <tbody>
            ${sessions.map(s=>`
              <tr>
                <td data-label="Data">${formatDate(s.date)}</td>
                <td data-label="Entrada">${formatTime(s.start_time)}</td>
                <td data-label="Saída">${formatTime(s.end_time)}</td>
                <td data-label="Intervalo">${minsToHHmm(s.break_total_minutes||0)}</td>
                <td data-label="Trabalhado"><b>${minsToHHmm(s.duration_minutes||0)}</b></td>
                <td data-label="Hora extra">${minsToHHmm(s.overtime_billable_minutes||0)} • ${fmtMoneyBR(s.overtime_value||0)}</td>
                <td data-label="Status HE"><span class="badge dot ${s.overtime_status==='approved'?'success':s.overtime_status==='pending'?'warning':s.overtime_status==='rejected'?'danger':''}">${s.overtime_status || 'none'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function openEmployee(emp){
    const [profileHtml, sessions] = await Promise.all([
      getProfileHtml(emp),
      api.listSessionsRange(emp.employee_id, monthStart, monthEnd)
    ]);
    const summary = calcSummary(sessions);

    openModal({
      title: `Funcionário — ${emp.name}`,
      bodyHtml: `
        <div class="admin-employee-layout">
          <div class="card soft-card">
            <h4>Resumo do mês</h4>
            <div class="metric-list">
              <div class="metric-pill"><span>Horas feitas</span><b>${minsToHHmm(summary.total)}</b></div>
              <div class="metric-pill"><span>Hora/dia</span><b>${Number(emp.contracted_hours_day||0).toFixed(2).replace('.', ',')}h</b></div>
              <div class="metric-pill"><span>Horas/mês</span><b>${Number(emp.contracted_hours_month||0)}h</b></div>
              <div class="metric-pill"><span>HE aprovada</span><b>${minsToHHmm(summary.heApprovedMin)} • ${fmtMoneyBR(summary.heApprovedValue)}</b></div>
              <div class="metric-pill"><span>HE pendente</span><b>${minsToHHmm(summary.hePendingMin)} • ${fmtMoneyBR(summary.hePendingValue)}</b></div>
              <div class="metric-pill"><span>Status</span><b>${emp.is_active===false?'Desativado':'Ativo'}</b></div>
            </div>
          </div>

          <div class="card soft-card">
            <h4>Configuração de jornada e valores</h4>
            <div class="grid cols-2 modal-form-grid">
              <div class="field"><label>Nome</label><input id="e_name" value="${esc(emp.name||'')}" /></div>
              <div class="field"><label>Iniciais</label><input id="e_initials" value="${esc(emp.initials||'')}" /></div>
              <div class="field"><label>Função</label><select id="e_job">${jobOptions(emp.job_function)}</select></div>
              <div class="field"><label>Papel</label><select id="e_role"><option value="employee" ${emp.role==='employee'?'selected':''}>employee</option><option value="admin" ${emp.role==='admin'?'selected':''}>admin</option></select></div>
              <div class="field"><label>Horas por dia</label><input id="e_day" type="number" step="0.01" value="${Number(emp.contracted_hours_day||0)}" /></div>
              <div class="field"><label>Horas por mês</label><input id="e_month" type="number" step="1" value="${Number(emp.contracted_hours_month||0)}" /></div>
              <div class="field"><label>Modo de pagamento</label><select id="e_pay"><option value="salaried" ${emp.pay_mode!=='hourly'?'selected':''}>Mensal</option><option value="hourly" ${emp.pay_mode==='hourly'?'selected':''}>Horista</option></select></div>
              <div class="field"><label>Salário base</label><input id="e_salary" type="number" step="0.01" value="${Number(emp.base_salary||0)}" /></div>
              <div class="field"><label>Valor/hora normal</label><input id="e_hourly" type="number" step="0.01" value="${Number(emp.hourly_rate||0)}" /></div>
              <div class="field"><label>Valor/hora extra</label><input id="e_overtime" type="number" step="0.01" value="${Number(emp.overtime_rate||0)}" /></div>
              <div class="field"><label>Nova senha</label><input id="newPass" type="password" placeholder="Opcional" /></div>
            </div>
            <p class="help">A hora extra é calculada a partir da carga diária + tolerância de 10 minutos. Aprovadas entram no financeiro.</p>
          </div>
        </div>


        <div class="card soft-card" style="margin-top:14px">
          <h4>Adicionar ponto manual</h4>
          <div class="grid cols-2 modal-form-grid">
            <div class="field"><label>Data</label><input id="mp_date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
            <div class="field"><label>Intervalo (minutos)</label><input id="mp_break" type="number" value="0" min="0" /></div>
            <div class="field"><label>Entrada</label><input id="mp_start" type="time" /></div>
            <div class="field"><label>Saída</label><input id="mp_end" type="time" /></div>
            <div class="field" style="grid-column:1/-1"><label>Observação</label><input id="mp_notes" placeholder="Ex.: ponto lançado pelo admin" /></div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:12px">
            <button class="btn primary" id="btn-add-point" type="button">Adicionar ponto</button>
          </div>
          <p class="help">Se esse ponto passar da carga diária + 10 minutos, a hora extra fica pendente para o colaborador justificar e o admin conferir.</p>
        </div>

        <div class="card soft-card" style="margin-top:14px">
          <h4>Pontos do mês — ${monthLabel}</h4>
          ${sessionsTableHtml(sessions)}
        </div>

        <div class="card soft-card" style="margin-top:14px">
          <h4>Cadastro CLT</h4>
          ${profileHtml}
        </div>

        <div style="margin-top:10px; display:flex; justify-content:flex-end">
          <button class="btn ${emp.is_active===false?'success':'danger'}" id="btn-toggle">${emp.is_active===false?'Ativar funcionário':'Desativar funcionário'}</button>
        </div>
      `,
      onSave: async ()=>{
        const newPass = $('#newPass').value;
        const payload = {
          name: $('#e_name').value.trim(),
          initials: $('#e_initials').value.trim() || initialsFromName($('#e_name').value),
          job_function: $('#e_job').value || null,
          role: $('#e_role').value,
          contracted_hours_day: Number($('#e_day').value||0),
          contracted_hours_month: Number($('#e_month').value||0),
          pay_mode: $('#e_pay').value,
          base_salary: Number($('#e_salary').value||0),
          hourly_rate: Number($('#e_hourly').value||0),
          overtime_rate: Number($('#e_overtime').value||0)
        };
        if (!payload.name) { alert('Informe o nome.'); return; }
        if (payload.contracted_hours_day <= 0) { alert('Informe quantas horas o funcionário faz por dia.'); return; }
        try{
          mSave.disabled=true;
          await api.updateEmployee(emp.employee_id, payload);
          if (newPass){
            if (newPass.length < 4) throw new Error('A nova senha precisa ter pelo menos 4 caracteres.');
            await api.resetEmployeePassword(emp.employee_id, newPass);
          }
          alert('Funcionário atualizado.');
          closeModal();
          await load();
        }catch(ex){ alert(ex.message || ex); }
        finally{ mSave.disabled=false; }
      }
    });

    setTimeout(()=>{
      const addPoint = $('#btn-add-point');
      addPoint?.addEventListener('click', async ()=>{
        const date = $('#mp_date').value;
        const startTime = $('#mp_start').value;
        const endTime = $('#mp_end').value;
        const breakMinutes = Number($('#mp_break').value||0);
        const notes = $('#mp_notes').value.trim() || 'Ponto lançado manualmente pelo admin.';
        if (!date || !startTime || !endTime){ alert('Informe data, entrada e saída.'); return; }
        try{
          addPoint.disabled = true;
          const startIso = new Date(`${date}T${startTime}:00`).toISOString();
          const endIso = new Date(`${date}T${endTime}:00`).toISOString();
          const tempSession = { start_time:startIso, end_time:endIso, break_total_minutes:breakMinutes, modality:'na' };
          const dayBase = await api.getDayWorkedMinutesForOvertime(emp.employee_id, date, null);
          const snap = computeOvertimeSnapshot({ user:emp, session:tempSession, dayBaseMinutes:dayBase, now:new Date(endIso) });
          const overtime = snap.overtime_billable_minutes > 0 ? {
            ...snap,
            reason:'',
            overtime_status:'pending'
          } : (snap.overtime_minutes > 0 ? { ...snap, reason:'Dentro da tolerância automática de 10 minutos.', overtime_status:'none' } : {});
          await api.createManualSession({
            employee_id: emp.employee_id,
            date,
            start_time: startTime,
            end_time: endTime,
            break_total_minutes: breakMinutes,
            notes,
            overtime
          });
          alert('Ponto manual adicionado.');
          closeModal();
          await load();
        }catch(ex){ alert(ex.message || ex); }
        finally{ addPoint.disabled = false; }
      });

      const t = $('#btn-toggle');
      t?.addEventListener('click', async ()=>{
        const next = emp.is_active === false;
        const ok = confirm(next ? 'Ativar este funcionário?' : 'Desativar este funcionário?');
        if (!ok) return;
        try{
          t.disabled = true;
          await api.setEmployeeActive(emp.employee_id, next);
          closeModal();
          await load();
        }catch(ex){ alert(ex.message || ex); }
        finally{ t.disabled = false; }
      });
    }, 0);
  }

  async function load(){
    const list = await api.listEmployees();
    const tbody = $('#tbl tbody');
    tbody.innerHTML = `<tr><td colspan="8"><span class="badge dot warning">Carregando horas do mês...</span></td></tr>`;

    const rows = [];
    for (const e of list){
      let sessions = [];
      try{ sessions = await api.listSessionsRange(e.employee_id, monthStart, monthEnd); }
      catch(_){ sessions = []; }
      const summary = calcSummary(sessions);
      rows.push({ emp:e, summary });
    }

    tbody.innerHTML='';
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="8"><span class="badge dot warning">Nenhum funcionário cadastrado.</span></td></tr>`;
      return;
    }

    for (const { emp:e, summary } of rows){
      const tr = document.createElement('tr');
      const st = e.is_active === false ? 'Desativado' : 'Ativo';
      const heMonth = summary.heApprovedMin + summary.hePendingMin;
      const heValue = summary.heApprovedValue + summary.hePendingValue;
      tr.innerHTML = `
        <td data-label="Colaborador">
          <div style="display:flex; align-items:center; gap:10px">
            <div class="avatar" style="width:34px;height:34px;border-radius:12px">${e.avatar_url ? `<img src="${esc(e.avatar_url)}" alt=""/>` : initialsFromName(e.name)}</div>
            <div style="min-width:0">
              <div style="font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(e.name || '—')}</div>
              <div class="small">${esc(e.role || 'employee')}</div>
            </div>
          </div>
        </td>
        <td data-label="ID"><span class="badge">${esc(e.employee_id)}</span></td>
        <td data-label="Status"><span class="badge dot ${e.is_active===false?'danger':'success'}">${st}</span></td>
        <td data-label="Hora/dia"><b>${Number(e.contracted_hours_day||0).toFixed(2).replace('.', ',')}h</b></td>
        <td data-label="Horas mês"><b>${minsToHHmm(summary.total)}</b></td>
        <td data-label="HE mês"><span class="badge dot ${summary.hePendingMin>0?'warning':heMonth>0?'success':''}">${minsToHHmm(heMonth)}</span></td>
        <td data-label="Valor HE">${fmtMoneyBR(heValue)}</td>
        <td data-label="Ações"><button class="btn" data-view="${esc(e.employee_id)}">Ver pontos</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('button[data-view]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-view');
        const emp = list.find(x=>x.employee_id===id);
        if (emp) await openEmployee(emp);
      });
    });
  }

  $('#btn-new').addEventListener('click', ()=>{
    openModal({
      title: 'Novo funcionário',
      saveLabel: 'Cadastrar funcionário',
      bodyHtml: `
        <div class="grid cols-2 modal-form-grid">
          <div class="field"><label>ID do colaborador</label><input id="f_id" placeholder="Ex.: EMP005"/></div>
          <div class="field"><label>Nome</label><input id="f_name" placeholder="Nome completo"/></div>
          <div class="field"><label>Iniciais</label><input id="f_ini" placeholder="Ex.: JM"/></div>
          <div class="field"><label>Função</label><select id="f_job">${jobOptions('')}</select></div>
          <div class="field"><label>Horas por dia</label><input id="f_day" type="number" step="0.01" value="8" min="0"/><p class="help">Usado para acionar hora extra diária.</p></div>
          <div class="field"><label>Horas contratuais/mês</label><input id="f_hours" type="number" value="160" min="0"/></div>
          <div class="field"><label>Modo de pagamento</label><select id="f_pay"><option value="salaried">Mensal</option><option value="hourly">Horista</option></select></div>
          <div class="field"><label>Salário base (R$)</label><input id="f_salary" type="number" step="0.01" value="0"/></div>
          <div class="field"><label>Valor/hora normal (R$)</label><input id="f_hourly" type="number" step="0.01" value="0"/></div>
          <div class="field"><label>Valor/hora extra (R$)</label><input id="f_overtime" type="number" step="0.01" value="0"/><p class="help">Se ficar zerado, o sistema usa salário ÷ horas mensais ou valor/hora normal.</p></div>
          <div class="field"><label>Senha inicial</label><input id="f_pass" type="password" placeholder="Senha temporária"/></div>
          <div class="field"><label>Papel</label><select id="f_role"><option value="employee">employee</option><option value="admin">admin</option></select></div>
        </div>
      `,
      onSave: async ()=>{
        const payload = {
          employee_id: $('#f_id').value.trim(),
          name: $('#f_name').value.trim(),
          initials: $('#f_ini').value.trim() || initialsFromName($('#f_name').value),
          job_function: $('#f_job').value || null,
          contracted_hours_day: Number($('#f_day').value||0),
          contracted_hours_month: Number($('#f_hours').value||0),
          pay_mode: $('#f_pay').value,
          base_salary: Number($('#f_salary').value||0),
          hourly_rate: Number($('#f_hourly').value||0),
          overtime_rate: Number($('#f_overtime').value||0),
          role: $('#f_role').value,
          password: $('#f_pass').value
        };
        if (!payload.employee_id || !payload.name) { alert('Preencha ID e Nome.'); return; }
        if (payload.contracted_hours_day <= 0) { alert('Informe quantas horas o funcionário faz por dia.'); return; }
        try{
          mSave.disabled=true;
          await api.createEmployee(payload);
          alert('Funcionário cadastrado.');
          closeModal();
          await load();
        }catch(ex){ alert(ex.message || ex); }
        finally{ mSave.disabled=false; }
      }
    });
  });

  await load();
})();
