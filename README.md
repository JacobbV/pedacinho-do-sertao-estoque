# Pedacinho do Sertão — Controle de Estoque

> Aplicação web interna temática para gestão operacional de estoque, monitorização de níveis críticos de segurança e automação do ciclo de compras para restaurantes[cite: 3, 11].

---

## 📌 Visão Geral

O **Pedacinho do Sertão — Estoque** é uma solução monolítica compacta desenvolvida com **Python (Flask)** e **SQLite**, concebida com arquitetura *mobile-first* temática inspirada na identidade visual e nas cores do sertão nordestino[cite: 3, 11].

O projeto foi desenhado para substituir cadernos de anotações físicas e folhas soltas de contagem, oferecendo à equipa da cozinha e à administração um painel dinâmico em tempo real para:
- Monitorizar os produtos que atingiram a margem mínima de segurança.
- Acompanhar o fluxo completo de compras (da solicitação ao recebimento com entrada automática em stock)[cite: 2, 3].
- Manter um livro de registos auditável para todas as alterações físicas realizadas[cite: 2, 3].

---

## 📊 Histórico e Controle de Versões

| Versão | Data | Tipo | Descrição das Modificações |
| :---: | :---: | :---: | :--- |
| **V1.0.0** | 20/10/2026 | `chore` | Inicialização da estrutura de pastas, configuração do ambiente virtual `.venv`, criação do banco SQLite (`pedacinho.db`) e rotas base no Flask[cite: 2, 3, 12]. |
| **V1.2.0** | 20/10/2026 | `feat` | Implementação dos endpoints REST para leitura (`/api/produtos`, `/api/solicitacoes`, `/api/historico`) e escrita com registo de movimentos[cite: 2]. |
| **V1.4.0** | 20/10/2026 | `fix` | Correção da integração entre frontend e backend: remoção de dados fixos/estáticos e sincronização via chamadas assíncronas `fetch`[cite: 5, 6]. |
| **V1.6.0** | 20/10/2026 | `feat` | Adição de fluxo de compras com três estados (`Solicitada` ➔ `Comprada` ➔ `Recebida`) com acréscimo automático de quantidade no inventário[cite: 2]. |
| **V1.8.0** | 20/10/2026 | `ui/ux` | Redesenho completo da interface móvel: paleta terracota/areia, cabeçalho com gravura do sertão em SVG, navegação em 4 abas, badges de atenção e diálogo modal[cite: 18]. |

---

## 🚀 Funcionalidades do Sistema

### 1. Ecrã Inicial (Dashboard)
- **Indicadores Rápidos**: 3 cartões de resumo com contagem em tempo real de:
  - `itens baixos`: produtos cuja quantidade atual está menor ou igual ao limite de segurança[cite: 3, 6].
  - `solicitações`: pedidos abertos pela equipa a aguardar aprovação/compra[cite: 2, 3, 6].
  - `compras a receber`: pedidos já adquiridos a aguardar entrega e conferência[cite: 2, 3, 6].
- **Secção "Precisa de atenção"**: Lista dinâmica destacando com imagens reais, saldo atual e etiqueta visual (`! Baixo` ou `! No limite`) os produtos mais urgentes[cite: 18].
- **Ação Rápida**: Botão flutuante em destaque para abrir o diálogo de criação de pedido sem sair da vista principal[cite: 18].

### 2. Ecrã de Estoque & Contagem Física
- Listagem integral de todos os insumos cadastrados[cite: 2].
- **Campo de Pesquisa Instantânea**: Filtro por texto que busca tanto pelo nome do produto como pela sua categoria sem recarregar a página[cite: 6].
- **Ajuste Direto de Contagem**: Ao tocar em qualquer cartão de produto, abre-se uma caixa rápida de atualização para corrigir a contagem física real na prateleira[cite: 2, 6].

### 3. Gestão do Ciclo de Compras
O sistema implementa uma regra de negócio linear e segura para a reposição de insumos[cite: 2]:
1. **Abertura (`Solicitada`)**: A equipa seleciona o produto no modal, informa a quantidade e uma observação opcional[cite: 2, 6].
2. **Autorização / Aquisição (`Aprovada` / `Comprada`)**: A gerência marca o item como adquirido[cite: 2, 6].
3. **Recebimento (`Recebida`)**: Ao receber a encomenda, a equipa confere o volume entregue; o sistema dá baixa na solicitação e soma a quantidade diretamente ao saldo de estoque do produto[cite: 2, 6].

### 4. Auditoria e Rastreabilidade
- Todas as operações (alterações manuais de contagem, novas ordens de compra, mudanças de estado e receções) gravam um registo permanente na tabela `movimentos` com timestamp local[cite: 2].
- A aba de perfil exibe a lista cronológica das últimas 100 movimentações registadas para auditoria[cite: 2].

---

## 🛠️ Tecnologias e Bibliotecas

- **Linguagem**: Python 3.10+
- **Framework Web**: [Flask](https://palletsprojects.com/p/flask/)[cite: 3, 4]
- **Base de Dados**: SQLite3 nativo com integridade referencial ativa (`PRAGMA foreign_keys = ON`) e retorno em dicionários indexados (`sqlite3.Row`)[cite: 2]
- **Frontend**: HTML5 semântico, CSS3 moderno (Flexbox, Grid, CSS Variables) e JavaScript puro (Vanilla ES6 com Fetch API)[cite: 3, 5, 6, 9]
- **Tipografia**: Google Fonts (*Playfair Display* e *Plus Jakarta Sans*)
- **Ilustrações**: Elementos visuais e logótipo gerados em código vetorial SVG limpo
- **PWA (Progressive Web App)**: Manifesto de aplicação e Service Worker configurados para estrutura móvel offline[cite: 3, 7, 8]

---

## 📂 Arquitetura de Ficheiros

```text
pedacinho-do-sertao-estoque/
│
├── .gitignore               # Ignora .venv, pasta instance, caches __pycache__ e logs[cite: 1, 3]
├── app.py                   # Servidor Flask, rotas REST da API e regras de negócio[cite: 2]
├── README.md                # Documentação técnica e operacional completa do projeto
├── requirements.txt         # Dependências mínimas de execução (Flask)[cite: 4]
│
├── instance/
│   └── pedacinho.db         # Ficheiro SQLite criado e populado automaticamente em runtime[cite: 2, 3]
│
├── static/
│   ├── app.js               # Camada de requisições fetch, lógica do DOM e controle de abas[cite: 6]
│   ├── style.css            # Estilização visual temática sertaneja e moldura mobile[cite: 9]
│   ├── manifest.json        # Ficheiro de manifesto para instalação PWA móvel[cite: 7]
│   ├── service-worker.js    # Script de cache estático para funcionamento offline[cite: 8]
│   ├── icon.svg             # Ícone vetorial do aplicativo[cite: 3, 8]
│   └── img/
│       ├── logo-pedacinho.png  # Logomarca oficial do restaurante[cite: 3, 5]
│       ├── icon-192.png        # Ícone do PWA para ecrãs móveis (192x192)[cite: 7]
│       └── icon-512.png        # Ícone do PWA para ecrãs de alta densidade (512x512)[cite: 7]
│
└── templates/
    └── index.html           # Gabarito HTML principal com os 4 painéis de navegação[cite: 2, 5]