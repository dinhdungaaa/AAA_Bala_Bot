-- Luu vector embedding cho tung chunk (mang float JSON). Khong dung pgvector.
-- Bang knowledge_chunks dung camelCase (botId, isActive...), nen cot hash phai
-- quote de giu nguyen hoa thuong "embeddingHash" (khop voi KnowledgeChunk.embeddingHash).
alter table knowledge_chunks add column if not exists embedding jsonb;
alter table knowledge_chunks add column if not exists "embeddingHash" text;
