'use strict';
/* Pedacinho do Sertão — app V2 (JavaScript puro) — V2.0.3 */
const app = document.getElementById('app');
const S = {me: null, tela: 'inicio', p: {}, sub: null, pilha: [], d: {}, bal: false, form: null, sel: {}, filtro: null, q: ''};
const TELAS = {};
const IC = {
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  box: '<path d="M12 3l8 4v10l-8 4-8-4V7z M4 7l8 4 8-4 M12 11v10"/>',
  list: '<path d="M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4"/>',
  truck: '<path d="M2 6h11v10H2z M13 9h4l3 3v4h-7 M7 19a1.5 1.5 0 1 0 .01 0 M17 19a1.5 1.5 0 1 0 .01 0"/>',
  bal: '<path d="M6 3h12v18H6z M9 12l2 2 4-4"/>',
  eq: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6 M16 5a3 3 0 0 1 0 6 M18 14c2 .8 3 3 3 6"/>',
  cfg: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1"/>',
  out: '<path d="M10 4H5v16h5 M14 8l4 4-4 4 M18 12H9"/>',
};

/* ---------- utilidades ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = (n) => (Math.round(Number(n) * 100) / 100).toLocaleString('pt-BR', {useGrouping: false, maximumFractionDigits: 2});
const un = (q, u) => `${fmt(q)} ${esc(u)}`;
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const data = (s) => { const m = String(s || '').match(/(\d+)-(\d+)-(\d+)[ T](\d+):(\d+)/); return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : (s || ''); };
const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${IC[n]}</svg>`;
const adm = () => S.me.nivel === 'admin';
const hoje = () => new Date().toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'});
const saud = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const selo = (k, t) => `<span class="selo ${k}"><i>${k === 'ok' ? '✓' : k === 'adm' ? '★' : '!'}</i>${t}</span>`;
const seloEst = (s) => selo(s, {baixo: 'Baixo', limite: 'No limite', ok: 'OK'}[s]);
const seloPed = (st) => ({Solicitada: selo('limite', 'Aguardando'), Aprovada: selo('ok', 'Aprovado'), Comprada: selo('ok', 'Comprado'),
  Recebida: selo('ok', 'Recebido'), Recusada: selo('baixo', 'Recusado')}[st] || esc(st));
const seloNivel = (u) => !u.ativo ? selo('baixo', 'Inativo') : u.nivel === 'admin' ? selo('adm', 'Admin') : u.nivel === 'padrao' ? selo('ok', 'Padrão') : selo('limite', 'Novo');
const thumb = (id) => `<span class="thumb"><img src="/static/img/produtos/${id}.jpg" alt="" onerror="this.remove()">${ic('box')}</span>`;
const vazio = (t) => `<div class="vazio">${t}</div>`;
const chip = (t, on, a, extra = '') => `<button class="chip ${on ? 'on' : ''}" data-a="${a}" ${extra}>${esc(t)}</button>`;
const sw = (on, a, extra = '') => `<button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" data-a="${a}" ${extra}></button>`;
const btn = (t, a, cls = '', extra = '') => `<button class="btn ${cls}" data-a="${a}" ${extra}>${t}</button>`;
const campo = (rot, id, v = '', extra = '') => `<label>${rot}<input id="${id}" value="${esc(v)}" ${extra}></label>`;

let tt;
function toast(msg, erro) {
  const t = $('#toast'); t.textContent = msg; t.className = 'mostra' + (erro ? ' erro' : '');
  clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, 2800);
}

async function api(url, metodo = 'GET', corpo) {
  const r = await fetch(url, {method: metodo, headers: corpo ? {'Content-Type': 'application/json'} : {}, body: corpo ? JSON.stringify(corpo) : undefined});
  let d = {}; try { d = await r.json(); } catch (e) { /* sem corpo */ }
  if (r.status === 401) { location.href = '/login'; throw new Error('Sessão expirada.'); }
  if (r.status === 403 && d.trocar_senha) { S.me.trocar_senha = true; ir('trocar', {}, {limpar: true}); throw new Error(d.erro); }
  if (!r.ok) { const e = new Error(d.erro || 'Algo deu errado. Tente de novo.'); e.dados = d; e.status = r.status; throw e; }
  return d;
}
async function tente(fn) { try { return await fn(); } catch (e) { if (e.message) toast(e.message, true); return null; } }

/* ---------- navegação ---------- */
async function ir(tela, p = {}, opc = {}) {
  if (tela === 'pedidos' && !adm()) tela = 'pedir';
  if (opc.limpar) S.pilha = [];
  else if (!opc.trocar && S.tela && S.tela !== tela) S.pilha.push({tela: S.tela, p: S.p, sub: S.sub});
  if (opc.raiz) S.pilha = [];
  S.tela = tela; S.p = p; S.sub = p.sub ?? (opc.mantemSub ? S.sub : null);
  S.menu = false;
  if (TELAS[tela].entrar) TELAS[tela].entrar();
  try { if (TELAS[tela].load) await TELAS[tela].load(); } catch (e) { if (e.message) toast(e.message, true); }
  render();
}
function voltar() {
  const a = S.pilha.pop();
  if (!a) return ir('inicio', {}, {raiz: true});
  S.tela = a.tela; S.p = a.p; S.sub = a.sub;
  const f = TELAS[a.tela].load; (f ? f() : Promise.resolve()).catch(() => {}).then(render);
}
async function atualizar() { try { if (TELAS[S.tela].load) await TELAS[S.tela].load(); } catch (e) { /* ignora */ } render(); }

