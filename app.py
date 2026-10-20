from pathlib import Path
import sqlite3

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
DATABASE = INSTANCE_DIR / "pedacinho.db"

INSTANCE_DIR.mkdir(exist_ok=True)


def conectar():
    conexao = sqlite3.connect(DATABASE)
    conexao.row_factory = sqlite3.Row
    conexao.execute("PRAGMA foreign_keys = ON")
    return conexao


def registrar_movimento(conexao, produto_id, tipo, quantidade, observacao):
    conexao.execute(
        """
        INSERT INTO movimentos
            (produto_id, tipo, quantidade, observacao)
        VALUES (?, ?, ?, ?)
        """,
        (produto_id, tipo, quantidade, observacao),
    )


def preparar_banco():
    conexao = conectar()

    conexao.executescript(
        """
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            categoria TEXT NOT NULL,
            unidade TEXT NOT NULL,
            quantidade REAL NOT NULL DEFAULT 0,
            minimo REAL NOT NULL DEFAULT 0,
            desejado REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS solicitacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER NOT NULL,
            quantidade REAL NOT NULL,
            observacao TEXT DEFAULT '',
            solicitante TEXT NOT NULL DEFAULT 'Equipe',
            status TEXT NOT NULL DEFAULT 'Solicitada',
            criada_em TEXT NOT NULL DEFAULT
                (datetime('now', 'localtime')),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );

        CREATE TABLE IF NOT EXISTS movimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            quantidade REAL NOT NULL,
            observacao TEXT DEFAULT '',
            criada_em TEXT NOT NULL DEFAULT
                (datetime('now', 'localtime')),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );
        """
    )

    total = conexao.execute(
        "SELECT COUNT(*) FROM produtos"
    ).fetchone()[0]

    if total == 0:
        produtos = [
            ("Blend bovino", "Carnes", "kg", 2.5, 5, 12),
            ("Pão brioche", "Padaria", "un", 8, 12, 30),
            ("Queijo coalho", "Laticínios", "kg", 1.8, 3, 8),
            ("Batata palito", "Acompanhamentos", "kg", 3, 5, 12),
            ("Tomate", "Hortifruti", "kg", 2, 3, 6),
            ("Refrigerante cola", "Bebidas", "un", 24, 12, 36),
            ("Água mineral", "Bebidas", "un", 18, 12, 36),
            ("Cerveja lata", "Bebidas", "un", 16, 12, 30),
            ("Polpa de acerola", "Bebidas", "kg", 10, 5, 20),
            ("Embalagem para hambúrguer", "Embalagens", "un", 35, 20, 80),
        ]

        conexao.executemany(
            """
            INSERT INTO produtos
                (nome, categoria, unidade, quantidade, minimo, desejado)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            produtos,
        )

        blend = conexao.execute(
            "SELECT id FROM produtos WHERE nome = 'Blend bovino'"
        ).fetchone()["id"]

        pao = conexao.execute(
            "SELECT id FROM produtos WHERE nome = 'Pão brioche'"
        ).fetchone()["id"]

        conexao.execute(
            """
            INSERT INTO solicitacoes
                (produto_id, quantidade, observacao, solicitante, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (blend, 8, "Reposição para o fim de semana", "Cozinha", "Solicitada"),
        )

        conexao.execute(
            """
            INSERT INTO solicitacoes
                (produto_id, quantidade, observacao, solicitante, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (pao, 20, "Pedido demonstrativo", "Cozinha", "Comprada"),
        )

    conexao.commit()
    conexao.close()


@app.get("/")
def inicio():
    return render_template("index.html")


@app.get("/api/produtos")
def listar_produtos():
    conexao = conectar()
    linhas = conexao.execute(
        "SELECT * FROM produtos ORDER BY categoria, nome"
    ).fetchall()
    conexao.close()

    return jsonify([dict(linha) for linha in linhas])


@app.post("/api/produtos/<int:produto_id>/contagem")
def atualizar_contagem(produto_id):
    dados = request.get_json() or {}

    try:
        quantidade = float(dados.get("quantidade"))
        if quantidade < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"erro": "Informe uma quantidade válida."}), 400

    conexao = conectar()
    produto = conexao.execute(
        "SELECT * FROM produtos WHERE id = ?", (produto_id,)
    ).fetchone()

    if produto is None:
        conexao.close()
        return jsonify({"erro": "Produto não encontrado."}), 404

    anterior = produto["quantidade"]

    conexao.execute(
        "UPDATE produtos SET quantidade = ? WHERE id = ?",
        (quantidade, produto_id),
    )
    registrar_movimento(
        conexao,
        produto_id,
        "Contagem de estoque",
        quantidade,
        f"Quantidade alterada de {anterior:g} para {quantidade:g}.",
    )

    conexao.commit()
    conexao.close()

    return jsonify({"ok": True})


@app.get("/api/solicitacoes")
def listar_solicitacoes():
    conexao = conectar()
    linhas = conexao.execute(
        """
        SELECT s.*, p.nome AS produto, p.unidade
        FROM solicitacoes s
        JOIN produtos p ON p.id = s.produto_id
        ORDER BY s.id DESC
        """
    ).fetchall()
    conexao.close()

    return jsonify([dict(linha) for linha in linhas])


@app.post("/api/solicitacoes")
def criar_solicitacao():
    dados = request.get_json() or {}

    try:
        produto_id = int(dados.get("produto_id"))
        quantidade = float(dados.get("quantidade"))
        if quantidade <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"erro": "Confira o produto e a quantidade."}), 400

    observacao = str(dados.get("observacao", "")).strip()

    conexao = conectar()
    produto = conexao.execute(
        "SELECT id FROM produtos WHERE id = ?", (produto_id,)
    ).fetchone()

    if produto is None:
        conexao.close()
        return jsonify({"erro": "Produto não encontrado."}), 404

    conexao.execute(
        """
        INSERT INTO solicitacoes
            (produto_id, quantidade, observacao, solicitante)
        VALUES (?, ?, ?, ?)
        """,
        (produto_id, quantidade, observacao, "Equipe (protótipo)"),
    )
    registrar_movimento(
        conexao,
        produto_id,
        "Solicitação criada",
        quantidade,
        observacao or "Sem observação",
    )

    conexao.commit()
    conexao.close()

    return jsonify({"ok": True}), 201


@app.post("/api/solicitacoes/<int:solicitacao_id>/status")
def atualizar_status(solicitacao_id):
    dados = request.get_json() or {}
    status = dados.get("status")

    if status not in ("Aprovada", "Comprada"):
        return jsonify({"erro": "Status inválido."}), 400

    conexao = conectar()
    solicitacao = conexao.execute(
        """
        SELECT s.*, p.nome AS produto
        FROM solicitacoes s
        JOIN produtos p ON p.id = s.produto_id
        WHERE s.id = ?
        """,
        (solicitacao_id,),
    ).fetchone()

    if solicitacao is None:
        conexao.close()
        return jsonify({"erro": "Solicitação não encontrada."}), 404

    conexao.execute(
        "UPDATE solicitacoes SET status = ? WHERE id = ?",
        (status, solicitacao_id),
    )
    registrar_movimento(
        conexao,
        solicitacao["produto_id"],
        status,
        solicitacao["quantidade"],
        f"Solicitação de {solicitacao['produto']} marcada como {status}.",
    )

    conexao.commit()
    conexao.close()

    return jsonify({"ok": True})


@app.post("/api/solicitacoes/<int:solicitacao_id>/receber")
def receber_mercadoria(solicitacao_id):
    dados = request.get_json() or {}

    try:
        quantidade = float(dados.get("quantidade"))
        if quantidade <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"erro": "Informe uma quantidade recebida válida."}), 400

    conexao = conectar()
    solicitacao = conexao.execute(
        """
        SELECT s.*, p.nome AS produto, p.quantidade AS estoque_atual
        FROM solicitacoes s
        JOIN produtos p ON p.id = s.produto_id
        WHERE s.id = ?
        """,
        (solicitacao_id,),
    ).fetchone()

    if solicitacao is None:
        conexao.close()
        return jsonify({"erro": "Solicitação não encontrada."}), 404

    if solicitacao["status"] != "Comprada":
        conexao.close()
        return jsonify({"erro": "Marque a compra antes de registrar o recebimento."}), 400

    novo_estoque = solicitacao["estoque_atual"] + quantidade

    conexao.execute(
        "UPDATE produtos SET quantidade = ? WHERE id = ?",
        (novo_estoque, solicitacao["produto_id"]),
    )
    conexao.execute(
        "UPDATE solicitacoes SET status = 'Recebida' WHERE id = ?",
        (solicitacao_id,),
    )
    registrar_movimento(
        conexao,
        solicitacao["produto_id"],
        "Mercadoria recebida",
        quantidade,
        f"Recebido para a compra de {solicitacao['produto']}.",
    )

    conexao.commit()
    conexao.close()

    return jsonify({"ok": True})


@app.get("/api/historico")
def listar_historico():
    conexao = conectar()
    linhas = conexao.execute(
        """
        SELECT m.*, p.nome AS produto, p.unidade
        FROM movimentos m
        JOIN produtos p ON p.id = m.produto_id
        ORDER BY m.id DESC
        LIMIT 100
        """
    ).fetchall()
    conexao.close()

    return jsonify([dict(linha) for linha in linhas])


preparar_banco()

if __name__ == "__main__":
    app.run(debug=True)