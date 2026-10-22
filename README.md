# Pedacinho do Sertão — Controle de Estoque

Sistema interno de estoque e pedidos de compra do restaurante temático **Pedacinho do Sertão**. Funciona no celular como um aplicativo (PWA) e foi pensado para poucas pessoas: os donos (admins) e a equipe de cozinha e salão.

**Versão atual: V2.1.2** · Online em <https://ramesonjaco.pythonanywhere.com/>

## Visão geral

- A equipe **marca o que está acabando**, sem digitar quantidade e sem ver o estoque.
- O admin vê o estoque, define a quantidade, **aprova** e acompanha a compra até a entrega.
- No recebimento, confere o que chegou (pediu 30, vieram 20 → faltaram 10) e o estoque soma só o recebido.
- O **balanço** é feito por etapas, com contagem às cegas e conferência das diferenças.

## Perfis e permissões

| Perfil | O que faz |
|---|---|
| **Admin** (donos) | Tudo: estoque, aprovar pedidos, compras, balanço, equipe, relatórios, backups, configurações |
| **Padrão** | Pede itens; pode receber compras e contar balanço conforme liberado pelo admin |
| **Novo** | Só pede itens (sem ver quantidades) |

Cada colaborador também tem as permissões individuais **pode pedir**, **pode receber** e **pode contar**, e um setor (**Cozinha** ou **Salão**) que limita os itens que enxerga. A senha provisória criada pelo admin é trocada no primeiro acesso.

## Funcionalidades

- Login com senhas criptografadas e bloqueio contra tentativas em excesso (5 erros em 10 minutos).
- Estoque com selos automáticos (Baixo / No limite / OK), mínimo e quantidade desejada por produto.
- Foto do produto (JPEG reduzido no próprio celular; só quem está logado vê).
- Pedidos: Solicitada → Aprovada → Comprada → Recebida (ou Recusada), com observação por item.
- Entrega parcial: o estoque soma só o que chegou.
- Bloqueio de produtos duplicados (ignora acento, maiúscula e símbolos) e botão **"Não achei o item"**, que envia sugestão para o admin.
- Lista de compras pronta para enviar pelo **WhatsApp**.
- Balanço por etapas (Cozinha · Ingredientes, Salão · Bebidas, Salão · Descartáveis): contagem às cegas, conferência, recontagem e fechamento, com lembrete de prazo.
- Histórico de movimentações com o nome de quem fez cada uma.
- Relatórios: mais pedidos, entregas com falta, diferenças de balanço e cobertura estimada.
- Backup automático diário (mantém os últimos 21) e download em .zip do banco e das fotos.
- Menu lateral e saudação por horário (bom dia, boa tarde, boa noite).

## Histórico de versões

| Versão | Tipo | Data | Descrição |
|---|---|---|---|
| V1.0.0 | chore | 20/10/2026 | Estrutura inicial do projeto |
| V1.2.0 | feat | 20/10/2026 | Cadastro de estoque e pedidos |
| V1.4.0 | fix | 20/10/2026 | Correções de cálculo e telas |
| V1.6.0 | feat | 20/10/2026 | Compras e histórico |
| V1.8.0 | ui/ux | 20/10/2026 | Novo visual |
| V2.0.0 | feat | 21/10/2026 | Login, níveis de acesso, pedido sem quantidade, aprovação, recebimento e balanço |
| V2.0.x | fix | 21/10/2026 | Ajustes de menu, saudação, exclusão de colaborador e instalação |
| V2.1.0 | feat | 22/10/2026 | Duplicados, "Não achei o item", observação por item, fotos, backups, relatórios e WhatsApp |
| V2.1.1 | fix | 22/10/2026 | Ajustes de layout e textos |
| V2.1.2 | fix | 22/10/2026 | Ícones, validação de números e tamanhos, índices no banco e testes de segurança e carga |

Os detalhes de cada atualização estão em `ATUALIZACAO_V2.md`.

