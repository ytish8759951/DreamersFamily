-- Little Dreamers Family - complete schema entry point
--
-- This file is intended for psql execution from the repository root.
-- Supabase CLI users should run `supabase db push`, which applies the same
-- migration files in filename order.
--
-- No seed or fake data is included.

\set ON_ERROR_STOP on

\ir migrations/001_initial_schema.sql
\ir migrations/002_core_product_schema.sql
\ir migrations/003_core_rls_and_storage.sql
\ir migrations/004_repository_foundation.sql