/* ---------- estrutura comum ---------- */
function cab({titulo, sub, voltar: v, home}) {
  const av = `<button class="avatar" data-a="menu" aria-label="Abrir menu">${esc((S.me.nome || '?')[0].toUpperCase())}</button>`;
  if (home) {
    return `<div class="cab home"><img class="sertao" src="/static/img/cabecalho-sertao.jpg" alt=""><img class="logo" src="/static/img/cabecalho-logo.jpg" alt="Pedacinho do Sertão">${av}
      <div class="titulo"><h1 id="saud-t">${saud()}, ${esc(S.me.nome.split(' ')[0])}</h1><div class="muted" id="data-t">${hoje()}</div></div></div>`;
  }
  return `<div class="cab">${v ? '<button class="voltar" data-a="voltar" aria-label="Voltar">‹</button>' : '<img class="logo" src="/static/img/cabecalho-logo.jpg" alt="Pedacinho do Sertão">'}${av}
    <div class="titulo"><h1>${esc(titulo)}</h1><div class="pequeno">${esc(sub || '')}</div></div></div><div class="regua"></div>`;
}
function abas(ativa) {
  const l = adm() ? [['inicio', 'Início', 'home'], ['estoque', 'Estoque', 'box'], ['pedidos', 'Pedidos', 'list'], ['compras', 'Compras', 'truck']]
    : [['inicio', 'Início', 'home'], ['pedidos', 'Pedidos', 'list']];
  return `<nav class="tabs">${l.map(([id, t, i]) => `<button data-a="ir" data-t="${id}" class="${ativa === id ? 'on' : ''}">${ic(i)}${t}</button>`).join('')}</nav>`;
}
function gaveta() {
  const m = S.me, atual = S.tela;
  const it = (t, ico, tela, extra = '', on) => `<button data-a="ir" data-t="${tela}" class="${(on ?? atual === tela) ? 'on' : ''}">${ic(ico)}<span style="flex:1">${t}</span>${extra}</button>`;
  let n = `<div class="rot">MENU</div>${it('Início', 'home', 'inicio')}`;
  if (adm()) n += it('Estoque', 'box', 'estoque') + it('Pedidos', 'list', 'pedidos') + it('Compras', 'truck', 'compras')
    + `<div class="rot">GESTÃO</div>${it('Balanço', 'bal', 'balanco', S.bal ? selo('ok', 'Aberto') : '')}${it('Equipe', 'eq', 'equipe')}`;
  else {
    n += it('Pedidos', 'list', 'pedir');
    if (m.pode_contar) n += it('Contar estoque', 'bal', 'contagem', S.bal ? selo('ok', 'Aberto') : '');
    if (m.pode_receber) n += it('Receber compras', 'truck', 'compras');
  }
  n += `<div class="rot">CONTA</div>${it('Configurações', 'cfg', 'config')}`;
  return `<div class="veu" data-a="menu"></div><aside class="gaveta" aria-label="Menu">
    <div class="perfil"><div class="av">${esc(m.nome[0].toUpperCase())}</div><div><h3>${esc(m.nome)}</h3><div class="pequeno">${adm() ? 'Administrador(a)' : esc(m.setor)}</div></div><button class="fechar" data-a="menu" aria-label="Fechar">×</button></div>
    <div class="regua"></div><nav>${n}</nav><div class="sair"><button data-a="sair">${ic('out')}Sair</button></div></aside>`;
}
function render() {
  const sc = TELAS[S.tela];
  const foot = sc.foot ? sc.foot() : '';
  const keep = $('#tela') ? $('#tela').scrollTop : 0;
  app.className = '';
  app.innerHTML = sc.cab() + `<div class="tela" id="tela">${sc.body()}</div>` + (foot ? `<div class="foot">${foot}</div>` : '')
    + (sc.semAbas ? '' : abas(sc.tab)) + (sc.semMenu ? '' : gaveta());
  if (sc.bind) sc.bind();
  const t = $('#tela'); if (t && S.manterScroll) t.scrollTop = keep; S.manterScroll = false;
}
const refrescar = () => { S.manterScroll = true; render(); };

/* ---------- INÍCIO ---------- */
TELAS.inicio = {
  tab: 'inicio',
  async load() {
    S.d.resumo = await api('/api/resumo'); S.bal = S.d.resumo.balanco.aberto;
    if (!adm()) S.d.pedidos = await api('/api/pedidos');
  },
  cab: () => cab({home: true}),
  body() {
    const r = S.d.resumo; let h = '';
    if (r.balanco.aberto) h += `<button class="aviso" data-a="ir" data-t="${adm() ? 'balanco' : 'contagem'}">${ic('bal')}<span style="flex:1"><b>Balanço aberto</b> · ${r.balanco.contados} de ${r.balanco.total} itens contados</span><span class="seta">›</span></button>`;
    if (adm() && r.sugestoes_abertas) h += `<button class="aviso amarelo" data-a="ir" data-t="pedidos" data-sub="sug"><span style="flex:1"><b>${r.sugestoes_abertas} ${r.sugestoes_abertas === 1 ? 'item sugerido' : 'itens sugeridos'}</b> por colaboradores · avaliar</span><span class="seta">›</span></button>`;
    if (adm()) {
      h += `<div class="sec">Resumo do estoque</div><div class="stats">
        <button class="stat s1" data-a="ir" data-t="estoque" data-f="baixos"><span class="ic">${ic('box')}</span><b>${r.itens_baixos}</b><span>itens baixos</span></button>
        <button class="stat s2" data-a="ir" data-t="pedidos"><span class="ic">${ic('list')}</span><b>${r.pedidos_aprovar}</b><span>pedidos p/ aprovar</span></button>
        <button class="stat s3" data-a="ir" data-t="compras" data-sub="receber"><span class="ic">${ic('truck')}</span><b>${r.compras_receber}</b><span>compras a receber</span></button></div>
        <div class="sec">Precisa de atenção</div>`;
      h += r.atencao.length ? r.atencao.map((p) => `<button class="cartao item" data-a="editar" data-id="${p.id}">${thumb(p.id)}<span class="meio"><div class="nome">${esc(p.nome)}</div><div class="det">${un(p.quantidade, p.unidade)}</div></span>${seloEst(p.status)}<span class="seta">›</span></button>`).join('')
        : vazio('Nenhum item precisando de atenção.');
    } else {
      h += `<div class="sec">Meus pedidos</div>`;
      const ps = (S.d.pedidos || []).slice(0, 4);
      h += ps.length ? ps.map(cartaoMeuPedido).join('') : vazio('Você ainda não fez pedidos.');
    }
    return h;
  },
  foot: () => (adm() || S.me.pode_pedir) ? btn(`<span class="mais">+</span>${adm() ? 'Nova solicitação' : 'Novo pedido'}`, 'ir', '', 'data-t="pedir"') : '',
};
function cartaoMeuPedido(g) {
  return `<div class="cartao"><div class="pequeno" style="margin-bottom:6px">${data(g.criada_em)}</div>${g.itens.map((i) =>
    `<div style="padding:3px 0"><div class="item"><span class="meio">${esc(i.produto)}${i.qtd_aprovada ? ` · ${un(i.qtd_aprovada, i.unidade)}` : ''}</span>${seloPed(i.status)}</div>${i.observacao ? `<div class="pequeno">“${esc(i.observacao)}”</div>` : ''}</div>`).join('')}</div>`;
}

/* ---------- ESTOQUE (admin) ---------- */
TELAS.estoque = {
  tab: 'estoque',
  entrar() { S.q = ''; S.filtro = S.p.f || 'todos'; },
  async load() { S.d.produtos = await api('/api/produtos'); },
  cab: () => cab({titulo: 'Estoque', sub: 'Todos os itens'}),
  body() {
    return `<input id="busca" data-i="busca" placeholder="Buscar produto" value="${esc(S.q)}"><div class="chips" id="chips">${chipsEstoque()}</div><div id="lista" style="display:flex;flex-direction:column;gap:10px">${listaEstoque()}</div>
      <button class="btn ghost" data-a="editar" data-id="">Novo produto</button>`;
  },
};
const chipsEstoque = () => [['todos', 'Todos'], ['Cozinha', 'Cozinha'], ['Salão', 'Salão'], ['baixos', 'Baixos']].map(([k, t]) => chip(t, S.filtro === k, 'filtro', `data-k="${k}"`)).join('');
function listaEstoque() {
  let ps = S.d.produtos.slice(); const q = S.q.toLowerCase();
  if (q) ps = ps.filter((p) => (p.nome + ' ' + p.categoria).toLowerCase().includes(q));
  if (S.filtro === 'baixos') ps = ps.filter((p) => p.status !== 'ok'); else if (['Cozinha', 'Salão'].includes(S.filtro)) ps = ps.filter((p) => p.setor === S.filtro);
  ps.sort((a, b) => (a.status === 'ok') - (b.status === 'ok') || a.nome.localeCompare(b.nome));
  return ps.length ? ps.map((p) => `<button class="cartao item" data-a="editar" data-id="${p.id}">${thumb(p.id)}<span class="meio"><div class="nome">${esc(p.nome)}</div><div class="det">${un(p.quantidade, p.unidade)} · mín. ${un(p.minimo, p.unidade)}</div></span>${seloEst(p.status)}<span class="seta">›</span></button>`).join('') : vazio('Nenhum item encontrado.');
}

