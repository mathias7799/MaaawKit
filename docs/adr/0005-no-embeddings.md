# ADR-0005: keyword retrieval, no embeddings (yet)

**Accepted, 3.0.** Memory recall is BM25-lite keyword scoring; the digest is
deterministic arithmetic (recency × confidence × hits × path overlap). No
vector store, no embedding API calls, no new dependency.

Why: at the expected scale (tens of records) keyword + path-overlap retrieval
is accurate, free, offline, and explainable.

Revisit trigger: >300 active records in a real repo, or measured recall
misses (user asks for something a record covers and recall returns nothing).
