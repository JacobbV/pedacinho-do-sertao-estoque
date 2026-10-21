"""Pedacinho do Sertão — Controle de estoque (V2.0.0)

Login com níveis de acesso, pedidos sem quantidade (o admin define),
compras com conferência de entrega e balanço de estoque por etapas.
"""
import os
import re
import secrets
import sqlite3
import time
from datetime import timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)
DATABASE = Path(os.environ.get("PEDACINHO_DB", INSTANCE_DIR / "pedacinho.db"))

ETAPAS = ["Cozinha · Ingredientes", "Salão · Bebidas", "Salão · Descartáveis"]
SETORES = ("Cozinha", "Salão")
STATUS_ABERTOS = ("Solicitada", "Aprovada", "Comprada")

app = Flask(__name__)


def _chave_secreta():
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    arquivo = INSTANCE_DIR / "secret_key"
    if not arquivo.exists():
        arquivo.write_text(secrets.token_hex(32))
    return arquivo.read_text().strip()


app.secret_key = _chave_secreta()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)


# ----------------------------------------------------------------- banco
def conectar():
    conexao = sqlite3.connect(DATABASE)
    conexao.row_factory = sqlite3.Row
    conexao.execute("PRAGMA foreign_keys = ON")
    return conexao


def colunas(con, tabela):
    return {r["name"] for r in con.execute(f"PRAGMA table_info({tabela})")}


def adicionar_coluna(con, tabela, coluna, definicao):
    if coluna not in colunas(con, tabela):
        con.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao}")
        return True
    return False


def registrar_movimento(con, produto_id, tipo, quantidade, observacao, usuario=None):
    con.execute(
        """INSERT INTO movimentos (produto_id, tipo, quantidade, observacao, usuario)
           VALUES (?, ?, ?, ?, ?)""",
        (produto_id, tipo, quantidade, observacao, usuario),
    )


def preparar_banco():
    con = conectar()
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL, categoria TEXT NOT NULL, unidade TEXT NOT NULL,
            quantidade REAL NOT NULL DEFAULT 0, minimo REAL NOT NULL DEFAULT 0,
            desejado REAL NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS solicitacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER NOT NULL, quantidade REAL NOT NULL,
            observacao TEXT DEFAULT '', solicitante TEXT NOT NULL DEFAULT 'Equipe',
            status TEXT NOT NULL DEFAULT 'Solicitada',
            criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );
        CREATE TABLE IF NOT EXISTS movimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER NOT NULL, tipo TEXT NOT NULL, quantidade REAL NOT NULL,
            observacao TEXT DEFAULT '',
            criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
            senha_hash TEXT NOT NULL,
            nivel TEXT NOT NULL DEFAULT 'novo',
            setor TEXT NOT NULL DEFAULT 'Cozinha',
            pode_pedir INTEGER NOT NULL DEFAULT 1,
            pode_receber INTEGER NOT NULL DEFAULT 0,
            pode_contar INTEGER NOT NULL DEFAULT 0,
            trocar_senha INTEGER NOT NULL DEFAULT 1,
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE TABLE IF NOT EXISTS balancos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL DEFAULT 'aberto',
            aberto_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            fechado_em TEXT, aberto_por TEXT
        );
        CREATE TABLE IF NOT EXISTS balanco_etapas (
            balanco_id INTEGER NOT NULL, etapa TEXT NOT NULL,
            liberada INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (balanco_id, etapa)
        );
        CREATE TABLE IF NOT EXISTS balanco_contagens (
            balanco_id INTEGER NOT NULL, produto_id INTEGER NOT NULL,
            contado REAL NOT NULL, contado_por TEXT,
            contado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (balanco_id, produto_id)
        );
        """
    )
    # migrações para bancos criados nas versões anteriores
    if adicionar_coluna(con, "produtos", "setor", "TEXT NOT NULL DEFAULT 'Cozinha'"):
        con.execute(
            "UPDATE produtos SET setor='Salão' WHERE categoria IN ('Bebidas','Embalagens')"
        )
    adicionar_coluna(con, "solicitacoes", "pedido_codigo", "TEXT")
    adicionar_coluna(con, "solicitacoes", "qtd_aprovada", "REAL")
    adicionar_coluna(con, "solicitacoes", "qtd_recebida", "REAL")
    adicionar_coluna(con, "solicitacoes", "usuario_id", "INTEGER")
    adicionar_coluna(con, "movimentos", "usuario", "TEXT")
    con.execute(
        """UPDATE solicitacoes SET qtd_aprovada = quantidade
           WHERE qtd_aprovada IS NULL AND status IN ('Aprovada','Comprada','Recebida')"""
    )

    if con.execute("SELECT COUNT(*) FROM produtos").fetchone()[0] == 0:
        produtos = [
            ("Blend bovino", "Carnes", "kg", 2.5, 5, 12, "Cozinha"),
            ("Pão brioche", "Padaria", "un", 8, 12, 30, "Cozinha"),
            ("Queijo coalho", "Laticínios", "kg", 1.8, 3, 8, "Cozinha"),
            ("Batata palito", "Acompanhamentos", "kg", 3, 5, 12, "Cozinha"),
            ("Tomate", "Hortifruti", "kg", 2, 3, 6, "Cozinha"),
            ("Refrigerante cola", "Bebidas", "un", 24, 12, 36, "Salão"),
            ("Água mineral", "Bebidas", "un", 18, 12, 36, "Salão"),
            ("Cerveja lata", "Bebidas", "un", 16, 12, 30, "Salão"),
            ("Polpa de acerola", "Bebidas", "kg", 10, 5, 20, "Salão"),
            ("Embalagem para hambúrguer", "Embalagens", "un", 35, 20, 80, "Salão"),
        ]
        con.executemany(
            """INSERT INTO produtos (nome, categoria, unidade, quantidade, minimo, desejado, setor)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            produtos,
        )
    con.commit()
    con.close()


