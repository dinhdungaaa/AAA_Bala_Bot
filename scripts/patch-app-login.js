import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appPath = path.join(__dirname, '..', 'src', 'App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

// Target string to replace (standardize line endings to match the file's content)
const target = `            <div id="auth-portal" className="lg:col-span-5 md:py-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="mb-6 text-center">
                  <h3 className="text-xl font-bold text-white tracking-tight">Cổng Kiểm Thử Trực Tuyến</h3>
                  <p className="text-xs text-slate-400 mt-1">Đăng nhập hoặc Đăng ký tài khoản Supabase Auth để sử dụng chức năng thiết lập và cấu hình bot Telegram của riêng bạn.</p>
                </div>

                <div className="flex bg-slate-100/10 p-1 border border-slate-800 rounded-xl mb-6 font-sans">
                  <button
                    type="button"
                    onClick={() => { setSbAuthMode('signin'); setSbAuthError(''); }}
                    className={\`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer \${sbAuthMode === 'signin' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'text-slate-400 hover:text-white'}\`}
                  >
                    Đăng Nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSbAuthMode('signup'); setSbAuthError(''); }}
                    className={\`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer \${sbAuthMode === 'signup' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'text-slate-400 hover:text-white'}\`}
                  >
                    Đăng Ký
                  </button>
                </div>

                <form onSubmit={handleSbAuthSubmit} className="space-y-4">
                  {sbAuthError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-start gap-2.5 animate-shake">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <span className="font-medium text-[11px] leading-snug whitespace-pre-line">{sbAuthError}</span>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Địa chỉ Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="name@yourdomain.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                      value={sbAuthEmail}
                      onChange={(e) => setSbAuthEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Mật khẩu bảo mật
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Mật khẩu từ 6 ký tự"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                      value={sbAuthPassword}
                      onChange={(e) => setSbAuthPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sbAuthLoading}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-850 text-slate-950 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10 mt-2"
                  >
                    {sbAuthLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                        Đang kết nối Supabase Auth...
                      </>
                    ) : sbAuthMode === 'signup' ? (
                      'Tạo tài khoản miễn phí'
                    ) : (
                      'Đăng Nhập Hệ Thống'
                    )}
                  </button>
                </form>

                <div className="mt-5 text-[10px] text-slate-500 text-center flex items-center justify-center gap-1.5 bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/50">
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  Mọi tài khoản đều được lưu an toàn tại máy chủ Supabase
                </div>`;

const replacement = `            <div id="auth-portal" className="lg:col-span-5 md:py-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="mb-6 text-center">
                  <h3 className="text-xl font-bold text-white tracking-tight">Cổng Kiểm Thử Trực Tuyến</h3>
                  <p className="text-xs text-slate-400 mt-1">Đăng nhập hoặc Đăng ký tài khoản Supabase Auth để sử dụng chức năng thiết lập và cấu hình bot Telegram của riêng bạn.</p>
                </div>

                {sbStatus !== null && !sbStatus.connected ? (
                  <div className="flex bg-slate-100/10 p-1 border border-slate-800 rounded-xl mb-6 font-sans">
                    <div className="flex-1 py-1.5 text-center text-xs font-bold rounded-lg bg-amber-600 text-white shadow-md shadow-amber-600/10">
                      Cấu hình Supabase
                    </div>
                  </div>
                ) : (
                  <div className="flex bg-slate-100/10 p-1 border border-slate-800 rounded-xl mb-6 font-sans">
                    <button
                      type="button"
                      onClick={() => { setSbAuthMode('signin'); setSbAuthError(''); }}
                      className={\`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer \${sbAuthMode === 'signin' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'text-slate-400 hover:text-white'}\`}
                    >
                      Đăng Nhập
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSbAuthMode('signup'); setSbAuthError(''); }}
                      className={\`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer \${sbAuthMode === 'signup' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'text-slate-400 hover:text-white'}\`}
                    >
                      Đăng Ký
                    </button>
                  </div>
                )}

                {sbStatus !== null && !sbStatus.connected ? (
                  <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-xl flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <span className="font-bold text-[11px] block text-amber-400">Chưa cấu hình Supabase!</span>
                        <p className="text-[10px] text-slate-400 mt-1">Hệ thống cần kết nối đến Supabase để quản lý tài khoản và dữ liệu bot của anh.</p>
                      </div>
                    </div>

                    {sbAuthError && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
                        <span className="font-medium text-[11px] leading-snug">{sbAuthError}</span>
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        API URL (Endpoint)
                      </label>
                      <input
                        type="url"
                        required
                        placeholder="https://your-project.supabase.co"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        value={sbUrl}
                        onChange={(e) => setSbUrl(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Anon Public API Key
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="eyJhbGciOi..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        value={sbKey}
                        onChange={(e) => setSbKey(e.target.value)}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sbTesting}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-850 text-slate-950 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10 mt-2"
                    >
                      {sbTesting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                          Đang kết nối...
                        </>
                      ) : (
                        'Lưu & Khởi tạo Kết nối'
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSbAuthSubmit} className="space-y-4">
                    {sbAuthError && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-start gap-2.5 animate-shake">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                        <span className="font-medium text-[11px] leading-snug whitespace-pre-line">{sbAuthError}</span>
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Địa chỉ Email
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="name@yourdomain.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                        value={sbAuthEmail}
                        onChange={(e) => setSbAuthEmail(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Mật khẩu bảo mật
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Mật khẩu từ 6 ký tự"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        value={sbAuthPassword}
                        onChange={(e) => setSbAuthPassword(e.target.value)}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sbAuthLoading}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-850 text-slate-950 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10 mt-2"
                    >
                      {sbAuthLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                          Đang kết nối Supabase Auth...
                        </>
                      ) : sbAuthMode === 'signup' ? (
                        'Tạo tài khoản miễn phí'
                      ) : (
                        'Đăng Nhập Hệ Thống'
                      )}
                    </button>
                  </form>
                )}

                <div className="mt-5 text-[10px] text-slate-500 text-center flex items-center justify-center gap-1.5 bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/50">
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  Mọi tài khoản đều được lưu an toàn tại máy chủ Supabase
                </div>`;

// Try exact replacement first
if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('Successfully patched App.tsx using standard target.');
} else {
  // Try replacement by normalizing line endings
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const normalizedTarget = target.replace(/\r\n/g, '\n');
  const normalizedReplacement = replacement.replace(/\r\n/g, '\n');
  
  if (normalizedContent.includes(normalizedTarget)) {
    const newContent = normalizedContent.replace(normalizedTarget, normalizedReplacement);
    fs.writeFileSync(appPath, newContent, 'utf8');
    console.log('Successfully patched App.tsx using normalized target.');
  } else {
    console.error('ERROR: Could not find target block in App.tsx.');
  }
}
