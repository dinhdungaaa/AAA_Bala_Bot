import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appPath = path.join(__dirname, '..', 'src', 'App.tsx');
let content = fs.readFileSync(appPath, 'utf-8');

// ============================================================
// 1. Update icon imports - add Clock, Calendar, Zap, Power, Eye
// ============================================================
content = content.replace(
  /Menu, X\n\} from 'lucide-react';/,
  "Menu, X, Clock, Calendar, Zap, Power, Eye\n} from 'lucide-react';"
);
content = content.replace(
  /Menu, X\r\n\} from 'lucide-react';/,
  "Menu, X, Clock, Calendar, Zap, Power, Eye\r\n} from 'lucide-react';"
);
console.log("[1] Updated icon imports");

// ============================================================
// 2. Update type imports - add ScheduleItem, ReminderLog
// ============================================================
content = content.replace(
  "SaasCustomer } from './types'",
  "SaasCustomer, ScheduleItem, ReminderLog } from './types'"
);
console.log("[2] Updated type imports");

// ============================================================
// 3. Update activeTab type union - add 'schedules'
// ============================================================
content = content.replace(
  "'billing' | 'admin'>",
  "'billing' | 'schedules' | 'admin'>"
);
console.log("[3] Updated activeTab type");

// ============================================================
// 4. Add schedule state variables after kbSearchQuery
// ============================================================
const kbSearchLine = "const [kbSearchQuery, setKbSearchQuery] = useState('');";
const kbSearchIdx = content.indexOf(kbSearchLine);
if (kbSearchIdx !== -1) {
  const insertAfter = kbSearchIdx + kbSearchLine.length;
  const scheduleStates = `

  // Schedule/Reminder System States
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [remLogs, setRemLogs] = useState<ReminderLog[]>([]);
  const [schedForm, setSchedForm] = useState({
    label: '', content: '', time: '08:00', frequency: 'daily' as string,
    targetChatIds: '', aiEnhanced: false, aiTone: 'friendly' as string,
    daysOfWeek: [] as number[], dayOfMonth: 1, category: 'task',
    targetType: 'group' as string, maxTriggers: 0
  });
  const [schedUploadFile, setSchedUploadFile] = useState<File | null>(null);
  const [schedParseText, setSchedParseText] = useState('');
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedTab, setSchedTab] = useState<'list' | 'create' | 'upload' | 'logs'>('list');`;
  content = content.substring(0, insertAfter) + scheduleStates + content.substring(insertAfter);
  console.log("[4] Added schedule state variables");
} else {
  console.log("[4] SKIP - kbSearchQuery not found");
}

// ============================================================
// 5. Add sidebar button for schedules after billing button
// ============================================================
// Find the billing sidebar button end - search for the text pattern
const billingNavText = "Gói Cước & Bảng Giá";
const billingNavIdx = content.indexOf(billingNavText);
if (billingNavIdx !== -1) {
  // Find the closing </button> after this text
  const afterBilling = content.indexOf('</button>', billingNavIdx);
  if (afterBilling !== -1) {
    const insertPos = afterBilling + '</button>'.length;
    const schedNavBtn = `

          <button
            onClick={() => { setActiveTab('schedules'); setIsMobileMenuOpen(false); }}
            className={\`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 \${activeTab === 'schedules' ? 'bg-blue-600/10 text-teal-400 border-l-4 border-teal-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}\`}
          >
            <Clock className="w-4 h-4 text-teal-400" />
            Lịch Nhắc Tự Động
          </button>`;
    content = content.substring(0, insertPos) + schedNavBtn + content.substring(insertPos);
    console.log("[5] Added sidebar button");
  }
} else {
  console.log("[5] SKIP - billing nav not found");
}