# --------------------------------------------------------------- utilidades
def erro(mensagem, codigo=400, **extra):
    return jsonify(erro=mensagem, **extra), codigo


def numero(valor):
    if isinstance(valor, str):
        valor = valor.replace(",", ".")
    return float(valor)


def status_estoque(quantidade, minimo):
    if quantidade < minimo:
        return "baixo"
    if minimo > 0 and quantidade <= minimo * 1.25:
        return "limite"
    return "ok"


def etapa_do(produto):
    if produto["setor"] == "Cozinha":
        return ETAPAS[0]
    return ETAPAS[1] if produto["categoria"] == "Bebidas" else ETAPAS[2]


def setor_cobre(usuario, texto):
    """True se o usuário atua no setor (ou etapa) indicado."""
    return usuario["nivel"] == "admin" or usuario["setor"] == "Todos" or texto.startswith(usuario["setor"])


def usuario_publico(u):
    return {
        "id": u["id"], "nome": u["nome"], "usuario": u["usuario"], "nivel": u["nivel"],
        "setor": u["setor"], "pode_pedir": bool(u["pode_pedir"]) or u["nivel"] == "admin",
        "pode_receber": bool(u["pode_receber"]) or u["nivel"] == "admin",
        "pode_contar": bool(u["pode_contar"]) or u["nivel"] == "admin",
        "trocar_senha": bool(u["trocar_senha"]), "ativo": bool(u["ativo"]),
    }


# --------------------------------------------------------------- autenticação
_tentativas = {}


def bloqueado(chave):
    agora = time.time()
    lista = [t for t in _tentativas.get(chave, []) if agora - t < 600]
    _tentativas[chave] = lista
    return len(lista) >= 5


def registrar_falha(chave):
    _tentativas.setdefault(chave, []).append(time.time())


def usuario_atual():
    uid = session.get("uid")
    if not uid:
        return None
    con = conectar()
    linha = con.execute("SELECT * FROM usuarios WHERE id = ? AND ativo = 1", (uid,)).fetchone()
    con.close()
    if linha is None:
        session.clear()
        return None
    return dict(linha)


def pode(u, permissao):
    return u["nivel"] == "admin" or bool(u[permissao])


def protegido(admin=False, permissao=None):
    def decorador(funcao):
        @wraps(funcao)
        def interno(*args, **kwargs):
            u = usuario_atual()
            if u is None:
                return erro("Faça login para continuar.", 401)
            if u["trocar_senha"] and request.endpoint not in ("api_me", "api_senha", "api_logout"):
                return erro("Troque a senha provisória para continuar.", 403, trocar_senha=True)
            if admin and u["nivel"] != "admin":
                return erro("Apenas administradores podem fazer isso.", 403)
            if permissao and not pode(u, permissao):
                return erro("Você não tem permissão para isso.", 403)
            g.usuario = u
            return funcao(*args, **kwargs)
        return interno
    return decorador


def existe_usuario():
    con = conectar()
    n = con.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
    con.close()
    return n > 0


@app.after_request
def sem_cache_na_api(resposta):
    if request.path.startswith("/api/"):
        resposta.headers["Cache-Control"] = "no-store"
    return resposta


@app.get("/")
def inicio():
    if usuario_atual() is None:
        return redirect("/login")
    return render_template("index.html")


@app.get("/login")
def pagina_login():
    if usuario_atual() is not None:
        return redirect("/")
    return render_template("login.html", primeiro_acesso=not existe_usuario())


def validar_novo_usuario(dados):
    nome = str(dados.get("nome", "")).strip()
    usuario = str(dados.get("usuario", "")).strip().lower()
    senha = str(dados.get("senha", ""))
    if len(nome) < 2:
        return None, "Informe o nome."
    if not re.fullmatch(r"[a-z0-9._-]{3,30}", usuario):
        return None, "Usuário: 3 a 30 letras minúsculas, números, ponto, hífen ou _."
    if len(senha) < 6:
        return None, "A senha precisa ter pelo menos 6 caracteres."
    return (nome, usuario, senha), None


@app.post("/api/setup")
def api_setup():
    if existe_usuario():
        return erro("O sistema já foi configurado.", 403)
    valores, problema = validar_novo_usuario(request.get_json(silent=True) or {})
    if problema:
        return erro(problema)
    nome, usuario, senha = valores
    con = conectar()
    cur = con.execute(
        """INSERT INTO usuarios (nome, usuario, senha_hash, nivel, setor, pode_pedir,
           pode_receber, pode_contar, trocar_senha) VALUES (?, ?, ?, 'admin', 'Todos', 1, 1, 1, 0)""",
        (nome, usuario, generate_password_hash(senha)),
    )
    con.commit()
    con.close()
    session.clear()
    session["uid"] = cur.lastrowid
    session.permanent = True
    return jsonify(ok=True)


