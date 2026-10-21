// Teste de fumaça do front: renderiza todas as telas com dados reais da API (sem navegador).
// Uso: PEDACINHO_DB=/tmp/x.db python3 -c "import app; app.app.run(port=5055)" &  node tests/smoke_front.js
const base = 'http://127.0.0.1:5055'; let cookie = '';
const realFetch = fetch;
globalThis.fetch = async (u, o = {}) => { const r = await realFetch(base + u, {...o, headers: {...(o.headers || {}), cookie}});
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; '); return r; };
const stub = () => ({innerHTML: '', textContent: '', className: '', value: '', style: {}, dataset: {}, scrollTop: 0, disabled: false,
  classList: {toggle() {}, add() {}, remove() {}, contains: () => false}, closest: () => null, matches: () => false});
const appEl = stub();
globalThis.window = globalThis; window.innerWidth = 400; globalThis.navigator = {}; globalThis.location = {href: ''};
globalThis.confirm = () => true; let abertas = []; globalThis.open = (u) => abertas.push(u);
globalThis.document = {getElementById: () => appEl, querySelector: (s) => (s === '#tela' ? null : stub()), querySelectorAll: () => [], addEventListener() {}};
const J = (u, m = 'POST', b = {}) => fetch(u, {method: m, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}).then((r) => r.json());
const falhas = [];
async function tela(rotulo, nome, p = {}) {
  try { await __T.ir(nome, p, {limpar: true}); const h = appEl.innerHTML;
    if (!h || /undefined|\[object|NaN/.test(h)) falhas.push(`${rotulo}: html suspeito (${(h.match(/.{0,40}(undefined|\[object|NaN).{0,40}/) || [''])[0]})`); else console.log('ok  ', rotulo, h.length);
  } catch (e) { falhas.push(`${rotulo}: ${e.stack}`); }
}
(async () => {
  require('../static/app.js'); await new Promise((r) => setTimeout(r, 300));
  await J('/api/setup', 'POST', {nome: 'Débora', usuario: 'debora', senha: '123456'});
  await J('/api/equipe', 'POST', {nome: 'João', usuario: 'joao', senha: 'abc123', setor: 'Cozinha', nivel: 'novo'});
  await J('/api/equipe', 'POST', {nome: 'Ana', usuario: 'ana', senha: 'abc123', setor: 'Salão', nivel: 'padrao', pode_receber: true, pode_contar: true});
  const T = __T; T.S.me = await fetch('/api/me').then((r) => r.json());
  for (const [r, n, p] of [['admin inicio', 'inicio'], ['estoque', 'estoque'], ['editar', 'editar', {id: 1}], ['novo produto', 'editar', {}], ['admin pedir', 'pedir'],
    ['pedidos', 'pedidos'], ['compras', 'compras'], ['balanço fechado', 'balanco'], ['equipe', 'equipe'], ['colab novo', 'colaborador', {}], ['colab edit', 'colaborador', {id: 2}], ['config', 'config'], ['relatórios 30', 'relatorios'], ['relatórios 7', 'relatorios', {sub: '7'}]]) await tela(r, n, p);
  // João pede, admin aprova
  const joao = {}; cookie = ''; await J('/api/login', 'POST', {usuario: 'joao', senha: 'abc123'}); await J('/api/senha', 'POST', {atual: 'abc123', nova: 'novasenha'});
  T.S.me = await fetch('/api/me').then((r) => r.json());
  await tela('staff inicio', 'inicio'); await tela('staff pedir', 'pedidos'); T.S.sel = {1: {q: '', o: 'x"y<z>'}}; T.render();
  { const h = appEl.innerHTML; if (!h.includes('class="obs"') || h.includes('<z>') || /undefined|\[object/.test(h)) falhas.push('observação: html inválido'); else console.log('ok   campo de observação (escapado)'); }
  await tela('staff sugerir', 'sugerir');
  await J('/api/sugestoes', 'POST', {texto: 'Cerveja long neck Heineken'});
  await tela('staff meus', 'meus');
  await J('/api/pedidos', 'POST', {itens: [{produto_id: 1, observacao: 'pode ser a marca X'}, {produto_id: 2}, {produto_id: 3}]});
  await tela('staff meus (com pedido)', 'meus'); await tela('staff config', 'config');
  // admin continua
  cookie = ''; await J('/api/login', 'POST', {usuario: 'debora', senha: '123456'}); T.S.me = await fetch('/api/me').then((r) => r.json());
  await tela('inicio com sugestão', 'inicio'); await tela('admin sugestões', 'pedidos', {sub: 'sug'});
  await tela('cadastrar da sugestão', 'editar', {nome: 'Cerveja long neck Heineken', setor: 'Cozinha', sugestao: 1});
  await tela('admin pedidos pendentes', 'pedidos'); T.S.pedido = T.S.d.pedidos[0]; await tela('aprovar', 'aprovar');
  const ids = T.S.pedido.itens.map((i) => i.id);
  await J(`/api/pedidos/${T.S.pedido.codigo}/aprovar`, 'POST', {itens: ids.map((id) => ({id, quantidade: 10}))});
  await J('/api/compras/comprar', 'POST', {ids});
  await tela('compras a comprar', 'compras', {sub: 'comprar'});
  T.S.d.compras = {a_comprar: [{id: 1, produto: 'Pão brioche', unidade: 'un', qtd: 30, observacao: 'Indaiá', solicitante: 'Lucas', produto_id: 1}], a_receber: []}; T.S.sel = {1: true};
  T.ACOES.whatsapp(); const msg = decodeURIComponent(abertas[0] || '');
  if (!msg.includes('• Pão brioche: 30 un (Indaiá)') || !msg.startsWith('https://wa.me/?text=')) falhas.push('whatsapp: ' + msg); else console.log('ok   texto do WhatsApp');
  await tela('compras a receber', 'compras', {sub: 'receber'}); T.S.sel = Object.fromEntries(ids.map((i) => [i, true]));
  T.S.entrega = T.S.d.compras.a_receber; await tela('entrega', 'entrega');
  await J('/api/balanco/iniciar', 'POST', {etapas: ['Cozinha · Ingredientes', 'Salão · Bebidas']});
  await tela('balanço aberto', 'balanco'); await tela('contagem', 'contagem');
  await J('/api/balanco/contagem', 'POST', {itens: [{produto_id: 1, quantidade: 4}, {produto_id: 2, quantidade: 8}]});
  await tela('conferir balanço', 'conferir'); await tela('inicio com balanço', 'inicio');
  console.log(falhas.length ? '\nFALHAS:\n' + falhas.join('\n') : '\nTodas as telas renderizaram sem erros.'); process.exit(falhas.length ? 1 : 0);
})();
