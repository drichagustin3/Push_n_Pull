# Sprint 2 Database Performance Report (`S2-DBA-06`)

**Project:** Hope, Inc. ERP  
**Database:** Supabase PostgreSQL (`public` schema)  
**Branch:** `feat/S2-DBA-06-index-tuning`  
**Scope:** Search and pricing query profiling (`EXPLAIN (ANALYZE, BUFFERS)`) and index tuning across `customer`, `product`, and `pricehist`.

---

## 1. Existing Index & Extension Baseline

Before tuning, the `public` schema contained:

| Table | Index Name | Definition |
| :--- | :--- | :--- |
| `customer` | `customer_pkey` | `CREATE UNIQUE INDEX customer_pkey ON public.customer USING btree (custno)` |
| `customer` | `idx_customer_status_custname` | `CREATE INDEX idx_customer_status_custname ON public.customer USING btree (is_deleted, custname)` |
| `product` | `product_pkey` | `CREATE UNIQUE INDEX product_pkey ON public.product USING btree (prodcode)` |
| `product` | `idx_product_status_description` | `CREATE INDEX idx_product_status_description ON public.product USING btree (is_deleted, description)` |
| `pricehist` | `pricehist_pkey` | `CREATE UNIQUE INDEX pricehist_pkey ON public.pricehist USING btree (effdate, prodcode)` |
| `pricehist` | `idx_pricehist_prodcode_effdate_status` | `CREATE INDEX idx_pricehist_prodcode_effdate_status ON public.pricehist USING btree (prodcode, effdate, is_deleted)` |

---

## 2. Query Profiling & Bottleneck Analysis

### Query A: Customer Live Search (Status Filter + `ILIKE` across `custno`, `custname`, `address`)
- **Bottlenecks Identified:**
  - Leading-wildcard substring matching (`ILIKE '%...%'` / `~~*`) across `custno`, `custname`, and `address` cannot use standard B-tree indexes for substring search, resulting in a `Seq Scan` and row filtering (`4` rows removed).
  - Unindexed `ORDER BY custname ASC` required an in-memory `Sort` (`quicksort`, `25kB`).
- **Baseline Plan (`EXPLAIN (ANALYZE, BUFFERS)`):**
  - Top node: `Sort` (`Sort Key: custname`, `quicksort`, `25kB`) over `Seq Scan on customer` (`Filter: ((NOT is_deleted) AND ...)`), `1` row returned.
  - Execution Time: `0.181 ms` | Planning Time: `0.479 ms` | Execution Buffers: `4` shared hits | Planning Buffers: `108` shared hits.

### Query B: Product Catalog with Current Effective Price (`LATERAL` Lookup)
- **Bottlenecks Identified:**
  - Outer `product` scan used `product_pkey` (`ORDER BY prodcode ASC`) and filtered `NOT is_deleted` (`5` rows removed), while inner `LATERAL` subquery scanned `pricehist` backward (`Index Scan Backward using idx_pricehist_prodcode_effdate_status`) across `4` loops because `effdate` in the existing index was ascending (`ASC`).
  - Baseline row estimate on `product` (`135` rows vs. `4` actual) was stale prior to `ANALYZE`.
- **Baseline Plan (`EXPLAIN (ANALYZE, BUFFERS)`):**
  - Top node: `Nested Loop Left Join` (`4` rows returned).
  - Execution Time: `0.086 ms` | Planning Time: `0.421 ms` | Execution Buffers: `10` shared hits (`2` on `product`, `8` on `pricehist`) | Planning Buffers: `111` shared hits.

### Query C: Price History Dialog Query (`prodcode = 'P-001'`, `ORDER BY effdate DESC`)
- **Bottlenecks Identified:**
  - Existing `idx_pricehist_prodcode_effdate_status` indexed `(prodcode, effdate ASC, is_deleted)`, forcing `Index Scan Backward` for `ORDER BY effdate DESC` and heap fetches for columns outside the index (`unitprice`, `stamp`).
  - Baseline row estimate (`1` row vs. `2` actual) underestimated `P-001` history entries prior to `ANALYZE`.