## Tecnologias

- **Back-end:** Python 3 + Flask 3
- **Banco de dados:** SQLite (arquivo único)
- **Front-end:** HTML, CSS e JavaScript puro (sem frameworks), em página única
- **Hospedagem:** PythonAnywhere
- **Fontes:** Playfair Display e Plus Jakarta Sans

## Arquitetura de arquivos

```
├── app.py                  # Servidor Flask: rotas, regras e banco
├── requirements.txt
├── ATUALIZACAO_V2.md       # Notas de cada atualização
├── templates/
│   ├── index.html          # Aplicativo
│   └── login.html
├── static/
│   ├── app.js              # Telas e lógica do front
│   ├── style.css
│   ├── icon.svg
│   ├── manifest.json       # PWA
│   ├── service-worker.js
│   └── img/                # Logo, cabeçalho e ícones 192/512
├── tests/
│   ├── test_api.py         # Fluxos principais
│   ├── test_seguranca.py   # Permissões, entradas inválidas, força bruta, fotos
│   ├── test_carga.py       # Estoque grande e uso simultâneo
│   └── smoke_front.js      # Renderiza todas as telas
└── instance/               # Criada sozinha; NÃO vai para o Git
    ├── estoque.db          # Banco de dados
    ├── fotos/
    ├── backups/
    └── secret_key
```

Coloque `instance/` e `__pycache__/` no `.gitignore` para nunca enviar o banco, as fotos nem a chave ao GitHub.

## Rodar no computador

```bash
pip install -r requirements.txt
python app.py
```

Abra `http://127.0.0.1:5000`. No primeiro acesso o sistema pede a criação do administrador.

## Atualizar o site (PythonAnywhere)

1. Substitua os arquivos no projeto local.
2. `git add .` → `git commit -m "mensagem"` → `git push`
3. No PythonAnywhere, abra um console Bash na pasta do projeto e rode `git pull`.
4. Na aba **Web**, clique em **Reload**.

Recomendado: na aba **Web**, defina a variável de ambiente `SECRET_KEY` com um texto longo e aleatório. Sem ela, o app gera uma chave em `instance/secret_key`.

## Backup e restauração

- O app guarda um backup por dia em `instance/backups` (variável `BACKUP_MANTER`, padrão 21).
- Em **Configurações**, o admin baixa um .zip com o banco e as fotos. **Baixe uma cópia por semana**: os backups automáticos ficam no mesmo disco do site.
- Para restaurar: pare o site, substitua `instance/estoque.db` (e `instance/fotos`) pelo conteúdo do .zip e dê Reload.

## Testes

```bash
python tests/test_api.py
python tests/test_seguranca.py
python tests/test_carga.py
```

O teste de carga cria 1.500 produtos, 20 mil pedidos e 40 mil movimentos, e simula 10 pessoas usando ao mesmo tempo. Os testes usam um banco temporário e nunca tocam nos seus dados.

## Limites da hospedagem gratuita (PythonAnywhere)

- 512 MiB de disco e 1 aplicativo web com 1 processo.
- Os 100 segundos de CPU por dia valem para consoles e tarefas agendadas, não para as visitas ao site.
- O site gratuito **expira após 1 mês sem confirmação**: entre na aba **Web** e clique em estender.
- Acesso externo à internet restrito (o app não precisa dele; o WhatsApp abre no celular).

Para 3 pessoas e algumas centenas de produtos, o plano gratuito atende.

## Próximos passos

- Importar produtos por planilha (CSV).
- Cadastro de fornecedores e lista de compra separada por fornecedor.
- Alerta de estoque baixo pelo WhatsApp.
- Exportar relatórios em PDF e CSV.
- Histórico com filtros (por produto, pessoa e período).
- Registro de preço pago e variação de custo.
- Gerenciar categorias pelo app.
- Modo offline para pedidos sem sinal.
