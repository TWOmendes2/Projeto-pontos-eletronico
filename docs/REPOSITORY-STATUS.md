# Consolidação de repositórios

Canônico: https://github.com/TWOmendes2/Projeto-pontos-eletronico
Legacy: https://github.com/TWOmendes2/deepontus-employee-management-system

## Critério

A comparação dos snapshots encontrou sete arquivos exclusivos no canônico: exemplo
de configuração e migrações 004–006 nas duas pastas de migrations. O duplicado não
contém arquivos exclusivos; seis arquivos têm conteúdo idêntico e 22 divergem.
O canônico contém a evolução de jornada/horas extras e passa a receber melhorias.
Isso não significa equivalência funcional entre todos os arquivos divergentes.

## Migração

Novos clones e PRs devem usar o canônico. Implantações existentes permanecem como
estão até revisão das diferenças de UI, login, scripts e esquema. Compare a versão
implantada, faça backup e teste em homologação antes de reapontar qualquer ambiente.
Não execute migrations das duas pastas cegamente: há numeração duplicada. Confira
o histórico aplicado e planeje uma sequência única em mudança específica.

O repositório legacy preserva commits e código como evidência de evolução. Não foi
arquivado administrativamente e nenhum deploy, domínio ou banco foi alterado.

## Segurança antes de operação

Configuração local não é versionada. Apenas chave pública pode ir ao navegador;
service role nunca. Autenticação no cliente/localStorage não substitui autorização
no banco. Teste políticas RLS, RPCs e escopo de colaborador/administrador em um banco
descartável. Esta consolidação não certifica segurança do fluxo legado.
