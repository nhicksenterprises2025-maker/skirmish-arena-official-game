CREATE TABLE map_pool_config (
  id TEXT PRIMARY KEY CHECK(id='active'),
  configuration_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
