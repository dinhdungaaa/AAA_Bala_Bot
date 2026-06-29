// Model embedding cua Gemini (verified OK: gemini-embedding-001, 3072 dims).
export const EMBED_MODEL = "gemini-embedding-001";
// Model sinh (verified OK).
export const GEN_MODEL = "gemini-2.5-flash";
// So doan truy hoi toi da dua vao prompt.
export const TOP_K = 5;
// Nguong cosine "tu tin cao" (danh dau fallback/handoff, KHONG dung de chan context).
export const SIM_THRESHOLD = 0.62;
// San truy hoi mem: moi doan tren san se duoc dua cho model TU phan doan lien quan,
// thay vi chan cung bang SIM_THRESHOLD (cau hoi ngan diem thap van lay duoc dung doan).
export const RETRIEVE_FLOOR = 0.4;