/* editar / novo produto */
TELAS.editar = {
  tab: 'estoque',
  async load() {
    if (!S.d.produtos) S.d.produtos = await api('/api/produtos');
    const p = S.p.id ? S.d.produtos.find((x) => x.id === +S.p.id) : null;
    S.form = p ? {...p} : {id: null, nome: S.p.nome || '', categoria: 'Outros', unidade: 'un', setor: S.p.setor || 'Cozinha', quantidade: 0, minimo: 0, desejado: 0, sugestao_id: S.p.sugestao || null};
  },
  cab: () => cab({titulo: S.form.id ? 'Editar item' : 'Novo produto', sub: 'Estoque e mínimo', voltar: true}),
  body() {
    const f = S.form, passo = f.unidade === 'kg' ? 0.5 : 1;
    return `<div class="cartao item">${S.form.id ? thumb(f.id) : ''}<span class="meio"><div class="nome" style="font-size:19px">${esc(f.nome || 'Novo produto')}</div><div class="det">${esc(f.setor)}</div></span>${S.form.id ? seloEst(f.status) : ''}</div>
      ${S.form.id ? '' : campo('Nome', 'f-nome', f.nome, 'data-i="f" data-c="nome"') + '<div class="pequeno" style="margin-top:-4px">Padrão do nome: Categoria · tipo · marca (ex.: Cerveja lata · Heineken). Nomes repetidos são bloqueados.</div>'}
      <div class="cartao"><div class="pequeno">Estoque atual</div><div class="passo"><button data-a="passo" data-v="${-passo}" aria-label="Diminuir">−</button>
        <input class="num" id="f-quantidade" inputmode="decimal" value="${fmt(f.quantidade)}" data-i="f" data-c="quantidade"><button data-a="passo" data-v="${passo}" aria-label="Aumentar">+</button></div><div class="pequeno" style="text-align:center">${esc(f.unidade)}</div></div>
      <div class="linha2">${campo('Estoque mínimo', 'f-minimo', fmt(f.minimo), 'inputmode="decimal" data-i="f" data-c="minimo"')}${campo('Quantidade ideal', 'f-desejado', fmt(f.desejado), 'inputmode="decimal" data-i="f" data-c="desejado"')}</div>
      <div class="linha2">${campo('Unidade', 'f-unidade', f.unidade, 'data-i="f" data-c="unidade"')}${campo('Categoria', 'f-categoria', f.categoria, 'data-i="f" data-c="categoria"')}</div>
      <div class="chips" style="align-items:center"><span class="pequeno">Setor</span>${['Cozinha', 'Salão'].map((s) => chip(s, f.setor === s, 'setor', `data-v="${s}"`)).join('')}</div>
      <div class="aviso amarelo" id="nota-est"></div>`;
  },
  foot: () => btn('Salvar alterações', 'salvar-produto') + btn('Cancelar', 'voltar', 'ghost'),
  bind() { notaEstoque(); },
};
function notaEstoque() {
  const f = S.form, el = $('#nota-est'); if (!el) return;
  const q = num(f.quantidade), m = num(f.minimo);
  if (!(q >= 0) || !(m >= 0)) { el.style.display = 'none'; return; }
  el.style.display = '';
  const st = q < m ? 'baixo' : (m > 0 && q <= m * 1.25) ? 'limite' : 'ok';
  el.className = 'aviso amarelo'; el.style.background = st === 'ok' ? 'var(--ok-bg)' : st === 'baixo' ? 'var(--baixo-bg)' : 'var(--lim-bg)';
  el.innerHTML = st === 'ok' ? `${fmt(q)} ${esc(f.unidade)} está acima do mínimo (${fmt(m)}).` : `${fmt(q)} ${esc(f.unidade)} ${st === 'baixo' ? 'está abaixo do' : 'está no limite do'} mínimo (${fmt(m)}). O item aparece como <b>${st === 'baixo' ? 'Baixo' : 'No limite'}</b> no início.`;
}

/* ---------- PEDIDOS: novo pedido (todos) ---------- */
TELAS.pedir = {
  tab: 'pedidos',
  entrar() { S.sel = {}; S.q = ''; S.filtro = null; },
  async load() { S.d.produtos = await api('/api/produtos'); if (!S.filtro) S.filtro = !adm() && S.d.produtos.some((p) => p.frequencia > 0) ? 'mais' : 'todos'; },
  cab: () => cab({titulo: 'Novo pedido', sub: adm() ? 'Solicitação do administrador' : S.me.setor, voltar: adm()}),
  body() {
    const cats = [...new Set(S.d.produtos.map((p) => p.categoria))].sort();
    const filtros = (!adm() && S.d.produtos.some((p) => p.frequencia > 0) ? [['mais', 'Mais pedidos']] : []).concat([['todos', 'Todos']], cats.map((c) => [c, c]));
    return `${adm() ? '' : segMeus('novo')}<input id="busca" data-i="busca" placeholder="Buscar ingrediente ou produto" value="${esc(S.q)}">
      <div class="chips">${filtros.map(([k, t]) => chip(t, S.filtro === k, 'filtro', `data-k="${k}"`)).join('')}</div><div id="lista" style="display:flex;flex-direction:column;gap:10px">${listaPedir()}</div>${adm() ? '' : '<button class="btn ghost" data-a="ir" data-t="sugerir">Não achei o item</button>'}`;
  },
  foot() { const n = Object.keys(S.sel).length; return `<button class="btn" id="enviar" data-a="enviar-pedido" ${n ? '' : 'disabled'}>Enviar pedido (${n} ${n === 1 ? 'item' : 'itens'})</button>`; },
};
const segMeus = (ativo) => `<div class="seg"><button class="${ativo === 'novo' ? 'on' : ''}" data-a="ir" data-t="pedir">Novo pedido</button><button class="${ativo === 'meus' ? 'on' : ''}" data-a="ir" data-t="meus">Meus pedidos</button></div>`;
function listaPedir() {
  let ps = S.d.produtos.slice(); const q = S.q.toLowerCase();
  if (q) ps = ps.filter((p) => (p.nome + ' ' + p.categoria).toLowerCase().includes(q));
  if (S.filtro === 'mais') ps = ps.filter((p) => p.frequencia > 0).sort((a, b) => b.frequencia - a.frequencia);
  else if (S.filtro && S.filtro !== 'todos') ps = ps.filter((p) => p.categoria === S.filtro);
  if (!ps.length) return vazio('Nenhum item aqui.');
  return ps.map((p) => {
    const v = S.sel[p.id], on = v !== undefined;
    return `<div class="cartao ${on ? 'marcado' : ''}" style="display:flex;flex-direction:column;gap:8px"><div class="item" data-a="marcar" data-id="${p.id}"><span class="meio"><div class="nome" style="font-size:16px">${esc(p.nome)}</div>
      ${adm() ? `<div class="det">${un(p.quantidade, p.unidade)} · mín. ${un(p.minimo, p.unidade)}</div>` : ''}</span>${adm() && on ? `<input class="pequeno-in" inputmode="decimal" placeholder="Qtd." data-i="qtdp" data-id="${p.id}" value="${esc(v.q)}">` : ''}${adm() ? seloEst(p.status) : ''}
      <span class="pedir">${on ? '✓ Pedir' : 'Pedir'}</span></div>
      ${on ? `<input class="obs" maxlength="100" placeholder="Observação (opcional): marca, tipo, urgência…" data-i="obs" data-id="${p.id}" value="${esc(v.o)}">` : ''}</div>`;
  }).join('');
}

