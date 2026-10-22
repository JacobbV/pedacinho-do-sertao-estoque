"""Segurança e robustez. Rode com:  python tests/test_seguranca.py"""
import math, os, sys, tempfile
os.environ["PEDACINHO_DB"] = os.path.join(tempfile.mkdtemp(), "seg.db")
os.environ["SECRET_KEY"] = "teste"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as A

novo = lambda: A.app.test_client()
post = lambda c, url, **j: c.post(url, json=j)
PUBLICAS = {"/login", "/api/login", "/api/setup", "/api/logout", "/static/<path:filename>"}


def entrar(adm, usuario, nivel, setor="Salão", **perm):
    assert post(adm, "/api/equipe", nome=usuario.title(), usuario=usuario, senha="abc123", setor=setor, nivel=nivel, **perm).status_code == 201
    c = novo(); post(c, "/api/login", usuario=usuario, senha="abc123"); post(c, "/api/senha", atual="abc123", nova="senha-" + usuario)
    return c


def preparar():
    adm = novo(); assert post(adm, "/api/setup", nome="Admin", usuario="admin", senha="123456").status_code == 200
    return adm, entrar(adm, "novo1", "novo"), entrar(adm, "padrao1", "padrao", pode_receber=True, pode_contar=True)


def rotas():
    for r in A.app.url_map.iter_rules():
        if r.rule in PUBLICAS or r.rule.startswith("/static"):
            continue
        for m in r.methods & {"GET", "POST"}:
            yield m, r.rule, r


def preencher(rule):
    return rule.replace("<int:uid>", "999").replace("<int:produto_id>", "999").replace("<int:pid>", "999").replace("<int:sid>", "999").replace("<codigo>", "XXXX").replace("<nome>", "x.db")


def test_anonimo_nao_acessa_nada():
    n = 0
    for m, rule, _ in rotas():
        url = preencher(rule); c = novo()
        r = c.get(url) if m == "GET" else c.post(url, json={})
        assert r.status_code in (401, 302), f"{m} {url} deveria exigir login, devolveu {r.status_code}"
        n += 1
    print(f"  anônimo: {n} rotas protegidas")


def test_so_admin_em_rotas_de_admin():
    adm, novo1, padrao1 = preparar()
    n = 0
    for m, rule, _ in rotas():
        if not (rule.startswith("/api/equipe") or rule.startswith("/api/balanco/iniciar") or rule.startswith("/api/balanco/fechar")
                or rule.startswith("/api/balanco/conferir") or rule.startswith("/api/balanco/recontar") or rule.startswith("/api/balanco/etapas")
                or rule.startswith("/api/historico") or rule.startswith("/api/relatorios") or rule.startswith("/api/config")
                or rule.startswith("/api/backup") or rule.startswith("/api/compras/comprar") or "/aprovar" in rule or "/recusar" in rule
                or "/resolver" in rule or rule.endswith("/foto") or "/excluir" in rule or (rule == "/api/produtos" and m == "POST")
                or rule == "/api/produtos/<int:produto_id>"):
            continue
        url = preencher(rule)
        for quem, c in (("novo", novo1), ("padrao", padrao1)):
            r = c.get(url) if m == "GET" else c.post(url, json={})
            assert r.status_code == 403, f"{quem} conseguiu acessar {m} {url} ({r.status_code})"
            n += 1
    print(f"  só-admin: {n} checagens (novo e padrão barrados)")


def test_permissoes_individuais():
    adm, novo1, padrao1 = preparar()
    assert novo1.get("/api/compras").status_code == 403 and novo1.get("/api/balanco").status_code == 403
    assert post(novo1, "/api/compras/receber", itens=[]).status_code == 403
    assert post(novo1, "/api/balanco/contagem", itens=[]).status_code == 403
    assert padrao1.get("/api/compras").status_code == 200 and padrao1.get("/api/balanco").status_code == 200
    prods = novo1.get("/api/produtos").get_json()
    assert prods and all("quantidade" not in p and "minimo" not in p and "desejado" not in p for p in prods)   # equipe nunca vê estoque
    assert all(p["setor"] == "Salão" for p in prods)                                                              # só o setor dela


def test_numeros_invalidos():
    adm, *_ = preparar()
    for ruim in ("nan", "inf", "-inf", "1e999", "1e30", -1, "abc", None):
        r = post(adm, "/api/produtos", nome=f"Prod {ruim}", unidade="un", quantidade=ruim)
        assert r.status_code == 400, f"quantidade={ruim!r} deveria ser recusada, devolveu {r.status_code}"
    pid = next(p["id"] for p in adm.get("/api/produtos").get_json() if p["nome"] == "Tomate")
    for ruim in ("nan", "inf"):
        assert post(adm, f"/api/produtos/{pid}", quantidade=ruim).status_code == 400
        assert post(adm, f"/api/produtos/{pid}", minimo=ruim).status_code == 400
    q = next(p["quantidade"] for p in adm.get("/api/produtos").get_json() if p["id"] == pid)
    assert math.isfinite(q)                                                                                      # o estoque continua são


def test_tamanhos_e_injecao():
    adm, novo1, _ = preparar()
    assert post(adm, "/api/produtos", nome="A" * 500, unidade="un").status_code == 400
    assert post(adm, "/api/produtos", nome="Ok", unidade="u" * 40).status_code == 400
    assert post(adm, "/api/equipe", nome="N" * 300, usuario="longo1", senha="abc123", setor="Salão", nivel="novo").status_code == 400
    # injeção SQL/HTML é tratada como texto comum
    assert post(adm, "/api/produtos", nome="x'; DROP TABLE produtos;--", unidade="un", setor="Salão").status_code == 201
    assert post(adm, "/api/produtos", nome="<script>alert(1)</script>", unidade="un", setor="Salão").status_code == 201
    assert len(adm.get("/api/produtos").get_json()) >= 10                                                        # tabela segue de pé
    assert post(novo1, "/api/sugestoes", texto="'; DELETE FROM usuarios;--").status_code == 201
    assert post(novo(), "/api/login", usuario="' OR '1'='1", senha="x").status_code == 401


def test_login_bloqueia_forca_bruta():
    adm, *_ = preparar()
    c = novo(); codigos = [post(c, "/api/login", usuario="admin", senha=f"errada{i}").status_code for i in range(7)]
    assert 429 in codigos, codigos


def test_foto_so_jpeg_e_so_admin():
    adm, novo1, _ = preparar()
    pid = adm.get("/api/produtos").get_json()[0]["id"]
    assert adm.post(f"/api/produtos/{pid}/foto", data=b"nao sou imagem", content_type="image/jpeg").status_code == 400
    assert adm.post(f"/api/produtos/{pid}/foto", data=b"\xff\xd8\xff" + b"0" * 900_000 + b"\xff\xd9", content_type="image/jpeg").status_code == 400
    assert novo1.post(f"/api/produtos/{pid}/foto", data=b"\xff\xd8\xff\xff\xd9", content_type="image/jpeg").status_code == 403
    assert novo().get(f"/fotos/{pid}.jpg").status_code in (401, 404)
    assert adm.get("/api/backup/../../app.py/baixar").status_code in (404, 405)


if __name__ == "__main__":
    for nome, f in sorted(globals().items()):
        if nome.startswith("test_"):
            try:
                os.remove(A.DATABASE)
            except OSError:
                pass
            A.preparar_banco(); A._tentativas.clear()
            f(); print("ok  ", nome)
    print("todos os testes de segurança passaram")
