# Configuração do novo banco gratuito

O arquivo enviado como banco, `ctnylpmumkbhuyctehtc.storage (1).zip`, está vazio: possui apenas a estrutura de um ZIP e não contém tabelas, registros nem arquivos do Storage. Por isso, a estrutura abaixo foi reconstruída a partir do código do jogo.

## 1. Criar o projeto

Crie um projeto novo no Supabase. Anote a senha do banco em local seguro; ela não será colocada no código do jogo.

## 2. Preparar o SQL

Abra `database/novo-supabase.sql` e procure por:

```text
PIN_ADMIN_AQUI
```

Troque esse texto por um PIN numérico de 4 dígitos escolhido por você. Não publique esse PIN em prints ou mensagens.

Exemplo apenas de formato:

```sql
extensions.crypt('1234', extensions.gen_salt('bf'))
```

Depois, no Supabase, abra o **SQL Editor**, cole o conteúdo completo do arquivo e execute.

## 3. Configurar o jogo

No painel do Supabase, copie:

- Project URL
- chave pública `anon` ou `publishable`

Edite `supabase-config.js`:

```js
const SUPABASE_URL = "SUA_PROJECT_URL";
const SUPABASE_ANON_KEY = "SUA_CHAVE_PUBLICA";
```

Não use a chave `service_role`.

## 4. Publicar no GitHub

Substitua no repositório antigo os arquivos:

- `.nojekyll`
- `index.html`
- `style.css`
- `app.js`
- `supabase-config.js`

Mantenha também a pasta `database` como documentação técnica. Faça o commit e publique pelo GitHub Pages.

## 5. Primeiro acesso administrativo

Na tela inicial:

1. Digite `ERIC ABLON DOS SANTOS CERQUEIRA`.
2. Marque **Sou professor**.
3. Informe o PIN administrativo escolhido no SQL.
4. Entre no Painel admin.
5. Cadastre os demais professores, cada um com seu próprio PIN de 4 dígitos.

## 6. Teste recomendado

1. Entre como aluno usando um nome completo.
2. Abra uma fase Fácil ou Média.
3. Use algumas dicas do Robô Professor.
4. Erre uma questão de propósito e conclua ou encerre a tentativa ao perder as vidas.
5. Entre como professor.
6. Clique em **Ver onde errou** no aluno testado.
7. Confira a conta, a resposta marcada, a correta e o uso das dicas.

## Dados antigos

Caso o projeto antigo volte a abrir, exporte a tabela `math_students`. Os campos antigos `id`, `full_name` e `progress` podem ser reaproveitados. Tentativas antigas continuarão exibindo apenas totais, pois o código anterior não armazenava cada pergunta respondida.

Professores antigos devem ser cadastrados novamente, porque a nova versão não aceita PIN salvo em texto simples.

## Trocar o PIN administrativo depois

Execute no SQL Editor, trocando o exemplo pelo novo PIN:

```sql
update public.math_app_config
set value_hash = extensions.crypt('NOVO_PIN', extensions.gen_salt('bf')),
    updated_at = now()
where key = 'admin_pin';
```
