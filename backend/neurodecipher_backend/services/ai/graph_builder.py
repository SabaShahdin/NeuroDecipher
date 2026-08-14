# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — GRAPH BUILDER
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — GRAPH BUILDER
# ══════════════════════════════════════════════════════════════════════════════
def build_graph_tensors(X_raw, actual_freq, device, n_for_graph=20):
    from torch_geometric.data import Data
    N             = len(X_raw)
    expected_pairs = NUM_NODES * (NUM_NODES - 1) // 2
    base_ei       = torch.tril_indices(NUM_NODES, NUM_NODES, offset=-1)
    n_use         = min(n_for_graph, N)

    try:
        from data.scripts.adjacancy_matrics import GraphConstructionFactory
        sample_signal = X_raw[:n_use].mean(axis=(0, 1))
        factory       = GraphConstructionFactory(sample_signal, STANDARD_CHANNELS, fs=actual_freq)
        adj_matrix    = factory.compute_cross_correlation()
        xs, ys        = base_ei[0].numpy(), base_ei[1].numpy()
        w             = torch.tensor(adj_matrix[xs, ys], dtype=torch.float32)
        log.info(f"  Graph built via cross_corr  weight range [{w.min():.4f}, {w.max():.4f}]")
    except Exception as exc:
        log.warning(f"  Graph construction failed ({exc}), using uniform weights")
        w = torch.ones(expected_pairs)

    ei_rev      = base_ei[[1, 0], :]
    edge_index  = torch.cat([base_ei, ei_rev], dim=1).to(device)
    edge_weight = torch.cat([w, w], dim=0).to(device)
    return edge_index, edge_weight


