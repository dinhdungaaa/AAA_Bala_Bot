import React, { useState, useEffect, useCallback } from 'react';
import { PenSquare, Copy, Trash2, Save, RefreshCw, Sparkles, AlertCircle } from 'lucide-react';

// ---- Kiểu dữ liệu nhẹ, khớp response Task 8 (server.ts /api/bots/:botId/content*) ----
type PostType = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7';
type Verdict = 'ok' | 'warn' | 'blocked';

interface ContentPost {
  id: string;
  botId: string;
  postType: PostType;
  topic: string;
  content: string;
  score: number;
  status: string;
  createdAt: string;
  passed?: boolean;
  failures?: string[];
}

interface UsageInfo {
  count: number;
  limit: number;
  verdict: Verdict;
}

const POST_TYPE_GROUPS: { label: string; options: { id: PostType; name: string }[] }[] = [
  {
    label: 'Thương hiệu cá nhân',
    options: [
      { id: 'D1', name: 'Storytelling cá nhân' },
      { id: 'D3', name: 'Hot take / opinion' },
      { id: 'D7', name: 'Behind-the-scenes' },
    ],
  },
  {
    label: 'Quảng bá / kiến thức',
    options: [
      { id: 'D2', name: 'Chia sẻ insight / kiến thức' },
      { id: 'D4', name: 'How-to / tutorial' },
      { id: 'D5', name: 'Cornerstone (bài trụ)' },
      { id: 'D6', name: 'Engagement (tương tác)' },
    ],
  },
];

const POST_TYPE_LABELS: Record<PostType, string> = {
  D1: 'Storytelling cá nhân', D2: 'Chia sẻ insight / kiến thức', D3: 'Hot take / opinion',
  D4: 'How-to / tutorial', D5: 'Cornerstone (bài trụ)', D6: 'Engagement (tương tác)', D7: 'Behind-the-scenes',
};

const LENGTH_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Tự động' },
  { value: 'short', label: 'Ngắn' },
  { value: 'medium', label: 'Vừa' },
  { value: 'long', label: 'Dài' },
];

export function ContentPanel({ botId }: { botId: string | null | undefined }) {
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [postType, setPostType] = useState<PostType>('D1');
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [lengthPreference, setLengthPreference] = useState('auto');
  const [extraIngredients, setExtraIngredients] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ContentPost | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    if (!botId) return;
    try {
      const res = await fetch(`/api/bots/${botId}/content/usage`);
      if (res.ok) setUsage(await res.json());
    } catch { /* im lặng — thẻ quota không hiện là chấp nhận được */ }
  }, [botId]);

  const loadPosts = useCallback(async () => {
    if (!botId) return;
    try {
      const res = await fetch(`/api/bots/${botId}/content`);
      if (res.ok) {
        const data: ContentPost[] = await res.json();
        setPosts([...data].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      }
    } catch { /* im lặng */ }
  }, [botId]);

  useEffect(() => {
    setResult(null);
    setError('');
    if (botId) {
      loadUsage();
      loadPosts();
    } else {
      setUsage(null);
      setPosts([]);
    }
  }, [botId, loadUsage, loadPosts]);

  const handleGenerate = async () => {
    if (!botId || !topic.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/bots/${botId}/content/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postType, topic: topic.trim(), goal: goal.trim() || undefined, lengthPreference, extraIngredients: extraIngredients.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data?.error || 'Bạn đã hết lượt tạo bài của gói tháng này. Nâng gói để tạo thêm.');
      } else if (!res.ok) {
        setError(data?.error || 'Tạo bài thất bại, thử lại sau ít phút.');
      } else {
        setResult(data);
        loadUsage();
        loadPosts();
      }
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);
  };

  const handleSaveResult = async () => {
    if (!result) return;
    setSavingId(result.id);
    try {
      await fetch(`/api/content/${result.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: result.content, status: 'saved' }),
      });
      loadPosts();
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa bài viết này?')) return;
    await fetch(`/api/content/${id}`, { method: 'DELETE' });
    if (result?.id === id) setResult(null);
    loadPosts();
    loadUsage();
  };

  if (!botId) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 text-center text-sm text-slate-500">
        Chọn bot trước để dùng tính năng tạo bài viết.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* Thẻ quota */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            {usage ? (
              <span>Đã dùng <span className="font-bold">{usage.count}/{usage.limit}</span> bài tháng này</span>
            ) : (
              <span className="text-slate-400">Đang tải hạn mức...</span>
            )}
          </div>
          {usage && usage.verdict !== 'ok' && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              {usage.verdict === 'blocked' ? 'Hết lượt tháng này — nâng gói để tạo thêm' : 'Sắp hết lượt — cân nhắc nâng gói'}
            </span>
          )}
        </div>

        {/* Form tạo bài */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Tạo bài viết mới</h2>
            <p className="text-xs text-slate-500 mt-1">AI soạn bài theo công thức content đã kiểm chứng, bám tri thức của bot.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Loại bài</label>
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value as PostType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {POST_TYPE_GROUPS.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.id} — {opt.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Độ dài</label>
              <select
                value={lengthPreference}
                onChange={(e) => setLengthPreference(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {LENGTH_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Chủ đề *</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="VD: Cách xây thương hiệu cá nhân bằng AI"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Mục tiêu (tùy chọn)</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="VD: Thu hút khách để lại số điện thoại"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Nguyên liệu thêm (tùy chọn)</label>
              <textarea
                rows={1}
                value={extraIngredients}
                onChange={(e) => setExtraIngredients(e.target.value)}
                placeholder="Số liệu, câu chuyện, chi tiết muốn đưa vào bài"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm flex items-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PenSquare className="w-4 h-4" />}
            {loading ? 'Đang tạo bài...' : 'Tạo bài'}
          </button>

          {result && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Kết quả — {POST_TYPE_LABELS[result.postType]}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${result.passed === false ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  Điểm chất lượng: {result.score}
                </span>
              </div>
              <textarea
                rows={10}
                value={result.content}
                onChange={(e) => setResult({ ...result, content: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y font-mono"
              />
              {result.failures && result.failures.length > 0 && (
                <p className="text-[11px] text-amber-600">Lưu ý: {result.failures.join('; ')}</p>
              )}
              <div className="flex gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleCopy(result.content, result.id)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" /> {copiedId === result.id ? 'Đã copy' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveResult}
                  disabled={savingId === result.id}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" /> {savingId === result.id ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(result.id)}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg text-xs flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Danh sách bài đã tạo */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4 lg:col-span-1 h-fit">
        <h3 className="text-sm font-bold text-slate-800">Bài đã tạo ({posts.length})</h3>
        {posts.length === 0 && (
          <p className="text-xs text-slate-400">Chưa có bài viết nào. Tạo bài đầu tiên ở bên trái.</p>
        )}
        <div className="space-y-3 max-h-[560px] overflow-y-auto">
          {posts.map(p => (
            <div key={p.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">{p.postType} · {POST_TYPE_LABELS[p.postType]}</span>
                <span className="text-[11px] font-bold text-slate-500">Điểm {p.score}</span>
              </div>
              <p className="text-xs font-semibold text-slate-700 line-clamp-1">{p.topic}</p>
              <p className="text-xs text-slate-500 line-clamp-3">{p.content}</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(p.content, p.id)}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> {copiedId === p.id ? 'Đã copy' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ContentPanel;
