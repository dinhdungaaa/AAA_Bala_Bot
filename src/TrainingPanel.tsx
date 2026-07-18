import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Plus, Trash2, AlertCircle, Sparkles, Power } from 'lucide-react';

interface TrainingExample {
  id: string;
  botId: string;
  question: string;
  answer: string;
  createdAt?: string;
}

interface TrainingRule {
  id: string;
  botId: string;
  rule: string;
  isActive: boolean;
  createdAt?: string;
}

type Verdict = 'ok' | 'warn' | 'blocked';
interface TrainingUsage {
  examples: { count: number; limit: number; verdict: Verdict };
  rules: { count: number; limit: number; verdict: Verdict };
}

export function TrainingPanel({ botId }: { botId: string | null | undefined }) {
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [rules, setRules] = useState<TrainingRule[]>([]);
  const [usage, setUsage] = useState<TrainingUsage | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [ruleText, setRuleText] = useState('');
  const [error, setError] = useState('');
  const [savingExample, setSavingExample] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const loadAll = useCallback(async () => {
    if (!botId) return;
    try {
      const [exRes, ruleRes, usageRes] = await Promise.all([
        fetch(`/api/bots/${botId}/training/examples`),
        fetch(`/api/bots/${botId}/training/rules`),
        fetch(`/api/bots/${botId}/training/usage`),
      ]);
      if (exRes.ok) setExamples(await exRes.json());
      if (ruleRes.ok) setRules(await ruleRes.json());
      if (usageRes.ok) setUsage(await usageRes.json());
    } catch { /* im lặng */ }
  }, [botId]);

  useEffect(() => {
    setError('');
    if (botId) {
      loadAll();
    } else {
      setExamples([]);
      setRules([]);
      setUsage(null);
    }
  }, [botId, loadAll]);

  const handleAddExample = async () => {
    if (!botId || !question.trim() || !answer.trim()) return;
    setSavingExample(true);
    setError('');
    try {
      const res = await fetch(`/api/bots/${botId}/training/examples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data?.error || 'Bạn đã đạt giới hạn số ví dụ mẫu của gói. Nâng gói để thêm nhiều hơn.');
      } else if (!res.ok) {
        setError(data?.error || 'Thêm ví dụ mẫu thất bại, thử lại sau.');
      } else {
        setQuestion('');
        setAnswer('');
        loadAll();
      }
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    } finally {
      setSavingExample(false);
    }
  };

  const handleDeleteExample = async (id: string) => {
    if (!window.confirm('Xóa ví dụ mẫu này?')) return;
    try {
      const res = await fetch(`/api/training/examples/${id}`, { method: 'DELETE' });
      if (!res.ok) { setError('Xóa ví dụ mẫu thất bại, thử lại sau.'); return; }
      loadAll();
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    }
  };

  const handleAddRule = async () => {
    if (!botId || !ruleText.trim()) return;
    setSavingRule(true);
    setError('');
    try {
      const res = await fetch(`/api/bots/${botId}/training/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule: ruleText.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data?.error || 'Bạn đã đạt giới hạn số quy tắc của gói. Nâng gói để thêm nhiều hơn.');
      } else if (!res.ok) {
        setError(data?.error || 'Thêm quy tắc thất bại, thử lại sau.');
      } else {
        setRuleText('');
        loadAll();
      }
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRule = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/training/rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) { setError('Cập nhật quy tắc thất bại, thử lại sau.'); return; }
      loadAll();
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Xóa quy tắc này?')) return;
    try {
      const res = await fetch(`/api/training/rules/${id}`, { method: 'DELETE' });
      if (!res.ok) { setError('Xóa quy tắc thất bại, thử lại sau.'); return; }
      loadAll();
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    }
  };

  if (!botId) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 text-center text-sm text-slate-500">
        Chọn bot trước để dùng tính năng huấn luyện phản hồi.
      </div>
    );
  }

  const renderUsageBadge = (label: string, u: { count: number; limit: number; verdict: Verdict } | undefined) => (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
      {u ? (
        u.limit >= 100000 ? (
          <span>{label}: <span className="font-bold">{u.count}</span> · <span className="font-bold text-emerald-600">Không giới hạn</span></span>
        ) : (
          <span>{label}: <span className="font-bold">{u.count}/{u.limit}</span></span>
        )
      ) : (
        <span className="text-slate-400">Đang tải hạn mức...</span>
      )}
      {u && u.verdict !== 'ok' && (
        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
          {u.verdict === 'blocked' ? 'Hết hạn mức — nâng gói' : 'Sắp hết hạn mức'}
        </span>
      )}
    </div>
  );

  const exampleLimitReached = usage ? usage.examples.verdict === 'blocked' : false;
  const ruleLimitReached = usage ? usage.rules.verdict === 'blocked' : false;

  return (
    <div className="space-y-8">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800 flex items-start gap-2">
        <GraduationCap className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Thay đổi ở đây có hiệu lực ngay cho các câu trả lời tiếp theo. Thử ngay ở tab <span className="font-semibold">Playground Chat Thử</span> để kiểm tra.</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Ví dụ mẫu (Hỏi → Trả lời)</h2>
            <p className="text-xs text-slate-500 mt-1">Dạy bot cách trả lời cụ thể theo mẫu — bot học phong cách, không copy nguyên văn.</p>
          </div>
          {renderUsageBadge('Ví dụ mẫu', usage?.examples)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Câu hỏi khách</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="VD: Bên mình có ship COD không?"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Câu trả lời mong muốn</label>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="VD: Dạ có ạ! Shop hỗ trợ COD toàn quốc ạ 😊"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddExample}
          disabled={savingExample || !question.trim() || !answer.trim() || exampleLimitReached}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> {savingExample ? 'Đang thêm...' : exampleLimitReached ? 'Đã hết hạn mức' : 'Thêm ví dụ'}
        </button>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {examples.length === 0 && <p className="text-xs text-slate-400">Chưa có ví dụ mẫu nào.</p>}
          {examples.map(ex => (
            <div key={ex.id} className="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">Khách: {ex.question}</p>
                <p className="text-xs text-slate-500 mt-1">→ {ex.answer}</p>
              </div>
              <button type="button" onClick={() => handleDeleteExample(ex.id)} className="shrink-0 text-rose-600 hover:text-rose-700">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Quy tắc chung</h2>
            <p className="text-xs text-slate-500 mt-1">Chỉ thị áp dụng cho mọi câu trả lời — VD "luôn hỏi số điện thoại trước khi báo giá".</p>
          </div>
          {renderUsageBadge('Quy tắc', usage?.rules)}
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
            placeholder="VD: Không bao giờ hứa thời gian giao hàng cụ thể"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={handleAddRule}
            disabled={savingRule || !ruleText.trim() || ruleLimitReached}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> {savingRule ? 'Đang thêm...' : ruleLimitReached ? 'Đã hết hạn mức' : 'Thêm quy tắc'}
          </button>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {rules.length === 0 && <p className="text-xs text-slate-400">Chưa có quy tắc nào.</p>}
          {rules.map(r => (
            <div key={r.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <p className={`text-xs flex-1 min-w-0 ${r.isActive ? 'text-slate-700 font-semibold' : 'text-slate-400 line-through'}`}>{r.rule}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleRule(r.id, !r.isActive)}
                  className={`flex items-center gap-1 text-[11px] font-bold ${r.isActive ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Power className="w-3.5 h-3.5" /> {r.isActive ? 'Đang bật' : 'Đang tắt'}
                </button>
                <button type="button" onClick={() => handleDeleteRule(r.id)} className="text-rose-600 hover:text-rose-700">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TrainingPanel;