// ============================================================
// 6. Add header title for schedules tab
// ============================================================
const analyticsTitle = "Báo cáo Đo Lường Hiệu Suất";
const analyticsIdx = content.indexOf(analyticsTitle);
if (analyticsIdx !== -1) {
  // Find the end of that line's closing
  const lineEnd = content.indexOf("'}", analyticsIdx);
  if (lineEnd !== -1) {
    const insertPos = lineEnd + 2; // after '}
    const schedTitle = `\n                  {activeTab === 'schedules' && 'Hệ Thống Nhắc Lịch Tự Động & AI Push'}`;
    content = content.substring(0, insertPos) + schedTitle + content.substring(insertPos);
    console.log("[6] Added header title");
  }
} else {
  console.log("[6] SKIP - analytics title not found");
}

// ============================================================
// 7. Add fetch schedules in useEffect
// ============================================================
const setFaqsLine = ".then(data => setFaqs(data));";
const setFaqsIdx = content.indexOf(setFaqsLine);
if (setFaqsIdx !== -1) {
  const insertPos = setFaqsIdx + setFaqsLine.length;
  const fetchSchedules = `

    fetch(\`/api/bots/\${selectedBotId}/schedules\`)
      .then(res => res.json())
      .then(data => setSchedules(data));

    fetch(\`/api/bots/\${selectedBotId}/reminder-logs\`)
      .then(res => res.json())
      .then(data => setRemLogs(data));`;
  content = content.substring(0, insertPos) + fetchSchedules + content.substring(insertPos);
  console.log("[7] Added schedule fetching");
} else {
  console.log("[7] SKIP - setFaqs not found");
}