const seloSug = (s) => ({aberta: selo('limite', 'Aguardando'), atendida: selo('ok', 'Cadastrado'), existente: selo('ok', 'Já existe'), recusada: selo('baixo', 'Recusado')}[s.status]);
TELAS.meus = {
  tab: 'pedidos',
  async load() { [S.d.pedidos, S.d.sug] = await Promise.all([api('/api/pedidos'), api('/api/sugestoes')]); },
  cab: () => cab({titulo: 'Meus pedidos', sub: S.me.setor}),
  body() {
    let h = segMeus('meus') + (S.d.pedidos.length ? S.d.pedidos.map(cartaoMeuPedido).join('') : vazio('Você ainda não fez pedidos.'));
    if (S.d.sug.length) h += `<div class="sec">Itens que pedi para cadastrar</div>` + S.d.sug.map((s) => `<div class="cartao"><div class="item"><span class="meio"><div class="nome" style="font-size:16px">${esc(s.texto)}</div><div class="det">${data(s.criada_em)}${s.status === 'atendida' || s.status === 'existente' ? ` · na lista como ${esc(s.produto)}` : ''}${s.status === 'recusada' && s.nota ? ` · ${esc(s.nota)}` : ''}</div></span>${seloSug(s)}</div></div>`).join('');
    return h;
  },
};
TELAS.sugerir = {
  tab: 'pedidos',
  cab: () => cab({titulo: 'Não achei o item', sub: S.me.setor, voltar: true}),
  body: () => `<div class="cartao"><div>Escreva o que você precisa. O aviso vai para o admin, que decide se cadastra na lista.</div><div class="pequeno" style="margin-top:6px">Isso não cria produto nem muda o estoque. Procure antes na busca para ver se o item já existe com outro nome.</div></div>
    ${campo('Item que está faltando na lista', 'sg-texto', '', 'maxlength="100" placeholder="Ex.: Cerveja long neck Heineken"')}`,
  foot: () => btn('Enviar aviso ao admin', 'enviar-sugestao'),
};

/* ---------- PEDIDOS (admin): aprovar ---------- */
TELAS.pedidos = {
  tab: 'pedidos',
  entrar() { S.sub = S.sub || 'pend'; },
  async load() {
    S.d.sug = await api('/api/sugestoes');
    if (S.sub === 'sug') S.d.produtos = await api('/api/produtos');
    else S.d.pedidos = await api('/api/pedidos' + (S.sub === 'hist' ? '' : '?apenas=pendentes'));
  },
  cab: () => cab({titulo: 'Pedidos', sub: 'Aprovação, sugestões e histórico'}),
  body() {
    const abertas = S.d.sug.filter((s) => s.status === 'aberta').length;
    const seg = `<div class="seg"><button class="${S.sub === 'pend' ? 'on' : ''}" data-a="sub" data-v="pend">Aprovar</button><button class="${S.sub === 'sug' ? 'on' : ''}" data-a="sub" data-v="sug">Sugestões${abertas ? ` (${abertas})` : ''}</button><button class="${S.sub === 'hist' ? 'on' : ''}" data-a="sub" data-v="hist">Histórico</button></div>`;
    if (S.sub === 'sug') {
      const opcoes = S.d.produtos.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
      return seg + (S.d.sug.length ? S.d.sug.map((s) => `<div class="cartao" style="display:flex;flex-direction:column;gap:8px"><div class="item"><span class="meio"><div class="nome" style="font-size:16px">${esc(s.texto)}</div><div class="det">${esc(s.solicitante)} · ${esc(s.setor)} · ${data(s.criada_em)}</div></span>${seloSug(s)}</div>
        ${s.status === 'aberta' ? `<label>Já existe na lista?<select id="jx-${s.id}"><option value="">Escolha o produto…</option>${opcoes}</select></label>
        <div class="linha2"><button class="btn verde" style="min-height:44px" data-a="sug-cadastrar" data-id="${s.id}">Cadastrar</button><button class="btn ghost" data-a="sug-existe" data-id="${s.id}">Já existe</button></div>
        <button class="btn perigo" data-a="sug-recusar" data-id="${s.id}">Recusar</button>` : (s.produto ? `<div class="det">Na lista como ${esc(s.produto)}</div>` : '')}</div>`).join('') : vazio('Nenhuma sugestão dos colaboradores.'));
    }
    const lista = S.d.pedidos.length ? S.d.pedidos.map((g) => `<button class="cartao item" data-a="aprovar" data-cod="${g.codigo}"><span class="meio"><div class="nome">${esc(g.itens.length)} ${g.itens.length === 1 ? 'item' : 'itens'} · ${esc(g.solicitante)}</div>
      <div class="det">${data(g.criada_em)} · ${esc(g.itens.slice(0, 3).map((i) => i.produto).join(', '))}${g.itens.length > 3 ? '…' : ''}</div></span>${g.geral === 'Pendente' ? selo('limite', 'Aprovar') : selo('ok', g.geral)}<span class="seta">›</span></button>`).join('')
      : vazio(S.sub === 'hist' ? 'Nenhum pedido ainda.' : 'Nenhum pedido esperando aprovação.');
    return seg + lista;
  },
};
TELAS.aprovar = {
  tab: 'pedidos',
  cab: () => cab({titulo: 'Aprovar pedido', sub: `Pedido de ${S.pedido.solicitante}`, voltar: true}),
  body() {
    return S.pedido.itens.map((i) => {
      const aberto = i.status === 'Solicitada';
      const sug = Math.max(Math.round(((i.desejado || 0) - i.estoque) * 10) / 10, 0);
      return `<div class="cartao" style="display:flex;flex-direction:column;gap:8px"><div class="item">${thumb(i.produto_id)}<span class="nome meio">${esc(i.produto)}</span>${aberto ? seloEst(i.status_estoque) : seloPed(i.status)}</div>
        ${i.observacao ? `<div class="aviso amarelo" style="font-size:13.5px">Observação: ${esc(i.observacao)}</div>` : ''}
        ${aberto ? `<div class="linha2" style="align-items:flex-end"><div class="pequeno">Estoque atual<div style="font-size:19px;font-weight:700;color:var(--texto)">${un(i.estoque, i.unidade)}</div><div class="pequeno">mín. ${un(i.minimo, i.unidade)}</div></div>${campo(`Quantidade (${esc(i.unidade)})`, 'qa-' + i.id, sug || '', 'inputmode="decimal" placeholder="0"')}</div>`
        : `<div class="det">${i.qtd_aprovada ? 'Quantidade: ' + un(i.qtd_aprovada, i.unidade) : ''}</div>`}</div>`;
    }).join('');
  },
  foot: () => S.pedido.itens.some((i) => i.status === 'Solicitada') ? btn('Aprovar e enviar p/ compras', 'confirmar-aprovacao', 'verde') + btn('Recusar pedido', 'recusar-pedido', 'ghost') : '',
};

