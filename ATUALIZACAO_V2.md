# Atualização V2.0.0 — login, níveis de acesso, balanço e novo visual

## O que muda
- **Login e níveis:** Admin, Padrão e Novo. O admin cria os acessos (usuário, senha provisória, setor Cozinha/Salão e o que a pessoa pode fazer: pedir, receber compras, contar balanço). Senhas ficam criptografadas; no primeiro acesso a pessoa troca a senha provisória.
- **Pedido sem quantidade:** colaborador só marca o item. O admin vê o estoque e o status (Baixo / No limite / OK), define a quantidade e aprova. Cozinha só vê itens da Cozinha; Salão, só do Salão. A equipe nunca vê quantidades de estoque.
- **Compras:** lista "A comprar" e "A receber". Na conferência da entrega digita-se o que chegou (pediu 30, vieram 20 → "faltaram 10") e o estoque soma só o recebido.
- **Balanço:** o admin inicia, libera etapas (Cozinha · Ingredientes, Salão · Bebidas, Salão · Descartáveis), a equipe conta às cegas (sem ver o estoque do sistema), o admin confere as diferenças e fecha. Aviso "Balanço aberto" no início e no menu.
- **Menu lateral** (bolinha do perfil ou puxar da borda direita): Balanço, Equipe, Configurações, Sair.
- **Estoque mínimo por produto** editável pelo admin, com os selos automáticos.
- **Histórico** agora registra quem fez cada movimentação.

## Como atualizar (GitHub)
1. **Faça backup** de `instance/pedacinho.db` (no PythonAnywhere: aba Files).
2. Copie para o repositório, substituindo: `app.py`, `requirements.txt`, `templates/` (agora com `index.html` e `login.html`), `static/app.js`, `static/style.css`.
3. Adicione `static/img/cabecalho-logo.jpg`, `static/img/cabecalho-sertao.jpg` e a pasta `tests/`.
4. Não mexa em `static/manifest.json`, `static/icon.svg` e `static/img/icon-*.png`.
5. No `static/service-worker.js`, troque o nome/versão do cache (ex.: `v1` → `v2`) para os celulares baixarem os arquivos novos.
6. Commit sugerido: `feat: V2.0.0 login, níveis de acesso, pedidos com aprovação, entrega parcial e balanço`.

## Como colocar no ar (PythonAnywhere)
1. Faça `git pull` no console (ou suba os arquivos) e clique em **Reload** na aba Web.
2. O banco antigo é **migrado automaticamente** (produtos ganham "setor"; pedidos antigos continuam). Nada é apagado.
3. Abra o site: sem nenhum usuário, a tela de login mostra **"Primeiro acesso: crie o administrador"**. Crie o seu (Jacob/Débora). Depois entre em **Menu → Equipe** e crie os demais.
4. Opcional (recomendado): na aba Web, em *Environment variables*, defina `SECRET_KEY` com um texto longo e aleatório. Sem isso o app gera uma chave sozinho em `instance/secret_key`.

## Fotos dos produtos (opcional)
Coloque `static/img/produtos/<id do produto>.jpg`. Se não existir, aparece o ícone de caixa.

## Rodar local e testar
```
pip install -r requirements.txt
python app.py
python tests/test_api.py      # testa o fluxo completo da API
```

## Linha para o README (histórico de versões)
| **V2.0.0** | 21/10/2026 | `feat` | Login com níveis (Admin/Padrão/Novo), pedidos sem quantidade com aprovação do admin, conferência de entrega parcial, balanço por etapas com contagem às cegas, menu lateral e novo visual. |

## V2.0.1
- Saudação (Bom dia / Boa tarde / Boa noite) e data acompanham o relógio e se atualizam sozinhas; ao voltar para o app, o início recarrega os números.
- Admin pode **excluir colaborador** (Equipe → tocar na pessoa → Excluir colaborador). Apaga login e senha; quem estiver logado perde o acesso na hora. O nome continua só como texto no histórico antigo. Para quem pode voltar, use "Acesso ativo" (desativar).
- Arquivos que mudaram: `app.py` e `static/app.js`.

## V2.0.2
- **Observação por item** no pedido (opcional, até 100 caracteres): ao marcar um item, aparece um campo para marca, tipo ou urgência. A observação aparece para o admin na aprovação, na lista de compras e na conferência da entrega, e em "Meus pedidos". Não cria produto novo.
- Arquivos que mudaram: `app.py`, `static/app.js`, `static/style.css`.

## V2.0.3
- **Produto duplicado bloqueado:** ao cadastrar ou renomear, o app ignora maiúsculas, acento, pontuação e espaço extra ("Cerveja lata", "cerveja  LATA" e "Cerveja-lata" contam como o mesmo nome). "Cerveja lata · Heineken" continua sendo um produto diferente. Padrão de nome sugerido: Categoria · tipo · marca.
- **"Não achei o item"** (colaborador, no fim da lista de Novo pedido): escreve o que falta, e isso vira um **aviso para o admin**, sem criar produto nem mexer no estoque. Se o texto já bate com um produto da lista, o app avisa na hora.
- **Admin:** aviso amarelo no Início e aba **Pedidos → Sugestões**. Para cada aviso: **Cadastrar** (abre o cadastro já com o nome e o setor preenchidos), **Já existe** (escolhe o produto da lista) ou **Recusar**. O colaborador vê o resultado em Meus pedidos → "Itens que pedi para cadastrar".
- Arquivos que mudaram: `app.py`, `static/app.js` (a tabela nova `sugestoes` é criada sozinha no banco, sem perder nada).
