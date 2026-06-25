-- Luu vector embedding cho tung chunk (mang float JSON). Khong dung pgvector.
-- Bang knowledge_chunks dung camelCase (botId, isActive...), nen cot hash phai
-- quote de giu nguyen hoa thuong "embeddingHash" (khop voi KnowledgeChunk.embeddingHash).
alter table knowledge_chunks add column if not exists embedding jsonb;
alter table knowledge_chunks add column if not exists "embeddingHash" text;

-- Phong cach tra loi per-bot (sales | reference). Bat buoc: UI luu bot gui kem
-- 'answerStyle', thieu cot nay thi luu cau hinh bot se loi.
alter table bots add column if not exists "answerStyle" text;