/* ---------- COMPRAS ---------- */
TELAS.compras = {
  tab: 'compras',
  entrar() { S.sub = adm() ? (S.p.sub || 'comprar') : 'receber'; S.sel = {}; },
  async load() { S.d.compras = await api('/api/compras'); const l = S.sub === 'comprar' ? S.d.compras.a_comprar : S.d.compras.a_receber; l.forEach((i) => { if (S.sel[i.id] === undefined) S.sel[i.id] = true; }); },
  cab: () => cab({titulo: 'Compras', sub: S.sub === 'comprar' ? 'Lista para comprar' : 'Entregas a conferir'}),
  body() {
    const c = S.d.compras, lista = S.sub === 'comprar' ? c.a_comprar : c.a_receber;
    const seg = adm() ? `<div class="seg"><button class="${S.sub === 'comprar' ? 'on' : ''}" data-a="sub" data-v="comprar">A comprar (${c.a_comprar.length})</button><button class="${S.sub === 'receber' ? 'on' : ''}" data-a="sub" data-v="receber">A receber (${c.a_receber.length})</button></div>` : '';
    return seg + (lista.length ? lista.map((i) => `<button class="cartao item" data-a="alternar" data-id="${i.id}"><span class="check ${S.sel[i.id] ? 'on' : ''}">${S.sel[i.id] ? '✓' : ''}</span>${thumb(i.produto_id)}<span class="meio"><div class="nome">${esc(i.produto)}</div><div class="det">Pedido de ${esc(i.solicitante)}${i.observacao ? ` · “${esc(i.observacao)}”` : ''}</div></span><b style="font-family:var(--serif);font-size:19px;color:var(--terra)">${un(i.qtd, i.unidade)}</b></button>`).join('')
      : vazio(S.sub === 'comprar' ? 'Nada para comprar agora.' : 'Nenhuma entrega esperando conferência.'));
  },
  foot() {
    const n = Object.values(S.sel).filter(Boolean).length;
    if (!n) return '';
    return S.sub === 'comprar' ? btn(`Marcar como comprado (${n})`, 'comprar', 'verde') : btn(`Conferir entrega (${n})`, 'conferir-entrega', 'verde');
  },
};
TELAS.entrega = {
  tab: 'compras',
  cab: () => cab({titulo: 'Conferir entrega', sub: 'Digite o que chegou', voltar: true}),
  body() {
    return S.entrega.map((i) => `<div class="cartao" style="display:flex;flex-direction:column;gap:8px"><div class="item">${thumb(i.produto_id)}<span class="meio"><div class="nome">${esc(i.produto)}</div><div class="det">Pedido: ${un(i.qtd, i.unidade)}${i.observacao ? ` · “${esc(i.observacao)}”` : ''}</div></span><span id="st-${i.id}">${seloReceb(i.qtd, i.qtd)}</span></div>
      ${campo(`Recebido (${esc(i.unidade)})`, 'rc-' + i.id, i.qtd, `inputmode="decimal" data-i="rec" data-id="${i.id}" data-ped="${i.qtd}"`)}</div>`).join('')
      + '<div class="pequeno" style="padding:0 2px">O estoque soma só o que foi recebido.</div>';
  },
  foot: () => btn('Confirmar recebimento', 'confirmar-entrega', 'verde'),
};
function seloReceb(ped, rec) {
  if (!(rec > 0)) return selo('baixo', 'Informe');
  if (rec < ped) return selo('limite', `Faltaram ${fmt(ped - rec)}`);
  if (rec > ped) return selo('limite', `+${fmt(rec - ped)}`);
  return selo('ok', 'Confere');
}

/* ---------- BALANÇO ---------- */
TELAS.balanco = {
  async load() { S.d.bal = await api('/api/balanco'); S.bal = S.d.bal.aberto; if (!S.d.bal.aberto) S.sel = Object.fromEntries(S.d.bal.etapas.map((e) => [e.nome, e.total > 0])); },
  cab: () => cab({titulo: 'Balanço', sub: 'Contagem de estoque'}),
  body() {
    const b = S.d.bal;
    if (!b.aberto) {
      return `<div class="cartao"><h3>Nenhum balanço aberto</h3><div class="det muted">Último balanço: ${b.ultimo_fechamento ? data(b.ultimo_fechamento) : 'ainda não houve'}</div></div>
        <div class="sec">Escolha o que liberar para contar</div>${b.etapas.map((e) => `<div class="cartao item"><span class="meio"><div class="nome">${esc(e.nome)}</div><div class="det">${e.total} itens</div></span>${sw(S.sel[e.nome], 'etapa-sel', `data-n="${esc(e.nome)}"`)}</div>`).join('')}
        <div class="pequeno">Você pode liberar as outras etapas depois, com o balanço já aberto.</div>`;
    }
    const pc = b.total ? Math.round(b.contados / b.total * 100) : 0;
    return `<div class="aviso" style="display:block;padding:12px 14px"><div class="item"><h3 style="flex:1">Balanço aberto</h3><span class="pequeno">desde ${data(b.aberto_em)}</span></div><div style="margin:6px 0 8px">${b.contados} de ${b.total} itens contados</div><div class="barra"><i style="width:${pc}%"></i></div></div>
      <div class="sec">Liberar por etapa</div>${b.etapas.map((e) => `<div class="cartao" style="display:flex;flex-direction:column;gap:8px"><div class="item"><span class="meio"><div class="nome">${esc(e.nome)}</div></span>${sw(e.liberada, 'etapa-lib', `data-n="${esc(e.nome)}" data-v="${e.liberada ? 0 : 1}"`)}</div>
      <div class="barra"><i style="width:${e.total ? Math.round(e.contados / e.total * 100) : 0}%"></i></div><div class="pequeno">${e.liberada ? `${e.contados} de ${e.total} itens contados` : 'Não liberado'}</div></div>`).join('')}
      <div class="pequeno">Colaboradores só contam o que você liberar. Quem é novo não vê o balanço.</div>`;
  },
  foot: () => S.d.bal.aberto ? btn('Conferir e fechar balanço', 'ir', 'verde', 'data-t="conferir"') : btn('Iniciar balanço', 'iniciar-balanco', 'verde'),
};
TELAS.conferir = {
  entrar() { S.filtro = 'dif'; },
  async load() { S.d.conf = await api('/api/balanco/conferir'); },
  cab: () => cab({titulo: 'Conferir balanço', sub: 'Contado x sistema', voltar: true}),
  body() {
    const c = S.d.conf; const itens = S.filtro === 'dif' ? c.itens.filter((i) => i.diferenca !== 0) : c.itens;
    return `<div class="aviso" style="display:block;padding:12px 14px"><h3>${c.contados >= c.liberados ? 'Contagem completa' : 'Contagem em andamento'}</h3><div>${c.contados} de ${c.liberados} itens contados · ${c.com_diferenca} com diferença</div></div>
      <div class="chips">${chip(`Com diferença (${c.com_diferenca})`, S.filtro === 'dif', 'filtro', 'data-k="dif"')}${chip('Todos', S.filtro !== 'dif', 'filtro', 'data-k="todos"')}</div>
      ${itens.length ? itens.map((i) => `<div class="cartao item">${thumb(i.id)}<span class="meio"><div class="nome">${esc(i.nome)}</div><div class="det">Sistema ${un(i.sistema, i.unidade)} · Contado <b style="color:var(--texto)">${un(i.contado, i.unidade)}</b></div></span>${i.diferenca === 0 ? selo('ok', 'Confere') : selo(i.diferenca < 0 ? 'baixo' : 'limite', (i.diferenca > 0 ? '+' : '−') + fmt(Math.abs(i.diferenca)))}</div>`).join('') : vazio('Nenhuma diferença encontrada.')}
      <div class="pequeno">Ao fechar, o estoque passa a valer o que foi contado.</div>`;
  },
  foot: () => btn('Fechar balanço e atualizar', 'fechar-balanco', 'verde') + btn('Pedir nova contagem', 'recontar', 'ghost'),
};
TELAS.contagem = {
  async load() { [S.d.itens, S.d.bal] = await Promise.all([api('/api/balanco/contagem'), api('/api/balanco')]); S.bal = S.d.bal.aberto; },
  cab: () => cab({titulo: 'Contar estoque', sub: [...new Set(S.d.itens.map((i) => i.etapa))].join(' · ') || 'Balanço'}),
  body() {
    if (!S.d.itens.length) return vazio('Nenhuma contagem liberada para você agora.');
    const feitos = S.d.itens.filter((i) => i.contado !== null).length, pc = Math.round(feitos / S.d.itens.length * 100);
    return `<div><div class="pequeno" id="prog-t">${feitos} de ${S.d.itens.length} itens contados</div><div class="barra" style="margin-top:6px"><i id="prog-b" style="width:${pc}%"></i></div></div>`
      + S.d.itens.map((i) => `<div class="cartao item"><span class="check ${i.contado !== null ? 'on' : ''}" id="ck-${i.produto_id}">${i.contado !== null ? '✓' : ''}</span><span class="meio nome" style="font-size:16px">${esc(i.nome)}</span>
      <input class="pequeno-in" inputmode="decimal" placeholder="Contar" data-i="cont" data-id="${i.produto_id}" value="${i.contado !== null ? fmt(i.contado) : ''}"><span class="pequeno" style="width:30px">${esc(i.unidade)}</span></div>`).join('');
  },
  foot: () => S.d.itens.length ? btn('Enviar contagem', 'enviar-contagem') : '',
};

