(async function(){
  const { $, api, requireAuth, renderShell, fmtDateBR, fmtMoneyBR, minsToHHmm } = window.Deepontus;
  const user = requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = '../dashboard.html'; return; }

  renderShell({ active:'requests', title:'Pendências', subtitle:'Correções, atestados e horas extras.', user, isAdmin:true });
  const root = $('#page');

  root.innerHTML = `
    <div class="grid cols-2">
      <div class="card paper" style="background:#fff;color:var(--paper-text);border-color:rgba(17,17,19,.12)">
        <h3 style="margin:0 0 10px">Solicitações de ajuste</h3>
        <div class="table-wrap">
          <table class="table" id="tAdj"><thead><tr><th>Colaborador</th><th>Data</th><th>Motivo</th><th>Ações</th></tr></thead><tbody></tbody></table>
        </div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 10px">Atestados</h3>
        <div class="table-wrap">
          <table class="table" id="tAtt"><thead><tr><th>Colaborador</th><th>Período</th><th>Obs.</th><th>Ações</th></tr></thead><tbody></tbody></table>
        </div>
      </div>

      <div class="card" style="grid-column:1/-1">
        <h3 style="margin:0 0 10px">Horas extras para verificar</h3>
        <p class="help" style="margin:0 0 12px">Quando o colaborador ultrapassa a tolerância de 10 minutos, a justificativa aparece aqui para aprovação.</p>
        <div class="table-wrap">
          <table class="table" id="tOvertime">
            <thead><tr><th>Colaborador</th><th>Data</th><th>Extra</th><th>Valor</th><th>Justificativa</th><th>Ações</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  async function load(){
    const { adjustments, attestations, overtime } = await api.listPendingRequests();

    const adjBody = $('#tAdj tbody');
    adjBody.innerHTML='';
    if (!adjustments.length){
      adjBody.innerHTML = `<tr><td colspan="4"><span class="badge dot success">Nenhuma solicitação pendente.</span></td></tr>`;
    }
    for (const a of adjustments){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge">${a.employee_id || '—'}</span></td>
        <td>${a.date ? fmtDateBR(a.date) : '—'}</td>
        <td>${(a.reason || a.notes || '—').slice(0,100)}</td>
        <td>
          <button class="btn success" data-ok="${a.id}">Aprovar</button>
          <button class="btn danger" data-no="${a.id}">Negar</button>
        </td>
      `;
      adjBody.appendChild(tr);
    }

    const attBody = $('#tAtt tbody');
    attBody.innerHTML='';
    if (!attestations.length){
      attBody.innerHTML = `<tr><td colspan="4"><span class="badge dot success">Nenhum atestado pendente.</span></td></tr>`;
    }
    for (const a of attestations){
      const tr = document.createElement('tr');
      const period = (a.start_date && a.end_date) ? `${fmtDateBR(a.start_date)} → ${fmtDateBR(a.end_date)}` : '—';
      tr.innerHTML = `
        <td><span class="badge">${a.employee_id || '—'}</span></td>
        <td>${period}</td>
        <td>${(a.notes || a.description || '—').slice(0,100)}</td>
        <td>
          <button class="btn success" data-att-ok="${a.id}">Aprovar</button>
          <button class="btn danger" data-att-no="${a.id}">Negar</button>
        </td>
      `;
      attBody.appendChild(tr);
    }

    const overtimeBody = $('#tOvertime tbody');
    overtimeBody.innerHTML = '';
    if (!overtime.length){
      overtimeBody.innerHTML = `<tr><td colspan="6"><span class="badge dot success">Nenhuma hora extra pendente.</span></td></tr>`;
    }
    for (const o of overtime){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge">${o.employee_id || '—'}</span></td>
        <td>${o.date ? fmtDateBR(o.date) : '—'}</td>
        <td>
          <span class="badge dot warning">${minsToHHmm(o.overtime_billable_minutes || 0)}</span>
          <div class="help" style="margin-top:4px">Total acima da carga: ${minsToHHmm(o.overtime_minutes || 0)}</div>
        </td>
        <td><b>${fmtMoneyBR(o.overtime_value || 0)}</b></td>
        <td>${(o.overtime_reason || '—').slice(0,160)}</td>
        <td>
          <button class="btn success" data-ot-ok="${o.id}">Aprovar</button>
          <button class="btn danger" data-ot-no="${o.id}">Negar</button>
        </td>
      `;
      overtimeBody.appendChild(tr);
    }

    // bind actions
    adjBody.querySelectorAll('button[data-ok]').forEach(b=>b.onclick=async()=>{ await api.setRequestStatus('adjustments', b.dataset.ok, 'approved'); await load(); });
    adjBody.querySelectorAll('button[data-no]').forEach(b=>b.onclick=async()=>{ await api.setRequestStatus('adjustments', b.dataset.no, 'rejected'); await load(); });
    attBody.querySelectorAll('button[data-att-ok]').forEach(b=>b.onclick=async()=>{ await api.setRequestStatus('attestations', b.dataset.attOk, 'approved'); await load(); });
    attBody.querySelectorAll('button[data-att-no]').forEach(b=>b.onclick=async()=>{ await api.setRequestStatus('attestations', b.dataset.attNo, 'rejected'); await load(); });
    overtimeBody.querySelectorAll('button[data-ot-ok]').forEach(b=>b.onclick=async()=>{ await api.setSessionOvertimeStatus(b.dataset.otOk, 'approved', user.employee_id); await load(); });
    overtimeBody.querySelectorAll('button[data-ot-no]').forEach(b=>b.onclick=async()=>{ await api.setSessionOvertimeStatus(b.dataset.otNo, 'rejected', user.employee_id); await load(); });
  }

  await load();
})();