- **Baseline Plan (`EXPLAIN (ANALYZE, BUFFERS)`):**
  - Top node: `Index Scan Backward using idx_pricehist_prodcode_effdate_status on pricehist` (`2` rows returned).
  - Execution Time: `0.024 ms` | Planning Time: `0.059 ms` | Execution Buffers: `3` shared hits.

---

## 3. Index Evaluation & Tuning Applied

1. **Composite B-Tree (`is_deleted, custname`) vs. Trigram GIN (`pg_trgm`):**
   - `idx_customer_status_custname` (`ON customer (is_deleted, custname)`) already supports status filtering and prefix/sorted access on `custname`, but does not accelerate leading-wildcard `ILIKE '%term%'` searches across `custno`, `custname`, and `address`.
   - Enabled `pg_trgm` and added GIN trigram indexes (`idx_customer_custno_trgm`, `idx_customer_custname_trgm`, `idx_customer_address_trgm`) to support substring `ILIKE` scaling as customer volume grows, trading additional write/index maintenance cost for faster substring searches.
2. **Covering Index on `pricehist`:**
   - Created `idx_pricehist_prod_del_effdate_inc_price` on `pricehist (prodcode, is_deleted, effdate DESC) INCLUDE (unitprice)` to align with `prodcode` + `is_deleted` filtering, `effdate DESC` ordering, and `unitprice` retrieval without heap visits when index-only scans are selected at larger data volumes.
3. **Statistics & Maintenance:**
   - Ran `ANALYZE` and `VACUUM (ANALYZE) pricehist` (outside a transaction block) to refresh planner statistics and visibility metadata.

---

## 4. Post-Tuning Verification & Comparison

On small seed tables (`5` customers, `5` products, `9` `pricehist` rows), PostgreSQL's cost-based planner favors sequential scans over index lookups because the entire dataset fits in a few `8KB` pages (`shared hit` buffers). As row counts grow, the trigram GIN indexes and `(prodcode, is_deleted, effdate DESC) INCLUDE (unitprice)` covering index prevent full-table scans and reverse-scan workarounds.

| Query | Metric | Before Tuning | After Tuning (`ANALYZE` / `VACUUM`) |
| :--- | :--- | :--- | :--- |
| **Query A** (Customer Search) | Top Plan / Time / Buffers | `Sort` + `Seq Scan` (`0.181 ms`, `4` hits, est. `2` rows) | `Sort` + `Seq Scan` (`1.376 ms`, `4` hits, est. `1` row) |
| **Query B** (Product + Current Price) | Top Plan / Time / Buffers | `Nested Loop Left Join` (`0.086 ms`, `10` hits, est. `135` rows) | `Sort` -> `Nested Loop Left Join` (`0.134 ms`, `8` hits, est. `4` rows) |
| **Query C** (Price History `P-001`) | Top Plan / Time / Buffers | `Index Scan Backward` (`0.024 ms`, `3` hits, est. `1` row) | `Sort` -> `Seq Scan` (`0.028 ms`, `1` hit, est. `2` rows) |

---

## 5. Recommendations for Production / Scale
- Keep `idx_customer_status_custname` for status filtering and `custname` ordering, and retain the `pg_trgm` GIN indexes (`custno`, `custname`, `address`) if live substring search (`ILIKE '%...%'`) remains a primary workload as `customer` grows.
- Keep `idx_pricehist_prod_del_effdate_inc_price` (`(prodcode, is_deleted, effdate DESC) INCLUDE (unitprice)`) and periodically run `VACUUM ANALYZE` on high-churn tables so visibility maps stay current for index-only scans.
- Re-benchmark with realistic synthetic row volumes (e.g., 10k–100k+ rows) before finalizing production capacity thresholds.