/* ---------- EQUIPE (admin) ---------- */
TELAS.equipe = {
  async load() { S.d.equipe = await api('/api/equipe'); },
  cab: () => cab({titulo: 'Equipe', sub: 'Administração'}),
  body: () => btn(`<span class="mais" style="color:var(--verde)">+</span>Novo colaborador`, 'colaborador', 'verde', 'data-id=""')
    + S.d.equipe.map((u) => `<button class="cartao item" data-a="colaborador" data-id="${u.id}"><span class="meio"><div class="nome">${esc(u.nome)}</div><div class="det">${u.nivel === 'admin' ? 'Acesso total' : `${esc(u.setor)} · ${[u.pode_pedir && 'pede', u.pode_receber && 'recebe', u.pode_contar && 'conta'].filter(Boolean).join(', ') || 'sem permissões'}`}</div></span>${seloNivel(u)}</button>`).join(''),
};
TELAS.colaborador = {
  entrar() {
    const u = S.p.id ? S.d.equipe.find((x) => x.id === +S.p.id) : null;
    S.form = u ? {...u, nova_senha: ''} : {id: null, nome: '', usuario: '', senha: '', setor: 'Cozinha', nivel: 'novo', pode_pedir: true, pode_receber: false, pode_contar: false, ativo: true};
  },
  cab: () => cab({titulo: S.form.id ? 'Editar colaborador' : 'Novo colaborador', sub: 'Equipe', voltar: true}),
  body() {
    const f = S.form, ed = !!f.id, sem = f.nivel === 'novo' || f.nivel === 'admin';
    return `${campo('Nome', 'c-nome', f.nome, 'data-i="f" data-c="nome"')}${campo('Usuário', 'c-usuario', f.usuario, `data-i="f" data-c="usuario" autocapitalize="none" ${ed ? 'readonly' : ''}`)}
      ${ed ? campo('Nova senha provisória (opcional)', 'c-senha', f.nova_senha, 'type="text" data-i="f" data-c="nova_senha"') : campo('Senha provisória', 'c-senha', f.senha, 'type="text" data-i="f" data-c="senha"')}
      <div class="chips" style="align-items:center"><span class="pequeno">Nível</span>${[['novo', 'Novo'], ['padrao', 'Padrão'], ['admin', 'Admin']].map(([k, t]) => chip(t, f.nivel === k, 'nivel', `data-v="${k}"`)).join('')}</div>
      ${f.nivel !== 'admin' ? `<div class="chips" style="align-items:center"><span class="pequeno">Setor</span>${['Cozinha', 'Salão'].map((s) => chip(s, f.setor === s, 'setor', `data-v="${s}"`)).join('')}</div>` : ''}
      <div>${f.nivel === 'admin' ? '<div class="pequeno" style="padding:6px 0">Administradores têm acesso a tudo.</div>' : `
        <div class="toggle"><span>Pode pedir</span>${sw(f.pode_pedir, 'perm', 'data-p="pode_pedir"')}</div>
        <div class="toggle" ${sem ? 'style="opacity:.45"' : ''}><span>Pode receber compras</span>${sw(f.pode_receber && !sem, 'perm', `data-p="pode_receber" ${sem ? 'disabled' : ''}`)}</div>
        <div class="toggle" ${sem ? 'style="opacity:.45"' : ''}><span>Pode contar balanço</span>${sw(f.pode_contar && !sem, 'perm', `data-p="pode_contar" ${sem ? 'disabled' : ''}`)}</div>`}
        ${ed ? `<div class="toggle"><span>Acesso ativo</span>${sw(f.ativo, 'perm', 'data-p="ativo"')}</div>` : ''}</div>
      ${f.nivel === 'novo' ? '<div class="pequeno">Quem é novo só pode pedir. Mude para Padrão quando quiser liberar mais.</div>' : ''}
      ${!ed ? '<div class="pequeno">No primeiro acesso a pessoa será pedida a trocar a senha.</div>' : ''}`;
  },
  foot: () => btn(S.form.id ? 'Salvar alterações' : 'Criar acesso', 'salvar-colaborador') + (S.form.id && S.form.id !== S.me.id ? btn('Excluir colaborador', 'excluir-colaborador', 'perigo') : ''),
};

