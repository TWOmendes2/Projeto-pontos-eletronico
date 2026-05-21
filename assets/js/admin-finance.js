/* Financeiro do Admin — visão consolidada */
(async function(){
  const { $, api, requireAuth, renderShell, fmtMoneyBR } = window.Deepontus;
  const user = requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { alert('Acesso restrito ao administrador.'); window.location.href = '../dashboard.html'; return; }

  renderShell({
    active:'admin-finance',
    title:'Financeiro (Admin)',
    subtitle:'Custo mensal por funcionário.',
    user,
    isAdmin:true
  });

  const root = $('#page');

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0,10);
  const end = new Date(Date.UTC(y, m+1, 1)).toISOString().slice(0,10);
  const competence = now.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });

  root.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 6px">Relatório mensal</h3>
          <div class="muted">Competência: <b>${competence}</b> • Base: sessões <b>aprovadas</b> no mês</div>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          <button class="btn" id="btn-refresh">Atualizar</button>
          <button class="btn primary" id="btn-export">Exportar XLS</button>
        </div>
      </div>

      <div class="kpi" style="margin-top:14px" id="kpis"></div>

      <div class="table-wrap" style="margin-top:14px; overflow:auto">
        <table class="table" id="tbl">
          <thead>
            <tr>
              <th>Funcionário</th>
              <th>Modo</th>
              <th>Horas</th>
              <th>HE aprovada</th>
              <th>HE pendente</th>
              <th>Bruto estimado</th>
              <th>INSS (manual)</th>
              <th>Total (bruto - INSS)</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <p class="help" style="margin-top:12px">
        • Nesta versão, o <b>INSS</b> é um campo manual (por funcionário) salvo no <b>localStorage do navegador</b> do admin.
        Em uma próxima versão, podemos persistir isso no banco (tabela de rubricas) para virar holerite oficial.
      </p>
    </div>
  `;

  const LS_KEY = 'deepontus_admin_inss_v1';
  function loadInss(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }catch{ return {}; }
  }
  function saveInss(map){
    localStorage.setItem(LS_KEY, JSON.stringify(map||{}));
  }

  async function computeEmployeeCost(emp, sessions){
    const baseSalary = Number(emp.base_salary||0);
    const rateBase = Number(emp.hourly_rate||0);
    const rateMon = Number(emp.hourly_rate_monitoria||0);
    const rateGra = Number(emp.hourly_rate_gravacao||0);

    let hoursMonitoria = 0, hoursGravacao = 0, hoursOutros = 0;
    let overtimeApprovedValue = 0, overtimePendingValue = 0;
    let overtimeApprovedMinutes = 0, overtimePendingMinutes = 0;

    for (const s of sessions){
      if (s.status !== 'approved') continue;
      const h = Number(s.duration_minutes||0)/60;
      if (s.modality === 'monitoria') hoursMonitoria += h;
      else if (s.modality === 'gravacao') hoursGravacao += h;
      else hoursOutros += h;

      if (s.overtime_status === 'approved'){
        overtimeApprovedValue += Number(s.overtime_value||0);
        overtimeApprovedMinutes += Number(s.overtime_billable_minutes||0);
      } else if (s.overtime_status === 'pending'){
        overtimePendingValue += Number(s.overtime_value||0);
        overtimePendingMinutes += Number(s.overtime_billable_minutes||0);
      }
    }
    const totalHours = hoursMonitoria + hoursGravacao + hoursOutros;

    let gross = 0;
    if (emp.pay_mode === 'hourly'){
      const mon = (rateMon || rateBase) * hoursMonitoria;
      const gra = (rateGra || rateBase) * hoursGravacao;
      const oth = (rateBase || rateMon || rateGra || 0) * hoursOutros;
      gross = mon + gra + oth;
    } else {
      gross = baseSalary;
    }
    gross += overtimeApprovedValue;

    return { totalHours, gross, overtimeApprovedValue, overtimePendingValue, overtimeApprovedMinutes, overtimePendingMinutes };
  }

  async function refresh(){
    const tbody = $('#tbl tbody');
    tbody.innerHTML = `<tr><td colspan="8"><span class="badge dot warning">Carregando…</span></td></tr>`;

    const employees = await api.listEmployees();
    const inssMap = loadInss();

    const rows = [];
    let totalGross = 0;
    let totalInss = 0;
    let totalOvertimeApproved = 0;
    let totalOvertimePending = 0;

    for (const emp of employees.filter(e=>e.is_active)){
      const sessions = await api.listSessionsRange(emp.employee_id, start, end);
      const { totalHours, gross, overtimeApprovedValue, overtimePendingValue, overtimeApprovedMinutes, overtimePendingMinutes } = await computeEmployeeCost(emp, sessions);
      const inss = Number(inssMap[emp.employee_id]||0);
      const net = Math.max(0, gross - inss);
      totalGross += gross;
      totalInss += inss;
      totalOvertimeApproved += overtimeApprovedValue;
      totalOvertimePending += overtimePendingValue;

      rows.push({
        id: emp.employee_id,
        name: emp.name,
        mode: emp.pay_mode === 'hourly' ? 'Horista' : 'Mensal',
        hours: totalHours,
        gross,
        overtimeApprovedValue,
        overtimePendingValue,
        overtimeApprovedMinutes,
        overtimePendingMinutes,
        inss,
        net
      });
    }

    // KPIs
    $('#kpis').innerHTML = `
      <div class="stat"><div class="label">Funcionários ativos</div><div class="value">${rows.length}</div></div>
      <div class="stat"><div class="label">Total bruto (estim.)</div><div class="value">${fmtMoneyBR(totalGross)}</div></div>
      <div class="stat"><div class="label">HE aprovada</div><div class="value">${fmtMoneyBR(totalOvertimeApproved)}</div></div>
      <div class="stat"><div class="label">HE pendente</div><div class="value">${fmtMoneyBR(totalOvertimePending)}</div></div>
      <div class="stat"><div class="label">Total INSS (manual)</div><div class="value">${fmtMoneyBR(totalInss)}</div></div>
      <div class="stat"><div class="label">Total líquido (estim.)</div><div class="value">${fmtMoneyBR(Math.max(0,totalGross-totalInss))}</div></div>
    `;

    // tabela
    tbody.innerHTML = '';
    for (const r of rows.sort((a,b)=>b.gross-a.gross)){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex; align-items:center; gap:10px">
            <div class="avatar" style="width:34px;height:34px;border-radius:12px">${(employees.find(e=>e.employee_id===r.id)?.avatar_url)?`<img src="${employees.find(e=>e.employee_id===r.id)?.avatar_url}" alt=""/>`:r.name.slice(0,1)}</div>
            <div>
              <div style="font-weight:800">${r.name}</div>
              <div class="help" style="margin:2px 0 0">${r.id}</div>
            </div>
          </div>
        </td>
        <td>${r.mode}</td>
        <td>${r.hours.toFixed(2)}</td>
        <td><span class="badge dot success">${fmtMoneyBR(r.overtimeApprovedValue)}<br>${(r.overtimeApprovedMinutes/60).toFixed(2)}h</span></td>
        <td><span class="badge dot warning">${fmtMoneyBR(r.overtimePendingValue)}<br>${(r.overtimePendingMinutes/60).toFixed(2)}h</span></td>
        <td><b>${fmtMoneyBR(r.gross)}</b></td>
        <td>
          <input data-inss="${r.id}" type="number" step="0.01" value="${Number(r.inss||0).toFixed(2)}" style="max-width:140px"/>
        </td>
        <td>${fmtMoneyBR(r.net)}</td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input[data-inss]').forEach(inp=>{
      inp.addEventListener('change', ()=>{
        const id = inp.getAttribute('data-inss');
        const map = loadInss();
        map[id] = Number(inp.value||0);
        saveInss(map);
        refresh();
      });
    });

    // export (XLS via HTML table)
    $('#btn-export').onclick = ()=>{
      const monthLabel = `${y}-${String(m+1).padStart(2,'0')}`;
      const rowsSorted = rows.slice().sort((a,b)=>b.gross-a.gross);

      const esc = (s)=>String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
      const money = (n)=>fmtMoneyBR(Number(n||0));

      const html = `