@app.post("/api/login")
def api_login():
    dados = request.get_json(silent=True) or {}
    usuario = str(dados.get("usuario", "")).strip().lower()
    senha = str(dados.get("senha", ""))
    chave = f"{request.remote_addr}:{usuario}"
    if bloqueado(chave):
        return erro("Muitas tentativas. Aguarde alguns minutos.", 429)
    con = conectar()
    linha = con.execute("SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1", (usuario,)).fetchone()
    con.close()
    if linha is None or not check_password_hash(linha["senha_hash"], senha):
        registrar_falha(chave)
        return erro("Usuário ou senha incorretos.", 401)
    session.clear()
    session["uid"] = linha["id"]
    session.permanent = True
    return jsonify(ok=True)


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
@protegido()
def api_me():
    return jsonify(usuario_publico(g.usuario))


@app.post("/api/senha")
@protegido()
def api_senha():
    dados = request.get_json(silent=True) or {}
    u = g.usuario
    if not check_password_hash(u["senha_hash"], str(dados.get("atual", ""))):
        return erro("A senha atual está incorreta.")
    nova = str(dados.get("nova", ""))
    if len(nova) < 6:
        return erro("A nova senha precisa ter pelo menos 6 caracteres.")
    con = conectar()
    con.execute("UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?",
                (generate_password_hash(nova), u["id"]))
    con.commit()
    con.close()
    return jsonify(ok=True)


# --------------------------------------------------------------- equipe (admin)
@app.get("/api/equipe")
@protegido(admin=True)
def api_equipe():
    con = conectar()
    linhas = con.execute("SELECT * FROM usuarios ORDER BY ativo DESC, nivel, nome").fetchall()
    con.close()
    return jsonify([usuario_publico(dict(l)) for l in linhas])


def _aplicar_permissoes(dados, nivel):
    if nivel == "admin":
        return 1, 1, 1
    pedir = 1 if dados.get("pode_pedir", True) else 0
    if nivel == "novo":
        return pedir, 0, 0
    return pedir, 1 if dados.get("pode_receber") else 0, 1 if dados.get("pode_contar") else 0