/* ---------- CONFIGURAÇÕES e troca de senha ---------- */
const formSenha = (forcada) => `${campo('Senha atual', 's-atual', '', 'type="password" autocomplete="current-password"')}${campo('Nova senha (mín. 6 caracteres)', 's-nova', '', 'type="password" autocomplete="new-password"')}${campo('Repita a nova senha', 's-nova2', '', 'type="password" autocomplete="new-password"')}`;
TELAS.config = {
  tab: null,
  async load() { S.d.hist = adm() ? await api('/api/historico') : []; },
  cab: () => cab({titulo: 'Configurações', sub: S.me.nome, voltar: true}),
  body: () => `<div class="sec">Trocar senha</div>${formSenha()}${btn('Salvar nova senha', 'salvar-senha')}
    ${adm() ? `<div class="sec" style="margin-top:12px">Últimas movimentações</div>${S.d.hist.slice(0, 40).map((h) => `<div class="cartao"><div class="item"><b class="meio">${esc(h.tipo)} · ${esc(h.produto)}</b><span class="pequeno">${data(h.criada_em)}</span></div><div class="det muted">${esc(h.observacao)}${h.usuario ? ' — ' + esc(h.usuario) : ''}</div></div>`).join('')}` : ''}
    <div class="pequeno" style="margin-top:8px">Pedacinho do Sertão · Estoque V2.0.3</div>`,
};
TELAS.trocar = {
  semAbas: true, semMenu: true,
  cab: () => `<div class="cab"><img class="logo" src="/static/img/cabecalho-logo.jpg" alt=""><div class="titulo"><h1>Crie sua senha</h1><div class="pequeno">Troque a senha provisória para continuar</div></div></div><div class="regua"></div>`,
  body: () => formSenha(),
  foot: () => btn('Salvar e entrar', 'salvar-senha'),
};

/* ---------- ações (cliques) ---------- */
const ACOES = {
  ir: (el) => ir(el.dataset.t, {sub: el.dataset.sub, f: el.dataset.f}, {raiz: !!el.closest('.tabs, .gaveta')}),
  voltar, menu: () => { app.classList.toggle('menu-aberto'); },
  sair: async () => { await tente(() => api('/api/logout', 'POST', {})); location.href = '/login'; },
  sub: (el) => { S.sub = el.dataset.v; S.sel = {}; atualizar(); },
  filtro: (el) => { S.filtro = el.dataset.k; if (S.tela === 'conferir') return render(); const c = $('#lista'); if (c) { c.innerHTML = S.tela === 'estoque' ? listaEstoque() : listaPedir(); document.querySelectorAll('.chips .chip').forEach((b) => b.classList.toggle('on', b.dataset.k === S.filtro)); } },
  editar: (el) => ir('editar', {id: el.dataset.id}),
  passo: (el) => { const n = Math.max((num(S.form.quantidade) || 0) + parseFloat(el.dataset.v), 0); S.form.quantidade = n; $('#f-quantidade').value = fmt(n); notaEstoque(); },
  setor: (el) => { S.form.setor = el.dataset.v; render(); },
  'salvar-produto': () => tente(async () => {
    const f = S.form, corpo = {nome: f.nome, categoria: f.categoria, unidade: f.unidade, setor: f.setor, quantidade: num(f.quantidade), minimo: num(f.minimo), desejado: num(f.desejado), sugestao_id: f.sugestao_id || undefined};
    if ([corpo.quantidade, corpo.minimo, corpo.desejado].some(Number.isNaN)) throw new Error('Confira os números informados.');
    await api(f.id ? `/api/produtos/${f.id}` : '/api/produtos', 'POST', corpo);
    S.d.produtos = null; S.pilha.pop();
    if (f.sugestao_id) { toast('Produto cadastrado. Aviso atendido.'); return ir('pedidos', {sub: 'sug'}, {trocar: true}); }
    toast('Item salvo.'); await ir('estoque', {}, {trocar: true});
  }),
  marcar: (el) => { const id = el.dataset.id; if (S.sel[id] !== undefined) delete S.sel[id]; else S.sel[id] = {q: '', o: ''}; const c = $('#lista'); c.innerHTML = listaPedir(); atualizarEnviar(); },
  'enviar-pedido': () => tente(async () => {
    const itens = Object.entries(S.sel).map(([id, v]) => ({produto_id: +id, quantidade: v.q, observacao: v.o}));
    const r = await api('/api/pedidos', 'POST', {itens});
    toast(r.repetidos.length ? `Enviado. Já em andamento: ${r.repetidos.join(', ')}` : 'Pedido enviado!'); S.sel = {};
    await ir(adm() ? 'pedidos' : 'meus', {}, {raiz: true});
  }),
  aprovar: (el) => { S.pedido = S.d.pedidos.find((g) => g.codigo === el.dataset.cod); ir('aprovar', {}); },
  'confirmar-aprovacao': () => tente(async () => {
    const itens = S.pedido.itens.filter((i) => i.status === 'Solicitada').map((i) => ({id: i.id, quantidade: num($('#qa-' + i.id).value) || 0}));
    if (itens.some((i) => i.quantidade <= 0) && !confirm('Itens com quantidade 0 serão recusados. Continuar?')) return;
    const r = await api(`/api/pedidos/${S.pedido.codigo}/aprovar`, 'POST', {itens});
    toast(`${r.aprovados} aprovado(s)${r.recusados ? `, ${r.recusados} recusado(s)` : ''}.`); S.pilha.pop(); await ir('pedidos', {}, {trocar: true});
  }),
  'recusar-pedido': () => tente(async () => {
    if (!confirm('Recusar todos os itens desse pedido?')) return;
    await api(`/api/pedidos/${S.pedido.codigo}/recusar`, 'POST', {}); toast('Pedido recusado.'); S.pilha.pop(); await ir('pedidos', {}, {trocar: true});
  }),
  alternar: (el) => { S.sel[el.dataset.id] = !S.sel[el.dataset.id]; refrescar(); },
  comprar: () => tente(async () => { const ids = Object.keys(S.sel).filter((k) => S.sel[k]).map(Number); await api('/api/compras/comprar', 'POST', {ids}); toast('Marcado como comprado.'); S.sel = {}; S.sub = 'receber'; await atualizar(); }),
  'conferir-entrega': () => { S.entrega = S.d.compras.a_receber.filter((i) => S.sel[i.id]); ir('entrega', {}); },
  'confirmar-entrega': () => tente(async () => {
    const itens = S.entrega.map((i) => ({id: i.id, quantidade: num($('#rc-' + i.id).value)}));
    if (itens.some((i) => !(i.quantidade > 0))) throw new Error('Informe o que chegou de cada item.');
    await api('/api/compras/receber', 'POST', {itens}); toast('Entrega registrada. Estoque atualizado.'); S.sel = {}; S.pilha.pop(); await ir('compras', {sub: 'receber'}, {trocar: true});
  }),
  'etapa-sel': (el) => { S.sel[el.dataset.n] = !S.sel[el.dataset.n]; refrescar(); },
  'iniciar-balanco': () => tente(async () => { await api('/api/balanco/iniciar', 'POST', {etapas: Object.keys(S.sel).filter((k) => S.sel[k])}); toast('Balanço aberto.'); await atualizar(); }),
  'etapa-lib': (el) => tente(async () => { await api('/api/balanco/etapas', 'POST', {etapa: el.dataset.n, liberada: el.dataset.v === '1'}); await atualizar(); }),
  'fechar-balanco': () => tente(async () => {
    let r;
    try { r = await api('/api/balanco/fechar', 'POST', {}); } catch (e) {
      if (e.status !== 409 || !e.dados.faltam) throw e;
      if (!confirm(`${e.message} Fechar mesmo assim? Só os itens contados serão atualizados.`)) return;
      r = await api('/api/balanco/fechar', 'POST', {forcar: true});
    }
    toast(`Balanço fechado. ${r.atualizados} itens atualizados.`); S.bal = false; await ir('balanco', {}, {raiz: true});
  }),
  recontar: () => tente(async () => { if (!confirm('Apagar a contagem dos itens com diferença para contar de novo?')) return; await api('/api/balanco/recontar', 'POST', {}); toast('Contagem reaberta para os itens com diferença.'); await atualizar(); }),
  'enviar-contagem': () => tente(async () => {
    const itens = [...document.querySelectorAll('[data-i="cont"]')].filter((i) => i.value.trim() !== '').map((i) => ({produto_id: +i.dataset.id, quantidade: num(i.value)}));
    if (!itens.length) throw new Error('Digite pelo menos uma contagem.');
    if (itens.some((i) => !(i.quantidade >= 0))) throw new Error('Confira os números digitados.');
    const r = await api('/api/balanco/contagem', 'POST', {itens}); toast(`${r.salvos} contagem(ns) enviada(s).`); await atualizar();
  }),
  colaborador: (el) => ir('colaborador', {id: el.dataset.id}),
  nivel: (el) => { S.form.nivel = el.dataset.v; if (S.form.nivel === 'novo') { S.form.pode_receber = false; S.form.pode_contar = false; } render(); },
  perm: (el) => { if (el.disabled) return; S.form[el.dataset.p] = !S.form[el.dataset.p]; render(); },
  'salvar-colaborador': () => tente(async () => {
    const f = S.form;
    if (f.id) await api(`/api/equipe/${f.id}`, 'POST', {nome: f.nome, nivel: f.nivel, setor: f.setor, pode_pedir: f.pode_pedir, pode_receber: f.pode_receber, pode_contar: f.pode_contar, ativo: f.ativo, nova_senha: f.nova_senha || undefined});
    else await api('/api/equipe', 'POST', {nome: f.nome, usuario: f.usuario, senha: f.senha, nivel: f.nivel, setor: f.setor, pode_pedir: f.pode_pedir, pode_receber: f.pode_receber, pode_contar: f.pode_contar});
    toast('Colaborador salvo.'); S.pilha.pop(); await ir('equipe', {}, {trocar: true});
  }),
  'excluir-colaborador': () => tente(async () => {
    const f = S.form;
    if (!confirm(`Excluir ${f.nome}?\n\nO login e a senha serão apagados e a pessoa não consegue mais entrar. Não dá para desfazer.\nO nome continua aparecendo apenas no histórico antigo.\n\nSe ela pode voltar um dia, prefira desativar o acesso.`)) return;
    await api(`/api/equipe/${f.id}/excluir`, 'POST', {}); toast('Colaborador excluído.'); S.pilha.pop(); await ir('equipe', {}, {trocar: true});
  }),
  'sug-cadastrar': (el) => { const s = S.d.sug.find((x) => x.id === +el.dataset.id); ir('editar', {nome: s.texto, setor: s.setor, sugestao: s.id}); },
  'sug-existe': (el) => tente(async () => {
    const v = $('#jx-' + el.dataset.id).value; if (!v) throw new Error('Escolha na lista qual produto já existe.');
    await api(`/api/sugestoes/${el.dataset.id}/resolver`, 'POST', {acao: 'ja_existe', produto_id: +v}); toast('Colaborador será avisado de que o item já existe.'); await atualizar();
  }),
  'sug-recusar': (el) => tente(async () => {
    if (!confirm('Recusar essa sugestão?')) return;
    await api(`/api/sugestoes/${el.dataset.id}/resolver`, 'POST', {acao: 'recusar'}); toast('Sugestão recusada.'); await atualizar();
  }),
  'enviar-sugestao': () => tente(async () => {
    await api('/api/sugestoes', 'POST', {texto: $('#sg-texto').value}); toast('Aviso enviado ao admin.'); await ir('meus', {}, {raiz: true});
  }),
  'salvar-senha': () => tente(async () => {
    const [a, n, n2] = ['#s-atual', '#s-nova', '#s-nova2'].map((s) => $(s).value);
    if (n !== n2) throw new Error('As senhas novas não são iguais.');
    await api('/api/senha', 'POST', {atual: a, nova: n}); S.me.trocar_senha = false; toast('Senha alterada.'); await ir('inicio', {}, {raiz: true});
  }),
};
function atualizarEnviar() { const b = $('#enviar'); if (!b) return; const n = Object.keys(S.sel).length; b.disabled = !n; b.textContent = `Enviar pedido (${n} ${n === 1 ? 'item' : 'itens'})`; }

