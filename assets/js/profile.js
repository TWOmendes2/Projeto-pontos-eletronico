/* Meu cadastro (CLT) — wizard */
(async function(){
  const { $, api, requireAuth, renderShell, Icons } = window.Deepontus;
  const user = requireAuth();
  if (!user) return;

  // Supabase client local (para upload de foto no Storage)
  const cfg = window.DEEPONTUS_CONFIG;
  const sb = (cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY)
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  async function uploadAvatarIfAny(file){
    if (!file) return null;
    if (!sb) throw new Error('Config Supabase ausente para upload.');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const safeExt = ['jpg','jpeg','png','webp'].includes(ext) ? ext : 'jpg';
    const path = `employees/${user.employee_id}/avatar.${safeExt}`;
    const bucket = 'employee-photos';

    const { error: upErr } = await sb.storage
      .from(bucket)
      .upload(path, file, { upsert:true, cacheControl:'3600', contentType:file.type || `image/${safeExt}` });

    if (upErr) {
      // mensagem amigável para bucket inexistente/permissão
      throw new Error(`Não foi possível enviar a foto. Verifique se existe o bucket "${bucket}" no Supabase Storage e se o usuário tem permissão. Detalhe: ${upErr.message}`);
    }

    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  const isAdmin = user.role === 'admin';
  renderShell({
    active: 'profile',
    title: 'Meu cadastro',
    subtitle: 'Dados do colaborador para o RH.',
    user,
    isAdmin
  });

  const page = document.querySelector('#page');

  // Campos (a tabela employee_profiles precisa ter essas colunas — ver /migrations/003_employee_profiles_more_fields.sql)
  const sections = [
    {
      id:'pessoais',
      title:'Dados pessoais',
      requiredKeys:['full_name','cpf','birth_date','email'],
      fields:[
        { key:'full_name', label:'Nome completo*', ph:'Ex: Pedro Matheus' },
        { key:'cpf', label:'CPF*', ph:'Ex: 123.456.789-01' },
        { key:'birth_date', label:'Data de nascimento*', type:'date' },
        { key:'email', label:'E-mail*', type:'email', ph:'Ex: pedro@email.com' },
        { key:'mother_name', label:'Nome da mãe', ph:'Ex: Maria da Silva' },
        { key:'marital_status', label:'Estado civil', ph:'Ex: Solteiro(a)' },
        { key:'nationality', label:'Nacionalidade', ph:'Ex: Brasileira' },
        { key:'naturality', label:'Naturalidade', ph:'Ex: Maceió/AL' },
      ]
    },
    {
      id:'documentos',
      title:'Documentos',
      requiredKeys:['rg','pis_pasep','ctps_number'],
      fields:[
        { key:'rg', label:'RG*', ph:'Ex: 1234567' },
        { key:'rg_uf', label:'UF (RG)', ph:'Ex: AL' },
        { key:'pis_pasep', label:'PIS/PASEP*', ph:'Ex: 123.45678.90-1' },
        { key:'ctps_number', label:'CTPS (nº)*', ph:'Ex: 123456' },
        { key:'ctps_series', label:'CTPS (série)', ph:'Ex: 0001' },
      ]
    },
    {
      id:'contato',
      title:'Contato',
      requiredKeys:['phone'],
      fields:[
        { key:'phone', label:'WhatsApp*', ph:'Ex: (82) 99999-8888' },
        { key:'emergency_name', label:'Contato de emergência', ph:'Ex: João (pai)' },
        { key:'emergency_phone', label:'Telefone emergência', ph:'Ex: (82) 9xxxx-xxxx' },
      ]
    },
    {
      id:'endereco',
      title:'Endereço residencial',
      requiredKeys:['address_street','address_number','address_neighborhood','address_city','address_state','address_zip'],
      fields:[
        { key:'address_zip', label:'CEP*', ph:'Ex: 57038-000' },
        { key:'address_street', label:'Rua/Av.*', ph:'Ex: Av. Comendador Gustavo Paiva' },
        { key:'address_number', label:'Número*', ph:'Ex: 2789' },
        { key:'address_complement', label:'Complemento', ph:'Apto, bloco...' },
        { key:'address_neighborhood', label:'Bairro*', ph:'Ex: Mangabeiras' },
        { key:'address_city', label:'Cidade*', ph:'Ex: Maceió' },
        { key:'address_state', label:'UF*', ph:'Ex: AL' },
      ]
    },
    {
      id:'foto',
      title:'Foto do perfil',
      requiredKeys:[],
      fields:[
        { key:'avatar_url', label:'URL da foto', ph:'Cole o link da sua foto (jpg/png)' },
      ]
    }
  ];

  const requiredAll = Array.from(new Set(sections.flatMap(s=>s.requiredKeys)));

  let state = {
    missingTable:false,
    profile:null,
    active:'pessoais',
  };

  function escapeHtml(s){
    return String(s||'')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function pctComplete(p){
    const ok = requiredAll.filter(k => String(p?.[k]||'').trim().length>0).length;
    return Math.round((ok/requiredAll.length)*100);
  }

  function missingKeys(p){
    return requiredAll.filter(k => !String(p?.[k]||'').trim());
  }

  function render(){
    const p = state.profile || {};
    const percent = pctComplete(p);
    const miss = missingKeys(p);

    const nav = sections.map(s=>{
      return `
        <button class="tablink ${state.active===s.id?'active':''}" data-sec="${s.id}" type="button">
          ${s.title}
        </button>
      `;
    }).join('');

    const active = sections.find(s=>s.id===state.active) || sections[0];

    page.innerHTML = `
      <div class="card paper" style="background:#fff;color:var(--paper-text);border-color:rgba(17,17,19,.12)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-weight:900;font-size:1.1rem">Meu cadastro (CLT)</div>
            <div class="help" style="margin-top:6px">Preencha com atenção. Campos com * são obrigatórios.</div>
          </div>
          <div class="badge" style="background:rgba(17,17,19,.04);border-color:rgba(17,17,19,.10);color:rgba(17,17,19,.75)">${percent}% completo</div>
        </div>

        ${state.missingTable ? `<div style="margin-top:12px" class="badge dot warning">Atenção: tabela <b>employee_profiles</b> não existe no banco. Rode as migrations.</div>`:''}
        ${(!isAdmin && miss.length) ? `<div style="margin-top:12px" class="badge dot danger">Cadastro incompleto — faltam <b>${miss.length}</b> campos obrigatórios. Finalize quando puder para manter seu cadastro em dia.</div>`:''}

        <div class="tabs-underline" style="margin-top:14px">${nav}</div>

        <div style="margin-top:14px">
          <div style="font-weight:900;font-size:1.02rem">${active.title}</div>
        </div>

        <form id="profile-form" style="margin-top:10px">
          ${active.id==='foto' ? `
            <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
              <div class="avatar" style="width:88px;height:88px;border-radius:26px;background:rgba(17,17,19,.06);border-color:rgba(17,17,19,.14)">
                ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt=""/>` : (user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt=""/>` : 'Foto')}
              </div>
              <div style="flex:1;min-width:240px">
                <div class="help" style="color:rgba(17,17,19,.60)">Envie uma foto (JPG/PNG). Ela será salva e usada no seu perfil.</div>
                <div class="field" style="margin-top:10px;max-width:420px">
                  <label>Enviar foto</label>
                  <input name="photo_file" type="file" accept="image/*" />
                </div>
                </div>
            </div>
          ` : `
            <div class="grid cols-2" style="gap:12px">
              ${active.fields.map(f=>`
                <div class="field" style="margin-top:0">
                  <label>${f.label}</label>
                  <input ${f.type?`type=\"${f.type}\"`:''} name="${f.key}" placeholder="${f.ph||''}" value="${escapeHtml(p[f.key])}"/>
                </div>
              `).join('')}
            </div>
          `}

          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
            <button class="btn" type="button" id="btn-prev">Anterior</button>
            <button class="btn primary" type="submit" id="btn-save">Salvar</button>
            <button class="btn" type="button" id="btn-next">Próximo</button>
          </div>
          <div class="help" style="margin-top:10px;color:rgba(17,17,19,.60)">* Campos obrigatórios.</div>
          <div id="msg" class="help" style="margin-top:6px;color:rgba(17,17,19,.60)"></div>
        </form>
      </div>
    `;

    page.querySelectorAll('button[data-sec]').forEach(b=>{
      b.addEventListener('click', ()=>{ const y=window.scrollY; state.active = b.getAttribute('data-sec'); render(); requestAnimationFrame(()=>{ window.scrollTo(0,y); document.querySelector(`[data-sec="${state.active}"]`)?.scrollIntoView({block:'nearest',inline:'center'}); }); });
    });

    $('#btn-prev')?.addEventListener('click', ()=>{
      const idx = sections.findIndex(s=>s.id===state.active);
      state.active = sections[Math.max(0, idx-1)].id;
      render();
    });
    $('#btn-next')?.addEventListener('click', ()=>{
      const idx = sections.findIndex(s=>s.id===state.active);
      state.active = sections[Math.min(sections.length-1, idx+1)].id;
      render();
    });

    $('#profile-form')?.addEventListener('submit', onSave);
  }

  async function load(){
    try{
      const res = await api.getEmployeeProfile(user.employee_id);
      state.missingTable = !!res.missingTable;
      state.profile = res.profile || { employee_id: user.employee_id };
    }catch(_){
      state.profile = { employee_id: user.employee_id };
    }
    render();
  }

  async function onSave(e){
    e.preventDefault();
    const msg = $('#msg');
    const btn = $('#btn-save');
    msg.textContent = '';
    btn.disabled = true;

    try{
      if (state.missingTable){
        msg.textContent = 'O banco ainda não tem a tabela de perfis/colunas necessárias. Rode as migrations.';
        msg.style.color = '#b45309';
        return;
      }

      const payload = { employee_id: user.employee_id };
      // preserva o que já existe
      Object.assign(payload, state.profile || {});

      const active = sections.find(s=>s.id===state.active) || sections[0];
      for (const f of active.fields){
        payload[f.key] = (e.target.elements[f.key]?.value || '').trim();
      }      // Foto: upload (arquivo)
      if (active.id==='foto'){
        const file = e.target.elements.photo_file?.files?.[0] || null;
        if (file){
          const avatarUrl = await uploadAvatarIfAny(file);
          if (avatarUrl){
            payload.avatar_url = avatarUrl;
            // salva no employees.avatar_url para refletir no menu/admin
            try{
              await window.Deepontus.api.updateEmployeeAvatar(user.employee_id, avatarUrl);
              user.avatar_url = avatarUrl;
              window.Deepontus.Storage.set(user);
            }catch(_){/* não bloqueia */}
          }
        }
      }

      // valida obrigatórios globais
      const miss = missingKeys(payload);
      if (!isAdmin && miss.length){
        msg.textContent = `Ainda faltam ${miss.length} campos obrigatórios. Você pode salvar aos poucos e concluir depois.`;
        msg.style.color = '#b45309';
      }

      const saved = await api.upsertEmployeeProfile(payload);
      state.profile = saved;
      msg.textContent = 'Cadastro salvo com sucesso.';
      msg.style.color = '#166534';

    }catch(ex){
      msg.textContent = ex.message || String(ex);
      msg.style.color = '#b91c1c';
    }finally{
      btn.disabled = false;
    }
  }

  await load();
})();
