(async function(){
  const { $, api, requireAuth, renderShell, fmtMoneyBR } = window.Deepontus;
  const user = requireAuth();
  if (!user) return;
  const isAdmin = user.role === 'admin';

  renderShell({ active:'calendar', title:'Calendário', subtitle:'Pontos e faltas por data.', user, isAdmin });
  const root = $('#page');

  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();

  root.innerHTML = `
    <div class="card">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div>
          <h3 style="margin:0" id="monthTitle">—</h3>
          <p class="help" style="margin:6px 0 0">Quadrado sólido: presente • X pequeno: sem ponto • Tracejado: atestado aprovado • Laranja: hora extra</p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn" id="prev">Mês anterior</button>
          <button class="btn" id="next">Próximo mês</button>
        </div>
      </div>

      <div style="margin-top:14px" id="calWrap"></div>

      <div class="legend">
        <div class="item"><span class="sw present"></span> Presente</div>
        <div class="item"><span class="sw missing"></span> Sem ponto</div>
        <div class="item"><span class="sw attested"></span> Atestado (aprovado)</div>
        <div class="item"><span class="sw overtime"></span> Hora extra registrada</div>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      <div class="card" id="dayCard">
        <h3 style="margin:0 0 6px">Detalhes do dia</h3>
        <p class="help" style="margin:0 0 12px">Clique em uma data para ver: início, intervalo, fim do intervalo e fim do ponto.</p>
        <div id="dayDetails" class="small">Selecione um dia no calendário.</div>
      </div>

      <div class="card" id="monthCard">
        <h3 style="margin:0 0 6px">Resumo do mês</h3>
        <p class="help" style="margin:0 0 12px">Lista por data com os registros aprovados.</p>
        <div class="table-wrap" style="max-height:360px; overflow:auto">
          <table class="table" id="monthTbl">
            <thead><tr><th>Data</th><th>Início</th><th>Intervalo</th><th>Fim</th><th>Horas</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  function monthName(year, month){
    return new Date(year, month, 1).toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
  }

  function dayKey(d){ return d.toISOString().slice(0,10); }

  function parseBreaks(notes){
    if (!notes) return [];
    try{
      const j = JSON.parse(notes);
      return Array.isArray(j?.breaks) ? j.breaks : [];
    }catch{ return []; }
  }
  function fmtTime(iso){
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  }
  function minsToHHmm(mins){
    const m = Math.max(0, Number(mins||0));
    const hh = Math.floor(m/60);
    const mm = m%60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }

  async function render(){
    $('#monthTitle').textContent = monthName(y,m);

    const { sessions, attestations } = await api.listMonthCalendar(user.employee_id, y, m);
    const present = new Set(sessions.filter(s=>s.status==='approved').map(s=>s.date));

    // overtime: qualquer sessão com hora extra sinalizada no fechamento
    const overtimeDays = new Set(
      sessions
        .filter(s => s.status === 'approved' && (Number(s.overtime_minutes||0) > 0 || s.is_overtime))
        .map(s => s.date)
    );

    // approved attestations ranges
    const approvedRanges = attestations
      .filter(a=>a.status==='approved')
      .map(a=>({ start: a.start_date, end: a.end_date }));

    function isAttested(date){
      const k = date.toISOString().slice(0,10);
      return approvedRanges.some(r => k >= r.start && k <= r.end);
    }

    const first = new Date(y,m,1);
    const last = new Date(y,m+1,0);
    const startDow = (first.getDay()+6)%7; // monday=0
    const daysInMonth = last.getDate();

    const grid = document.createElement('div');
    grid.className='cal';

    const dows = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    for (const d of dows){
      const el = document.createElement('div');
      el.className='dow';
      el.textContent=d;
      grid.appendChild(el);
    }

    // leading blanks
    for (let i=0;i<startDow;i++){
      const b = document.createElement('div');
      b.className='day other-month';
      b.innerHTML='<span class="n"> </span>';
      grid.appendChild(b);
    }

    for (let day=1; day<=daysInMonth; day++){
      const date = new Date(y,m,day);
      const k = date.toISOString().slice(0,10);
      let cls = 'missing';
      if (isAttested(date)) cls='attested';
      else if (present.has(k)) cls='present';
      if (overtimeDays.has(k)) cls += ' overtime';

      const cell = document.createElement('div');
      cell.className = `day ${cls}`;
      cell.innerHTML = `<span class="n">${day}</span>`;
      cell.setAttribute('data-date', k);
      grid.appendChild(cell);
    }

    $('#calWrap').innerHTML='';
    $('#calWrap').appendChild(grid);

    // tabela mensal (um resumo por dia)
    const tbody = $('#monthTbl tbody');
    tbody.innerHTML='';
    const daysSorted = [...new Set(sessions.filter(s=>s.status==='approved').map(s=>s.date))].sort();
    for (const d of daysSorted){
      const ss = sessions.filter(s=>s.date===d && s.status==='approved');
      // pega primeira/última sessão (se houver mais de uma no dia)
      const firstS = ss[0];
      const lastS = ss[ss.length-1];
      const breaks = parseBreaks(firstS?.notes);
      const b0 = breaks[0];
      const interval = b0 ? `${fmtTime(b0.start)}–${fmtTime(b0.end)}` : (Number(firstS?.break_total_minutes||0)>0 ? `Total ${minsToHHmm(firstS.break_total_minutes)}` : '—');
      const totalMins = ss.reduce((a,x)=>a+Number(x.duration_minutes||0),0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><button class="btn ghost" data-pick="${d}">${new Date(d+'T00:00:00').toLocaleDateString('pt-BR')}</button></td>
        <td>${fmtTime(firstS?.start_time)}</td>
        <td>${interval}</td>
        <td>${fmtTime(lastS?.end_time)}</td>
        <td><span class="badge ${ss.some(x=>Number(x.overtime_minutes||0)>0)?'dot warning':'dot success'}">${minsToHHmm(totalMins)}</span></td>
      `;
      tbody.appendChild(tr);
    }

    // clique no grid
    grid.querySelectorAll('.day[data-date]').forEach(el=>{
      el.addEventListener('click', ()=> pickDate(el.getAttribute('data-date')));
    });
    // clique na tabela
    tbody.querySelectorAll('button[data-pick]').forEach(b=>{
      b.addEventListener('click', ()=> pickDate(b.getAttribute('data-pick')));
    });
  }

  async function pickDate(date){
    const box = $('#dayDetails');
    box.innerHTML = `<div class="badge dot warning">Carregando…</div>`;
    try{
      const ss = await api.listDaySessions(user.employee_id, date);
      if (!ss.length){
        box.innerHTML = `<div class="badge dot danger">Sem registro de ponto neste dia.</div>`;
        return;
      }
      // Mostra todas as sessões do dia
      const rows = ss.map(s=>{
        const breaks = parseBreaks(s.notes);
        const interval = breaks.length
          ? breaks.map(b=>`${fmtTime(b.start)} → ${fmtTime(b.end)}`).join('<br>')
          : (Number(s.break_total_minutes||0)>0 ? `Total ${minsToHHmm(s.break_total_minutes)}` : '—');
        return `
          <tr>
            <td>${fmtTime(s.start_time)}</td>
            <td>${interval}</td>
            <td>${fmtTime(s.end_time)}</td>
            <td>${minsToHHmm(s.duration_minutes||0)}</td>
            <td>${Number(s.overtime_billable_minutes||0)>0 ? `<span class="badge dot warning">${minsToHHmm(s.overtime_billable_minutes)} • ${fmtMoneyBR(s.overtime_value||0)}</span>` : '—'}</td>
          </tr>
        `;
      }).join('');
      const total = ss.reduce((a,x)=>a+Number(x.duration_minutes||0),0);
      box.innerHTML = `
        <div class="badge" style="margin-bottom:10px">${new Date(date+'T00:00:00').toLocaleDateString('pt-BR')} • Total: <strong>${minsToHHmm(total)}</strong> ${ss.some(x=>Number(x.overtime_minutes||0)>0)?'<span class="badge dot warning" style="margin-left:8px">Hora extra registrada</span>':''}</div>
        <div class="table-wrap" style="overflow:auto">
          <table class="table">
            <thead><tr><th>Início</th><th>Intervalo</th><th>Fim</th><th>Horas</th><th>Hora extra</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="help" style="margin-top:10px">Obs.: horários de intervalo são salvos no campo <b>notes</b> (JSON) quando você abre/fecha intervalo pelo painel.</p>
      `;
    }catch(ex){
      box.innerHTML = `<div class="badge dot danger">Erro ao carregar detalhes: ${ex.message||ex}</div>`;
    }
  }

  $('#prev').addEventListener('click', async ()=>{
    m -= 1; if (m<0){ m=11; y-=1; }
    await render();
  });
  $('#next').addEventListener('click', async ()=>{
    m += 1; if (m>11){ m=0; y+=1; }
    await render();
  });

  await render();
})();
