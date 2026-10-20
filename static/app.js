const $ = (seletor) => document.querySelector(seletor);
let produtos = [];
let solicitacoes = [];

// Fotos idênticas aos produtos mostrados no mock-up (Carne de sol, Pão brioche, Queijo coalho)
const IMAGENS_CATEGORIA = {
  carne: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=160&q=80",
  padaria: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=160&q=80",
  queijo: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=160&q=80",
  batata: "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=160&q=80",
  hortifruti: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=160&q=80",
  bebidas: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=160&q=80",
  padrao: "https://images.unsplash.com/photo-1506617420156-8e4536971650?auto=format&fit=crop&w=160&q=80"
};

async function api(url, options = {}) {
  const resposta = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || "Falha na requisição.");
  return dados;
}

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (letra) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[letra]));
}

function obterImagem(nome, categoria) {
  const chave = (nome + " " + categoria).toLowerCase();
  if (chave.includes("carne") || chave.includes("blend") || chave.includes("sol")) return IMAGENS_CATEGORIA.carne;
  if (chave.includes("pão") || chave.includes("brioche")) return IMAGENS_CATEGORIA.padaria;
  if (chave.includes("queijo") || chave.includes("coalho")) return IMAGENS_CATEGORIA.queijo;
  if (chave.includes("batata")) return IMAGENS_CATEGORIA.batata;
  if (chave.includes("horti") || chave.includes("tomate")) return IMAGENS_CATEGORIA.hortifruti;
  if (chave.includes("bebida") || chave.includes("cerveja") || chave.includes("refrigerante")) return IMAGENS_CATEGORIA.bebidas;
  return IMAGENS_CATEGORIA.padrao;
}

function situacao(p) {
  if (p.quantidade <= p.minimo * 0.7) {
    return { rotulo: "Baixo", classe: "pill-low", icon: "!" };
  }
  if (p.quantidade <= p.minimo) {
    return { rotulo: "No limite", classe: "pill-warning", icon: "!" };
  }
  return { rotulo: "Adequado", classe: "pill-ok", icon: "✓" };
}

function aviso(mensagem) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = mensagem;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function alternarTela(nome) {
  document.querySelectorAll(".view-panel").forEach((painel) => {
    painel.classList.toggle("active", painel.id === `page-${nome}`);
  });

  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === nome);
  });
}

function formatarDataHoje() {
  const agora = new Date();
  const opcoes = { weekday: 'long', day: 'numeric', month: 'long' };
  $("#currentDate").textContent = agora.toLocaleDateString('pt-BR', opcoes);
}

function templateCardProduto(p) {
  const imgUrl = obterImagem(p.nome, p.categoria);
  const status = situacao(p);

  return `
    <article class="product-item-card" data-id="${p.id}">
      <div class="product-thumbnail" style="background-image: url('${imgUrl}')"></div>
      <div class="product-details">
        <strong class="product-name">${escapar(p.nome)}</strong>
        <span class="product-qty-sub">${p.quantidade} ${escapar(p.unidade)}</span>
      </div>
      <span class="status-pill ${status.classe}">
        <span class="exclamation">${status.icon}</span>
        <span>${status.rotulo}</span>
      </span>
      <span class="card-chevron">›</span>
    </article>
  `;
}

function desenharInicio() {
  const itensAtencao = produtos.filter((p) => p.quantidade <= p.minimo);
  const solicitadas = solicitacoes.filter((s) => s.status === "Solicitada");
  const compradas = solicitacoes.filter((s) => s.status === "Comprada");

  $("#countLow").textContent = itensAtencao.length;
  $("#countRequests").textContent = solicitadas.length;
  $("#countReceive").textContent = compradas.length;

  const container = $("#attentionStockList");
  if (!itensAtencao.length) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:13px; padding:10px;">Estoque abastecido!</p>';
  } else {
    // Limita a exatamente 3 itens para o botão ficar visível sem precisar rolar
    container.innerHTML = itensAtencao.slice(0, 3).map(templateCardProduto).join("");
  }
}

function desenharTodosProdutos(filtro = "") {
  const container = $("#allStockList");
  if (!container) return;

  const lista = produtos.filter((p) =>
    (p.nome + " " + p.categoria).toLowerCase().includes(filtro.toLowerCase())
  );

  container.innerHTML = lista.map(templateCardProduto).join("");
}