// ============================================================
// 8. Add schedule tab content before admin tab
// ============================================================
const adminTabMarker = "{activeTab === 'admin' && sbUser?.email === ADMIN_EMAIL && (";
const adminIdx = content.indexOf(adminTabMarker);
if (adminIdx !== -1) {
  const schedulePanel = `{activeTab === 'schedules' && (
            <div className="space-y-6 animate-fade-in text-left">
              {/* HEADER BANNER */}
              <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-slate-800 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-xl">
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
                  <Clock className="w-80 h-80 text-teal-400 rotate-12" />
                </div>
                <div className="relative z-10 max-w-4xl">
                  <h2 className="text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-3">
                    <Clock className="w-6 h-6 text-teal-400" />
                    Hệ Thống Nhắc Lịch Tự Động
                  </h2>
                  <p className="text-slate-400 text-xs md:text-sm mt-2 max-w-2xl">
                    Nạp file quy trình hoặc thiết lập thủ công lịch nhắc. Bot sẽ tự động gửi nhắc nhở vào group Telegram theo đúng giờ với nội dung AI thông minh, không lặp lại.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full font-mono font-bold border border-teal-500/30">UTC+7 Vietnam</span>
                    <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full font-mono font-bold border border-teal-500/30">{schedules.filter(s => s.status === 'active').length} Active</span>
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono font-bold">{schedules.length} Total</span>
                  </div>
                </div>
              </div>

              {/* SUB-NAV TABS */}
              <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-xs">
                {([['list', 'Danh sách', Calendar], ['create', 'Tạo mới', Plus], ['upload', 'Nạp file / AI', Upload], ['logs', 'Lịch sử gửi', History]] as [string, string, any][]).map(([key, label, Icon]) => (
                  <button key={key} onClick={() => setSchedTab(key as any)}
                    className={\`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer \${schedTab === key ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}\`}>
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
              </div>

              {/* LIST TAB */}
              {schedTab === 'list' && (
                <div className="space-y-3">
                  {schedules.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-4">
                      <Clock className="w-12 h-12 text-slate-300 mx-auto" />
                      <h3 className="text-lg font-bold text-slate-600">Chưa có lịch nhắc nào</h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">Tạo lịch nhắc mới bằng cách nhập thủ công hoặc nạp file quy trình. Bot sẽ tự động nhắc theo đúng lịch đã thiết lập.</p>
                      <button onClick={() => setSchedTab('create')} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer">
                        <Plus className="w-3.5 h-3.5 inline mr-1" />Tạo lịch nhắc đầu tiên
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nhãn</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Giờ</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tần suất</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Push</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đã nhắc</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {schedules.map(sched => (
                            <tr key={sched.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-bold text-xs text-slate-800">{sched.label}</div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{sched.content}</div>
                              </td>
                              <td className="px-4 py-3 text-xs font-mono font-bold text-teal-600">{sched.time}</td>
                              <td className="px-4 py-3">
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                                  {sched.frequency === 'daily' ? 'Hàng ngày' : sched.frequency === 'weekly' ? 'Hàng tuần' : sched.frequency === 'weekdays' ? 'T2-T6' : sched.frequency === 'monthly' ? 'Hàng tháng' : sched.frequency === 'once' ? 'Một lần' : sched.frequency}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {sched.aiEnhanced ? (
                                  <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-bold border border-purple-200 flex items-center gap-1 w-fit">
                                    <Sparkles className="w-3 h-3" />{sched.aiTone || 'friendly'}
                                  </span>
                                ) : <span className="text-[10px] text-slate-400">Tắt</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className={\`text-[10px] px-2 py-0.5 rounded-full font-bold border \${sched.status === 'active' ? 'bg-green-50 text-green-600 border-green-200' : sched.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}\`}>
                                  {sched.status === 'active' ? 'Hoạt động' : sched.status === 'paused' ? 'Tạm dừng' : sched.status === 'completed' ? 'Hoàn thành' : sched.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-slate-600">{sched.triggerCount}{sched.maxTriggers ? \`/\${sched.maxTriggers}\` : ''}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={async () => { await fetch(\`/api/schedules/\${sched.id}/toggle\`, { method: 'PUT' }); const r = await fetch(\`/api/bots/\${selectedBotId}/schedules\`); setSchedules(await r.json()); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" title={sched.status === 'active' ? 'Tạm dừng' : 'Bật lại'}>
                                    <Power className={\`w-3.5 h-3.5 \${sched.status === 'active' ? 'text-green-500' : 'text-slate-400'}\`} />
                                  </button>
                                  <button onClick={async () => { if (!confirm('Gửi nhắc nhở ngay?')) return; await fetch(\`/api/schedules/\${sched.id}/trigger-now\`, { method: 'POST' }); const r = await fetch(\`/api/bots/\${selectedBotId}/schedules\`); setSchedules(await r.json()); const lr = await fetch(\`/api/bots/\${selectedBotId}/reminder-logs\`); setRemLogs(await lr.json()); alert('Đã gửi!'); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" title="Gửi ngay">
                                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                                  </button>
                                  <button onClick={async () => { if (!confirm('Xóa lịch nhắc?')) return; await fetch(\`/api/schedules/\${sched.id}\`, { method: 'DELETE' }); setSchedules(p => p.filter(s => s.id !== sched.id)); }} className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title="Xóa">
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* CREATE TAB */}
              {schedTab === 'create' && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
                  <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-teal-500" />
                    Tạo Lịch Nhắc Mới
                  </h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!selectedBotId || !schedForm.content.trim()) return;
                    setSchedLoading(true);
                    try {
                      const chatIds = schedForm.targetChatIds.split(',').map(s => s.trim()).filter(Boolean);
                      const res = await fetch(\`/api/bots/\${selectedBotId}/schedules\`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...schedForm, targetChatIds: chatIds, maxTriggers: schedForm.maxTriggers > 0 ? schedForm.maxTriggers : undefined })
                      });
                      if (res.ok) {
                        const created = await res.json();
                        setSchedules(prev => [created, ...prev]);
                        setSchedForm({ label: '', content: '', time: '08:00', frequency: 'daily', targetChatIds: '', aiEnhanced: false, aiTone: 'friendly', daysOfWeek: [], dayOfMonth: 1, category: 'task', targetType: 'group', maxTriggers: 0 });
                        setSchedTab('list');
                        alert('Tạo lịch nhắc thành công!');
                      }
                    } catch (err) { alert('Lỗi: ' + err); }
                    finally { setSchedLoading(false); }
                  }} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhãn lịch nhắc</label>
                        <input type="text" required placeholder="VD: Họp sáng, Báo cáo tuần..." value={schedForm.label} onChange={e => setSchedForm({ ...schedForm, label: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Giờ nhắc (HH:mm)</label>
                        <input type="time" required value={schedForm.time} onChange={e => setSchedForm({ ...schedForm, time: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-mono" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nội dung nhắc nhở</label>
                      <textarea required rows={3} placeholder="Nhập nội dung nhắc nhở gửi vào group Telegram..." value={schedForm.content} onChange={e => setSchedForm({ ...schedForm, content: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tần suất</label>
                        <select value={schedForm.frequency} onChange={e => setSchedForm({ ...schedForm, frequency: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer">
                          <option value="once">Một lần</option><option value="daily">Hàng ngày</option><option value="weekdays">T2 - T6</option><option value="weekly">Hàng tuần</option><option value="monthly">Hàng tháng</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Phân loại</label>
                        <select value={schedForm.category} onChange={e => setSchedForm({ ...schedForm, category: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer">
                          <option value="task">Tác vụ</option><option value="meeting">Họp</option><option value="report">Báo cáo</option><option value="custom">Tùy chỉnh</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Giới hạn lần (0=vô hạn)</label>
                        <input type="number" min={0} value={schedForm.maxTriggers} onChange={e => setSchedForm({ ...schedForm, maxTriggers: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Telegram Group Chat IDs (phân cách bằng dấu phẩy)</label>
                      <input type="text" placeholder="VD: -100123456789, -100987654321" value={schedForm.targetChatIds} onChange={e => setSchedForm({ ...schedForm, targetChatIds: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" />
                      <p className="text-[10px] text-slate-400 mt-1">Lấy Group Chat ID bằng cách thêm bot @RawDataBot vào group Telegram.</p>
                    </div>
                    {/* AI PUSH TOGGLE */}
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /><span className="text-sm font-bold text-slate-800">AI Push Nhân Viên</span></div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={schedForm.aiEnhanced} onChange={e => setSchedForm({ ...schedForm, aiEnhanced: e.target.checked })} className="sr-only peer" />
                          <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-purple-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                        </label>
                      </div>
                      {schedForm.aiEnhanced && (
                        <div>
                          <label className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block mb-1">Tone AI Push</label>
                          <div className="flex gap-2 flex-wrap">
                            {['friendly', 'motivational', 'strict', 'urgent'].map(tone => (
                              <button key={tone} type="button" onClick={() => setSchedForm({ ...schedForm, aiTone: tone })}
                                className={\`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer \${schedForm.aiTone === tone ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'}\`}>
                                {tone === 'friendly' ? 'Thân thiện' : tone === 'motivational' ? 'Tạo động lực' : tone === 'strict' ? 'Nghiêm túc' : 'Khẩn cấp'}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-purple-500 mt-2">Gemini AI sẽ viết lại nội dung mỗi lần gửi, không bao giờ lặp lại.</p>
                        </div>
                      )}
                    </div>
                    <button type="submit" disabled={schedLoading}
                      className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md">
                      {schedLoading ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang tạo...</> : <><Plus className="w-4 h-4" />Tạo Lịch Nhắc</>}
                    </button>
                  </form>
                </div>
              )}

              {/* UPLOAD TAB */}
              {schedTab === 'upload' && (
                <div className="space-y-5">
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                    <h3 className="font-bold text-base text-slate-800 flex items-center gap-2"><Upload className="w-5 h-5 text-teal-500" />Nạp File Quy Trình (TXT, CSV, JSON, Excel)</h3>
                    <div className="border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-xl p-8 text-center transition-colors cursor-pointer"
                      onClick={() => document.getElementById('sched-file-input')?.click()}>
                      <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-bold text-slate-600">{schedUploadFile ? schedUploadFile.name : 'Kéo thả hoặc nhấn để chọn file'}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ: .txt, .csv, .json, .xlsx</p>
                      <input id="sched-file-input" type="file" accept=".txt,.csv,.json,.xlsx,.xls,.md" className="hidden" onChange={e => setSchedUploadFile(e.target.files?.[0] || null)} />
                    </div>
                    <button disabled={!schedUploadFile || schedLoading} onClick={async () => {
                      if (!schedUploadFile || !selectedBotId) return;
                      setSchedLoading(true);
                      const reader = new FileReader();
                      reader.onload = async () => {
                        try {
                          const base64 = (reader.result as string).split(',')[1];
                          const res = await fetch(\`/api/bots/\${selectedBotId}/schedules/upload\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: schedUploadFile.name, fileData: base64 }) });
                          const data = await res.json();
                          if (data.success) { setSchedules(prev => [...data.schedules, ...prev]); alert(\`Nạp thành công \${data.totalParsed} lịch nhắc!\`); setSchedUploadFile(null); setSchedTab('list'); }
                          else { alert('Lỗi: ' + (data.errors?.join(', ') || 'Không thể parse')); }
                        } catch (err) { alert('Lỗi: ' + err); }
                        setSchedLoading(false);
                      };
                      reader.readAsDataURL(schedUploadFile);
                    }} className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer">
                      {schedLoading ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang xử lý...</> : <><Upload className="w-4 h-4" />Upload & Parse File</>}
                    </button>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                    <h3 className="font-bold text-base text-slate-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" />AI Parse Văn Bản Tự Do</h3>
                    <p className="text-xs text-slate-500">Nhập mô tả quy trình bằng ngôn ngữ tự nhiên. AI sẽ tự động trích xuất thành danh sách lịch nhắc.</p>
                    <textarea rows={5} placeholder="VD: Nhắc họp sáng lúc 8h30 mỗi ngày. Báo cáo doanh thu vào 17h chiều thứ 6 hàng tuần." value={schedParseText} onChange={e => setSchedParseText(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
                    <button disabled={!schedParseText.trim() || schedLoading} onClick={async () => {
                      if (!selectedBotId) return;
                      setSchedLoading(true);
                      try {
                        const res = await fetch(\`/api/bots/\${selectedBotId}/schedules/parse-text\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: schedParseText }) });
                        const data = await res.json();
                        if (data.success) { setSchedules(prev => [...data.schedules, ...prev]); alert(\`AI trích xuất thành công \${data.totalParsed} lịch nhắc!\`); setSchedParseText(''); setSchedTab('list'); }
                        else { alert('Lỗi: ' + (data.errors?.join(', ') || 'AI không thể phân tích')); }
                      } catch (err) { alert('Lỗi: ' + err); }
                      finally { setSchedLoading(false); }
                    }} className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer">
                      {schedLoading ? <><RefreshCw className="w-4 h-4 animate-spin" />AI đang phân tích...</> : <><Sparkles className="w-4 h-4" />AI Parse & Tạo Lịch Nhắc</>}
                    </button>
                  </div>
                </div>
              )}

              {/* LOGS TAB */}
              {schedTab === 'logs' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-teal-500" />Lịch Sử Nhắc Nhở Đã Gửi</h3>
                    <button onClick={async () => { const r = await fetch(\`/api/bots/\${selectedBotId}/reminder-logs\`); setRemLogs(await r.json()); }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Làm mới
                    </button>
                  </div>
                  {remLogs.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                      <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">Chưa có nhắc nhở nào được gửi.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {remLogs.map(log => (
                        <div key={log.id} className={\`bg-white rounded-xl border p-4 \${log.status === 'sent' ? 'border-green-200' : log.status === 'failed' ? 'border-rose-200' : 'border-slate-200'}\`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={\`text-[10px] px-2 py-0.5 rounded-full font-bold border \${log.status === 'sent' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-rose-50 text-rose-600 border-rose-200'}\`}>
                                {log.status === 'sent' ? 'Đã gửi' : 'Thất bại'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">{new Date(log.triggeredAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">{log.targetChatIds?.length || 0} targets</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{log.content}</p>
                          {log.errorMessage && <p className="text-[10px] text-rose-500 mt-1">{log.errorMessage}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          `;
  content = content.substring(0, adminIdx) + schedulePanel + content.substring(adminIdx);
  console.log("[8] Added schedule tab content");
} else {
  console.log("[8] SKIP - admin tab not found");
}

fs.writeFileSync(appPath, content, 'utf-8');
console.log("All patches applied successfully! File size:", content.length);