@app.post("/api/equipe")
@protegido(admin=True)
def api_criar_colaborador():
    dados = request.get_json(silent=True) or {}
    valores, problema = validar_novo_usuario(dados)
    if problema:
        return erro(problema)
    nome, usuario, senha = valores
    nivel = dados.get("nivel", "novo")
    setor = dados.get("setor", "Cozinha")
    if nivel not in ("novo", "padrao", "admin"):
        return erro("Nível inválido.")
    if nivel == "admin":
        setor = "Todos"
    elif setor not in SETORES:
        return erro("Escolha o setor: Cozinha ou Salão.")
    pedir, receber, contar = _aplicar_permissoes(dados, nivel)
    con = conectar()
    try:
        con.execute(
            """INSERT INTO usuarios (nome, usuario, senha_hash, nivel, setor, pode_pedir,
               pode_receber, pode_contar, trocar_senha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (nome, usuario, generate_password_hash(senha), nivel, setor, pedir, receber, contar),
        )
        con.commit()
    except sqlite3.IntegrityError:
        con.close()
        return erro("Esse usuário já existe.", 409)
    con.close()
    return jsonify(ok=True), 201


@app.post("/api/equipe/<int:uid>")
@protegido(admin=True)
def api_editar_colaborador(uid):
    dados = request.get_json(silent=True) or {}
    con = conectar()
    alvo = con.execute("SELECT * FROM usuarios WHERE id = ?", (uid,)).fetchone()
    if alvo is None:
        con.close()
        return erro("Colaborador não encontrado.", 404)
    nivel = dados.get("nivel", alvo["nivel"])
    ativo = 1 if dados.get("ativo", bool(alvo["ativo"])) else 0
    if uid == g.usuario["id"] and (nivel != "admin" or not ativo):
        con.close()
        return erro("Você não pode remover o próprio acesso de administrador.")
    if nivel not in ("novo", "padrao", "admin"):
        con.close()
        return erro("Nível inválido.")
    setor = "Todos" if nivel == "admin" else dados.get("setor", alvo["setor"])
    if nivel != "admin" and setor not in SETORES:
        setor = "Cozinha"
    pedir, receber, contar = _aplicar_permissoes(dados, nivel)
    con.execute(
        """UPDATE usuarios SET nome = ?, nivel = ?, setor = ?, pode_pedir = ?, pode_receber = ?,
           pode_contar = ?, ativo = ? WHERE id = ?""",
        (str(dados.get("nome", alvo["nome"])).strip() or alvo["nome"], nivel, setor,
         pedir, receber, contar, ativo, uid),
    )
    nova = dados.get("nova_senha")
    if nova:
        if len(str(nova)) < 6:
            con.close()
            return erro("A senha precisa ter pelo menos 6 caracteres.")
        con.execute("UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?",
                    (generate_password_hash(str(nova)), uid))
    con.commit()
    con.close()
    return jsonify(ok=True)


# --------------------------------------------------------------- produtos
def produto_json(p, completo):
    base = {"id": p["id"], "nome": p["nome"], "categoria": p["categoria"],
            "unidade": p["unidade"], "setor": p["setor"], "frequencia": p["frequencia"]}
    if completo:
        base.update(quantidade=p["quantidade"], minimo=p["minimo"], desejado=p["desejado"],
                    status=status_estoque(p["quantidade"], p["minimo"]))
    return base


SQL_PRODUTOS = """SELECT p.*, (SELECT COUNT(*) FROM solicitacoes s WHERE s.produto_id = p.id
                  AND s.criada_em >= datetime('now', 'localtime', '-90 days')) AS frequencia
                  FROM produtos p"""


@app.get("/api/produtos")
@protegido()
def api_produtos():
    u = g.usuario
    con = conectar()
    linhas = con.execute(SQL_PRODUTOS + " ORDER BY p.categoria, p.nome").fetchall()
    con.close()
    if u["nivel"] == "admin":
        return jsonify([produto_json(l, True) for l in linhas])
    if not pode(u, "pode_pedir"):
        return erro("Você não tem permissão para isso.", 403)
    return jsonify([produto_json(l, False) for l in linhas if setor_cobre(u, l["setor"])])


def _campos_produto(dados, atual=None):
    nome = str(dados.get("nome", atual["nome"] if atual else "")).strip()
    unidade = str(dados.get("unidade", atual["unidade"] if atual else "")).strip()
    categoria = str(dados.get("categoria", atual["categoria"] if atual else "Outros")).strip() or "Outros"
    setor = dados.get("setor", atual["setor"] if atual else "Cozinha")
    if not nome or not unidade:
        raise ValueError("Informe o nome e a unidade.")
    if setor not in SETORES:
        raise ValueError("Setor inválido.")
    try:
        quantidade = numero(dados.get("quantidade", atual["quantidade"] if atual else 0))
        minimo = numero(dados.get("minimo", atual["minimo"] if atual else 0))
        desejado = numero(dados.get("desejado", atual["desejado"] if atual else 0))
    except (TypeError, ValueError):
        raise ValueError("Confira os números informados.")
    if min(quantidade, minimo, desejado) < 0:
        raise ValueError("Os números não podem ser negativos.")
    return nome, categoria, unidade, setor, quantidade, minimo, desejado


@app.post("/api/produtos")
@protegido(admin=True)
def api_criar_produto():
    try:
        nome, cat, uni, setor, qtd, mini, des = _campos_produto(request.get_json(silent=True) or {})
    except ValueError as e:
        return erro(str(e))
    con = conectar()
    cur = con.execute(
        """INSERT INTO produtos (nome, categoria, unidade, quantidade, minimo, desejado, setor)
           VALUES (?, ?, ?, ?, ?, ?, ?)""", (nome, cat, uni, qtd, mini, des, setor))
    registrar_movimento(con, cur.lastrowid, "Produto cadastrado", qtd, nome, g.usuario["nome"])
    con.commit()
    con.close()
    return jsonify(ok=True), 201


@app.post("/api/produtos/<int:produto_id>")
@protegido(admin=True)
def api_editar_produto(produto_id):
    con = conectar()
    atual = con.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    if atual is None:
        con.close()
        return erro("Produto não encontrado.", 404)
    try:
        nome, cat, uni, setor, qtd, mini, des = _campos_produto(request.get_json(silent=True) or {}, atual)
    except ValueError as e:
        con.close()
        return erro(str(e))
    con.execute(
        """UPDATE produtos SET nome=?, categoria=?, unidade=?, setor=?, quantidade=?, minimo=?, desejado=?
           WHERE id=?""", (nome, cat, uni, setor, qtd, mini, des, produto_id))
    if qtd != atual["quantidade"]:
        registrar_movimento(con, produto_id, "Contagem de estoque", qtd,
                            f"Quantidade alterada de {atual['quantidade']:g} para {qtd:g}.", g.usuario["nome"])
    if mini != atual["minimo"]:
        registrar_movimento(con, produto_id, "Mínimo alterado", mini,
                            f"Mínimo de {atual['minimo']:g} para {mini:g}.", g.usuario["nome"])
    con.commit()
    con.close()
    return jsonify(ok=True)


# --------------------------------------------------------------- pedidos
CHAVE_PEDIDO = "COALESCE(s.pedido_codigo, 'L' || s.id)"


@app.post("/api/pedidos")
@protegido(permissao="pode_pedir")
def api_criar_pedido():
    u = g.usuario
    itens = (request.get_json(silent=True) or {}).get("itens") or []
    if not itens:
        return erro("Marque pelo menos um item.")
    codigo = secrets.token_hex(4).upper()
    con = conectar()
    criados, repetidos = 0, []
    for item in itens:
        try:
            pid = int(item.get("produto_id"))
        except (TypeError, ValueError):
            continue
        p = con.execute("SELECT * FROM produtos WHERE id = ?", (pid,)).fetchone()
        if p is None or not setor_cobre(u, p["setor"]):
            continue
        aberto = con.execute(
            "SELECT 1 FROM solicitacoes WHERE produto_id = ? AND status IN ('Solicitada','Aprovada','Comprada')",
            (pid,)).fetchone()
        if aberto:
            repetidos.append(p["nome"])
            continue
        status, qtd = "Solicitada", 0.0
        if u["nivel"] == "admin":
            try:
                qtd = max(numero(item.get("quantidade") or 0), 0)
            except (TypeError, ValueError):
                qtd = 0.0
            if qtd > 0:
                status = "Aprovada"
        con.execute(
            """INSERT INTO solicitacoes (produto_id, quantidade, observacao, solicitante, status,
               pedido_codigo, qtd_aprovada, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (pid, qtd, str(item.get("observacao") or "").strip()[:200], u["nome"], status, codigo,
             qtd if status == "Aprovada" else None, u["id"]))
        registrar_movimento(con, pid, "Solicitação criada", qtd,
                            f"Pedido de {p['nome']} feito por {u['nome']}.", u["nome"])
        criados += 1
    con.commit()
    con.close()
    if criados == 0:
        msg = "Esses itens já têm pedido em andamento." if repetidos else "Nenhum item válido."
        return erro(msg, 409 if repetidos else 400, repetidos=repetidos)
    return jsonify(ok=True, codigo=codigo, criados=criados, repetidos=repetidos), 201


def agrupar_pedidos(linhas, admin):
    grupos = {}
    for l in linhas:
        cod = l["pedido_codigo"] or f"L{l['id']}"
        gp = grupos.setdefault(cod, {"codigo": cod, "solicitante": l["solicitante"],
                                     "criada_em": l["criada_em"], "itens": []})
        item = {"id": l["id"], "produto_id": l["produto_id"], "produto": l["produto"],
                "unidade": l["unidade"], "status": l["status"], "observacao": l["observacao"],
                "qtd_aprovada": l["qtd_aprovada"], "qtd_recebida": l["qtd_recebida"]}
        if admin:
            item.update(estoque=l["estoque"], minimo=l["minimo"], desejado=l["desejado"],
                        status_estoque=status_estoque(l["estoque"], l["minimo"]))
        gp["itens"].append(item)
    saida = []
    for gp in grupos.values():
        st = [i["status"] for i in gp["itens"]]
        gp["geral"] = ("Pendente" if "Solicitada" in st else
                       "Concluído" if all(s in ("Recebida", "Recusada") for s in st) else "Em andamento")
        saida.append(gp)
    return saida


@app.get("/api/pedidos")
@protegido()
def api_listar_pedidos():
    u = g.usuario
    admin = u["nivel"] == "admin"
    sql = """SELECT s.*, p.nome AS produto, p.unidade, p.quantidade AS estoque, p.minimo, p.desejado
             FROM solicitacoes s JOIN produtos p ON p.id = s.produto_id """
    parametros = ()
    if not admin:
        sql += "WHERE s.usuario_id = ? "
        parametros = (u["id"],)
    sql += "ORDER BY s.id DESC LIMIT 300"
    con = conectar()
    linhas = con.execute(sql, parametros).fetchall()
    con.close()
    grupos = agrupar_pedidos(linhas, admin)
    if admin and request.args.get("apenas") == "pendentes":
        grupos = [gp for gp in grupos if gp["geral"] == "Pendente"]
    return jsonify(grupos[:60])


@app.post("/api/pedidos/<codigo>/aprovar")
@protegido(admin=True)
def api_aprovar_pedido(codigo):
    itens = (request.get_json(silent=True) or {}).get("itens") or []
    con = conectar()
    aprovados = recusados = 0
    for item in itens:
        try:
            sid, qtd = int(item.get("id")), numero(item.get("quantidade") or 0)
        except (TypeError, ValueError):
            continue
        s = con.execute(
            f"SELECT s.*, p.nome AS produto FROM solicitacoes s JOIN produtos p ON p.id = s.produto_id "
            f"WHERE s.id = ? AND s.status = 'Solicitada' AND {CHAVE_PEDIDO} = ?", (sid, codigo)).fetchone()
        if s is None:
            continue
        if qtd > 0:
            con.execute("UPDATE solicitacoes SET status='Aprovada', qtd_aprovada=?, quantidade=? WHERE id=?",
                        (qtd, qtd, sid))
            registrar_movimento(con, s["produto_id"], "Aprovada", qtd,
                                f"Pedido de {s['produto']} aprovado.", g.usuario["nome"])
            aprovados += 1
        else:
            con.execute("UPDATE solicitacoes SET status='Recusada' WHERE id=?", (sid,))
            registrar_movimento(con, s["produto_id"], "Recusada", 0,
                                f"Pedido de {s['produto']} recusado.", g.usuario["nome"])
            recusados += 1
    con.commit()
    con.close()
    if aprovados + recusados == 0:
        return erro("Nada para aprovar nesse pedido.", 404)
    return jsonify(ok=True, aprovados=aprovados, recusados=recusados)


@app.post("/api/pedidos/<codigo>/recusar")
@protegido(admin=True)
def api_recusar_pedido(codigo):
    con = conectar()
    linhas = con.execute(
        f"SELECT s.* FROM solicitacoes s WHERE s.status = 'Solicitada' AND {CHAVE_PEDIDO} = ?", (codigo,)).fetchall()
    for s in linhas:
        con.execute("UPDATE solicitacoes SET status='Recusada' WHERE id=?", (s["id"],))
        registrar_movimento(con, s["produto_id"], "Recusada", 0, "Pedido recusado.", g.usuario["nome"])
    con.commit()
    con.close()
    return jsonify(ok=True, recusados=len(linhas))


# --------------------------------------------------------------- compras
@app.get("/api/compras")
@protegido()
def api_compras():
    u = g.usuario
    if not pode(u, "pode_receber"):
        return erro("Você não tem permissão para isso.", 403)
    con = conectar()
    linhas = con.execute(
        """SELECT s.*, p.nome AS produto, p.unidade FROM solicitacoes s
           JOIN produtos p ON p.id = s.produto_id WHERE s.status IN ('Aprovada','Comprada')
           ORDER BY s.id""").fetchall()
    con.close()

    def item(s):
        return {"id": s["id"], "produto_id": s["produto_id"], "produto": s["produto"], "unidade": s["unidade"],
                "qtd": s["qtd_aprovada"] or s["quantidade"], "solicitante": s["solicitante"],
                "pedido": s["pedido_codigo"] or f"L{s['id']}"}
    return jsonify(
        a_comprar=[item(s) for s in linhas if s["status"] == "Aprovada"] if u["nivel"] == "admin" else [],
        a_receber=[item(s) for s in linhas if s["status"] == "Comprada"])


@app.post("/api/compras/comprar")
@protegido(admin=True)
def api_marcar_comprado():
    ids = (request.get_json(silent=True) or {}).get("ids") or []
    con = conectar()
    feitos = 0
    for sid in ids:
        s = con.execute("SELECT s.*, p.nome AS produto FROM solicitacoes s JOIN produtos p ON p.id = s.produto_id "
                        "WHERE s.id = ? AND s.status = 'Aprovada'", (sid,)).fetchone()
        if s is None:
            continue
        con.execute("UPDATE solicitacoes SET status='Comprada' WHERE id=?", (sid,))
        registrar_movimento(con, s["produto_id"], "Comprada", s["qtd_aprovada"] or s["quantidade"],
                            f"{s['produto']} marcado como comprado.", g.usuario["nome"])
        feitos += 1
    con.commit()
    con.close()
    if feitos == 0:
        return erro("Nenhum item para marcar como comprado.", 404)
    return jsonify(ok=True, comprados=feitos)


def _receber(con, usuario, sid, qtd):
    s = con.execute(
        """SELECT s.*, p.nome AS produto, p.unidade, p.quantidade AS estoque FROM solicitacoes s
           JOIN produtos p ON p.id = s.produto_id WHERE s.id = ?""", (sid,)).fetchone()
    if s is None:
        raise LookupError("Pedido não encontrado.")
    if s["status"] != "Comprada":
        raise ValueError("Esse item ainda não foi marcado como comprado.")
    pedido = s["qtd_aprovada"] or s["quantidade"]
    con.execute("UPDATE produtos SET quantidade = ? WHERE id = ?", (s["estoque"] + qtd, s["produto_id"]))
    con.execute("UPDATE solicitacoes SET status='Recebida', qtd_recebida=? WHERE id=?", (qtd, sid))
    nota = f"Recebido {qtd:g} {s['unidade']} de {pedido:g} pedidos"
    if qtd < pedido:
        nota += f" (faltaram {pedido - qtd:g})"
    registrar_movimento(con, s["produto_id"], "Mercadoria recebida", qtd, nota + ".", usuario["nome"])


@app.post("/api/compras/receber")
@protegido(permissao="pode_receber")
def api_receber_varios():
    itens = (request.get_json(silent=True) or {}).get("itens") or []
    con = conectar()
    try:
        for item in itens:
            try:
                sid, qtd = int(item.get("id")), numero(item.get("quantidade"))
            except (TypeError, ValueError):
                raise ValueError("Confira as quantidades recebidas.")
            if qtd <= 0:
                raise ValueError("A quantidade recebida precisa ser maior que zero.")
            _receber(con, g.usuario, sid, qtd)
        con.commit()
    except LookupError as e:
        con.rollback()
        return erro(str(e), 404)
    except ValueError as e:
        con.rollback()
        return erro(str(e))
    finally:
        con.close()
    return jsonify(ok=True, recebidos=len(itens))


# --------------------------------------------------------------- balanço
def balanco_aberto(con):
    return con.execute("SELECT * FROM balancos WHERE status = 'aberto' ORDER BY id DESC LIMIT 1").fetchone()


def estado_balanco(con, bal):
    produtos = con.execute("SELECT id, setor, categoria FROM produtos").fetchall()
    liberadas = {}
    contados = set()
    if bal:
        liberadas = {r["etapa"]: bool(r["liberada"]) for r in
                     con.execute("SELECT * FROM balanco_etapas WHERE balanco_id = ?", (bal["id"],))}
        contados = {r["produto_id"] for r in
                    con.execute("SELECT produto_id FROM balanco_contagens WHERE balanco_id = ?", (bal["id"],))}
    etapas = {e: {"nome": e, "liberada": liberadas.get(e, False), "total": 0, "contados": 0} for e in ETAPAS}
    for p in produtos:
        e = etapas[etapa_do(p)]
        e["total"] += 1
        e["contados"] += 1 if p["id"] in contados else 0
    return list(etapas.values())


@app.get("/api/balanco")
@protegido()
def api_balanco():
    u = g.usuario
    if not pode(u, "pode_contar"):
        return erro("Você não tem permissão para isso.", 403)
    con = conectar()
    bal = balanco_aberto(con)
    etapas = estado_balanco(con, bal)
    ultimo = con.execute("SELECT fechado_em FROM balancos WHERE status='fechado' ORDER BY id DESC LIMIT 1").fetchone()
    con.close()
    if u["nivel"] != "admin":
        etapas = [e for e in etapas if e["liberada"] and setor_cobre(u, e["nome"])] if bal else []
    return jsonify(aberto=bal is not None, aberto_em=bal["aberto_em"] if bal else None,
                   etapas=etapas, total=sum(e["total"] for e in etapas),
                   contados=sum(e["contados"] for e in etapas),
                   ultimo_fechamento=ultimo["fechado_em"] if ultimo else None)


@app.post("/api/balanco/iniciar")
@protegido(admin=True)
def api_iniciar_balanco():
    etapas = (request.get_json(silent=True) or {}).get("etapas") or []
    con = conectar()
    if balanco_aberto(con):
        con.close()
        return erro("Já existe um balanço aberto.", 409)
    cur = con.execute("INSERT INTO balancos (aberto_por) VALUES (?)", (g.usuario["nome"],))
    for e in ETAPAS:
        con.execute("INSERT INTO balanco_etapas (balanco_id, etapa, liberada) VALUES (?, ?, ?)",
                    (cur.lastrowid, e, 1 if e in etapas else 0))
    con.commit()
    con.close()
    return jsonify(ok=True), 201


@app.post("/api/balanco/etapas")
@protegido(admin=True)
def api_liberar_etapa():
    dados = request.get_json(silent=True) or {}
    con = conectar()
    bal = balanco_aberto(con)
    if bal is None or dados.get("etapa") not in ETAPAS:
        con.close()
        return erro("Balanço ou etapa inválidos.", 404)
    con.execute("UPDATE balanco_etapas SET liberada = ? WHERE balanco_id = ? AND etapa = ?",
                (1 if dados.get("liberada") else 0, bal["id"], dados["etapa"]))
    con.commit()
    con.close()
    return jsonify(ok=True)


@app.get("/api/balanco/contagem")
@protegido(permissao="pode_contar")
def api_itens_contagem():
    u = g.usuario
    con = conectar()
    bal = balanco_aberto(con)
    if bal is None:
        con.close()
        return jsonify([])
    liberadas = {r["etapa"] for r in con.execute(
        "SELECT etapa FROM balanco_etapas WHERE balanco_id = ? AND liberada = 1", (bal["id"],))}
    contagens = {r["produto_id"]: r["contado"] for r in con.execute(
        "SELECT produto_id, contado FROM balanco_contagens WHERE balanco_id = ?", (bal["id"],))}
    produtos = con.execute("SELECT * FROM produtos ORDER BY categoria, nome").fetchall()
    con.close()
    saida = []
    for p in produtos:
        etapa = etapa_do(p)
        if etapa in liberadas and setor_cobre(u, etapa):
            saida.append({"produto_id": p["id"], "nome": p["nome"], "unidade": p["unidade"],
                          "etapa": etapa, "contado": contagens.get(p["id"])})
    return jsonify(saida)  # contagem às cegas: o estoque do sistema não é enviado


@app.post("/api/balanco/contagem")
@protegido(permissao="pode_contar")
def api_enviar_contagem():
    u = g.usuario
    itens = (request.get_json(silent=True) or {}).get("itens") or []
    con = conectar()
    bal = balanco_aberto(con)
    if bal is None:
        con.close()
        return erro("Não há balanço aberto.", 409)
    liberadas = {r["etapa"] for r in con.execute(
        "SELECT etapa FROM balanco_etapas WHERE balanco_id = ? AND liberada = 1", (bal["id"],))}
    salvos = 0
    for item in itens:
        try:
            pid, qtd = int(item.get("produto_id")), numero(item.get("quantidade"))
        except (TypeError, ValueError):
            continue
        p = con.execute("SELECT * FROM produtos WHERE id = ?", (pid,)).fetchone()
        if qtd < 0 or p is None or etapa_do(p) not in liberadas or not setor_cobre(u, etapa_do(p)):
            continue
        con.execute(
            """INSERT INTO balanco_contagens (balanco_id, produto_id, contado, contado_por)
               VALUES (?, ?, ?, ?) ON CONFLICT(balanco_id, produto_id)
               DO UPDATE SET contado = excluded.contado, contado_por = excluded.contado_por,
               contado_em = datetime('now', 'localtime')""", (bal["id"], pid, qtd, u["nome"]))
        salvos += 1
    con.commit()
    con.close()
    return jsonify(ok=True, salvos=salvos)


def _conferencia(con, bal):
    linhas = con.execute(
        """SELECT p.id, p.nome, p.unidade, p.quantidade AS sistema, c.contado, c.contado_por
           FROM balanco_contagens c JOIN produtos p ON p.id = c.produto_id
           WHERE c.balanco_id = ? ORDER BY p.nome""", (bal["id"],)).fetchall()
    itens = [dict(l, diferenca=round(l["contado"] - l["sistema"], 4)) for l in linhas]
    return itens


@app.get("/api/balanco/conferir")
@protegido(admin=True)
def api_conferir():
    con = conectar()
    bal = balanco_aberto(con)
    if bal is None:
        con.close()
        return erro("Não há balanço aberto.", 404)
    itens = _conferencia(con, bal)
    total = sum(e["total"] for e in estado_balanco(con, bal) if e["liberada"])
    con.close()
    return jsonify(itens=itens, contados=len(itens), liberados=total,
                   com_diferenca=sum(1 for i in itens if i["diferenca"] != 0))


@app.post("/api/balanco/recontar")
@protegido(admin=True)
def api_recontar():
    ids = (request.get_json(silent=True) or {}).get("produto_ids") or []
    con = conectar()
    bal = balanco_aberto(con)
    if bal is None:
        con.close()
        return erro("Não há balanço aberto.", 404)
    if not ids:
        ids = [i["id"] for i in _conferencia(con, bal) if i["diferenca"] != 0]
    for pid in ids:
        con.execute("DELETE FROM balanco_contagens WHERE balanco_id = ? AND produto_id = ?", (bal["id"], pid))
    con.commit()
    con.close()
    return jsonify(ok=True, apagados=len(ids))


@app.post("/api/balanco/fechar")
@protegido(admin=True)
def api_fechar_balanco():
    forcar = bool((request.get_json(silent=True) or {}).get("forcar"))
    con = conectar()
    bal = balanco_aberto(con)
    if bal is None:
        con.close()
        return erro("Não há balanço aberto.", 404)
    itens = _conferencia(con, bal)
    pendentes = sum(e["total"] - e["contados"] for e in estado_balanco(con, bal) if e["liberada"])
    if pendentes and not forcar:
        con.close()
        return erro(f"Ainda faltam {pendentes} itens para contar.", 409, faltam=pendentes)
    for i in itens:
        con.execute("UPDATE produtos SET quantidade = ? WHERE id = ?", (i["contado"], i["id"]))
        registrar_movimento(con, i["id"], "Balanço", i["contado"],
                            f"Balanço: de {i['sistema']:g} para {i['contado']:g} {i['unidade']}.", g.usuario["nome"])
    con.execute("UPDATE balancos SET status='fechado', fechado_em=datetime('now','localtime') WHERE id=?", (bal["id"],))
    con.commit()
    con.close()
    return jsonify(ok=True, atualizados=len(itens))


# --------------------------------------------------------------- início e histórico
@app.get("/api/resumo")
@protegido()
def api_resumo():
    u = g.usuario
    con = conectar()
    bal = balanco_aberto(con)
    etapas = estado_balanco(con, bal) if bal else []
    visiveis = [e for e in etapas if e["liberada"] and (u["nivel"] == "admin" or
                (pode(u, "pode_contar") and setor_cobre(u, e["nome"])))]
    balanco = {"aberto": bool(visiveis), "total": sum(e["total"] for e in visiveis),
               "contados": sum(e["contados"] for e in visiveis)}
    if u["nivel"] != "admin":
        meus = con.execute("SELECT COUNT(DISTINCT COALESCE(pedido_codigo, id)) FROM solicitacoes "
                           "WHERE usuario_id = ? AND status IN ('Solicitada','Aprovada','Comprada')", (u["id"],)).fetchone()[0]
        con.close()
        return jsonify(meus_abertos=meus, balanco=balanco)
    produtos = con.execute("SELECT * FROM produtos").fetchall()
    atencao = sorted(
        [p for p in produtos if status_estoque(p["quantidade"], p["minimo"]) != "ok"],
        key=lambda p: (p["quantidade"] / p["minimo"]) if p["minimo"] else 1)
    pend = con.execute("SELECT COUNT(DISTINCT COALESCE(pedido_codigo, 'L' || id)) FROM solicitacoes "
                       "WHERE status = 'Solicitada'").fetchone()[0]
    receber = con.execute("SELECT COUNT(*) FROM solicitacoes WHERE status = 'Comprada'").fetchone()[0]
    con.close()
    return jsonify(
        itens_baixos=sum(1 for p in produtos if status_estoque(p["quantidade"], p["minimo"]) == "baixo"),
        pedidos_aprovar=pend, compras_receber=receber, balanco=balanco,
        atencao=[{"id": p["id"], "nome": p["nome"], "quantidade": p["quantidade"], "unidade": p["unidade"],
                  "status": status_estoque(p["quantidade"], p["minimo"])} for p in atencao[:5]])


@app.get("/api/historico")
@protegido(admin=True)
def api_historico():
    con = conectar()
    linhas = con.execute(
        """SELECT m.*, p.nome AS produto, p.unidade FROM movimentos m
           JOIN produtos p ON p.id = m.produto_id ORDER BY m.id DESC LIMIT 100""").fetchall()
    con.close()
    return jsonify([dict(l) for l in linhas])


preparar_banco()

if __name__ == "__main__":
    app.run(debug=True)