function desenharSolicitacoes() {
  const container = $("#solicitacoesList");
  if (!container) return;

  if (!solicitacoes.length) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:13px; padding:10px;">Nenhuma solicitação aberta.</p>';
    return;
  }

  container.innerHTML = solicitacoes.map((s) => {
    let botaoAcao = "";
    if (s.status === "Solicitada") {
      botaoAcao = `<button class="btn-submit" style="padding:4px 8px; font-size:11px;" data-status-id="${s.id}" data-valor="Aprovada">Aprovar</button>`;
    } else if (s.status === "Aprovada") {
      botaoAcao = `<button class="btn-submit" style="padding:4px 8px; font-size:11px;" data-status-id="${s.id}" data-valor="Comprada">Comprar</button>`;
    } else if (s.status === "Comprada") {
      botaoAcao = `<button class="btn-submit" style="background:#3b632c; padding:4px 8px; font-size:11px;" data-receber-id="${s.id}" data-qtd="${s.quantidade}">Receber</button>`;
    }

    return `
      <article class="product-item-card">
        <div class="product-thumbnail" style="background:#efe5d8;">📋</div>
        <div class="product-details">
          <strong class="product-name">${escapar(s.produto)}</strong>
          <span class="product-qty-sub">${s.quantidade} ${escapar(s.unidade)} • ${escapar(s.solicitante)}</span>
          ${s.observacao ? `<span style="font-size:11px; color:var(--text-muted);">${escapar(s.observacao)}</span>` : ""}
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <span class="status-pill pill-warning">${escapar(s.status)}</span>
          ${botaoAcao}
        </div>
      </article>
    `;
  }).join("");
}

async function desenharHistorico() {
  const container = $("#historicoList");
  if (!container) return;

  const historico = await api("/api/historico");
  container.innerHTML = historico.slice(0, 10).map((h) => `
    <article class="product-item-card">
      <div class="product-thumbnail" style="background:#f4eae1;">⏱</div>
      <div class="product-details">
        <strong class="product-name">${escapar(h.tipo)} — ${escapar(h.produto)}</strong>
        <span class="product-qty-sub">${escapar(h.observacao || "Movimentação registrada")}</span>
        <span style="font-size:10px; color:var(--text-muted);">${escapar(h.criada_em)}</span>
      </div>
    </article>
  `).join("");
}

function preencherSelectProdutos() {
  const select = $("#requestProduct");
  select.innerHTML = produtos.map((p) =>
    `<option value="${p.id}">${escapar(p.nome)} (${escapar(p.unidade)})</option>`
  ).join("");
}

async function carregarDados() {
  try {
    [produtos, solicitacoes] = await Promise.all([
      api("/api/produtos"),
      api("/api/solicitacoes")
    ]);
    desenharInicio();
    desenharTodosProdutos();
    desenharSolicitacoes();
    desenharHistorico();
    preencherSelectProdutos();
  } catch (err) {
    aviso(err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  formatarDataHoje();
  carregarDados();

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => alternarTela(el.dataset.nav));
  });

  $("#searchStock")?.addEventListener("input", (e) => {
    desenharTodosProdutos(e.target.value);
  });

  const dialog = $("#requestDialog");
  $("#btnNovaSolicitacao")?.addEventListener("click", () => {
    preencherSelectProdutos();
    $("#requestQuantity").value = "";
    $("#requestNote").value = "";
    dialog.showModal();
  });

  $("#btnCancelDialog")?.addEventListener("click", () => dialog.close());

  $("#requestForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/solicitacoes", {
        method: "POST",
        body: JSON.stringify({
          produto_id: $("#requestProduct").value,
          quantidade: $("#requestQuantity").value,
          observacao: $("#requestNote").value
        })
      });
      dialog.close();
      await carregarDados();
      aviso("Solicitação enviada!");
    } catch (err) {
      aviso(err.message);
    }
  });

  document.addEventListener("click", async (e) => {
    const card = e.target.closest(".product-item-card[data-id]");
    if (card && !e.target.closest("button")) {
      const id = Number(card.dataset.id);
      const prod = produtos.find((p) => p.id === id);
      if (!prod) return;

      const novaQtd = prompt(`Atualizar estoque de ${prod.nome} (${prod.unidade}):`, prod.quantidade);
      if (novaQtd !== null && novaQtd.trim() !== "") {
        try {
          await api(`/api/produtos/${id}/contagem`, {
            method: "POST",
            body: JSON.stringify({ quantidade: novaQtd })
          });
          await carregarDados();
          aviso("Estoque atualizado.");
        } catch (err) {
          aviso(err.message);
        }
      }
    }

    const btnStatus = e.target.closest("[data-status-id]");
    if (btnStatus) {
      try {
        await api(`/api/solicitacoes/${btnStatus.dataset.statusId}/status`, {
          method: "POST",
          body: JSON.stringify({ status: btnStatus.dataset.valor })
        });
        await carregarDados();
        aviso("Status atualizado!");
      } catch (err) {
        aviso(err.message);
      }
    }

    const btnReceber = e.target.closest("[data-receber-id]");
    if (btnReceber) {
      const qtd = prompt("Quantidade recebida:", btnReceber.dataset.qtd);
      if (qtd !== null) {
        try {
          await api(`/api/solicitacoes/${btnReceber.dataset.receberId}/receber`, {
            method: "POST",
            body: JSON.stringify({ quantidade: qtd })
          });
          await carregarDados();
          aviso("Mercadoria recebida e somada ao estoque!");
        } catch (err) {
          aviso(err.message);
        }
      }
    }
  });
});