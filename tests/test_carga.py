"""Carga e concorrência. Rode com:  python tests/test_carga.py
Simula um restaurante com estoque grande e vários celulares usando ao mesmo tempo."""
import urllib.error, http.cookiejar, json, os, random, sqlite3, sys, tempfile, threading, time, urllib.request
os.environ["PEDACINHO_DB"] = os.path.join(tempfile.mkdtemp(), "carga.db")
os.environ["SECRET_KEY"] = "teste"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as A
import logging
from werkzeug.serving import make_server
logging.getLogger('werkzeug').setLevel(logging.ERROR)

N_PROD, N_SOLIC, N_MOV = 1500, 20000, 40000


def semear():
    A.preparar_banco()
    con = sqlite3.connect(A.DATABASE)
    for t in ("movimentos", "solicitacoes", "produtos"):
        con.execute(f"DELETE FROM {t}")
    con.execute("DELETE FROM sqlite_sequence")
    random.seed(1)
    cats = ["Carnes", "Hortifruti", "Bebidas", "Descartáveis", "Limpeza", "Secos"]
    con.executemany("INSERT INTO produtos (nome, categoria, unidade, setor, quantidade, minimo, desejado) VALUES (?,?,?,?,?,?,?)",
                    [(f"Produto {i}", random.choice(cats), "un", random.choice(["Cozinha", "Salão"]),
                      random.randint(0, 50), random.randint(5, 15), random.randint(20, 60)) for i in range(N_PROD)])
    con.executemany("INSERT INTO solicitacoes (produto_id, quantidade, status, criada_em) VALUES (?,?,?,datetime('now','localtime',?))",
                    [(random.randint(1, N_PROD), random.randint(1, 20), random.choice(["Recebida"] * 8 + ["Recusada", "Aprovada"]),
                      f"-{random.randint(0, 400)} days") for _ in range(N_SOLIC)])
    con.executemany("INSERT INTO movimentos (produto_id, tipo, quantidade, criada_em) VALUES (?,?,?,datetime('now','localtime',?))",
                    [(random.randint(1, N_PROD), random.choice(["entrada", "ajuste", "balanco"]), random.randint(1, 20),
                      f"-{random.randint(0, 400)} days") for _ in range(N_MOV)])
    con.commit(); con.close()


def cliente(base):
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def chamar(url, corpo=None):
        req = urllib.request.Request(base + url, data=None if corpo is None else json.dumps(corpo).encode(),
                                     headers={"Content-Type": "application/json"})
        with op.open(req, timeout=60) as r:
            return r.status, r.read()
    return chamar


def main():
    semear()
    srv = make_server("127.0.0.1", 0, A.app, threaded=True)
    base = f"http://127.0.0.1:{srv.server_port}"
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    adm = cliente(base)
    adm("/api/setup", {"nome": "Admin", "usuario": "admin", "senha": "123456"})
    print(f"Banco: {N_PROD} produtos, {N_SOLIC} solicitações, {N_MOV} movimentos "
          f"({os.path.getsize(A.DATABASE) / 1e6:.1f} MB)")

    print("\nTempo por tela (1 usuário):")
    piores = 0
    for url in ["/api/resumo", "/api/produtos", "/api/pedidos", "/api/compras", "/api/relatorios", "/api/historico",
                "/api/balanco", "/api/sugestoes", "/api/equipe", "/api/fotos"]:
        t = time.perf_counter(); st, corpo = adm(url); ms = (time.perf_counter() - t) * 1000
        piores = max(piores, ms)
        print(f"  {url:<18} {ms:7.0f} ms  {len(corpo) / 1024:7.0f} KB  [{st}]")
    assert piores < 3000, "alguma tela passou de 3 s"

    print("\nConcorrência: 10 pessoas apertando de tudo ao mesmo tempo, 30 ações cada...")
    erros, tempos = [], []
    def pessoa(i):
        c = cliente(base)
        c("/api/login", {"usuario": "admin", "senha": "123456"})
        rnd = random.Random(i)
        for k in range(30):
            acao = rnd.choice(["ler", "ler", "ler", "ajustar", "pedir", "criar"])
            t = time.perf_counter()
            try:
                if acao == "ler":
                    c(rnd.choice(["/api/resumo", "/api/produtos", "/api/pedidos", "/api/compras"]))
                elif acao == "ajustar":
                    c(f"/api/produtos/{rnd.randint(1, N_PROD)}", {"quantidade": rnd.randint(0, 40)})
                elif acao == "pedir":
                    c("/api/pedidos", {"itens": [{"produto_id": rnd.randint(1, N_PROD), "quantidade": 5}]})
                else:
                    c("/api/produtos", {"nome": f"Novo {i}-{k}", "categoria": "Teste", "unidade": "un", "setor": "Cozinha",
                                         "quantidade": 3, "minimo": 1, "desejado": 5})
            except urllib.error.HTTPError as e:
                if e.code != 409:  # 409 = item já tem pedido aberto (regra normal do app)
                    erros.append(f"{acao}: HTTP {e.code}")
            except Exception as e:  # noqa
                erros.append(f"{acao}: {e}")
            tempos.append((time.perf_counter() - t) * 1000)
    t0 = time.perf_counter()
    ths = [threading.Thread(target=pessoa, args=(i,)) for i in range(10)]
    [t.start() for t in ths]; [t.join() for t in ths]
    total = time.perf_counter() - t0
    tempos.sort()
    print(f"  {len(tempos)} requisições em {total:.1f} s | mediana {tempos[len(tempos)//2]:.0f} ms | "
          f"p95 {tempos[int(len(tempos)*.95)]:.0f} ms | máx {tempos[-1]:.0f} ms | erros: {len(erros)}")
    for e in erros[:5]:
        print("   ", e)
    assert not erros, "houve erros sob concorrência"
    con = sqlite3.connect(A.DATABASE)
    assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert con.execute("PRAGMA foreign_key_check").fetchall() == []
    print("  integridade do banco: ok")
    srv.shutdown()
    print("\ntodos os testes de carga passaram")


if __name__ == "__main__":
    main()