const ENTRADAS = {
  busca: (el) => { S.q = el.value; const c = $('#lista'); if (c) c.innerHTML = S.tela === 'estoque' ? listaEstoque() : listaPedir(); },
  qtdp: (el) => { S.sel[el.dataset.id].q = el.value; },
  obs: (el) => { S.sel[el.dataset.id].o = el.value; },
  f: (el) => { S.form[el.dataset.c] = el.value; if (['quantidade', 'minimo', 'unidade'].includes(el.dataset.c)) notaEstoque(); },
  rec: (el) => { const q = num(el.value); $('#st-' + el.dataset.id).innerHTML = seloReceb(+el.dataset.ped, q); },
  cont: (el) => { const feito = el.value.trim() !== ''; const ck = $('#ck-' + el.dataset.id); ck.className = 'check' + (feito ? ' on' : ''); ck.textContent = feito ? '✓' : ''; },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]'); if (!el || e.target.matches('input')) return;
  const f = ACOES[el.dataset.a]; if (f) f(el);
});
document.addEventListener('input', (e) => { const f = ENTRADAS[e.target.dataset.i]; if (f) f(e.target); });
/* saudação e data acompanham o relógio; ao voltar para o app, o início é recarregado */
function atualizarSaudacao() {
  if (!S.me) return; const h = $('#saud-t'), d = $('#data-t');
  if (h) h.textContent = `${saud()}, ${S.me.nome.split(' ')[0]}`; if (d) d.textContent = hoje();
}
setInterval(atualizarSaudacao, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden || !S.me) return; atualizarSaudacao(); if (S.tela === 'inicio') atualizar(); });
/* puxar para o lado abre o menu (borda direita) e fecha (arrastando para a direita) */
let x0 = null;
document.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, {passive: true});
document.addEventListener('touchend', (e) => {
  if (x0 === null || !S.me || TELAS[S.tela].semMenu) return; const dx = e.changedTouches[0].clientX - x0;
  if (dx < -60 && x0 > window.innerWidth - 48) app.classList.add('menu-aberto'); else if (dx > 60 && app.classList.contains('menu-aberto')) app.classList.remove('menu-aberto'); x0 = null;
});

/* ---------- início do app ---------- */
(async function iniciar() {
  try {
    S.me = await api('/api/me');
    if (S.me.trocar_senha) return ir('trocar', {}, {limpar: true});
    await ir('inicio', {}, {limpar: true});
  } catch (e) { if (e.message) app.innerHTML = `<div class="spin">${esc(e.message)}</div>`; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/static/service-worker.js').catch(() => {});
})();
globalThis.__T = {S, TELAS, ACOES, ir, render};
