(async function(){
  const { $, api, Storage } = window.Deepontus;
  const form = $('#login-form');
  const err = $('#error');
  const btn = $('#btn-login');

  const existing = Storage.get();
  if (existing) { window.location.href = './dashboard.html'; return; }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    err.textContent='';
    btn.disabled=true;
    btn.classList.add('loading');
    try{
      const employee_id = $('#employee_id').value.trim();
      const password = $('#password').value;
      const res = await api.login({ employee_id, password });
      if (!res.success) { err.textContent = res.error || 'Falha no login.'; return; }
      Storage.set(res.user);

      // O cadastro CLT continua disponível em "Meu cadastro", mas não bloqueia mais o login
      // nem o acesso ao painel de ponto/admin.
      window.location.href = './dashboard.html';
    }catch(ex){
      err.textContent = ex.message || String(ex);
    }finally{
      btn.disabled=false;
      btn.classList.remove('loading');
    }
  });
})();
