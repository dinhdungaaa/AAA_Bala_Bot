-- Luu vector embedding cho tung chunk (mang float JSON). Khong dung pgvector.
alter table knowledge_chunks add column if not exists embedding jsonb;
alter table knowledge_chunks add column if not exists embedding_hash text;
