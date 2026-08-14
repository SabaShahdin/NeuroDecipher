# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — INFERENCE  (build_graph_objects helper)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — INFERENCE  (build_graph_objects helper)
# ══════════════════════════════════════════════════════════════════════════════
def build_graph_objects(X_sc, edge_index, edge_weight):
    from torch_geometric.data import Data
    graph_objects = []
    N = X_sc.shape[0]
    for i in range(N):
        x = torch.tensor(X_sc[i], dtype=torch.float32)
        d = Data(
            x           = x,
            edge_index  = edge_index.cpu(),
            y           = torch.zeros(1, dtype=torch.float32),
            edge_weight = edge_weight.cpu(),
        )
        d.seg_idx = i
        graph_objects.append(d)
    log.info(f"  {N} graph objects ready")
    return graph_objects


