# Deepontus / Ponto Batinga

Sistema web para controle de ponto, jornada, horas extras, pendências, calendário, financeiro e gestão de colaboradores do Batinga Cursos.

> Este repositório foi sanitizado para publicação pública no GitHub: as chaves reais do Supabase foram removidas.

## Funcionalidades

- Login de colaboradores por ID e senha.
- Registro de entrada, saída e intervalos.
- Painel do colaborador com horas do dia e pendências.
- Calendário de pontos e faltas por data.
- Área financeira para acompanhamento de valores e horas.
- Área administrativa para colaboradores, solicitações e financeiro.
- Cálculo de jornada, horas contratadas, horas extras e valores por modalidade.
- Suporte a avatar/foto de perfil do colaborador.

## Tecnologias

- HTML5, CSS3 e JavaScript puro.
- Supabase como banco/back-end.
- Supabase JS via CDN.
- BcryptJS via CDN para comparação/hash de senhas.

## Estrutura do projeto

```txt
.
├── admin/
│   ├── employees.html
│   ├── finance.html
│   └── requests.html
├── assets/
│   ├── css/
│   ├── img/
│   └── js/
│       ├── config.example.js
│       ├── config.js
│       ├── core.js
│       └── demais scripts da aplicação
├── migrations/
├── supabase/migrations/
├── calendar.html
├── dashboard.html
├── finance.html
├── index.html
├── login.html
└── profile.html
```

## Configuração do Supabase

O arquivo com as credenciais reais **não deve ser publicado** no GitHub.

Para rodar o projeto localmente ou em um ambiente privado:

1. Copie o arquivo de exemplo:

```bash
cp assets/js/config.example.js assets/js/config.js
```

2. Edite `assets/js/config.js` com os dados do seu projeto Supabase:

```js
window.DEEPONTUS_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_SUPABASE_ANON_KEY"
};
```

3. Nunca coloque `SERVICE_ROLE_KEY` ou chaves administrativas no front-end.

## Banco de dados

As migrations SQL estão nas pastas:

- `migrations/`
- `supabase/migrations/`

Aplique os arquivos SQL no Supabase seguindo a ordem numérica dos nomes. O arquivo mais recente do projeto é o `006_v10_database_connection_design_overtime.sql`.

## Como rodar localmente

Como o projeto é front-end estático, basta servir a pasta do projeto em um servidor local.

Exemplo com Python:

```bash
python -m http.server 8080
```

Depois acesse:

```txt
http://localhost:8080/login.html
```

Também é possível abrir com extensões como Live Server no VS Code.

## Publicação no GitHub

Antes de publicar:

1. Confira se `assets/js/config.js` não contém chaves reais.
2. Confira se arquivos `.env` não foram adicionados.
3. Rode uma busca por termos sensíveis:

```bash
grep -RniE "api_key|apikey|secret|token|service_role|SUPABASE_ANON_KEY|eyJ" .
```

4. Suba o projeto normalmente para o GitHub.

O `.gitignore` deste projeto já ignora `assets/js/config.js`, `.env`, builds, logs e arquivos de sistema/editor.

## Deploy

Este projeto pode ser publicado em hospedagens de site estático, como:

- GitHub Pages;
- Netlify;
- Vercel;
- Cloudflare Pages;
- qualquer servidor que sirva HTML, CSS e JavaScript.

Para um deploy público real, configure as regras de segurança do Supabase com atenção. A `anon key` pode ser usada no front-end, mas o acesso aos dados precisa estar protegido por RLS/policies adequadas no Supabase.

## Observações de segurança

- Não exponha chaves privadas no navegador.
- Não use `service_role` no JavaScript do front-end.
- Mantenha as políticas de acesso do Supabase revisadas.
- Troque/rotacione a chave que já apareceu em versões antigas antes de publicar o repositório.
- Se a chave antiga já foi compartilhada, gere uma nova no Supabase e atualize apenas no ambiente privado de produção.
