# Pedacinho do Sertão — Controle de Estoque

App interno de pedidos de compra e estoque do restaurante temático Pedacinho do Sertão. Usuários: ~3 pessoas (donos Márcio e Débora + equipe de Cozinha e Salão). Responda sempre em português do Brasil, em linguagem simples: o dono do projeto (Jacó) não é desenvolvedor profissional.

## Stack
- Back-end: Python 3 + Flask 3, tudo em `app.py` (rotas `/api/...`, regras e banco).
- Banco: SQLite (`instance/estoque.db`, variável `PEDACINHO_DB` para trocar). Sem ORM, usa `sqlite3.Row`.
- Front: página única em JavaScript puro (`static/app.js`, `static/style.css`, `templates/index.html`). Sem frameworks nem build.
- PWA: `static/manifest.json` e `static/service-worker.js` (arquivos do Jacó; confira antes de mexer).
- Hospedagem: PythonAnywhere gratuito (`ramesonjaco.pythonanywhere.com`), 1 processo web.

## Regras do negócio (não quebrar)
- Perfis: **admin** (donos), **padrao**, **novo**. Permissões individuais: `pode_pedir`, `pode_receber`, `pode_contar`. Setor: Cozinha ou Salão (admin vê "Todos").
- Colaborador pede item **sem quantidade** e **nunca vê quantidades de estoque**. O admin define a quantidade e aprova.
- Status do pedido: Solicitada → Aprovada → Comprada → Recebida (ou Recusada).
- Recebimento parcial: o estoque soma só `qtd_recebida`.
- Nome de produto duplicado é bloqueado por `chave_nome` (sem acento, minúsculas, sem símbolos). Existe o fluxo "Não achei o item" (tabela `sugestoes`).
- Balanço por etapas (Cozinha · Ingredientes, Salão · Bebidas, Salão · Descartáveis), contagem às cegas, conferência, recontagem e fechamento.
- Senha provisória força troca no primeiro acesso. Login bloqueia após 5 erros em 10 minutos.
- Toda movimentação é registrada em `movimentos` com o usuário.
- Números passam por `numero()` (rejeita nan, inf e valores acima de 1.000.000). Use sempre essa função.
- Limites de texto: produto 80, categoria 40, unidade 12, nome de colaborador 60.

## Como rodar e testar
```
pip install -r requirements.txt
python app.py                      # http://127.0.0.1:5000

python tests/test_api.py           # fluxos principais
python tests/test_seguranca.py     # permissões, entradas inválidas, força bruta, fotos
python tests/test_carga.py         # 1.500 produtos, 10 pessoas ao mesmo tempo
```
Rode os três testes **antes e depois** de cada mudança no `app.py`. Os testes usam banco temporário e não tocam nos dados reais. `tests/smoke_front.js` exige o servidor rodando na porta 5055.

## Versionamento
- Versão atual: **V2.1.2**. Ao mudar, atualize a versão em `app.py` (docstring), `static/app.js` (linha 2 e rodapé do menu), `ATUALIZACAO_V2.md` (nova seção no topo da lista) e na tabela do `README.md`.
- Mensagens de commit curtas, em português, começando pela versão. Ex.: `V2.1.3 - importar produtos por planilha`.

## Deploy (feito pelo Jacó, não por você)
1. `git add .` → `git commit -m "..."` → `git push`
2. No PythonAnywhere (console Bash na pasta do projeto): `git pull`
3. Aba **Web** → **Reload**
Você não acessa o PythonAnywhere. Ao terminar uma mudança, diga ao Jacó exatamente esses passos.

## Cuidados
- Nunca envie ao Git: `instance/` (banco, fotos, backups, `secret_key`) e `.venv/`. Confira o `.gitignore`.
- Não apague nem reescreva `instance/estoque.db`. Mudanças no banco devem ser **migrações compatíveis** (ver `adicionar_coluna` e `CREATE ... IF NOT EXISTS` em `preparar_banco`).
- Não commit nem push sem o Jacó pedir.
- Hospedagem gratuita: o site expira todo mês e precisa de um clique em "Run until 1 month from today" (feito pelo Jacó por volta do dia 20). Backups: admin baixa o .zip em Configurações toda semana.

## Próximas ideias (em ordem)
1. Importar produtos por planilha (CSV/Excel), respeitando duplicados.
2. Fornecedores e lista de compras por fornecedor (WhatsApp).
3. Aviso no app quando passar de 7 dias sem backup baixado.
4. Histórico com filtros; exportar relatórios em PDF/CSV.
5. Preço pago por compra; categorias editáveis; pedido offline.
