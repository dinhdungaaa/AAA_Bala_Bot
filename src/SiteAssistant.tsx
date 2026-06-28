import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';

interface Msg { role: 'user' | 'bot'; text: string; }

const WELCOME: Msg = {
  role: 'bot',
  text: 'Dạ em là Trợ lý BalaBot 👋 Em có thể tư vấn về tính năng, bảng giá, cách kết nối Telegram/Facebook/Zalo và cách bắt đầu. Anh/chị muốn hỏi gì ạ?',
};

const SUGGESTIONS = ['BalaBot là gì?', 'Bảng giá thế nào?', 'Kết nối Zalo ra sao?', 'Cách tạo bot?'];

export default function SiteAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Lead capture
  const [showLead, setShowLead] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadContact, setLeadContact] = useState('');
  const [leadSending, setLeadSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading, open, showLead]);

  const submitLead = async () => {
    if (!leadContact.trim() || leadSending) return;
    setLeadSending(true);
    try {
      const lastUser = [...messages].reverse().find(m => m.role === 'user')?.text || '';
      const r = await fetch('/api/site-assistant/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: leadName, contact: leadContact, note: lastUser, page: typeof window !== 'undefined' ? window.location.href : '' }),
      });
      const d = await r.json();
      setShowLead(false); setLeadName(''); setLeadContact('');
      setMessages(prev => [...prev, { role: 'bot', text: d.message || 'Cảm ơn anh/chị! Bên em sẽ liên hệ sớm ạ.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Gửi liên hệ chưa được ạ, anh/chị thử lại giúp em nhé.' }]);
    } finally {
      setLeadSending(false);
    }
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const history = messages.filter(m => m !== WELCOME).slice(-6);
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const r = await fetch('/api/site-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      });
      const d = await r.json();
      setMessages(prev => [...prev, { role: 'bot', text: d.answer || 'Dạ em chưa rõ câu hỏi, anh/chị nói lại giúp em nhé ạ.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Mạng đang trục trặc ạ, anh/chị thử lại sau nhé.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Nút nổi */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Mở trợ lý BalaBot"
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 pl-4 pr-5 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xl shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-transform cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-bold">Hỏi trợ lý</span>
        </button>
      )}

      {/* Khung chat */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[60] w-[92vw] max-w-[380px] h-[68vh] max-h-[560px] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-[fadeIn_.15s_ease-out]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold">Trợ lý BalaBot</div>
                <div className="text-[10px] text-indigo-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Trực tuyến
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Đóng" className="p-1 rounded-lg hover:bg-white/15 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tin nhắn */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-slate-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                </div>
              </div>
            )}

            {messages.length <= 1 && !loading && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Form để lại liên hệ */}
          {showLead && (
            <div className="px-3 py-3 border-t border-indigo-100 bg-indigo-50/60 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-800">Để lại liên hệ — bên em gọi tư vấn & hỗ trợ setup</span>
                <button onClick={() => setShowLead(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
              <input
                value={leadName} onChange={(e) => setLeadName(e.target.value)}
                placeholder="Tên của anh/chị (tuỳ chọn)"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                value={leadContact} onChange={(e) => setLeadContact(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitLead(); }}
                placeholder="Số điện thoại / Zalo / email *"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={submitLead} disabled={leadSending || !leadContact.trim()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                {leadSending ? 'Đang gửi...' : 'Gửi liên hệ'}
              </button>
            </div>
          )}

          {/* Nhập */}
          <div className="p-2.5 border-t border-slate-200 bg-white shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={1}
                placeholder="Nhập câu hỏi về BalaBot..."
                className="flex-1 resize-none max-h-24 bg-slate-100 rounded-xl px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                aria-label="Gửi"
                className="w-9 h-9 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 mt-1.5">
              {!showLead && (
                <button onClick={() => setShowLead(true)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer">
                  📞 Để lại liên hệ để được tư vấn
                </button>
              )}
              <span className="text-[9px] text-slate-300">·</span>
              <span className="text-[9px] text-slate-400">AI có thể chưa chính xác 100%</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