<html>
<head>
<meta charset="utf-8" />
<style>
  body{font-family:Inter, Arial, sans-serif;}
  .title{background:#6D28D9;color:#fff;font-weight:900;font-size:18px;padding:14px;text-align:center;}
  table{border-collapse:collapse;width:100%;}
  th,td{border:1px solid #ddd;padding:8px;font-size:12px;}
  th{background:#f4f4f5;text-transform:uppercase;letter-spacing:.06em;font-size:11px;}
  .kpi{margin:14px 0;}
  .kpi td{font-weight:800;}
</style>
</head>
<body>
  <div class="title">RELATÓRIO FINANCEIRO — BATINGA CURSOS — ${esc(String(competence).toUpperCase())}</div>

  <table class="kpi">
    <tr>
      <td>Total bruto (estim.)</td><td>${money(totalGross)}</td>
      <td>HE aprovada</td><td>${money(totalOvertimeApproved)}</td>
      <td>HE pendente</td><td>${money(totalOvertimePending)}</td>
      <td>Total INSS (manual)</td><td>${money(totalInss)}</td>
      <td>Total líquido (estim.)</td><td>${money(Math.max(0,totalGross-totalInss))}</td>
    </tr>
  </table>

  <table>
    <thead>
      <tr>
        <th>Funcionário</th>
        <th>ID</th>
        <th>Modo</th>
        <th>Horas</th>
        <th>HE aprovada</th>
        <th>HE pendente</th>
        <th>Bruto estimado</th>
        <th>INSS</th>
        <th>Líquido estimado</th>
      </tr>
    </thead>
    <tbody>
      ${rowsSorted.map(r=>`
        <tr>
          <td>${esc(r.name)}</td>
          <td>${esc(r.id)}</td>
          <td>${esc(r.mode)}</td>
          <td>${Number(r.hours||0).toFixed(2)}</td>
          <td>${money(r.overtimeApprovedValue)}</td>
          <td>${money(r.overtimePendingValue)}</td>
          <td>${money(r.gross)}</td>
          <td>${money(r.inss)}</td>
          <td>${money(r.net)}</td>
        </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;

      const blob = new Blob([html], { type:'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financeiro-admin-${monthLabel}.xls`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    $('#btn-refresh').onclick = refresh;

  }

  await refresh();
})();
