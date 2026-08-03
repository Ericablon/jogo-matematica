# Jogo de Matemática — versão atualizada

Jogo educativo em HTML, CSS e JavaScript, pronto para publicação no GitHub Pages e integração com um novo projeto Supabase.

## O que foi atualizado

- Painel do professor com a conta exata que o aluno errou.
- Exibição da resposta marcada, resposta correta, fase, operação, data e uso das dicas.
- Robô Professor nas dificuldades Fácil e Média, com orientação passo a passo.
- Explicação automática após uma resposta errada.
- Correção da montagem das contas de divisão no tutor.
- Registro detalhado de cada resposta nas novas tentativas.
- Acesso de professores por PIN armazenado como hash no banco.
- Sessões temporárias para professores e administrador.
- Bloqueio por 15 minutos após 5 tentativas inválidas de acesso.
- Tabelas protegidas por RLS e acessadas somente por funções controladas.
- Progresso local no navegador quando o Supabase ainda não estiver configurado.
- Mesclagem segura do progresso para evitar que uma gravação antiga apague tentativas recentes.

## Arquivos principais

- `index.html`: entrada do jogo.
- `app.js`: regras, telas, painel do professor e Robô Professor.
- `style.css`: aparência e responsividade.
- `supabase-config.js`: URL e chave pública do novo Supabase.
- `database/novo-supabase.sql`: estrutura completa do banco.
- `MIGRACAO.md`: passo a passo de configuração e publicação.

## Funcionamento sem banco

Enquanto `supabase-config.js` estiver com os textos `COLE_AQUI`, os alunos podem testar o jogo e o progresso fica somente no navegador atual. A área dos professores permanece bloqueada até o novo Supabase ser configurado.

## Segurança

Apenas a chave pública `anon` ou `publishable` deve ficar no GitHub. Nunca coloque a chave `service_role`, senha do banco ou qualquer chave secreta no repositório.
