"""Testes do fluxo completo. Rode com:  python -m pytest -q   (ou python tests/test_api.py)"""
import os, sys, tempfile
os.environ["PEDACINHO_DB"] = os.path.join(tempfile.mkdtemp(), "teste.db")
os.environ["SECRET_KEY"] = "teste"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as A

def novo(): return A.app.test_client()
def post(c, url, **j): return c.post(url, json=j)

def test_fluxo_completo():
    adm = novo()
    assert adm.get("/api/produtos").status_code == 401
    assert post(adm, "/api/setup", nome="Débora", usuario="debora", senha="123456").status_code == 200
    assert post(novo(), "/api/setup", nome="X", usuario="xxx", senha="123456").status_code == 403

    # cria colaboradores
    assert post(adm, "/api/equipe", nome="João", usuario="joao", senha="abc123", setor="Cozinha", nivel="novo").status_code == 201
    assert post(adm, "/api/equipe", nome="Ana", usuario="ana", senha="abc123", setor="Salão", nivel="padrao",
                pode_receber=True, pode_contar=True).status_code == 201
    assert post(adm, "/api/equipe", nome="Dup", usuario="joao", senha="abc123", setor="Salão", nivel="novo").status_code == 409

    # João precisa trocar a senha provisória
    joao = novo()
    assert post(joao, "/api/login", usuario="joao", senha="errada").status_code == 401
    assert post(joao, "/api/login", usuario="JOAO", senha="abc123").status_code == 200
    assert joao.get("/api/produtos").status_code == 403
    assert post(joao, "/api/senha", atual="abc123", nova="novasenha").status_code == 200
    prods = joao.get("/api/produtos").get_json()
    assert prods and all(p["setor"] == "Cozinha" for p in prods)
    assert not any("quantidade" in p or "minimo" in p for p in prods)     # sem estoque para a equipe
    assert joao.get("/api/equipe").status_code == 403
    assert joao.get("/api/compras").status_code == 403

    # João pede (sem quantidade)
    pao = next(p["id"] for p in prods if p["nome"] == "Pão brioche")
    blend = next(p["id"] for p in prods if p["nome"] == "Blend bovino")
    r = post(joao, "/api/pedidos", itens=[{"produto_id": pao}, {"produto_id": blend}])
    assert r.status_code == 201 and r.get_json()["criados"] == 2
    assert post(joao, "/api/pedidos", itens=[{"produto_id": pao}]).status_code == 409  # já tem pedido aberto
    bebida = next(p["id"] for p in adm.get("/api/produtos").get_json() if p["nome"] == "Água mineral")
    assert post(joao, "/api/pedidos", itens=[{"produto_id": bebida}]).status_code == 400  # outro setor

    # admin aprova
    resumo = adm.get("/api/resumo").get_json()
    assert resumo["pedidos_aprovar"] == 1 and resumo["itens_baixos"] >= 2
    pedidos = adm.get("/api/pedidos?apenas=pendentes").get_json()
    assert len(pedidos) == 1 and pedidos[0]["itens"][0]["estoque"] is not None
    cod = pedidos[0]["codigo"]
    ids = {i["produto_id"]: i["id"] for i in pedidos[0]["itens"]}
    assert post(adm, f"/api/pedidos/{cod}/aprovar", itens=[{"id": ids[pao], "quantidade": "30"},
                                                            {"id": ids[blend], "quantidade": 0}]).get_json()["recusados"] == 1
    compras = adm.get("/api/compras").get_json()
    assert len(compras["a_comprar"]) == 1 and compras["a_comprar"][0]["qtd"] == 30
    assert post(adm, "/api/compras/comprar", ids=[ids[pao]]).status_code == 200

    # Ana (pode_receber) confere a entrega: pediu 30, vieram 20
    ana = novo()
    post(ana, "/api/login", usuario="ana", senha="abc123"); post(ana, "/api/senha", atual="abc123", nova="senhaana")
    assert ana.get("/api/compras").get_json()["a_comprar"] == []
    estoque_antes = next(p["quantidade"] for p in adm.get("/api/produtos").get_json() if p["id"] == pao)
    assert post(ana, "/api/compras/receber", itens=[{"id": ids[pao], "quantidade": 20}]).status_code == 200
    estoque_depois = next(p["quantidade"] for p in adm.get("/api/produtos").get_json() if p["id"] == pao)
    assert estoque_depois == estoque_antes + 20
    hist = adm.get("/api/historico").get_json()
    assert any("faltaram 10" in h["observacao"] for h in hist)
    assert post(ana, "/api/compras/receber", itens=[{"id": ids[pao], "quantidade": 5}]).status_code == 400  # já recebido

    # balanço
    assert ana.get("/api/balanco").get_json()["aberto"] is False
    assert post(joao, "/api/balanco/iniciar", etapas=[]).status_code == 403
    assert post(adm, "/api/balanco/iniciar", etapas=["Cozinha · Ingredientes", "Salão · Bebidas"]).status_code == 201
    assert post(adm, "/api/balanco/iniciar", etapas=[]).status_code == 409
    assert joao.get("/api/balanco").status_code == 403                       # novo não conta
    itens_ana = ana.get("/api/balanco/contagem").get_json()
    assert itens_ana and all(i["etapa"].startswith("Salão") for i in itens_ana)
    assert all("sistema" not in i and "quantidade" not in i for i in itens_ana)
    assert not any(i["etapa"] == "Salão · Descartáveis" for i in itens_ana)  # não liberada
    r = post(ana, "/api/balanco/contagem", itens=[{"produto_id": itens_ana[0]["produto_id"], "quantidade": "7,5"}])
    assert r.get_json()["salvos"] == 1
    conf = adm.get("/api/balanco/conferir").get_json()
    assert conf["contados"] == 1 and conf["com_diferenca"] == 1
    assert post(adm, "/api/balanco/fechar").status_code == 409                # faltam itens
    assert post(adm, "/api/balanco/etapas", etapa="Salão · Descartáveis", liberada=True).status_code == 200
    r = post(adm, "/api/balanco/fechar", forcar=True)
    assert r.get_json()["atualizados"] == 1
    prod = next(p for p in adm.get("/api/produtos").get_json() if p["id"] == itens_ana[0]["produto_id"])
    assert prod["quantidade"] == 7.5
    assert adm.get("/api/balanco").get_json()["aberto"] is False

    # editar produto e proteção do próprio acesso
    assert post(adm, f"/api/produtos/{pao}", quantidade=50, minimo=20).status_code == 200
    assert post(adm, "/api/equipe/1", nivel="padrao").status_code == 400
    # excluir colaborador: some o acesso, o histórico fica com o nome
    joao_id = next(u["id"] for u in adm.get("/api/equipe").get_json() if u["usuario"] == "joao")
    assert post(adm, f"/api/equipe/{adm.get('/api/me').get_json()['id']}/excluir").status_code == 400
    assert post(joao, f"/api/equipe/{joao_id}/excluir").status_code == 403
    assert post(adm, f"/api/equipe/{joao_id}/excluir").status_code == 200
    assert joao.get("/api/produtos").status_code == 401
    assert post(novo(), "/api/login", usuario="joao", senha="novasenha").status_code == 401
    assert not any(u["usuario"] == "joao" for u in adm.get("/api/equipe").get_json())
    assert post(adm, f"/api/equipe/{joao_id}/excluir").status_code == 404
    assert post(adm, "/api/logout").status_code == 200
    assert adm.get("/api/me").status_code == 401

if __name__ == "__main__":
    test_fluxo_completo(); print("todos os testes passaram")
