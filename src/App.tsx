import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Bot, GraduationCap, Database, Play, Send, Sliders,
  History, BarChart3, Settings, CreditCard, Plus, Trash2, CheckCircle2,
  AlertCircle, Upload, MessageSquare, ArrowRight, ThumbsUp, ThumbsDown, RefreshCw, Key, Link2, HelpCircle, Check, Search, FileText, ChevronRight, User2, MessageCircle, Info, Sparkles, Shield,
  Menu, X, Clock, Calendar, Zap, Power, Eye
} from 'lucide-react';
import { BotConfig, KnowledgeSource, FAQItem, ChatSession, Message, AnalyticsSummary, SaasCustomer, ScheduleItem, ReminderLog } from './types';

const ADMIN_EMAIL = 'ox102.crypto@gmail.com';

const isAdminRoute = () => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/+$/, '').endsWith('/balabot/admin') ||
    window.location.pathname.replace(/\/+$/, '') === '/admin';
};

// Helper function to render text with intelligent layout, smart/readable line breaks, and neat lists
const renderFormattedText = (text: string, isUser: boolean = false) => {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className={`space-y-1.5 whitespace-pre-wrap break-words ${isUser ? 'text-white' : 'text-slate-850'}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        
        // Render bullet lists cleanly
        if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
          const cleanText = trimmed.replace(/^[-•*]\s*/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-1 animate-in fade-in duration-100">
              <span className={`shrink-0 mt-2 w-1.5 h-1.5 rounded-full ${isUser ? 'bg-white/85' : 'bg-blue-500'}`} />
              <span className="flex-1 text-sm leading-relaxed">{cleanText}</span>
            </div>
          );
        }
        
        // Render numbered lists with bold index badges
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          const num = numMatch[1];
          const cleanText = numMatch[2];
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-1 animate-in fade-in duration-100">
              <span className={`shrink-0 font-bold text-xs mt-0.5 ${isUser ? 'text-white/95' : 'text-blue-600'}`}>{num}.</span>
              <span className="flex-1 text-sm leading-relaxed">{cleanText}</span>
            </div>
          );
        }
        
        // If the line is empty, render a comfortable spacer
        if (!trimmed) {
          return <div key={idx} className="h-2" />;
        }
        
        // Regular sentence line
        return (
          <p key={idx} className="text-sm leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'train' | 'kb' | 'playground' | 'telegram' | 'facebook' | 'zalo' | 'conversations' | 'analytics' | 'supabase' | 'billing' | 'schedules' | 'train-schedules' | 'admin'>(() => isAdminRoute() ? 'admin' : 'dashboard');
  const [telegramPanel, setTelegramPanel] = useState<'connection' | 'schedules' | 'train-schedules'>('connection');
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [conversations, setConversations] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsSummary | null>(null);

  // Supabase Integration States
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [sbStatus, setSbStatus] = useState<{ connected: boolean; message: string; missingTables: string[] } | null>(null);
  const [sbSchema, setSbSchema] = useState('');
  const [sbTesting, setSbTesting] = useState(false);
  const [sbSyncing, setSbSyncing] = useState(false);
  const [sbSyncResult, setSbSyncResult] = useState<any | null>(null);
  const [sbStorageFiles, setSbStorageFiles] = useState<any[]>([]);
  const [sbLoadingStorage, setSbLoadingStorage] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Supabase Auth Integration States
  const [sbAuthEmail, setSbAuthEmail] = useState('');
  const [sbAuthPassword, setSbAuthPassword] = useState('');
  const [sbUser, setSbUser] = useState<any | null>(null);
  const [usage, setUsage] = useState<{ count: number; limit: number; tier: string; verdict: string } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [sbAuthMode, setSbAuthMode] = useState<'signin' | 'signup'>('signin');
  const [sbAuthLoading, setSbAuthLoading] = useState(false);
  const [sbAuthError, setSbAuthError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);


  // Pricing & monetization states - default values are highly generous as requested!
  const [showAdminConfig, setShowAdminConfig] = useState<boolean>(false);
  const [checkoutPlan, setCheckoutPlan] = useState<'pro' | 'enterprise' | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutCompleted, setCheckoutCompleted] = useState<boolean>(false);
  const [simulatedCardNumber, setSimulatedCardNumber] = useState<string>('4111 2222 3333 4444');
  const [simulatedCardHolder, setSimulatedCardHolder] = useState<string>('');
  const [freeQueriesLimit, setFreeQueriesLimit] = useState<number>(1000);
  const [freeBotsLimit, setFreeBotsLimit] = useState<number>(1);
  const [freeTelegramIntegration, setFreeTelegramIntegration] = useState<boolean>(true);
  const [freePdfTraining, setFreePdfTraining] = useState<boolean>(true);
  const [freeRealtimeTakeover, setFreeRealtimeTakeover] = useState<boolean>(true);
  const [freeAnalytics, setFreeAnalytics] = useState<boolean>(true);
  const [customPlanNotes, setCustomPlanNotes] = useState<string>("Đặc quyền cam kết: Ưu đãi trọn đời dành cho các đối tác doanh nghiệp triển khai quy mô lớn.");

  // States for user subscription management/simulator
  const [simulatedCustomers, setSimulatedCustomers] = useState<SaasCustomer[]>([
    { id: '1', name: 'Đại lý Gạo Tám Thơm Sài Gòn', email: 'gaotamthom@gmail.com', phone: '090.123.4567', tier: 'free', messageLimit: 1000, joinedDate: '15/05/2026' },
    { id: '2', name: 'Hợp tác xã Nông sản sạch Đà Lạt', email: 'dalatcleanfoods@gmail.com', phone: '091.234.5678', tier: 'pro', messageLimit: 25000, joinedDate: '20/04/2026' },
    { id: '3', name: 'Vựa Trái cây Xuất khẩu Miền Tây', email: 'mientayfruits@outlook.com', phone: '098.765.4321', tier: 'enterprise', messageLimit: 150000, joinedDate: '01/03/2026' },
    { id: '4', name: 'Vật tư Nông nghiệp Phú Quốc', email: 'phuquocagri@yahoo.com', phone: '097.766.5544', tier: 'free', messageLimit: 1000, joinedDate: '10/05/2026' }
  ]);

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerPassword, setNewCustomerPassword] = useState('');
  const [newCustomerTier, setNewCustomerTier] = useState<'free' | 'pro' | 'enterprise'>('free');

  const getScopedApiHeaders = () => {
    const savedUser = localStorage.getItem("sbUser");
    const savedUrl = localStorage.getItem("sbUrl");
    const savedKey = localStorage.getItem("sbKey");
    let email = sbUser?.email || "";
    if (!email && savedUser) {
      try {
        email = JSON.parse(savedUser)?.email || "";
      } catch (_) {}
    }
    const headers: Record<string, string> = {};
    if (email) headers["x-balabot-user-email"] = email;
    if (savedUrl) headers["x-balabot-supabase-url"] = savedUrl;
    if (savedKey) headers["x-balabot-supabase-key"] = savedKey;
    return headers;
  };

  const handleUpdateCustomer = (id: string, updates: Partial<SaasCustomer>) => {
    setSimulatedCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    fetch(`/api/admin/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() },
      body: JSON.stringify(updates)
    })
    .then(res => {
      if (!res.ok) throw new Error("Cập nhật thất bại");
      return res.json();
    })
    .then(updated => {
      setSimulatedCustomers(prev => prev.map(c => c.id === id ? updated : c));
    })
    .catch(err => {
      console.error("Lỗi cập nhật trên server:", err);
    });
  };

  const handleDeleteCustomer = (id: string) => {
    setSimulatedCustomers(prev => prev.filter(c => c.id !== id));
    fetch(`/api/admin/customers/${id}`, {
      method: 'DELETE',
      headers: getScopedApiHeaders()
    })
    .then(res => {
      if (!res.ok) throw new Error("Xóa thất bại");
      return res.json();
    })
    .catch(err => {
      console.error("Lỗi xóa trên server:", err);
    });
  };
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<'all' | 'free' | 'pro' | 'enterprise'>('all');
  const [adminActionLogs, setAdminActionLogs] = useState<Array<{
    timestamp: string;
    query: string;
    status: 'SUCCESS' | 'INFO';
  }>>([
    { timestamp: new Date().toLocaleTimeString('vi-VN'), query: "-- Đã kết nối với Supabase Postgres Engine. Danh sách hồ sơ sỉ lẻ hoạt động.", status: 'INFO' }
  ]);

  const [newBotName, setNewBotName] = useState('');
  const [newBotDesc, setNewBotDesc] = useState('');
  const [newBotField, setNewBotField] = useState('Bán lẻ & Thực phẩm');
  const [newBotTone, setNewBotTone] = useState<'friendly' | 'professional' | 'brief' | 'sales' | 'support'>('friendly');
  const [isCreatingBot, setIsCreatingBot] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Train file/text form
  const [trainType, setTrainType] = useState<'file' | 'text' | 'faq' | 'url'>('file');
  const [fileStorageStrategy, setFileStorageStrategy] = useState<'default' | 'extract-and-delete' | 'byo-cloud'>('extract-and-delete');
  const [byoCloudUrl, setByoCloudUrl] = useState('');
  const [uploadFileName, setUploadFileName] = useState('Tai_lieu_mau.txt');
  const [manualText, setManualText] = useState('');
  const [manualTextTitle, setManualTextTitle] = useState('');
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [trainCategory, setTrainCategory] = useState<'product' | 'policy' | 'pricing' | 'shipping' | 'warranty' | 'hdsd' | 'faq'>('faq');
  const [isSubmittingTrain, setIsSubmittingTrain] = useState(false);

  // Playground States
  const [playgroundMessages, setPlaygroundMessages] = useState<Message[]>([
    { id: 'p1', sender: 'bot', username: 'BalaBot', text: 'Xin chào! Trợ lý đã nạp xong dữ liệu tri thức của doanh nghiệp. Quý khách có thể đặt câu hỏi thử nghiệm để kiểm tra cách trợ lý phản hồi dựa trên nguồn tài liệu.', timestamp: new Date().toISOString() }
  ]);
  const [playgroundInput, setPlaygroundInput] = useState('');
  const [isPlaygroundTyping, setIsPlaygroundTyping] = useState(false);
  const [lastCitation, setLastCitation] = useState<any[]>([]);

  // Telegram Integration States
  const [inputToken, setInputToken] = useState('');
  const [testTokenStatus, setTestTokenStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testTokenResultMsg, setTestTokenResultMsg] = useState('');
  const [webhookDetails, setWebhookDetails] = useState<any>(null);
  const [isFetchingWebhook, setIsFetchingWebhook] = useState(false);
  const [webhookActionMsg, setWebhookActionMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);

  const fetchWebhookDetails = async () => {
    if (!selectedBotId) return;
    setIsFetchingWebhook(true);
    setWebhookActionMsg(null);
    try {
      const res = await fetch(`/api/bots/${selectedBotId}/telegram-webhook`);
      if (res.ok) {
        const data = await res.json();
        setWebhookDetails(data);
      }
    } catch (err) {
      console.error("Lỗi tải chi tiết Webhook:", err);
    } finally {
      setIsFetchingWebhook(false);
    }
  };

  const handleManualRegisterWebhook = async () => {
    if (!selectedBotId) return;
    setIsFetchingWebhook(true);
    setWebhookActionMsg(null);
    try {
      let origin = window.location.origin;
      if (origin.includes('ais-dev-')) {
        origin = origin.replace('ais-dev-', 'ais-pre-');
      }
      const isLocal = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' || 
                      window.location.hostname.startsWith('192.168.');
      if (!isLocal && window.location.pathname.includes('/balabot')) {
        origin = `${origin}/balabot`;
      }
      const res = await fetch(`/api/bots/${selectedBotId}/telegram-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWebhookActionMsg({ status: 'success', text: data.message });
        fetchWebhookDetails(); // update local status
        // Fetch fresh bots state
        const botUrl = sbUser?.id ? `/api/bots?userId=${sbUser.id}` : '/api/bots';
        const botRes = await fetch(botUrl);
        if (botRes.ok) {
          const freshBots = await botRes.json();
          setBots(freshBots);
        }
      } else {
        setWebhookActionMsg({ status: 'error', text: data.error || 'Đăng ký thất bại với Telegram.' });
      }
    } catch (err: any) {
      setWebhookActionMsg({ status: 'error', text: 'Lỗi đồng bộ webhook: ' + err.message });
    } finally {
      setIsFetchingWebhook(false);
    }
  };

  // Telegram incoming client simulator
  const [simMessageText, setSimMessageText] = useState('Cho tôi hỏi sản phẩm/dịch vụ bên mình hiện báo giá như thế nào ạ?');
  const [isSimulatingMessage, setIsSimulatingMessage] = useState(false);
  const [simUserFullName, setSimUserFullName] = useState('Quốc Anh Bùi');
  const [simUserUsername, setSimUserUsername] = useState('quoc_anh_9x');

  // Facebook Messenger Integration States
  const [facebookDetails, setFacebookDetails] = useState<any>(null);
  const [isFetchingFacebook, setIsFetchingFacebook] = useState(false);
  const [facebookActionMsg, setFacebookActionMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const [inputFacebookToken, setInputFacebookToken] = useState('');
  const [isConnectingFacebook, setIsConnectingFacebook] = useState(false);
  const [facebookSimText, setFacebookSimText] = useState('Shop tư vấn giúp mình sản phẩm/dịch vụ phù hợp với nhu cầu hiện tại nhé.');
  const [facebookSimUserId, setFacebookSimUserId] = useState('fb-test-user-001');
  const [isSimulatingFacebook, setIsSimulatingFacebook] = useState(false);

  // Zalo Group Integration States
  const [zaloStatus, setZaloStatus] = useState<any>(null);
  const [zaloQr, setZaloQr] = useState<string | null>(null);
  const [zaloGroups, setZaloGroups] = useState<{ bindings: any[]; bots: any[] }>({ bindings: [], bots: [] });
  const [zaloLoading, setZaloLoading] = useState(false);
  const zaloPollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadZalo = async () => {
    setZaloLoading(true);
    try {
      const s = await fetch('/api/zalo/status', { headers: getScopedApiHeaders() }).then((r) => r.json());
      setZaloStatus(s);
      const g = await fetch('/api/zalo/groups', { headers: getScopedApiHeaders() }).then((r) => r.json());
      setZaloGroups(g && typeof g === 'object' ? g : { bindings: [], bots: [] });
    } catch (err) {
      console.error('Zalo load error:', err);
    } finally {
      setZaloLoading(false);
    }
  };

  const startZaloLogin = async () => {
    try {
      const r = await fetch('/api/zalo/login/start', { method: 'POST', headers: getScopedApiHeaders() }).then((x) => x.json());
      const qrValue = r?.qr || null;
      // zca-js trả base64 THUẦN (đã cắt tiền tố data-URL) → phải thêm lại, nếu không <img> vỡ ảnh.
      const qrSrc = typeof qrValue === 'string' && qrValue.length > 0
        ? (/^(data:|https?:)/.test(qrValue) ? qrValue : `data:image/png;base64,${qrValue}`)
        : null;
      setZaloQr(qrSrc);
      if (zaloPollerRef.current) clearInterval(zaloPollerRef.current);
      zaloPollerRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/zalo/login/result', { headers: getScopedApiHeaders() }).then((x) => x.json());
          if (res.state === 'success' || res.state === 'failed') {
            clearInterval(zaloPollerRef.current!);
            zaloPollerRef.current = null;
            setZaloQr(null);
            await loadZalo();
          }
        } catch (_) {}
      }, 2000);
    } catch (err) {
      console.error('Zalo login start error:', err);
    }
  };

  const logoutZalo = async () => {
    try {
      await fetch('/api/zalo/logout', { method: 'POST', headers: getScopedApiHeaders() });
      await loadZalo();
    } catch (err) {
      console.error('Zalo logout error:', err);
    }
  };

  const saveZaloBinding = async (groupId: string, botId: string, enabled: boolean, groupName?: string) => {
    try {
      await fetch(`/api/zalo/groups/${encodeURIComponent(groupId)}/binding`, {
        method: 'POST',
        headers: { ...getScopedApiHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ botId, enabled, groupName }),
      });
      await loadZalo();
    } catch (err) {
      console.error('Zalo binding save error:', err);
    }
  };

  const fetchFacebookDetails = async () => {
    if (!selectedBotId) return;
    setIsFetchingFacebook(true);
    setFacebookActionMsg(null);
    try {
      const res = await fetch(`/api/bots/${selectedBotId}/facebook-webhook`);
      const data = await res.json();
      if (res.ok) {
        setFacebookDetails(data);
      } else {
        setFacebookActionMsg({ status: 'error', text: data.error || 'Không tải được cấu hình Facebook Messenger.' });
      }
    } catch (err: any) {
      setFacebookActionMsg({ status: 'error', text: 'Lỗi tải cấu hình Facebook: ' + err.message });
    } finally {
      setIsFetchingFacebook(false);
    }
  };

  const handleConnectFacebook = async () => {
    if (!selectedBotId || !inputFacebookToken.trim()) return;
    setIsConnectingFacebook(true);
    setFacebookActionMsg(null);
    try {
      const res = await fetch(`/api/bots/${selectedBotId}/facebook-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() },
        body: JSON.stringify({ pageAccessToken: inputFacebookToken.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFacebookActionMsg({ status: 'success', text: data.message || 'Kết nối Facebook Page thành công.' });
        setInputFacebookToken('');
        fetchFacebookDetails();
      } else {
        setFacebookActionMsg({ status: 'error', text: data.error || 'Kết nối Facebook Page thất bại.' });
      }
    } catch (err: any) {
      setFacebookActionMsg({ status: 'error', text: 'Lỗi kết nối Facebook: ' + err.message });
    } finally {
      setIsConnectingFacebook(false);
    }
  };

  const handleDisconnectFacebook = async () => {
    if (!selectedBotId) return;
    setIsConnectingFacebook(true);
    setFacebookActionMsg(null);
    try {
      const res = await fetch(`/api/bots/${selectedBotId}/facebook-disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() }
      });
      const data = await res.json();
      setFacebookActionMsg({ status: data.success ? 'success' : 'error', text: data.message || 'Đã xử lý.' });
      fetchFacebookDetails();
    } catch (err: any) {
      setFacebookActionMsg({ status: 'error', text: 'Lỗi ngắt kết nối Facebook: ' + err.message });
    } finally {
      setIsConnectingFacebook(false);
    }
  };

  const handleSimulateFacebookMsg = async () => {
    if (!selectedBotId || !facebookSimText.trim()) return;
    setIsSimulatingFacebook(true);
    setFacebookActionMsg(null);
    try {
      const res = await fetch('/api/facebook-webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBotId,
          senderId: facebookSimUserId || 'fb-test-user-001',
          text: facebookSimText
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không gửi được tin mô phỏng Facebook.');
      }
      setFacebookActionMsg({ status: 'success', text: 'Đã gửi tin mô phỏng Facebook Messenger thành công.' });
      fetch(`/api/bots/${selectedBotId}/conversations`)
        .then(r => r.json())
        .then(setConversations)
        .catch(() => {});
    } catch (err: any) {
      setFacebookActionMsg({ status: 'error', text: err.message || 'Lỗi mô phỏng Facebook Messenger.' });
    } finally {
      setIsSimulatingFacebook(false);
    }
  };

  // Human operator takeover reply
  const [operatorReply, setOperatorReply] = useState('');

  // Search Knowledge Filter
  const [kbSearchQuery, setKbSearchQuery] = useState('');

  // Schedule/Reminder System States
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [remLogs, setRemLogs] = useState<ReminderLog[]>([]);
  const [tgGroups, setTgGroups] = useState<Array<{ chatId: string; title: string; type: string }>>([]);
  const [schedForm, setSchedForm] = useState({
    label: '', content: '', time: '08:00', frequency: 'daily' as string,
    targetChatIds: '', aiEnhanced: false, aiTone: 'friendly' as string,
    daysOfWeek: [] as number[], dayOfMonth: 1, category: 'task',
    targetType: 'group' as string, maxTriggers: 0
  });
  const [schedUploadFile, setSchedUploadFile] = useState<File | null>(null);
  const [schedParseText, setSchedParseText] = useState('');
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedTab, setSchedTab] = useState<'list' | 'create' | 'upload' | 'logs'>('list');

  // Reusable function to fetch bots from the backend
  const fetchBots = (userId?: string) => {
    const url = userId ? `/api/bots?userId=${userId}` : '/api/bots';
    fetch(url, { headers: getScopedApiHeaders() })
      .then(res => res.json())
      .then(data => {
        setBots(data);
        if (data.length > 0) {
          setSelectedBotId(prev => prev || data[0].id);
        } else {
          setSelectedBotId('');
        }
      })
      .catch(err => console.error("Error fetching bots:", err));
  };

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const isInternalApi = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
      if (!isInternalApi) return originalFetch(input, init);

      const existingHeaders = new Headers(init?.headers || {});
      Object.entries(getScopedApiHeaders()).forEach(([key, value]) => {
        if (!existingHeaders.has(key)) existingHeaders.set(key, value);
      });

      return originalFetch(input, {
        ...init,
        headers: existingHeaders
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [sbUser?.email, sbUrl, sbKey]);

  // Nạp mức dùng tháng này của user đăng nhập (thẻ usage + nâng gói).
  useEffect(() => {
    if (!sbUser?.id) { setUsage(null); return; }
    fetch(`/api/usage/me?userId=${encodeURIComponent(sbUser.id)}`)
      .then(r => r.json())
      .then(d => setUsage(d))
      .catch(() => setUsage(null));
  }, [sbUser?.id, activeTab]);

  // Rehydrate Supabase Auth Session & Restore User Config
  useEffect(() => {
    const savedUser = localStorage.getItem("sbUser");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setSbUser(parsed);
        if (parsed.email === ADMIN_EMAIL) {
          setActiveTab('admin');
        } else {
          setActiveTab('dashboard');
        }

        const savedUrl = localStorage.getItem("sbUrl");
        const savedKey = localStorage.getItem("sbKey");

        // Helper: after config is activated on the backend, re-fetch bots from Supabase
        const onConfigRestored = (url: string, key: string, status: any) => {
          setSbUrl(url);
          setSbKey(key);
          setSbStatus(status);
          localStorage.setItem("sbUrl", url);
          localStorage.setItem("sbKey", key);
          // Re-fetch bots now that the backend Supabase client is configured
          fetchBots(parsed.id);
        };

        const activateConfig = (url: string, key: string) => {
          fetch('/api/supabase/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, key, email: parsed.email })
          })
          .then(r => r.json())
          .then(actData => {
            if (actData.success) {
              onConfigRestored(url, key, actData.status);
            }
          });
        };

        // Multi-source config recovery chain:
        // 1. Server DB (survives restarts) → 2. localStorage → 3. Server current env
        if (parsed.email) {
          fetch(`/api/supabase/config/retrieve?email=${encodeURIComponent(parsed.email)}`)
            .then(res => res.json())
            .then(data => {
              if (data.success && data.url && data.key) {
                // Config found from server (DB, JSON, or env) — always use it
                activateConfig(data.url, data.key);
              } else if (savedUrl && savedKey) {
                // Fallback: use localStorage credentials
                activateConfig(savedUrl, savedKey);
              } else {
                // Last resort: check if server already has Supabase configured
                fetch('/api/supabase/config')
                  .then(r => r.json())
                  .then(serverCfg => {
                    if (serverCfg.config?.isConfigured && serverCfg.status?.connected) {
                      setSbUrl(serverCfg.config.url);
                      setSbKey(serverCfg.config.key);
                      setSbStatus(serverCfg.status);
                      fetchBots(parsed.id);
                    }
                  });
              }
            })
            .catch(err => {
              console.error("Error restoring user config on mount", err);
              if (savedUrl && savedKey) {
                activateConfig(savedUrl, savedKey);
              } else {
                // Even on network error, try to fetch bots in case server has env config
                fetchBots(parsed.id);
              }
            });
        }
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (isAdminRoute() && !sbUser) {
      setActiveTab('admin');
      setSbAuthMode('signin');
      setSbAuthEmail(ADMIN_EMAIL);
      setShowAuthModal(false);
    }
  }, [sbUser]);

  // Protect Admin dashboard & automatically redirect non-admin accounts
  useEffect(() => {
    if (sbUser && sbUser.email !== ADMIN_EMAIL && activeTab === 'admin') {
      setActiveTab('dashboard');
    }
  }, [sbUser, activeTab]);

  // Fetch real SaaS users to enrich the admin directory with active data from backend
  useEffect(() => {
    if (activeTab === 'admin' && sbUser?.email === ADMIN_EMAIL) {
      fetch('/api/admin/customers', { headers: getScopedApiHeaders() })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setSimulatedCustomers(data);
          }
        })
        .catch(err => console.error("Error fetching SaaS customers:", err));
    }
  }, [activeTab, sbUser]);

  // Load Zalo status and groups when Zalo tab opens; clear poll when leaving
  useEffect(() => {
    if (activeTab === 'zalo' && sbUser?.email === ADMIN_EMAIL) {
      loadZalo();
    } else if (activeTab !== 'zalo' && zaloPollerRef.current) {
      clearInterval(zaloPollerRef.current);
      zaloPollerRef.current = null;
    }
  }, [activeTab, sbUser]);

  // Fetch initial bots when user session changes
  useEffect(() => {
    fetchBots(sbUser?.id);
  }, [sbUser?.id]);

  // Fetch bot-specific resources when dynamic bot or tab changes
  useEffect(() => {
    if (!selectedBotId) {
      setSources([]);
      setFaqs([]);
      setConversations([]);
      setAnalyticsData(null);
      return;
    }
    
    // Fetch current Bot details
    fetch(`/api/bots/${selectedBotId}/sources`)
      .then(res => res.json())
      .then(data => setSources(data));

    fetch(`/api/bots/${selectedBotId}/faqs`)
      .then(res => res.json())
      .then(data => setFaqs(data));

    fetch(`/api/bots/${selectedBotId}/schedules`)
      .then(res => res.json())
      .then(data => setSchedules(data));

    fetch(`/api/bots/${selectedBotId}/reminder-logs`)
      .then(res => res.json())
      .then(data => setRemLogs(data));

    fetch(`/api/bots/${selectedBotId}/telegram-groups`)
      .then(res => res.json())
      .then(data => setTgGroups(data.groups || []))
      .catch(() => setTgGroups([]));

    fetch(`/api/bots/${selectedBotId}/conversations`)
      .then(res => res.json())
      .then(data => {
        setConversations(data);
        if (data.length > 0 && !selectedSessionId) {
          setSelectedSessionId(data[0].id);
        }
      });

    fetch(`/api/analytics/${selectedBotId}`)
      .then(res => res.json())
      .then(data => setAnalyticsData(data));

    if (activeTab === 'telegram') {
      fetchWebhookDetails();
    }
    if (activeTab === 'facebook') {
      fetchFacebookDetails();
    }
  }, [selectedBotId, activeTab]);

  // Load Supabase configuration & status
  useEffect(() => {
    fetch('/api/supabase/config')
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setSbUrl(data.config.url || '');
          setSbKey(data.config.key || '');
        }
        setSbStatus(data.status);
      });

    fetch('/api/supabase/schema')
      .then(res => res.json())
      .then(data => {
        setSbSchema(data.schema || '');
      });

    if (activeTab === 'supabase' || activeTab === 'admin') {
      fetchSbStorageFiles();
    }
  }, [activeTab]);

  const fetchSbStorageFiles = async () => {
    setSbLoadingStorage(true);
    try {
      const res = await fetch('/api/supabase/storage/files');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSbStorageFiles(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch storage files", err);
    } finally {
      setSbLoadingStorage(false);
    }
  };

  const handleDeleteStorageFile = async (name: string) => {
    const cf = window.confirm(`Bạn có chắc chắn muốn xóa tập tin "${name}" khỏi Supabase Storage?`);
    if (!cf) return;
    try {
      const res = await fetch(`/api/supabase/storage/files/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert('Đã xóa tập tin khỏi Supabase Storage thành công.');
          fetchSbStorageFiles();
        } else {
          alert('Không thể xóa tập tin.');
        }
      }
    } catch (err: any) {
      alert('Có lỗi xảy ra: ' + err.message);
    }
  };

  const handleSbAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSbAuthLoading(true);
    setSbAuthError('');
    try {
      const endpoint = sbAuthMode === 'signup' ? '/api/supabase/auth/signup' : '/api/supabase/auth/signin';
      const payload: any = { email: sbAuthEmail, password: sbAuthPassword };
      const savedAuthUrl = localStorage.getItem("sbUrl");
      const savedAuthKey = localStorage.getItem("sbKey");
      if (savedAuthUrl && savedAuthKey) {
        payload.supabaseUrl = savedAuthUrl;
        payload.supabaseKey = savedAuthKey;
      }
      if (sbAuthMode === 'signup') {
        const isLocal = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.hostname.startsWith('192.168.');
        if (!isLocal && window.location.pathname.includes('/balabot')) {
          payload.redirectTo = `${window.location.origin}/balabot/`;
        } else {
          payload.redirectTo = window.location.origin;
        }
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSbUser(data.user);
        localStorage.setItem("sbUser", JSON.stringify(data.user));
        if (data.user.email === ADMIN_EMAIL) {
          setActiveTab('admin');
        } else {
          setActiveTab('dashboard');
        }
        
        // Retrieve and restore user's saved Supabase credentials if present
        // Multi-source recovery: Server DB → localStorage → Server env
        if (data.user.email) {
          const savedUrl = localStorage.getItem("sbUrl");
          const savedKey = localStorage.getItem("sbKey");

          const onSigninConfigRestored = (url: string, key: string, status: any) => {
            setSbUrl(url);
            setSbKey(key);
            setSbStatus(status);
            localStorage.setItem("sbUrl", url);
            localStorage.setItem("sbKey", key);
            // Re-fetch bots now that the backend Supabase client is configured
            fetchBots(data.user.id);
          };

          const activateSigninConfig = (url: string, key: string) => {
            fetch('/api/supabase/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url, key, email: data.user.email })
            })
            .then(r => r.json())
            .then(actData => {
              if (actData.success) {
                onSigninConfigRestored(url, key, actData.status);
              }
            });
          };

          fetch(`/api/supabase/config/retrieve?email=${encodeURIComponent(data.user.email)}`)
            .then(r => r.json())
            .then(configData => {
              if (configData.success && configData.url && configData.key) {
                // Config found from server (DB, JSON, or env) — always use it
                activateSigninConfig(configData.url, configData.key);
              } else if (savedUrl && savedKey) {
                activateSigninConfig(savedUrl, savedKey);
              } else {
                // Last resort: check if server already has Supabase
                fetch('/api/supabase/config')
                  .then(r => r.json())
                  .then(serverCfg => {
                    if (serverCfg.config?.isConfigured && serverCfg.status?.connected) {
                      setSbUrl(serverCfg.config.url);
                      setSbKey(serverCfg.config.key);
                      setSbStatus(serverCfg.status);
                      fetchBots(data.user.id);
                    }
                  });
              }
            })
            .catch(err => {
              console.error("Error retrieving user config upon signin", err);
              if (savedUrl && savedKey) {
                activateSigninConfig(savedUrl, savedKey);
              } else {
                // Even on error, try fetching bots in case server has env config
                fetchBots(data.user.id);
              }
            });
        }

        alert(sbAuthMode === 'signup' 
          ? 'Đăng ký tài khoản Supabase Auth thành công. Bạn có thể dùng tài khoản vừa tạo để đăng nhập.'
          : 'Đăng nhập hệ thống Supabase Auth thành công. Khóa phiên đã được cài đặt.'
        );
        setSbAuthEmail('');
        setSbAuthPassword('');
        setShowAuthModal(false); // Close auth modal on success
      } else {
        let errMsg = data.error || 'Có lỗi xảy ra trong quá trình xác thực.';
        if (errMsg.toLowerCase().includes('email not confirmed')) {
          errMsg = 'Tài khoản chưa được xác nhận email. Hệ thống sẽ tự động xác nhận trong lần đăng nhập tiếp theo — vui lòng thử đăng nhập lại. Nếu vẫn lỗi, liên hệ quản trị viên để được hỗ trợ.';
        }
        setSbAuthError(errMsg);
      }
    } catch (err: any) {
      setSbAuthError(err.message || String(err));
    } finally {
      setSbAuthLoading(false);
    }
  };

  const handleSbSignOut = () => {
    setSbUser(null);
    localStorage.removeItem("sbUser");
    localStorage.removeItem("sbUrl");
    localStorage.removeItem("sbKey");
    alert('Đăng xuất tài khoản Supabase Auth thành công.');
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSbTesting(true);
    try {
      const res = await fetch('/api/supabase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sbUrl, key: sbKey, email: sbUser?.email || '' })
      });
      const data = await res.json();
      if (data.success) {
        setSbStatus(data.status);
        localStorage.setItem("sbUrl", sbUrl);
        localStorage.setItem("sbKey", sbKey);
        alert('Cấu hình kết nối Supabase thành công! Hệ thống đã cập nhật và kiểm tra bảng.');
      }
    } catch (err: any) {
      alert('Không thể cập nhật cấu hình: ' + err.message);
    } finally {
      setSbTesting(false);
    }
  };

  const handleSyncToSupabase = async () => {
    setSbSyncing(true);
    setSbSyncResult(null);
    try {
      const res = await fetch('/api/supabase/sync', { method: 'POST' });
      const data = await res.json();
      setSbSyncResult(data);
      if (data.success) {
        alert('Đồng bộ dữ liệu lên database Supabase thành công.');
        // reload bots if synced
        const botUrl = sbUser?.id ? `/api/bots?userId=${sbUser.id}` : '/api/bots';
        fetch(botUrl)
          .then(r => r.json())
          .then(d => {
            setBots(d);
            if (d.length > 0) setSelectedBotId(d[0].id);
          });
      } else {
        alert('Đồng bộ thất bại: ' + data.message);
      }
    } catch (e: any) {
      alert('Lỗi đồng bộ dữ liệu: ' + e.message);
    } finally {
      setSbSyncing(false);
    }
  };

  const activeBot = bots.find(b => b.id === selectedBotId);
  const selectedSession = conversations.find(c => c.id === selectedSessionId);

  // Handlers
  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBotName.trim()) return;

    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newBotName,
        description: newBotDesc,
        field: newBotField,
        tone: newBotTone,
        language: 'vi',
        telegramToken: '',
        userId: sbUser?.id,
        welcomeMessage: `Dạ! ${newBotName} xin kính chào quý khách. Em là BalaBot trả lời tự động hỗ trợ 24/7. Anh/chị có thể ghi rõ câu hỏi bên dưới nhé!`,
        fallbackMessage: 'Dạ, câu hỏi mảng này em chưa được nạp tri thức ạ. Em xin chuyển yêu cầu kèm ghi chú để các anh/chị nhân viên liên hệ giải đáp lại ngay.',
        fallbackEmail: 'support@doanhnghiep.vn',
        fallbackPhone: '19001234',
        fallbackZalo: 'https://zalo.me/',
        fallbackWebsite: 'https://site.vn',
        restrictedTopics: 'Sử dụng từ ngữ tục tĩu, so sánh giá rẻ thù địch, đàm luận tôn giáo chính trị.',
        workingHours: '08:00 - 22:00'
      })
    });

    if (res.ok) {
      const created = await res.json();
      setBots([...bots, created]);
      setSelectedBotId(created.id);
      setIsCreatingBot(false);
      setNewBotName('');
      setNewBotDesc('');
    }
  };

  const handleUpdateBotSettings = async (updatedFields: Partial<BotConfig>) => {
    if (!selectedBotId) return;
    const res = await fetch(`/api/bots/${selectedBotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields)
    });
    if (res.ok) {
      const updated = await res.json();
      setBots(bots.map(b => b.id === selectedBotId ? updated : b));
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1] || '';
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleTrainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBotId) return;
    setIsSubmittingTrain(true);

    try {
      if (trainType === 'file') {
        let fileName = uploadFileName;
        let fileDataStr = "";
        let fileType = "text/plain";

        if (selectedFile) {
          fileName = selectedFile.name;
          fileType = selectedFile.type;
          fileDataStr = await fileToBase64(selectedFile);
        } else {
          // Nội dung mẫu trung lập (khi người dùng chưa chọn tệp)
          const textContent = `TÀI LIỆU TRI THỨC MẪU – CHÍNH SÁCH & DỊCH VỤ:\n- Thời gian phản hồi hỗ trợ: trong vòng 24 giờ làm việc.\n- Sản phẩm/Dịch vụ tiêu chuẩn: báo giá theo từng gói, vui lòng liên hệ để nhận tư vấn chi tiết.\n- Chính sách bảo hành/đổi trả: áp dụng theo quy định công bố trên hợp đồng dịch vụ.\n- Kênh liên hệ hỗ trợ: hotline và email chăm sóc khách hàng của doanh nghiệp.`;
          fileDataStr = btoa(unescape(encodeURIComponent(textContent)));
        }

        const res = await fetch(`/api/bots/${selectedBotId}/upload-source`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: fileStorageStrategy === 'byo-cloud' && byoCloudUrl ? (byoCloudUrl.split('/').pop() || 'Tài liệu liên kết Đám mây') : fileName,
            fileData: fileStorageStrategy === 'byo-cloud' && byoCloudUrl ? '' : fileDataStr,
            fileType,
            category: trainCategory,
            fileStorageStrategy,
            byoCloudUrl: fileStorageStrategy === 'byo-cloud' ? byoCloudUrl : ''
          })
        });

        if (res.ok) {
          const data = await res.json();
          setSources([data.source, ...sources]);
          setSelectedFile(null);
          setTimeout(() => {
            fetch(`/api/bots/${selectedBotId}/sources`)
              .then(r => r.json())
              .then(data => setSources(data));
          }, 1500);
        } else {
          const errData = await res.json();
          alert('Lỗi tải file: ' + (errData.error || 'Thao tác không hợp lệ.'));
        }
        setIsSubmittingTrain(false);
        return;
      }

      let name = '';
      let textContent = '';
      let sum = '';

      if (trainType === 'text') {
        name = manualTextTitle || 'Văn bản đào tạo bổ sung';
        textContent = manualText;
        sum = manualText.substring(0, 100) + '...';
      } else if (trainType === 'url') {
        name = webUrl;
        textContent = ''; // Server will crawl the URL automatically
        sum = `Đang gởi cào dữ liệu: ${webUrl}`;
      } else {
        // FAQ
        const resFAQ = await fetch(`/api/bots/${selectedBotId}/faqs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: faqQ, answer: faqA, category: trainCategory })
        });
        if (resFAQ.ok) {
          const newFaq = await resFAQ.json();
          setFaqs(prev => [newFaq, ...prev]);
          setFaqQ('');
          setFaqA('');
        }
        setIsSubmittingTrain(false);
        return;
      }

      const res = await fetch(`/api/bots/${selectedBotId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type: trainType,
          fullText: textContent,
          category: trainCategory,
          contentSummary: sum
        })
      });

      if (res.ok) {
        const createdSource = await res.json();
        setSources([createdSource, ...sources]);
        setManualText('');
        setManualTextTitle('');
        setWebUrl('');
        
        // Simulate status waiting
        setTimeout(() => {
          fetch(`/api/bots/${selectedBotId}/sources`)
            .then(r => r.json())
            .then(data => setSources(data));
        }, 2000);
      }
    } catch (error: any) {
      alert("Đã xảy ra sự cố khi huấn luyện: " + error.message);
    } finally {
      setIsSubmittingTrain(false);
    }
  };

  const handleReTrainBot = async () => {
    if (!selectedBotId) return;
    await fetch(`/api/bots/${selectedBotId}/retrain`, { method: 'POST' });
    alert('Hệ thống đang tiến hành nạp lại embeddings và tối ưu tri thức AI Bot.');
  };

  const handleDeleteSource = async (id: string) => {
    const cf = window.confirm('Bạn có chắc chắn muốn xóa nguồn tri thức này không? Toàn bộ các chunk liên kết sẽ bị gỡ bỏ.');
    if (!cf) return;
    const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSources(sources.filter(s => s.id !== id));
    }
  };

  const handlePlaygroundSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playgroundInput.trim() || !selectedBotId) return;

    const userText = playgroundInput;
    const userMsg: Message = {
      id: 'p-user-' + Date.now(),
      sender: 'user',
      username: 'UserTest',
      text: userText,
      timestamp: new Date().toISOString()
    };

    const recentMessages = [...playgroundMessages, userMsg].slice(-8);

    setPlaygroundMessages(prev => [...prev, userMsg]);
    setPlaygroundInput('');
    setIsPlaygroundTyping(true);

    const res = await fetch(`/api/bots/${selectedBotId}/playgroundChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: userText, recentMessages })
    });

    if (res.ok) {
      const data = await res.json();
      const botMsg: Message = {
        id: 'p-bot-' + Date.now(),
        sender: 'bot',
        username: activeBot?.name || 'BalaBot',
        text: data.text,
        timestamp: new Date().toISOString(),
        sourcesUsed: data.sources
      };
      setPlaygroundMessages(prev => [...prev, botMsg]);
      setLastCitation(data.sources || []);
    }
    setIsPlaygroundTyping(false);
  };

  // Check Telegram Token
  const handleTestToken = async () => {
    if (!inputToken.trim()) return;
    setTestTokenStatus('testing');
    setTestTokenResultMsg('');

    const res = await fetch('/api/check-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inputToken })
    });

    const data = await res.json();
    if (data.valid) {
      setTestTokenStatus('success');
      setTestTokenResultMsg(`Kết nối thành công! Đã định vị Bot: @${data.botUsername} (${data.botName})`);
      // Update local bot token config
      handleUpdateBotSettings({
        telegramToken: inputToken,
        telegramStatus: 'connected',
        telegramBotUsername: data.botUsername,
        telegramWebhookActive: true,
        status: 'active'
      });
    } else {
      setTestTokenStatus('error');
      setTestTokenResultMsg(data.error || 'Token không hợp lệ theo phản hồi từ Telegram.');
    }
  };

  // Simulate incoming Telegram user message
  const handleSimulateTelegramMsg = async () => {
    if (!simMessageText.trim() || !selectedBotId) return;
    setIsSimulatingMessage(true);

    const calculatedUserId = 'u-' + (simUserUsername.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || '612459021');

    const res = await fetch('/api/telegram-webhook/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botId: selectedBotId,
        text: simMessageText,
        username: simUserUsername,
        fullName: simUserFullName,
        userId: calculatedUserId
      })
    });

    if (res.ok) {
      const data = await res.json();
      // reload conversations dynamic list
      const rConvs = await fetch(`/api/bots/${selectedBotId}/conversations`);
      const convsData = await rConvs.json();
      setConversations(convsData);
      
      // select this conversation to view live
      const matchedSess = convsData.find((s: any) => s.telegramUserId === calculatedUserId);
      if (matchedSess) {
        setSelectedSessionId(matchedSess.id);
      }
      setActiveTab('conversations');
      setSimMessageText('');
      alert('Đã gửi gói dữ liệu webhook giả lập từ Telegram thành công tới webhook!');
    }
    setIsSimulatingMessage(false);
  };

  // Operator takeover send
  const handleOperatorSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorReply.trim() || !selectedSessionId) return;

    const res = await fetch(`/api/conversations/${selectedSessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: operatorReply,
        sender: 'agent',
        username: 'Doanh nghiệp Operator'
      })
    });

    if (res.ok) {
      const newMsg = await res.json();
      if (selectedSession) {
        const updatedMsgs = [...selectedSession.messages, newMsg];
        setConversations(conversations.map(c => c.id === selectedSessionId ? {
          ...c,
          status: 'resolved',
          lastMessageText: operatorReply,
          lastMessageTime: new Date().toISOString(),
          messages: updatedMsgs
        } : c));
      }
      setOperatorReply('');
    }
  };

  // Toggle session status
  const handleUpdateSessionStatus = async (sessId: string, status: string) => {
    const res = await fetch(`/api/conversations/${sessId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      setConversations(conversations.map(c => c.id === sessId ? { ...c, status: status as any } : c));
    }
  };

  const handleUpdateSessionNotes = async (sessId: string, notes: string) => {
    const res = await fetch(`/api/conversations/${sessId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalNotes: notes })
    });
    if (res.ok) {
      setConversations(conversations.map(c => c.id === sessId ? { ...c, internalNotes: notes } : c));
    }
  };

  const filteredSources = sources.filter(s =>
    s.name.toLowerCase().includes(kbSearchQuery.toLowerCase()) ||
    s.contentSummary.toLowerCase().includes(kbSearchQuery.toLowerCase())
  );

  if (!sbUser) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950 overflow-x-hidden">
        {/* LANDING HEADER */}
        <header className="w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-slate-850 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-slate-950 shadow-lg shadow-emerald-500/20 text-lg">
              A
            </div>
            <div>
              <span className="text-white font-black text-xl tracking-tight block">AAA BalaBot</span>
              <span className="text-[10px] text-emerald-400 font-mono tracking-wider font-bold">OMNICHANNEL AI SAAS</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400 font-medium">
            <a href="#features" className="hover:text-white transition-colors">Tính Năng</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">Cách Hoạt Động</a>
            <div className="h-4 w-px bg-slate-800"></div>
            <span className="text-emerald-400 font-mono text-xs flex items-center gap-1.5 bg-emerald-900/40 px-3 py-1 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Sẵn sàng tích hợp 24/7
            </span>
          </div>
        </header>

        {/* HERO SECTION / AUTH GRID */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 md:py-20 flex flex-col justify-center space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* LEFT COLUMN: HERO INTRO */}
            <div className="lg:col-span-7 space-y-8 text-left">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Nền tảng Telegram Bot AI SaaS Đột Phá
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
                Biến Tri Thức Doanh Nghiệp Thành <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">Trợ Lý Ảo Chốt Đơn 24/7</span>
              </h1>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl">
                BalaBot sử dụng AI thế hệ mới kết hợp cơ chế nạp tri thức RAG thông minh. Trợ lý tự động thấu hiểu sản phẩm, báo giá chuẩn xác từ tài liệu bạn huấn luyện và phục vụ khách hàng Telegram không ngừng nghỉ.
              </p>

              {/* LIVE SIMULATION MOCKUP CARD */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden max-w-xl">
                <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center font-bold text-xs uppercase">
                      ai
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        Trợ Lý Tự Động AAA Organic Farm
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-mono">BalaBot</span>
                      </div>
                      <div className="text-[9px] text-slate-500">Đang hoạt động trên Telegram</div>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                </div>

                <div className="space-y-4 text-xs font-sans">
                  {/* User Message */}
                  <div className="flex flex-col items-end space-y-1">
                    <div className="bg-slate-800 text-slate-100 p-3 rounded-2xl rounded-tr-none max-w-[85%]">
                      Chào shop, tôi muốn tìm hiểu báo giá và thời gian giao của gói dịch vụ tiêu chuẩn ạ?
                    </div>
                    <span className="text-[10px] text-slate-500 pr-1">14:02 · Khách hàng</span>
                  </div>

                  {/* AI Response */}
                  <div className="flex flex-col items-start space-y-1">
                    <div className="bg-emerald-950/60 border border-emerald-500/20 text-slate-200 p-3 rounded-2xl rounded-tl-none max-w-[85%] leading-relaxed">
                      Dạ kính chào Quý khách. Gói dịch vụ tiêu chuẩn hiện có mức giá ưu đãi, đã bao gồm hỗ trợ triển khai theo nhu cầu của doanh nghiệp.
                      <br /><br />
                      Thời gian phản hồi trong vòng 24 giờ làm việc. Quý khách vui lòng cho biết quy mô sử dụng để bộ phận tư vấn báo giá chi tiết ạ.
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 pl-1">
                      <span>14:02 · Trực Tuyến AI</span>
                      <span className="bg-emerald-950/80 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/30 text-[9px] font-mono">
                        Khớp tri thức: Bang_Gia_Dich_Vu.pdf
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: INTEGRATED AUTH FORM CONTAINER */}
            <div id="auth-portal" className="lg:col-span-5 md:py-4">
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
                      className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${sbAuthMode === 'signin' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'text-slate-400 hover:text-white'}`}
                    >
                      Đăng Nhập
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSbAuthMode('signup'); setSbAuthError(''); }}
                      className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${sbAuthMode === 'signup' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'text-slate-400 hover:text-white'}`}
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
                </div>
              </div>
            </div>
          </div>

          {/* BENEFIT BENTO SECTION */}
          <div id="features" className="space-y-8 pt-12 border-t border-slate-800/60">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <span className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-widest">Tính năng vượt trội</span>
              <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Hội Tụ Đầy Đủ Giải Pháp Chăm Sóc Khách Hàng</h2>
              <p className="text-slate-400 text-sm">Trải nghiệm vận hành bot nhàn nhã với các công nghệ tự động hóa tối tân nhất.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Feature 1 */}
              <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl space-y-4 hover:border-emerald-500/20 transition-all duration-200">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-white">Chăm Sóc & Chốt Đơn 24/7</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Thiết lập tone giọng thân thiện, linh hoạt tiếp nhận thắc mắc và hỗ trợ chốt đơn mọi thời điểm trong ngày mà không phát sinh thêm nhân lực.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl space-y-4 hover:border-emerald-500/20 transition-all duration-200">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-white">Nạp Tri Thức Chọn Lọc (RAG)</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Tải lên bảng giá, hướng dẫn sử dụng, file PDF để huấn luyện trợ lý. AI bám sát dữ liệu nguồn để trả lời và tuyệt đối không bao giờ bịa đặt thông tin.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl space-y-4 hover:border-emerald-500/20 transition-all duration-200">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-white">Chuyển Giao Cho Đội Ngũ (Takeover)</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Khi khách hàng hỏi chủ đề nhạy cảm hoặc cần can thiệp trực tiếp, quản trị viên dễ dàng takeover cuộc trò chuyện tức khắc qua giao diện admin.
                </p>
              </div>

            </div>
          </div>

          {/* HOW IT WORKS */}
          <div id="how-it-works" className="bg-gradient-to-tr from-slate-900 to-slate-950 border border-slate-800/80 p-8 md:p-12 rounded-3xl space-y-8">
            <div className="max-w-xl text-left space-y-3">
              <span className="text-emerald-400 font-bold font-mono text-xs uppercase tracking-wider">Quy Trình Hoạt Động</span>
              <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Kích hoạt Bot Telegram Chỉ Với 4 Bước Đơn Giản</h2>
              <p className="text-slate-400 text-sm">Cơ chế tự động hóa 100% giúp bạn sở hữu trợ lý ảo cực kỳ nhanh chóng.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 font-sans text-left">
              <div className="space-y-2">
                <div className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 w-6 h-6 rounded-full flex items-center justify-center">1</div>
                <h4 className="font-bold text-sm text-white">Đăng ký Tài Khoản</h4>
                <p className="text-slate-500 text-xs leading-relaxed">Tạo tài khoản cá nhân thông qua bảng điều khiển Auth góc trên để bảo vệ dữ liệu tri thức riêng tư.</p>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 w-6 h-6 rounded-full flex items-center justify-center">2</div>
                <h4 className="font-bold text-sm text-white">Tạo Cấu Hình Bot</h4>
                <p className="text-slate-500 text-xs leading-relaxed">Đặt tên bot, viết mô tả ngắn, chọn lĩnh vực kinh doanh và tone giọng hoạt động phù hợp phong cách.</p>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 w-6 h-6 rounded-full flex items-center justify-center">3</div>
                <h4 className="font-bold text-sm text-white">Nạp File Tri Thức</h4>
                <p className="text-slate-500 text-xs leading-relaxed">Tải lên các file tri thức của bạn (PDF, Excel, Word). Hệ thống tự mã hóa sang vector tri thức.</p>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 w-6 h-6 rounded-full flex items-center justify-center">4</div>
                <h4 className="font-bold text-sm text-white">Tích Hợp Telegram</h4>
                <p className="text-slate-500 text-xs leading-relaxed">Dán Token từ BotFather lên và bấm lưu - Bot của bạn lập tức hoạt động trực tuyến 24/7 tức thì!</p>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-xs text-slate-400">
                Sẵn sàng đưa dịch vụ chăm sóc khách hàng của bạn lên một tầm cao mới hoàn toàn tự động?
              </div>
              <a
                href="#auth-portal"
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs tracking-wide rounded-xl transition-colors shrink-0 text-center"
              >
                Tạo Bot Của Bạn Ngay Bây Giờ
              </a>
            </div>
          </div>
        </main>

        {/* FOOTER */}
        <footer className="h-16 border-t border-slate-800 text-slate-500 text-xs flex items-center justify-center gap-2 shrink-0 bg-slate-950/40">
          <span>© 2026 AAA BalaBot Omnichannel AI SaaS. Bảo lưu mọi quyền.</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] overflow-hidden text-[#1E293B] relative">
      
      {/* MOBILE BACKDROP OVERLAY */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-all duration-200 cursor-pointer"
        />
      )}

      {/* SIDEBAR NAVIGATION - Responsive Drawer Layout */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#0F172A] flex flex-col shrink-0 border-r border-[#1E293B]/20 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:flex'
      }`}>
        <div className="p-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              A
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight block">AAA BalaBot</span>
              <span className="text-[10px] text-blue-400 font-mono tracking-wider">OMNICHANNEL AI SAAS</span>
            </div>
          </div>
          {/* Close button inside mobile menu */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WORKSPACE SELECTION WIDGET */}
        <div className="px-4 py-2 shrink-0">
          <div className="bg-slate-800/40 border border-slate-700/50 p-2.5 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <div className="flex-1 overflow-hidden">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">Workspace</span>
              <span className="text-xs text-white font-medium truncate block">AAA Organic Farm</span>
            </div>
            <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded uppercase font-mono font-bold">Owner</span>
          </div>
        </div>

        {/* SIDEBAR TABS */}
        <nav className="flex-1 px-3 mt-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'dashboard' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <LayoutDashboard className="w-4 h-4 text-blue-400" />
            Bàn điều khiển
          </button>

          <button
            onClick={() => { setActiveTab('config'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'config' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Settings className="w-4 h-4 text-emerald-400" />
            Cấu hình Bot AI
          </button>

          <button
            onClick={() => { setActiveTab('train'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'train' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <GraduationCap className="w-4 h-4 text-purple-400" />
            Nạp Tri Thức & Train
          </button>

          <button
            onClick={() => { setActiveTab('kb'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'kb' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Database className="w-4 h-4 text-amber-400" />
            Kho Kiến Thức
          </button>

          <button
            onClick={() => { setActiveTab('playground'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'playground' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Play className="w-4 h-4 text-rose-400" />
            Playground Chat Thử
          </button>

          <button
            onClick={() => { setActiveTab('telegram'); setTelegramPanel('connection'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'telegram' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Link2 className="w-4 h-4 text-cyan-400" />
            Tích hợp Telegram
          </button>

          <button
            onClick={() => { setActiveTab('facebook'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'facebook' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <MessageCircle className="w-4 h-4 text-blue-500" />
            Tích hợp Facebook
          </button>

          {sbUser?.email === ADMIN_EMAIL && (
            <button
              onClick={() => { setActiveTab('zalo'); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'zalo' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
            >
              <MessageCircle className="w-4 h-4 text-green-400" />
              Zalo Group Bot
            </button>
          )}

          {activeTab === 'telegram' && (
            <div className="ml-7 mr-2 mb-1 space-y-1 border-l border-slate-700/60 pl-3">
              <button
                onClick={() => setTelegramPanel('connection')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${telegramPanel === 'connection' ? 'bg-cyan-500/10 text-cyan-300 font-bold' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/40'}`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Kết nối Bot
              </button>
              <button
                onClick={() => setTelegramPanel('schedules')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${telegramPanel === 'schedules' ? 'bg-teal-500/10 text-teal-300 font-bold' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/40'}`}
              >
                <Clock className="w-3.5 h-3.5" />
                Lịch nhắc
              </button>
              <button
                onClick={() => setTelegramPanel('train-schedules')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${telegramPanel === 'train-schedules' ? 'bg-purple-500/10 text-purple-300 font-bold' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/40'}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Train lịch AI
              </button>
            </div>
          )}

          <button
            onClick={() => { setActiveTab('conversations'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'conversations' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <History className="w-4 h-4 text-orange-400" />
            Lịch sử & Takeover
            {conversations.filter(c => c.status === 'escalated').length > 0 && (
              <span className="ml-auto bg-rose-600 text-white min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                {conversations.filter(c => c.status === 'escalated').length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'analytics' ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <BarChart3 className="w-4 h-4 text-sky-400" />
            Báo Cáo & Phân Tích
          </button>

          <button
            onClick={() => { setActiveTab('supabase'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'supabase' ? 'bg-blue-600/10 text-emerald-400 border-l-4 border-emerald-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Database className="w-4 h-4 text-emerald-400" />
            Kết nối Supabase
          </button>

          <button
            onClick={() => { setActiveTab('billing'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'billing' ? 'bg-blue-600/10 text-rose-400 border-l-4 border-rose-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <CreditCard className="w-4 h-4 text-rose-400" />
            Gói Cước & Bảng Giá
          </button>

          <button
            onClick={() => { setActiveTab('telegram'); setTelegramPanel('schedules'); setIsMobileMenuOpen(false); }}
            className={`hidden w-full items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'schedules' ? 'bg-blue-600/10 text-teal-400 border-l-4 border-teal-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Clock className="w-4 h-4 text-teal-400" />
            Lịch Nhắc Tự Động
          </button>

          <button
            onClick={() => { setActiveTab('telegram'); setTelegramPanel('train-schedules'); setIsMobileMenuOpen(false); }}
            className={`hidden w-full items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'train-schedules' ? 'bg-blue-600/10 text-teal-400 border-l-4 border-teal-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Sparkles className="w-4 h-4 text-teal-400" />
            Train Lịch Nhắc (AI)
          </button>

          {sbUser?.email === ADMIN_EMAIL && (
            <button
              onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'admin' ? 'bg-blue-600/10 text-amber-500 border-l-4 border-amber-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
            >
              <Shield className="w-4 h-4 text-amber-400" />
              Quản Trị Người Dùng
              <span className="ml-auto bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">Admin</span>
            </button>
          )}
        </nav>

        {/* PROFILE/AUTH ON SIDEBAR FOR MOBILE AND BACKUP */}
        <div className="px-4 py-3 border-t border-slate-800/60 shrink-0 bg-slate-950/20">
          {sbUser ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-white font-bold shrink-0 text-xs">
                  {sbUser.email?.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-slate-300 text-xs font-bold block truncate">{sbUser.email}</span>
                  <span className="text-[9px] text-emerald-400 font-bold tracking-wider block uppercase">ĐÃ ĐĂNG NHẬP</span>
                </div>
              </div>
              <button
                onClick={() => {
                  handleSbSignOut();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 hover:text-rose-300 border border-rose-800/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setSbAuthMode('signin');
                setSbAuthError('');
                setShowAuthModal(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              Đăng Nhập Tài Khoản
            </button>
          )}
        </div>


      </aside>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 lg:gap-4 shrink-0">
            {/* Mobile Hamburger menu toggle button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg cursor-pointer shrink-0 transition-colors"
              aria-label="Mở menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[#0F172A] font-extrabold text-sm hidden sm:block lg:hidden tracking-tight">AAA BalaBot</span>
              <div className="hidden lg:block min-w-0">
                <h1 className="text-sm md:text-lg font-bold text-slate-800 truncate">
                  {activeTab === 'dashboard' && 'Tổng quan Hệ thống'}
                  {activeTab === 'config' && 'Cấu hình Hành vi & Tone Giọng Bot'}
                  {activeTab === 'train' && 'Nạp Đào Tạo Tri Thức Đột Phá'}
                  {activeTab === 'kb' && 'Quản lý Dữ liệu Kho Tri Thức'}
                  {activeTab === 'playground' && 'Playground Chat Thử Nghiệm'}
                  {activeTab === 'telegram' && 'Liên kết Kế Nối Telegram Bot'}
                  {activeTab === 'facebook' && 'Liên kết Facebook Messenger'}
                  {activeTab === 'zalo' && 'Zalo Group Bot'}
                  {activeTab === 'conversations' && 'Lịch sử Hội thoại Real-time'}
                  {activeTab === 'analytics' && 'Báo cáo Đo Lường Hiệu Suất'}
                  {activeTab === 'schedules' && 'Hệ Thống Nhắc Lịch Tự Động & AI Push'}
                  {activeTab === 'train-schedules' && 'Đào Tạo & Thiết Lập Lịch Nhắc (AI)'}
                  {activeTab === 'supabase' && 'Cơ sở dữ liệu đám mây Supabase'}
                  {activeTab === 'billing' && 'Chính sách Bảng giá & Thiết lập Doanh thu SaaS'}
                  {activeTab === 'admin' && 'Cổng Quản Trị Hệ Thống SaaS & Phân Quyền Khách Hàng'}
                </h1>
                <p className="text-xs text-emerald-600 font-medium hidden sm:block truncate max-w-[300px] lg:max-w-none">
                  {activeTab === 'admin' ? 'Bảng điều khiển tối cao quản trị tài khoản, cấp bù tin nhắn và phân gói thủ công' : activeTab === 'train-schedules' ? 'Đào tạo AI tự động phân tích quy trình timeline' : 'Trợ lý AI chăm sóc khách hàng 24/7'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink min-w-0">
            {/* ACTIVE BOT SELECTOR DROPDOWN - STABLE TRUNCATION & MAX WIDTH */}
            <div className="flex items-center gap-1 md:gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 md:px-3 md:py-1.5 shadow-xs shrink min-w-0 max-w-[130px] sm:max-w-[170px] md:max-w-[220px] lg:max-w-[320px] xl:max-w-[420px]">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider hidden xl:inline shrink-0">Đang quản lý:</span>
              <select
                className="bg-transparent text-xs md:text-sm font-bold text-slate-800 focus:outline-none cursor-pointer w-full min-w-0 pr-6 truncate"
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
              >
                {bots.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsCreatingBot(true)}
              className="p-2 sm:px-2.5 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 shadow-xs shadow-blue-500/10 shrink-0"
              title="Tạo Bot Mới"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden lg:inline">Tạo Bot</span>
            </button>
            
            <div className="w-px h-6 bg-slate-200 hidden lg:block"></div>
            
            {/* AUTH ACTIONS - RENDERED ONLY ON LARGE SCREENS (DESKTOP) TO ABSOLUTELY PREVENT HEADER COLLISION ON MOBILES & TABLETS */}
            <div className="hidden lg:flex items-center gap-2 md:gap-3 shrink-0">
              {sbUser ? (
                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                  <div className="hidden xl:flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-[100px] lg:max-w-[150px]">{sbUser.email}</span>
                    <span className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-widest">ĐÃ ĐĂNG NHẬP</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setSbAuthMode('signin');
                    setSbAuthError('');
                    setShowAuthModal(true);
                  }}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shadow-emerald-500/10 shrink-0"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Đăng Nhập</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* CONTAINER VIEW FOR SCROLLING */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6">

          {/* DYNAMIC ALERT: IF SELECTED BOT DOESNT HAVE TG TOKEN */}
          {activeBot && !activeBot.telegramToken && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between gap-4 shadow-xs">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-slate-800">Bot Chưa Được Kết Nối Ra Telegram</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Bot "{activeBot.name}" hiện tại chỉ hoạt động nội bộ trên playground. Nhập mã Token của BotFather để chạy live phục vụ khách hàng Telegram.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('telegram')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shrink-0 transition-colors"
              >
                Tích hợp ngay
              </button>
            </div>
          )}

          {/* EMPTY STATE FOR NEWLY REGISTERED/LOGGED IN USERS WITH NO BOTS */}
          {bots.length === 0 && activeTab !== 'supabase' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center max-w-xl mx-auto my-12 shadow-md space-y-6 animate-fade-in">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <Bot className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">Chào mừng bạn đến với AAA BalaBot</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-normal">
                  Tài khoản mới đăng nhập của bạn hiện chưa có Bot nào hoạt động. Chúng tôi đã chuẩn bị sẵn một không gian làm sạch trực tuyến để bạn tự tay huấn luyện và kết nối Bot của riêng mình.
                </p>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl text-left border border-slate-200/60 border-dashed space-y-3">
                <span className="text-xs font-bold text-slate-705 block uppercase tracking-wider">Các bước để bắt đầu:</span>
                <ul className="text-xs text-slate-650 list-decimal list-inside space-y-2 leading-relaxed">
                  <li>Nhấp nút <strong className="text-blue-600">"Tạo Bot Mới"</strong> ở góc trên bên phải</li>
                  <li>Cấu hình thông tin cơ bản và chọn tone giọng phù hợp</li>
                  <li>Nạp tài liệu hữu ích vào <strong className="text-blue-600">Kho tri thức</strong> của Bot</li>
                  <li>Lấy Token từ Telegram BotFather để đưa Bot trực tuyến 24/7!</li>
                </ul>
              </div>
              <button
                onClick={() => setIsCreatingBot(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tạo Trợ Lý Ảo Đầu Tiên Ngay
              </button>
            </div>
          )}

          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && bots.length > 0 && (
            <div className="space-y-6">
              {/* Usage / Billing card */}
              {usage && (
                <div className={`bg-white p-5 rounded-xl border shadow-xs ${usage.verdict === 'blocked' ? 'border-rose-300' : usage.verdict === 'warn' ? 'border-amber-300' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Mức dùng tháng này</span>
                      <span className="font-bold text-slate-800">Gói <span className="uppercase">{usage.tier}</span> — {usage.count.toLocaleString()} / {usage.limit ? usage.limit.toLocaleString() : '∞'} tin</span>
                    </div>
                    <button onClick={() => setShowUpgrade(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">Nâng gói</button>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${usage.verdict === 'blocked' ? 'bg-rose-500' : usage.verdict === 'warn' ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${usage.limit > 0 ? Math.min(100, Math.round(usage.count / usage.limit * 100)) : 0}%` }} />
                  </div>
                  {usage.verdict === 'warn' && <p className="text-[11px] text-amber-600 mt-1.5 font-medium">Sắp đạt giới hạn — cân nhắc nâng gói để bot không bị tạm dừng.</p>}
                  {usage.verdict === 'blocked' && <p className="text-[11px] text-rose-600 mt-1.5 font-medium">Đã đạt giới hạn tháng này — bot tạm dừng trả lời AI. Vui lòng nâng gói.</p>}
                </div>
              )}

              {showUpgrade && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowUpgrade(false)}>
                  <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                    <h3 className="font-bold text-lg text-slate-800 mb-1">Nâng gói dịch vụ</h3>
                    <p className="text-sm text-slate-500 mb-4">Chuyển khoản theo thông tin dưới đây, ghi rõ email tài khoản. Chúng tôi sẽ kích hoạt gói trong vòng 24h làm việc.</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1 font-mono">
                      <div>Ngân hàng: <b>[Tên ngân hàng]</b></div>
                      <div>Số TK: <b>[Số tài khoản]</b></div>
                      <div>Chủ TK: <b>[Tên chủ tài khoản]</b></div>
                      <div>Nội dung: <b>BALABOT {sbUser?.email || ''}</b></div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-3">Hỗ trợ / đổi gói: [email hoặc Zalo hỗ trợ của bạn].</p>
                    <button onClick={() => setShowUpgrade(false)} className="mt-4 w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold">Đóng</button>
                  </div>
                </div>
              )}

              {/* Top Row Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Trạng thái Bot</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeBot?.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${activeBot?.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    </span>
                    <span className="font-bold text-lg text-slate-800">
                      {activeBot?.status === 'active' ? 'Hoạt động 24/7' : 'Đang thiếu Token'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-2">Dữ liệu kết nối Telegram</span>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Tổng Số Tin Nhắn Trị Sự</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-extrabold text-slate-900">{analyticsData?.totalMessages ?? 618}</span>
                    <span className="text-green-500 text-xs font-medium font-mono">+12% tuần này</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-2">Tính từ khách hàng thật nhắn đến</span>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Tỷ lệ Phản Hồi Thành Công</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-extrabold text-slate-900">{analyticsData?.successRate ?? 91.2}%</span>
                    <span className="text-blue-500 text-xs font-semibold">+1.5% cải thiện</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-2">Không kích hoạt cảnh báo chuyển giao</span>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Tổng Thư Mục Kiến Thức</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-extrabold text-slate-900">{sources.length}</span>
                    <span className="text-slate-500 text-xs">{sources.filter(s => s.status === 'completed').length} nguồn hợp lệ</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-2">Sẵn sàng đưa vào ngữ cảnh AI</span>
                </div>
              </div>

              {/* Bot List Table & Real-time Live Monitor Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                    <div>
                      <h2 className="font-bold text-slate-800 text-base">Danh Sách Bots Đang Triển Khai</h2>
                      <p className="text-xs text-slate-400">Quản trị tập trung toàn bộ chi nhánh bot</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto p-1">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#FAFBFD] text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-4">Tên / Username</th>
                          <th className="px-6 py-4">Trạng thái</th>
                          <th className="px-6 py-4">Tone giọng</th>
                          <th className="px-6 py-4 text-right">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {bots.map(b => (
                          <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs uppercase shrink-0">
                                  {b.name.charAt(0)}
                                </div>
                                <div className="overflow-hidden">
                                  <div className="font-bold text-slate-900 truncate max-w-[200px]">{b.name}</div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {b.telegramBotUsername ? `@${b.telegramBotUsername}` : 'Chưa liên kết Telegram'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight ${b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {b.status === 'active' ? 'Online' : 'Vượt hạn / Cần Token'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded uppercase">
                                {b.tone === 'friendly' ? 'Thân thiện' : b.tone === 'professional' ? 'Chuyên nghiệp' : 'Bán hàng'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedBotId(b.id);
                                  setActiveTab('config');
                                }}
                                className="text-xs text-blue-600 font-bold hover:underline"
                              >
                                Cài đặt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Dashboard Quick Training Side-widget - "Professional Polish" layout */}
                <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Trạng thái Khối Tri Thức</h3>
                      </div>
                      <span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">Trực Tuyến</span>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-xs mb-1 text-slate-300">
                          <span>Nhật ký đồng bộ tự động</span>
                          <span className="font-mono text-blue-400 font-bold">100% Hoàn tất</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 w-full rounded-full"></div>
                        </div>
                      </div>

                      <div className="border-t border-slate-800 pt-4">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-2">Các file mới đào tạo gần đây</span>
                        <div className="space-y-2">
                          {sources.slice(0, 3).map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-xs bg-slate-800/40 p-2 rounded-lg border border-slate-800">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="truncate max-w-[160px] text-slate-200 font-medium">{item.name}</span>
                              </div>
                              <span className="bg-green-950 text-green-400 text-[9px] font-bold px-1.5 rounded uppercase shrink-0">Đã Train</span>
                            </div>
                          ))}
                          {sources.length === 0 && (
                            <div className="text-xs text-slate-400 italic">Chưa có nguồn tri thức, hãy sang mục Đào Tạo.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-slate-800 pt-4">
                    <button
                      onClick={() => setActiveTab('playground')}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/10"
                    >
                      <Play className="w-3.5 h-3.5" /> Thử Nghiệm Sandbox Chat
                    </button>
                  </div>
                </div>
              </div>


            </div>
          )}

          {/* TAB 2: BOT CONFIGURATION & TONE SETTINGS */}
          {activeTab === 'config' && activeBot && bots.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-8">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Thiết Lập Hành Vi Phản Hồi Của Trợ Lý</h2>
                <p className="text-xs text-slate-500 mt-1">Cấu hình cách Bot đại diện thương hiệu lắng nghe và thương thảo với khách hàng</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Tên Đại Diện Của Trực Trụ</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      value={activeBot.name}
                      onChange={(e) => handleUpdateBotSettings({ name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Lĩnh vực hoạt động</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      value={activeBot.field}
                      onChange={(e) => handleUpdateBotSettings({ field: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Mô tả mục tiêu</label>
                    <textarea
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      value={activeBot.description}
                      onChange={(e) => handleUpdateBotSettings({ description: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Tone giọng chủ đạo</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={activeBot.tone}
                        onChange={(e) => handleUpdateBotSettings({ tone: e.target.value as any })}
                      >
                        <option value="friendly">Thân thiện, ấm áp</option>
                        <option value="professional">Chuyên nghiệp, lễ độ</option>
                        <option value="brief">Ngắn gọn, rành mạch</option>
                        <option value="sales">Tư vấn bán hàng, chốt đơn</option>
                        <option value="support">Hỗ trợ kỹ thuật chu đáo</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Báo giá bán lẻ</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={activeBot.allowPricing ? 'yes' : 'no'}
                        onChange={(e) => handleUpdateBotSettings({ allowPricing: e.target.value === 'yes' })}
                      >
                        <option value="yes">Cho phép chi tiết giá</option>
                        <option value="no">Bảo mật / Hotline tư vấn riêng</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Kiểu Bot (mục đích trả lời)</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={activeBot.answerStyle || 'sales'}
                      onChange={(e) => handleUpdateBotSettings({ answerStyle: e.target.value as 'sales' | 'reference' })}
                    >
                      <option value="sales">Bán hàng — thân thiện, chủ động mời chốt đơn (CTA)</option>
                      <option value="reference">Tra cứu kiến thức — trung lập, súc tích, hạn chế bán hàng</option>
                    </select>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {activeBot.answerStyle === 'reference'
                        ? 'Bot tập trung trả lời đúng kiến thức đã nạp, không chào mời.'
                        : 'Bot tư vấn như nhân viên sale, có thể gợi ý chốt đơn.'}
                    </span>
                  </div>

                  {activeBot.answerStyle === 'reference' && (
                    <div className="flex items-start justify-between gap-3 bg-amber-50/60 border border-amber-200 rounded-lg p-3">
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-800">Cho phép gợi ý sản phẩm khi khách hỏi liên quan</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                          Bật: khi câu hỏi liên quan trực tiếp đến sản phẩm/dịch vụ có trong tài liệu, bot được
                          giới thiệu ngắn gọn (1 câu), không thúc ép. Tắt: thuần kiến thức, tuyệt đối không nhắc sản phẩm.
                        </p>
                      </div>
                      <button
                        onClick={() => handleUpdateBotSettings({ allowProductConsulting: activeBot.allowProductConsulting === false })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${activeBot.allowProductConsulting !== false ? 'bg-amber-500' : 'bg-slate-350'}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${activeBot.allowProductConsulting !== false ? 'translate-x-5' : 'translate-x-0'}`}></span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Lời chào mở đầu (Welcome Trợ Lý)</label>
                    <textarea
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      value={activeBot.welcomeMessage}
                      onChange={(e) => handleUpdateBotSettings({ welcomeMessage: e.target.value })}
                    />
                    <span className="text-[10px] text-slate-400">Hiển thị khi khách hàng ấn chữ /start đầu tiên trên Telegram.</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Hành động khi "Chưa học được tri thức"</label>
                    <textarea
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      value={activeBot.fallbackMessage}
                      onChange={(e) => handleUpdateBotSettings({ fallbackMessage: e.target.value })}
                    />
                    <span className="text-[10px] text-slate-400">Câu fallback xin lỗi và hướng dẫn khách chuyển sang số hỗ trợ dự phòng.</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Sđt Fallback</label>
                      <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={activeBot.fallbackPhone}
                        onChange={(e) => handleUpdateBotSettings({ fallbackPhone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Link Zalo hỗ trợ</label>
                      <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={activeBot.fallbackZalo}
                        onChange={(e) => handleUpdateBotSettings({ fallbackZalo: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-150 pt-6">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">Giới Hạn Nghiêm Ngặt "Chỉ Trả Lời Tri Thức Đã Học"</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Nếu không bật, Gemini sẽ dựa trên am hiểu chung để nói chuyện. Nếu bật, chỉ gói gọn tuyệt đối trong bảng PDF đã train.</p>
                  </div>
                  <button
                    onClick={() => handleUpdateBotSettings({ limitToKnowledge: !activeBot.limitToKnowledge })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${activeBot.limitToKnowledge ? 'bg-blue-600' : 'bg-slate-350'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${activeBot.limitToKnowledge ? 'translate-x-5' : 'translate-x-0'}`}></span>
                  </button>
                </div>
              </div>

              <div className="text-right">
                <button
                  onClick={() => {
                    alert('Các thông tin cấu hình Bot đã được lưu trữ và kích hoạt đồng trục tự động lên API server!');
                    setActiveTab('dashboard');
                  }}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-md"
                >
                  Lưu & Áp Dụng Toàn Hệ Thống
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: TRAIN / UPLOAD CONTEXT */}
          {activeTab === 'train' && bots.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Cung Cấp Tài Liệu Đào Tạo Ngữ Cảnh</h2>
                      <p className="text-xs text-slate-500 mt-1">Đồng bộ văn bản, PDF sản phẩm hoặc FAQ câu hỏi thường gặp để bồi dưỡng tư duy cho Bot</p>
                    </div>
                  </div>

                  {/* SUB TAB SELECTOR */}
                  <div className="flex overflow-x-auto whitespace-nowrap scrollbar-none border-b border-slate-200 mb-6 gap-1 md:gap-2 pb-1.5">
                    <button
                      onClick={() => setTrainType('file')}
                      className={`pb-3 text-xs font-bold uppercase tracking-wider px-3 transition-colors ${trainType === 'file' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Tải File Tài Liệu
                    </button>
                    <button
                      onClick={() => setTrainType('text')}
                      className={`pb-3 text-xs font-bold uppercase tracking-wider px-3 transition-colors ${trainType === 'text' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Nhập Văn Bản Trực Tiếp
                    </button>
                    <button
                      onClick={() => setTrainType('faq')}
                      className={`pb-3 text-xs font-bold uppercase tracking-wider px-3 transition-colors ${trainType === 'faq' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Tạo FAQ Câu Hỏi/Đáp
                    </button>
                    <button
                      onClick={() => setTrainType('url')}
                      className={`pb-3 text-xs font-bold uppercase tracking-wider px-3 transition-colors ${trainType === 'url' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Crawl URL Website
                    </button>
                  </div>

                  <form onSubmit={handleTrainSubmit} className="space-y-6">

                    {trainType === 'file' && (
                      <div className="space-y-5 animate-in fade-in duration-200">
                        {/* Standard local uploader with automatic Zero-Storage processing under the hood */}
                        <div className="border-2 border-dashed border-slate-350 bg-slate-50 p-8 rounded-xl text-center hover:bg-slate-100/50 transition-colors cursor-pointer relative">
                          <input
                            type="file"
                            title=""
                            className="absolute inset-0 opacity-0 cursor-pointer text-[0px]"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                setUploadFileName(e.target.files[0].name);
                                setSelectedFile(e.target.files[0]);
                              }
                            }}
                          />
                          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                          <span className="font-bold text-sm text-slate-800 block">Kéo thả file tài liệu hoặc Click để tìm</span>
                          <span className="text-[11px] text-slate-400 block mt-1">Hỗ trợ tốt nhất các tệp văn bản bóc tách như <b>.txt, .md, .csv, .json, .xml</b>. Dung lượng tối ưu không tốn dung lượng máy chủ.</span>

                          {selectedFile && (
                            <div className="mt-4 inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs px-3 py-1.5 rounded-lg border border-emerald-200 pointer-events-none">
                              <FileText className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="font-semibold">Đã chọn tài liệu — sẵn sàng xử lý</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {trainType === 'text' && (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-700 block mb-1">Tiêu đề đoạn tài liệu</label>
                          <input
                            type="text"
                            placeholder="Ví dụ: Quy trình bảo hành và chính sách đổi trả"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none"
                            value={manualTextTitle}
                            onChange={(e) => setManualTextTitle(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700 block mb-1">Nội dung chi tiết tài liệu huấn luyện trực tiếp</label>
                          <textarea
                            rows={6}
                            placeholder="Nhập thông tin hướng dẫn, chính sách giá sỉ chi tiết, cách liên hệ hỗ trợ nâng cao tại đây..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none text-slate-700 font-medium"
                            value={manualText}
                            onChange={(e) => setManualText(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {trainType === 'faq' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        <div>
                          <label className="text-xs font-semibold text-slate-700 block mb-1">Khách thường hỏi câu gì?</label>
                          <input
                            type="text"
                            placeholder="Ví dụ: Bên mình có hỗ trợ triển khai cho khách ở tỉnh thành khác không?"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={faqQ}
                            onChange={(e) => setFaqQ(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700 block mb-1">Câu trả lời chính thức của Doanh nghiệp</label>
                          <textarea
                            rows={4}
                            placeholder="Dạ, hiện tại bên em hỗ trợ triển khai trên toàn quốc; tùy khu vực sẽ có phương án phù hợp ạ..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={faqA}
                            onChange={(e) => setFaqA(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {trainType === 'url' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Chèn Website URL (Địa chỉ cần cào/crawl kiến thức)</label>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            placeholder="https://congty.vn/cau-hoi-thuong-gap"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none"
                            value={webUrl}
                            onChange={(e) => setWebUrl(e.target.value)}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-2">Hệ thống AI sẽ tự động đi sâu và quét toàn bộ các phân trang con để bứt triết lý.</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                      <span className="text-xs text-slate-400 font-medium">Bản ghi tự động đồng bộ ngay khi nhấn Đào tạo</span>
                      <button
                        type="submit"
                        disabled={isSubmittingTrain}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs tracking-wide transition-all shadow-md shadow-blue-500/10 flex items-center gap-2"
                      >
                        {isSubmittingTrain ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Đang phân tích dữ liệu...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Tiến hành Đào Tạo (Add Source)
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Training logs and status progress on the right */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm mb-4 uppercase tracking-wider">Tiến trình Huấn Luyện AI</h3>
                  <div className="space-y-4">
                    <button
                      onClick={handleReTrainBot}
                      className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-bold transition-all hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Huấn luyện lại toàn bộ gốc (Re-train)
                    </button>

                    <div className="border-t border-slate-100 pt-4 space-y-3">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Danh sách gốc vừa nạp</span>
                      {sources.map((item) => (
                        <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="font-bold text-xs text-slate-800 truncate max-w-[170px]">{item.name}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${item.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                              {item.status === 'completed' ? 'Đã học' : 'Đang tách...'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 truncate">{item.contentSummary}</p>
                          <div className="flex items-center justify-end mt-2 pt-2 border-t border-slate-150-dashed text-[10px] text-slate-400">
                            <button
                              onClick={() => handleDeleteSource(item.id)}
                              className="text-rose-500 hover:text-rose-700 font-bold"
                            >
                              Xóa bỏ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 leading-relaxed">
                  Lưu ý: Mọi tài liệu sửa đổi trên đây hoặc bị gỡ bỏ sẽ trực tiếp làm thay đổi tri thức phản hồi của Bot tới Khách hàng Telegram gần như ngay lập tức.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: KNOWLEDGE BASE SEARCH ENGINE */}
          {activeTab === 'kb' && bots.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Kho Kiến Thức Tri Thức</h2>
                  <p className="text-xs text-slate-500 mt-1">Tìm kiếm chi tiết và hiệu chỉnh từng nội dung tri thức huấn luyện đang được áp dụng cho trợ lý</p>
                </div>

                {/* SEARCH INPUT */}
                <div className="relative w-full md:w-80">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Tìm kiếm tri thức..."
                    className="pl-9 pr-4 py-2 w-full bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={kbSearchQuery}
                    onChange={(e) => setKbSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* SEARCH RESULTS CHUNKS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSources.map((source) => (
                  <div key={source.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-xs transition-shadow flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-end mb-2">
                        <span className="text-[11px] text-slate-400 font-mono">ID: {source.id}</span>
                      </div>
                      <h3 className="font-bold text-sm text-slate-800 mb-2">{source.name}</h3>
                      <div className="bg-slate-50 p-3 rounded-lg text-xs leading-relaxed text-slate-600 font-medium">
                        {source.fullText}
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100 text-xs">
                      <span className="text-slate-400">{source.createdAt.substring(0, 10)}</span>
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        className="text-rose-500 font-semibold hover:underline"
                      >
                        Gỡ bỏ tri thức
                      </button>
                    </div>
                  </div>
                ))}

                {filteredSources.length === 0 && (
                  <div className="col-span-2 text-center py-12 text-slate-400">
                    <Database className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    Không tìm thấy thành tố câu hỏi/đối đáp tri thức nào phù hợp. Hãy thử thay đổi từ khóa.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: PLAYGROUND CHAT TEST */}
          {activeTab === 'playground' && bots.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* PLAYGROUND CONVERSATION - LEFT PANEL */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden h-[600px]">
                <div className="bg-[#FAFBFD] p-4 border-b border-slate-200 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-rose-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md shadow-rose-350/15">
                      P
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">Cửa sổ Chat Sandbox AI</h3>
                      <p className="text-[11px] text-slate-400">Dùng ngữ cảnh tri thức để kiểm tra phản hồi tức thì</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPlaygroundMessages([
                        { id: 'p1', sender: 'bot', username: activeBot?.name || 'BalaBot', text: 'Hội thoại sandbox đã được làm mới. Bạn có thể bắt đầu lại cuộc trò chuyện.', timestamp: new Date().toISOString() }
                      ]);
                      setLastCitation([]);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 font-bold border border-slate-200 px-2.5 py-1 rounded bg-white shadow-3xs"
                  >
                    Reset hội thoại
                  </button>
                </div>

                {/* MESSAGES WATERFALL */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {playgroundMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl p-4 shadow-3xs text-sm leading-relaxed ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none font-medium'}`}>
                        {renderFormattedText(msg.text, msg.sender === 'user')}
                        
                        {/* sources helper in playground msg */}
                        {msg.sourcesUsed && msg.sourcesUsed.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200/50 text-[10px] font-semibold text-slate-500 flex flex-wrap items-center gap-1.5">
                            <span className="bg-emerald-100 text-emerald-800 px-1 rounded uppercase">Khớp tri thức</span>
                            {msg.sourcesUsed.map(src => (
                              <span key={src.id} className="bg-slate-200/80 px-1 rounded text-slate-600">
                                {src.name} ({(src.score * 100).toFixed(0)}%)
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isPlaygroundTyping && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 rounded-2xl rounded-tl-none p-3 text-slate-400 text-xs flex items-center gap-2">
                        <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                        Bot đang trích xuất tri thức và phản hồi...
                      </div>
                    </div>
                  )}
                </div>

                {/* INPUT CONTROL */}
                <form onSubmit={handlePlaygroundSend} className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2 shrink-0">
                  <input
                    type="text"
                    disabled={isPlaygroundTyping}
                    placeholder="Ví dụ: Gói dịch vụ tiêu chuẩn báo giá thế nào, thời gian triển khai bao lâu?"
                    className="flex-1 bg-white border border-slate-250 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={playgroundInput}
                    onChange={(e) => setPlaygroundInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center shrink-0 shadow-xs"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* CITATIONS AND METADATA PANEL - RIGHT PANEL */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between h-[600px] overflow-y-auto">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Thông Số Trọc Thử</h3>
                  <p className="text-xs text-slate-500 mb-4">Các tài liệu mấu chốt được Gemini định vị để xuất câu trả lời cuối cùng</p>

                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tone Giọng Hoạt Động</span>
                      <span className="font-bold text-sm text-slate-800 block capitalize mt-1">
                        {activeBot?.tone === 'friendly' ? 'Thân thiện' : 'Chuyên nghiệp'} (Tối ưu hóa phản hồi)
                      </span>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Văn Bản Gốc Được Định Vị</span>
                      {lastCitation.length > 0 ? (
                        <div className="space-y-2">
                          {lastCitation.map((citation) => (
                            <div key={citation.id} className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                              <div className="flex justify-between text-xs font-bold text-blue-900 mb-1">
                                <span className="truncate max-w-[155px]">{citation.name}</span>
                                <span className="font-mono text-blue-600">{(citation.score * 100).toFixed(0)}% Match</span>
                              </div>
                              <span className="text-[10px] bg-blue-200/65 px-1 py-0.5 rounded text-blue-800 uppercase font-bold tracking-tight">Đã xác minh</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic py-4">Đặt câu hỏi ở Sandbox. Hệ thống sẽ ngay lập tức phơi bày văn bản nguồn trích ra tương tự ở đây.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-6 text-xs text-slate-500 leading-relaxed">
                  <div className="flex gap-2 items-center text-slate-700 font-semibold mb-1">
                    <Check className="w-3.5 h-3.5 text-green-600" />
                    <span>Gợi Ý FAQ Mốc</span>
                  </div>
                  Nếu thấy Bot trả lời chưa vừa lòng, quý doanh nghiệp có thể lập tức bổ sung một cặp Hỏi/Đáp chung trong tab "Nạp tri thức" để cài đè vĩnh viễn.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'telegram' && activeBot && bots.length > 0 && (
            <div className="mb-6 bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {([
                  ['connection', 'Kết nối Bot', 'Token, webhook, test tin nhắn', Link2, 'cyan'],
                  ['schedules', 'Lịch nhắc tự động', `${schedules.filter(s => s.status === 'active').length} đang bật / ${schedules.length} tổng lịch`, Clock, 'teal'],
                  ['train-schedules', 'Train lịch nhắc (AI)', 'Parse file hoặc text thành lịch', Sparkles, 'purple']
                ] as [typeof telegramPanel, string, string, any, string][]).map(([key, label, desc, Icon, color]) => {
                  const isActive = telegramPanel === key;
                  const activeClass = color === 'purple'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : color === 'teal'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-cyan-600 text-white shadow-sm';
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTelegramPanel(key)}
                      className={`min-h-[72px] rounded-lg px-4 py-3 text-left transition-all flex items-center gap-3 ${isActive ? activeClass : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-white/15' : 'bg-slate-100'}`}>
                        <Icon className={`w-5 h-5 ${isActive ? 'text-white' : color === 'purple' ? 'text-purple-500' : color === 'teal' ? 'text-teal-500' : 'text-cyan-500'}`} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold leading-tight">{label}</span>
                        <span className={`block text-[11px] mt-1 leading-snug ${isActive ? 'text-white/75' : 'text-slate-400'}`}>{desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: TELEGRAM SETUP & WEBHOOK SIMULATION */}
          {activeTab === 'telegram' && telegramPanel === 'connection' && activeBot && bots.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Cấu hình Đấu Nối API Telegram</h2>
                  <p className="text-xs text-slate-500 mt-1">Cài đặt API Telegram Token để khởi động chạy bot thật tiếp đón khách</p>
                </div>

                {/* STEPS GUIDELINES FOR BOTFATHER */}
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3 text-xs leading-relaxed text-slate-700">
                  <h4 className="font-bold text-slate-900 text-sm">Hướng dẫn các bước lấy Token qua BotFather:</h4>
                  <ol className="list-decimal pl-4 space-y-2">
                    <li>Mở app Telegram, tìm kiếm tài khoản hệ thống chính chủ của Telegram: <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold hover:underline">@BotFather</a>.</li>
                    <li>Gửi tin nhắn <code className="bg-slate-200 px-1.5 py-0.5 rounded font-mono font-semibold">/newbot</code>, sau đó nhập Tên của Bot và Username của Bot theo hướng dẫn (ví dụ kết thúc bằng chữ "bot", VD: yourcompany_bot).</li>
                    <li>Copy chuỗi mã HTTP API Token (chuỗi ký tự dài chứa dấu hai chấm, VD: <code className="bg-slate-200 px-1 py-0.5 rounded">7123456789:AFF_...</code>) rồi nhập vào Form bên dưới.</li>
                  </ol>
                </div>

                {/* TOKEN SYNC FORM */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Mã Telegram Bot Token</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Key className="h-4 w-4 text-slate-400" />
                        </span>
                        <input
                          type="text"
                          placeholder="Ví dụ: 7123456789:AAExampleToken_YourCompanyBot"
                          className="pl-9 pr-4 py-2.5 w-full bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                          value={inputToken}
                          onChange={(e) => setInputToken(e.target.value)}
                        />
                      </div>
                      <button
                        onClick={handleTestToken}
                        disabled={testTokenStatus === 'testing' || !inputToken}
                        className="px-4 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors hover:bg-slate-800 disabled:opacity-50 shrink-0 uppercase tracking-wider"
                      >
                        {testTokenStatus === 'testing' ? 'Kiểm tra...' : 'Test & Kết Nối'}
                      </button>
                    </div>

                    {testTokenStatus !== 'idle' && (
                      <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${testTokenStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {testTokenStatus === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{testTokenResultMsg}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 p-4 rounded-xl">
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Tình trạng Webhook Trực Cột</h4>
                      <p className="text-[11px] text-slate-400 mt-1">Sử dụng Webhook tự động nhận và rep tin realtime 1-2 giây</p>
                    </div>
                    {activeBot.telegramWebhookActive ? (
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-md uppercase tracking-tight">Active Webook</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-md uppercase tracking-tight">Disabled</span>
                    )}
                  </div>

                  {/* Comprehensive live status diagnostics */}
                  {activeBot.telegramToken && (
                    <div className="pt-4 border-t border-slate-150-dashed space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Chẩn Đoán Kết Nối Webhook Live</span>
                        <button
                          type="button"
                          onClick={fetchWebhookDetails}
                          disabled={isFetchingWebhook}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isFetchingWebhook ? 'animate-spin' : ''}`} />
                          Tải lại trạng thái Telegram
                        </button>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 divide-y divide-slate-100 space-y-3 prose-xs">
                        <div className="grid grid-cols-3 text-xs py-1.5 first:pt-0">
                          <span className="text-slate-400 font-medium font-sans">Webhook URL thực:</span>
                          <span className="col-span-2 font-mono break-all text-slate-700 select-all">
                            {webhookDetails?.webhookInfo?.url || 'Vẫn chưa đăng ký Webhook với Telegram'}
                          </span>
                        </div>

                        {webhookDetails?.webhookInfo && (
                          <>
                            <div className="grid grid-cols-3 text-xs py-1.5 align-middle">
                              <span className="text-slate-400 font-medium font-sans">Bản tin Chờ gửi (Pending):</span>
                              <span className="col-span-2 font-bold text-slate-700 font-sans">
                                {webhookDetails.webhookInfo.pending_update_count} tin chưa xử lý
                              </span>
                            </div>

                            {(() => {
                              const wi = webhookDetails.webhookInfo;
                              const errAgeSec = wi.last_error_date ? (Date.now() / 1000 - wi.last_error_date) : Infinity;
                              // Lỗi "thực sự đang xảy ra" = còn tin pending HOẶC lỗi vừa mới (<2 phút).
                              // Lỗi cũ + 0 pending = lịch sử (vd 503 hồi Render suspend), không phải sự cố hiện tại.
                              const activeError = !!wi.last_error_message && (wi.pending_update_count > 0 || errAgeSec <= 120);
                              const staleError = !!wi.last_error_message && !activeError;

                              if (activeError) {
                                return (
                                  <div className="grid grid-cols-3 text-xs py-1.5 text-rose-600 bg-rose-50/50 p-2 rounded-lg">
                                    <span className="font-bold flex items-center gap-1 font-sans">
                                      <AlertCircle className="w-3.5 h-3.5" /> Lỗi gửi tin gần nhất:
                                    </span>
                                    <span className="col-span-2 font-medium leading-relaxed break-words font-mono">
                                      {wi.last_error_message}
                                      {wi.last_error_date && (
                                        <span className="block text-[10px] text-slate-400 mt-1">
                                          Thời gian lỗi: {new Date(wi.last_error_date * 1000).toLocaleString('vi-VN')}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              }

                              if (wi.url) {
                                return (
                                  <div className="grid grid-cols-3 text-xs py-1.5 text-green-700 bg-green-50/50 p-2 rounded-lg">
                                    <span className="font-bold flex items-center gap-1 font-sans">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Trạng thái truyền:
                                    </span>
                                    <span className="col-span-2 font-medium font-sans">
                                      Kết nối thông suốt! Máy chủ Telegram đang nhận gửi dữ liệu bình thường.
                                      {staleError && wi.last_error_date && (
                                        <span className="block text-[10px] text-slate-400 mt-1 font-normal">
                                          (Lỗi cũ đã qua lúc {new Date(wi.last_error_date * 1000).toLocaleString('vi-VN')} — không còn ảnh hưởng.)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </>
                        )}
                      </div>

                      {/* Setup action buttons with current live address */}
                      <div className="space-y-2.5">
                        <div className="text-xs text-slate-500 leading-relaxed bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                          <p className="font-bold text-blue-900 mb-1 font-sans">Hướng dẫn vận hành:</p>
                          Telegram yêu cầu đường dẫn Webhook phải <strong>công khai (Public URL)</strong>. Hệ thống sẽ tự đăng ký Webhook theo tên miền hiện tại của bạn để nhận tin nhắn trực tiếp từ Telegram:
                          <strong className="block text-slate-700 font-mono mt-1 select-all">
                            {(() => {
                              let origin = window.location.origin;
                              if (origin.includes('ais-dev-')) {
                                origin = origin.replace('ais-dev-', 'ais-pre-');
                              }
                              const isLocal = window.location.hostname === 'localhost' || 
                                              window.location.hostname === '127.0.0.1' || 
                                              window.location.hostname.startsWith('192.168.');
                              if (!isLocal && window.location.pathname.includes('/balabot')) {
                                origin = `${origin}/balabot`;
                              }
                              return `${origin}/api/telegram-webhook/${activeBot.id}`;
                            })()}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={handleManualRegisterWebhook}
                          disabled={isFetchingWebhook}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs tracking-wider uppercase shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingWebhook ? 'animate-spin' : ''}`} />
                          Đồng Bộ & Ký Webhook Với Domain Hiện Tại
                        </button>

                        {webhookActionMsg && (
                          <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${webhookActionMsg.status === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {webhookActionMsg.status === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                            <span>{webhookActionMsg.text}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

               {/* TELEGRAM SIMULATOR WIDGET CONTROLLER */}
              <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageCircle className="w-5 h-5 text-blue-400" />
                    <h3 className="font-bold text-sm uppercase tracking-wider text-white">Giả Lập Gửi Tin Telegram</h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    Bản preview không đổi webhook ngoài trực tiếp được. Để kiểm tra tính năng **tự động xưng hô Anh/Chị + Tên riêng dựa vào giới tính**, hãy thay đổi họ tên khách hàng dưới đây và nhập tin nhắn:
                  </p>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Họ Tên Khách Hàng</label>
                      <input
                        type="text"
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                        value={simUserFullName}
                        onChange={(e) => setSimUserFullName(e.target.value)}
                        placeholder="Ví dụ: Đỗ Thị Quỳnh"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Username Telegram</label>
                      <input
                        type="text"
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                        value={simUserUsername}
                        onChange={(e) => setSimUserUsername(e.target.value)}
                        placeholder="Ví dụ: quynh_dt"
                      />
                    </div>
                  </div>

                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Nội dung câu hỏi</label>
                  <textarea
                    rows={4}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs focus:outline-none text-white font-medium"
                    value={simMessageText}
                    onChange={(e) => setSimMessageText(e.target.value)}
                  />
                </div>

                <div className="mt-6 border-t border-slate-800 pt-4 space-y-3">
                  <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3">
                    <span><strong>Thành viên gửi:</strong> @{simUserUsername} ({simUserFullName})</span>
                  </div>
                  <button
                    onClick={handleSimulateTelegramMsg}
                    disabled={isSimulatingMessage || !simMessageText.trim()}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-transform shadow-md flex items-center justify-center gap-2"
                  >
                    {isSimulatingMessage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Gửi webhook mô phỏng sang Server
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: FACEBOOK MESSENGER INTEGRATION */}
          {activeTab === 'facebook' && activeBot && bots.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Cấu hình Facebook Messenger</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Kết nối bot với Meta Page Messenger qua webhook để nhận và trả lời tin nhắn khách hàng.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchFacebookDetails}
                    disabled={isFetchingFacebook}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingFacebook ? 'animate-spin' : ''}`} />
                    Tải cấu hình
                  </button>
                </div>

                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3 text-xs leading-relaxed text-slate-700">
                  <h4 className="font-bold text-slate-900 text-sm">Các bước kết nối trên Meta Developers</h4>
                  <ol className="list-decimal pl-4 space-y-2">
                    <li>Tạo hoặc mở app Meta Developers, thêm sản phẩm Messenger và liên kết Fanpage của bạn.</li>
                    <li>Trong phần Webhooks, dán <strong>Callback URL</strong> và <strong>Verify Token</strong> bên dưới để xác thực webhook.</li>
                    <li>Tạo <strong>Page Access Token</strong> cho Fanpage (mục Messenger → Generate Token).</li>
                    <li>Dán Page Access Token vào ô bên dưới rồi bấm <strong>Kết nối</strong>. Hệ thống sẽ tự xác thực và tự đăng ký nhận tin nhắn (không cần subscribe thủ công hay cấu hình biến môi trường).</li>
                  </ol>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Callback URL</span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">Webhook</span>
                    </div>
                    <div className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 break-all select-all">
                      {facebookDetails?.webhookUrl || 'Bấm "Tải cấu hình" để lấy URL webhook Facebook.'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Verify Token</span>
                      <div className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 break-all select-all">
                        {facebookDetails?.verifyToken || 'balabot-dev-verify-token'}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Trạng thái Page</span>
                      <div className={`text-xs font-bold rounded-lg p-3 border ${facebookDetails?.facebookStatus === 'connected' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {facebookDetails?.facebookStatus === 'connected'
                          ? `Đã kết nối: ${facebookDetails?.facebookPageName || facebookDetails?.facebookPageId || 'Page'}`
                          : 'Chưa kết nối Fanpage'}
                      </div>
                    </div>
                  </div>

                  {/* Per-bot Page Access Token connect */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Page Access Token</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Dán Page Access Token của Fanpage..."
                        className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        value={inputFacebookToken}
                        onChange={(e) => setInputFacebookToken(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleConnectFacebook}
                        disabled={isConnectingFacebook || !inputFacebookToken.trim()}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs whitespace-nowrap flex items-center gap-2"
                      >
                        {isConnectingFacebook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                        Kết nối
                      </button>
                    </div>
                    {facebookDetails?.facebookStatus === 'connected' && (
                      <button
                        type="button"
                        onClick={handleDisconnectFacebook}
                        disabled={isConnectingFacebook}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                      >
                        Ngắt kết nối Fanpage
                      </button>
                    )}
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Token được lưu riêng cho từng bot. Khi bấm Kết nối, hệ thống tự xác thực với Facebook và tự đăng ký nhận tin nhắn.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
                    <div className="font-bold text-slate-800 mb-1">Graph API Version</div>
                    <span className="font-mono">{facebookDetails?.graphApiVersion || 'v25.0'}</span>
                  </div>
                </div>

                {facebookActionMsg && (
                  <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${facebookActionMsg.status === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {facebookActionMsg.status === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{facebookActionMsg.text}</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageCircle className="w-5 h-5 text-blue-400" />
                    <h3 className="font-bold text-sm uppercase tracking-wider text-white">Giả lập Facebook Messenger</h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    Dùng phần này để kiểm tra bot trả lời qua luồng Facebook mà chưa cần cấu hình Meta app thật.
                  </p>

                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Facebook Sender ID mô phỏng</label>
                  <input
                    type="text"
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono mb-4"
                    value={facebookSimUserId}
                    onChange={(e) => setFacebookSimUserId(e.target.value)}
                  />

                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Nội dung khách hỏi</label>
                  <textarea
                    rows={5}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs focus:outline-none text-white font-medium"
                    value={facebookSimText}
                    onChange={(e) => setFacebookSimText(e.target.value)}
                  />
                </div>

                <div className="mt-6 border-t border-slate-800 pt-4 space-y-3">
                  <button
                    onClick={handleSimulateFacebookMsg}
                    disabled={isSimulatingFacebook || !facebookSimText.trim()}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-transform shadow-md flex items-center justify-center gap-2"
                  >
                    {isSimulatingFacebook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Gửi tin mô phỏng Facebook
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ZALO GROUP BOT */}
          {activeTab === 'zalo' && sbUser?.email === ADMIN_EMAIL && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Zalo Group Bot (không chính thức)</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Bot trả lời trong nhóm Zalo khi được @nhắc hoặc reply. Dùng nick phụ, có rủi ro khóa nick.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadZalo}
                    disabled={zaloLoading}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${zaloLoading ? 'animate-spin' : ''}`} />
                    Làm mới
                  </button>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">Trạng thái:</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${zaloStatus?.loginState === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {zaloStatus?.loginState || '?'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">Listener:</span>
                    <span>{String(zaloStatus?.listenerConnected ?? '?')}</span>
                  </div>
                  {zaloStatus?.lastError && (
                    <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-red-700 font-medium">
                      Lỗi: {zaloStatus.lastError}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 flex-wrap">
                  {zaloStatus?.loginState !== 'active' && (
                    <button
                      onClick={startZaloLogin}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold flex items-center gap-2"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Đăng nhập Zalo (quét QR)
                    </button>
                  )}
                  {zaloStatus?.loginState === 'active' && (
                    <button
                      onClick={logoutZalo}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-2"
                    >
                      Đăng xuất
                    </button>
                  )}
                </div>

                {typeof zaloQr === 'string' && zaloQr.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600 font-medium">Quét QR bằng app Zalo để đăng nhập. Đang chờ xác nhận...</p>
                    <img src={zaloQr} alt="Quét QR bằng app Zalo" style={{ width: 220 }} className="rounded-lg border border-slate-200" />
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="font-bold text-slate-800 text-sm">Gán bot cho từng nhóm</h3>
                  {(!zaloGroups.bindings || zaloGroups.bindings.length === 0) ? (
                    <p className="text-xs text-slate-400">Chưa có nhóm nào. Đăng nhập Zalo và bot sẽ tự phát hiện nhóm khi có tin nhắn.</p>
                  ) : (
                    <div className="space-y-2">
                      {zaloGroups.bindings.map((b: any) => (
                        <div key={b.group_id} className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                          <span className="font-medium text-slate-700 flex-1 min-w-0 truncate">{b.group_name || b.group_id}</span>
                          <select
                            value={b.bot_id || ''}
                            onChange={(e) => saveZaloBinding(b.group_id, e.target.value, e.target.value ? b.enabled : false, b.group_name)}
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:border-green-500"
                          >
                            <option value="">— Chọn bot —</option>
                            {(zaloGroups.bots || []).map((bot: any) => (
                              <option key={bot.id} value={bot.id}>{bot.name}</option>
                            ))}
                          </select>
                          <label className={`flex items-center gap-1.5 ${b.bot_id ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`} title={b.bot_id ? '' : 'Chọn bot trước khi bật'}>
                            <input
                              type="checkbox"
                              disabled={!b.bot_id}
                              checked={b.enabled}
                              onChange={(e) => saveZaloBinding(b.group_id, b.bot_id, e.target.checked, b.group_name)}
                              className="accent-green-600"
                            />
                            <span className="text-slate-600">Bật</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-green-400" />
                  <h3 className="font-bold text-sm uppercase tracking-wider text-white">Hướng dẫn Zalo Group</h3>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                  <p>1. Đăng nhập bằng QR — quét bằng app Zalo chính thức.</p>
                  <p>2. Sau khi đăng nhập, bot sẽ lắng nghe tin nhắn nhóm khi được @nhắc hoặc ai đó reply vào tin nhắn của bot.</p>
                  <p>3. Gán bot cho từng nhóm trong danh sách bên trái để chọn bot trả lời phù hợp.</p>
                  <p className="text-amber-300 font-medium">Lưu ý: Zalo không có API chính thức. Dùng nick phụ để tránh rủi ro khóa tài khoản.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: HISTORIC CONVERSATIONS & OPERATOR TAKEOVER */}
          {activeTab === 'conversations' && bots.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* SESSIONS LIST - LEFT 1/3 PANEL */}
              <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[600px] overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
                  <h3 className="font-bold text-slate-800 text-sm">Hội thoại từ Telegram</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Click vào đoạn chat để can thiệp / trả lời thay</p>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {conversations.map((sess) => {
                    const isEscalated = sess.status === 'escalated';
                    return (
                      <div
                        key={sess.id}
                        onClick={() => setSelectedSessionId(sess.id)}
                        className={`p-4 cursor-pointer transition-colors relative hover:bg-slate-50 ${selectedSessionId === sess.id ? 'bg-blue-50/50 border-l-4 border-blue-500' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-xs text-slate-900 truncate max-w-[140px]">
                            {sess.telegramFullName || sess.telegramUsername}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {sess.lastMessageTime.substring(11, 16)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-1">
                          {sess.lastMessageText}
                        </p>

                        <div className="flex gap-2 items-center mt-2">
                          <span className={`px-2 py-0.25 rounded text-[10px] font-bold uppercase tracking-tight ${
                            sess.status === 'escalated' ? 'bg-red-100 text-red-700 animate-pulse' :
                            sess.status === 'bot_answered' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {sess.status === 'escalated' ? 'Cần nhân viên gấp' : sess.status === 'bot_answered' ? 'Bot Rep' : 'Đã Đóng'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {conversations.length === 0 && (
                    <div className="text-center py-12 text-slate-400 text-xs italic">
                      Chưa có lịch sử hội thoại khách hàng nào được ghi nhận.
                    </div>
                  )}
                </div>
              </div>

              {/* DETAILED CHAT CONTENT - MIDDLE 1/2 PANEL */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[600px] overflow-hidden">
                {selectedSession ? (
                  <>
                    {/* SESSION DETAILS TOP BAR */}
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                      <div>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                          CHAT ID: {selectedSession.telegramUserId}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 mt-1">
                          {selectedSession.telegramFullName} (@{selectedSession.telegramUsername})
                        </h4>
                      </div>

                      {/* Manual State Resolver */}
                      <div className="flex gap-2">
                        {selectedSession.status === 'escalated' && (
                          <button
                            onClick={() => handleUpdateSessionStatus(selectedSession.id, 'resolved')}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                          >
                            Đánh dấu xử lý xong (Resolve)
                          </button>
                        )}
                        <span className={`px-2.5 py-1 text-xs font-bold rounded uppercase ${
                          selectedSession.status === 'escalated' ? 'bg-rose-100 text-rose-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {selectedSession.status === 'escalated' ? 'Cảnh báo: Nhân viên cần vào' : 'Bot Đang Phục Vụ'}
                        </span>
                      </div>
                    </div>

                    {/* HISTORIC DIALOGS WATERFALL */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                      {selectedSession.messages.map((m) => {
                        const isAgent = m.sender === 'agent';
                        const isBot = m.sender === 'bot';
                        return (
                          <div key={m.id} className={`flex ${isAgent || isBot ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[75%] rounded-xl p-3 shadow-3xs text-xs leading-relaxed ${
                              isAgent ? 'bg-[#0F172A] text-white rounded-tl-none font-bold' :
                              isBot ? 'bg-blue-50 text-slate-800 border border-blue-100 rounded-tl-none font-medium' :
                              'bg-white text-slate-900 border border-slate-200 rounded-tr-none'
                            }`}>
                              <span className="block text-[10px] text-slate-400 uppercase font-mono font-bold mb-1">
                                {m.username} ({m.timestamp.substring(11, 16)})
                              </span>
                              {renderFormattedText(m.text, isAgent)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* OPERATOR REPLY PANEL - THE TAKEOVER MODULE */}
                    <form onSubmit={handleOperatorSendReply} className="p-4 border-t border-slate-150-dashed bg-slate-50 shrink-0">
                      <div className="flex items-center gap-1 text-[10px] text-rose-600 font-bold uppercase mb-2">
                        <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                        <span>Chế độ can thiệp: Trả lời thay thế bot tự động</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nhập câu trả lời can thiệp của nhân viên tổng đài để Rep sang Telegram khách hàng ngay..."
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                          value={operatorReply}
                          onChange={(e) => setOperatorReply(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg"
                        >
                          Gửi thay bot
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-400 italic">
                    Chọn một cuộc trò chuyện để can thiệp cứu rỗi fallback và ghi chú khách sỉ.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 8: VECTOR REPORTING ANALYTICS */}
          {activeTab === 'analytics' && bots.length > 0 && (
            <div className="space-y-6">
              
              {/* TOP STATS ANALYTICS ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tỉ lệ escalation sang nhân viên</span>
                  <div className="text-2xl font-extrabold text-slate-800 mt-1">8.8%</div>
                  <p className="text-xs text-slate-500 mt-2">Dưới mức cho phép (Tối đa 15%)</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Người dùng chat tích cực (7 ngày)</span>
                  <div className="text-2xl font-extrabold text-slate-800 mt-1">142 Người</div>
                  <p className="text-xs text-slate-500 mt-2">Đạt tỉ lệ tương tác sỉ tới 42%</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Hỏi/Đáp Hữu Ích Đơn Trích</span>
                  <div className="text-2xl font-extrabold text-[#10B981] mt-1">84 / 92</div>
                  <p className="text-xs text-slate-500 mt-2">Tỉ lệ Thumbs-up đạt mức 91.3%</p>
                </div>
              </div>

              {/* VECTOR CHART SIMULATION & MISSING KNOWLEDGE SUGGESTIONS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* SVG TRAFFIC FLOW GRAPH */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Lưu Lượng Tin Nhắn Theo Tuần</h3>
                    <p className="text-xs text-slate-400 mb-4">Tổng số tin nhắn phản hồi của BalaBot (Vạch xanh) so với khách hỏi (màu xanh than)</p>
                  </div>

                  {/* CUSTOM SVG RESPONSIVE CHART - Highly reliable and lightweight */}
                  <div className="relative h-60 w-full bg-slate-50/50 rounded-xl overflow-hidden p-2 flex items-end">
                    <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      <line x1="0" y1="50" x2="400" y2="50" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="100" x2="400" y2="100" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="150" x2="400" y2="150" stroke="#f1f5f9" strokeWidth="1" />

                      {/* User Messages Polyline (Blue) */}
                      <polyline
                        fill="none"
                        stroke="#0F172A"
                        strokeWidth="3.5"
                        points="20,160 80,140 140,110 200,130 260,80 320,50 380,90"
                      />

                      {/* Bot Messages Polyline (Emerald) */}
                      <polyline
                        fill="none"
                        stroke="#3B82F6"
                        strokeWidth="3"
                        strokeDasharray="4 4"
                        points="20,165 80,145 140,115 200,135 260,85 320,55 380,95"
                      />

                      {/* Labels */}
                      <text x="20" y="195" fill="#94a3b8" fontSize="9" fontWeight="bold">05/19</text>
                      <text x="140" y="195" fill="#94a3b8" fontSize="9" fontWeight="bold">05/21</text>
                      <text x="260" y="195" fill="#94a3b8" fontSize="9" fontWeight="bold">05/23</text>
                      <text x="360" y="195" fill="#94a3b8" fontSize="9" fontWeight="bold">Hôm nay</text>
                    </svg>
                  </div>
                </div>

                {/* KNOWLEDGE GAPS & USER FALLBACK FEEDBACK LOOP */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Tri Thức Cần Bồi Dưỡng Thêm</h3>
                    <p className="text-xs text-slate-400 mb-4">Các chủ đề khách rà hỏi nhiều lần gần đây nhưng Bot chưa khớp văn bản trả lời được</p>

                    <div className="space-y-3">
                      {analyticsData?.knowledgeGaps.map((gap, idx) => (
                        <div key={idx} className="p-3 bg-amber-50/40 border border-amber-200/60 rounded-xl">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-bold text-xs text-slate-800 block">{gap.topic}</span>
                            <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded uppercase">
                              {gap.missingCount} lượt hỏi hụt
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">{gap.suggestion}</p>
                          <button
                            onClick={() => {
                              setTrainType('text');
                              setTrainCategory('product');
                              setManualText(`Tri thức bổ sung cho: ${gap.topic}. Chi tiết: `);
                              setManualTextTitle(`Mổ xẻ giải quyết vấn đề ${gap.topic}`);
                              setActiveTab('train');
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-800 font-bold mt-2 flex items-center gap-1 hover:underline"
                          >
                            Hướng đào tạo vá lỗ hổng tri thức <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 9: SUPABASE CONNECTION & SYNC MANAGER */}
          {activeTab === 'supabase' && (
            <div className="space-y-6">
              {/* INTRO HERO GRID */}
              <div className="bg-gradient-to-br from-emerald-950 to-slate-900 border border-emerald-500/30 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-lg">
                <div className="relative z-10 max-w-2xl">
                  <span className="bg-emerald-500 text-slate-950 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">
                    Hệ Thống Tự Động Lưu Trữ Điện Toán Đám Mây
                  </span>
                  <h2 className="text-xl md:text-2xl font-extrabold tracking-normal">Cơ sở dữ liệu đám mây Supabase PostgreSQL</h2>
                  <p className="text-slate-300 text-xs mt-2 leading-relaxed">
                    Kết nối BalaBot của bạn trực tiếp tới dịch vụ cơ sở dữ liệu Supabase.com miễn phí để bảo toàn dữ liệu bot,
                    lịch sử trò chuyện khách hàng, tri thức đã học một cách trường tồn, bảo mật, và sẵn sàng tích hợp Telegram 24/7 thực tế.
                  </p>
                </div>
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-10 translate-y-10">
                  <Database className="w-80 h-80 text-emerald-300" />
                </div>
              </div>

              {/* SUPABASE AUTHENTICATION MANAGER */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
                        Supabase Email & Password Authentication Status
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Xác thực người dùng quản trị trực tiếp đối chiếu qua phân hệ Supabase Auth
                    </p>
                  </div>
                  {sbUser && (
                    <button
                      onClick={handleSbSignOut}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Đăng xuất tài khoản
                    </button>
                  )}
                </div>

                {sbUser ? (
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-emerald-100 rounded-xl border border-emerald-200 text-emerald-700">
                        <User2 className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs text-emerald-600 font-extrabold uppercase tracking-widest">Đang đăng nhập thành công</p>
                        <p className="text-sm font-bold text-slate-800">{sbUser.email}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">ID Người dùng: {sbUser.id}</p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 border-l border-slate-200 pl-4">
                      <p><strong>Xác thực phiên</strong>: Email/Password Auth hoạt động</p>
                      <p className="mt-1">✅ <strong>Quyền hạn</strong>: Toàn quyền truy cập bảng tri thức và kho Storage</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    <div className="lg:col-span-5 space-y-3">
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs text-slate-600 leading-relaxed space-y-2">
                        <p className="font-semibold text-slate-850">Cách thức kiểm thử Supabase Auth:</p>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-500 text-[11px]">
                          <li>Bật nhà cung cấp dịch vụ <strong>Email</strong> trên bảng điều khiển Supabase Dashboard &gt; Auth &gt; Providers.</li>
                          <li>Nhập Email và Mật khẩu tự chọn của bạn sau đây để thực hiện Đăng ký / Đăng nhập trực tiếp.</li>
                          <li>Cơ chế bảo mật Email & Mật khẩu được kết nối đầy đủ và đồng bộ trực tiếp tới cơ sở dữ liệu của bạn.</li>
                        </ol>
                      </div>
                    </div>

                    <div className="lg:col-span-7 font-sans">
                      <div className="border border-slate-150 rounded-xl p-5">
                        <div className="flex border-b border-slate-150 mb-4 font-sans">
                          <button
                            type="button"
                            onClick={() => { setSbAuthMode('signin'); setSbAuthError(''); }}
                            className={`flex-1 pb-2.5 text-center text-xs font-bold transition-colors cursor-pointer ${sbAuthMode === 'signin' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            ĐĂNG NHẬP
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSbAuthMode('signup'); setSbAuthError(''); }}
                            className={`flex-1 pb-2.5 text-center text-xs font-bold transition-colors cursor-pointer ${sbAuthMode === 'signup' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            ĐĂNG KÝ MỚI
                          </button>
                        </div>

                        <form onSubmit={handleSbAuthSubmit} className="space-y-3">
                          {sbAuthError && (
                            <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 text-xs rounded-lg flex items-start gap-2 animate-shake">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span className="font-medium text-[11px] whitespace-pre-line">{sbAuthError}</span>
                            </div>
                          )}

                          <div>
                            <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                              Địa chỉ Email tập sự / quản trị
                            </label>
                            <input
                              type="email"
                              required
                              placeholder="admin@yourdomain.com"
                              className="w-full bg-slate-50 border border-slate-150 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-emerald-500/10 focus:outline-none"
                              value={sbAuthEmail}
                              onChange={(e) => setSbAuthEmail(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                              Mật khẩu bảo mật
                            </label>
                            <input
                              type="password"
                              required
                              minLength={6}
                              placeholder="Tối thiểu 6 ký tự"
                              className="w-full bg-slate-50 border border-slate-150 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-emerald-500/10 focus:outline-none"
                              value={sbAuthPassword}
                              onChange={(e) => setSbAuthPassword(e.target.value)}
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={sbAuthLoading}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-350 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {sbAuthLoading ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Đang thực hiện xác thực với Supabase...
                              </>
                            ) : sbAuthMode === 'signup' ? (
                              'Yêu cầu Đăng ký Tài khoản'
                            ) : (
                              'Tiến hành Đăng nhập Hệ thống'
                            )}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* DUAL COLUMN - CONFIGURATION AND STATUS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. CONNECTION CONFIGURATION FORM */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Database className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Thông Số Kết Nối Supabase</h3>
                        <p className="text-xs text-slate-400">Thiết lập URL định tuyến API và Khóa Công Khai</p>
                      </div>
                    </div>

                    <form onSubmit={handleSaveSupabaseConfig} className="space-y-4 mt-6">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          API URL (Endpoint)
                        </label>
                        <input
                          type="url"
                          required
                          placeholder="https://xyzxyz.supabase.co"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          value={sbUrl}
                          onChange={(e) => setSbUrl(e.target.value)}
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          URL riêng tư của Project của bạn trong trang quản trị Supabase &gt; Settings &gt; API.
                        </span>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Anon Public API Key
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="eyJhbGciOi..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          value={sbKey}
                          onChange={(e) => setSbKey(e.target.value)}
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Khóa API Anon hoặc Service Role (được mã hóa một chiều trên server).
                        </span>
                      </div>

                      <div className="pt-4">
                        <button
                          type="submit"
                          disabled={sbTesting}
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 disabled:bg-slate-500 cursor-pointer"
                        >
                          {sbTesting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Đang cấu hình & kết nối...
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Lưu Cấu Hình & Kiểm Tra
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* 2. REALTIME CONNECTION STATUS & TABLE INTEGRITY */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Trạng thái hạ tầng Supabase</h3>
                    <p className="text-xs text-slate-400 mb-6">Độ khả dụng và tính toàn vẹn của cơ sở dữ liệu đám mây</p>

                    {/* STATUS BANNER */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${sbStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                        <div className="flex-1">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Phương thức lưu trữ hoạt động</span>
                          <span className="text-sm font-bold text-slate-800">
                            {sbStatus?.connected ? 'Bản Ghi Supabase Đám Mây Sẵn Sàng (Live Cloud)' : 'In-Memory Backup Mode (Local Mock)'}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {sbStatus?.message || 'Chưa thiết lập URL kết nối riêng. Hệ thống đang sử dụng cơ sở dữ liệu mô phỏng trong RAM.'}
                          </p>
                        </div>
                      </div>

                      {/* INDIVIDUAL TABLES CHECK */}
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Tính toàn vẹn bảng (Required Schema)</span>
                        <div className="space-y-2">
                          {[
                            { name: 'bots', label: 'Bảng Bot AI (Cấu hình hành vi)' },
                            { name: 'knowledge_sources', label: 'Bảng Tri Thức Gốc (Files/FAQ)' },
                            { name: 'knowledge_chunks', label: 'Bảng liên kết tri thức' },
                            { name: 'chat_sessions', label: 'Nhật ký chat & Hội thoại' },
                            { name: 'faq_items', label: 'Cặp FAQ Hỏi đáp cứng' }
                          ].map((tbl, i) => {
                            const isMissing = sbStatus?.missingTables?.includes(tbl.name);
                            return (
                              <div key={i} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                                <span className="font-medium text-slate-700">{tbl.label}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{tbl.name}</span>
                                  {sbStatus?.connected ? (
                                    !isMissing ? (
                                      <span className="text-emerald-500 font-bold flex items-center gap-0.5"><Check className="w-3.5 h-3.5" /> OK</span>
                                    ) : (
                                      <span className="text-rose-500 font-bold flex items-center gap-0.5 text-[10px]"><AlertCircle className="w-3.5 h-3.5" /> HOÀN TOÀN THIẾU</span>
                                    )
                                  ) : (
                                    <span className="text-amber-500 font-medium text-[10px] italic">Simulated OK</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* THREE COLUMN DETAILS AND ACTION PANELS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* ADVANTAGE CARD */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between lg:col-span-1">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Ưu Điểm Của Supabase</h3>
                    <p className="text-xs text-slate-400 mb-4">Tại sao doanh nghiệp nên nâng cấp lên Supabase.com đám mây?</p>

                    <div className="space-y-3 mt-4">
                      <div className="flex gap-2.5 items-start text-xs text-slate-600">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Bảo lưu trường tồn:</strong> Dữ liệu không bị xóa mất kể cả khi server container restart hoặc nâng cấp ứng dụng.</span>
                      </div>
                      <div className="flex gap-2.5 items-start text-xs text-slate-600">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Chạy thật Telegram:</strong> Khách chat Telegram ngoài đời thực sự sẽ được lưu và đổ trực tuyến về dashboard ngay lập tức.</span>
                      </div>
                      <div className="flex gap-2.5 items-start text-xs text-slate-600">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Băng thông Postgres SQL:</strong> Khả năng tra cứu nội dung cực nhanh phục vụ trợ lý ảo AI của doanh nghiệp hoạt động tối đa.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SYNCHRONIZE PROGRESSIVE SEEDER CARD */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between lg:col-span-1">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Đồng bộ / Nạp dữ liệu Seeding</h3>
                    <p className="text-xs text-slate-400 mb-4">Chuyển toàn bộ dữ liệu mẫu hiện tại (Bots, FAQ, Chunks) lên Supabase Đám Mây mới của bạn</p>

                    <div className="border border-indigo-100 bg-indigo-50/40 p-3 rounded-xl mb-4">
                      <span className="text-[10px] text-indigo-700 font-extrabold uppercase tracking-wide block mb-1">Dữ liệu sẵn có để nạp:</span>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-medium font-sans">
                        <div>Bots: {bots.length} bản ghi</div>
                        <div>📁 Sources: {sources.length} file</div>
                        <div>🧩 Chunks: {sources.length * 2} mẩu</div>
                        <div>💬 Lịch sử: {conversations.length} cuộc hội thoại</div>
                        <div>❓ FAQ: {faqs.length} câu hỏi cứng</div>
                      </div>
                    </div>

                    {sbSyncResult && (
                      <div className={`mb-4 p-3 rounded-xl border text-xs ${sbSyncResult.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                        <span className="font-bold block">{sbSyncResult.success ? 'Thành công!' : 'Có lỗi xảy ra:'}</span>
                        <p className="mt-1 text-[11px] font-sans">{sbSyncResult.message}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <button
                      onClick={handleSyncToSupabase}
                      disabled={sbSyncing || !sbStatus?.connected}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {sbSyncing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Đang tải nạp seeding dữ liệu...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          {sbStatus?.connected ? 'Đồng bộ Dữ liệu Lên Đám Mây' : 'Yêu cầu kết nối Supabase'}
                        </>
                      )}
                    </button>
                    {!sbStatus?.connected && (
                      <span className="text-[10px] text-slate-400 text-center block mt-1.5 italic">Hãy thiết lập thông số kết kết nối bên trên trước</span>
                    )}
                  </div>
                </div>

                {/* HOW TO MANUAL GUIDE CARD */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between lg:col-span-1">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">3 bước tạo Supabase miễn phí</h3>
                    <p className="text-xs text-slate-400 mb-4">Cách lấy thông số kết nối trong 2 phút</p>

                    <ol className="space-y-3 mt-4 text-xs text-slate-600 list-decimal pl-4">
                      <li>Truy cập <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">Supabase.com</a>, đăng nhập và nhấn <strong>New Project</strong> để tạo cơ sở dữ liệu miễn phí.</li>
                      <li>Sau khi project khởi chạy hoàn tất, vào thẻ <strong>SQL Editor</strong>, dán đoạn lệnh SQL Schema bên dưới đây và nhấn <strong>Run</strong> để khởi dựng các bảng cần thiết.</li>
                      <li>Truy cập mục <strong>Settings &gt; API</strong>, sao chép URL và khóa Public Anon dán vào form bên trái để kích hoạt.</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* SUPABASE STORAGE EXPLORER PANEL */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
                        Supabase Storage Explorer (Bucket: knowledge-sources)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Trực quan và quản trị phân bổ các tập tin văn bản, PDF, DOCX, CSV đào tạo thực tế trên đám mây</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchSbStorageFiles}
                      disabled={sbLoadingStorage || !sbStatus?.connected}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${sbLoadingStorage ? 'animate-spin' : ''}`} />
                      Làm mới bộ nhớ
                    </button>
                  </div>
                </div>

                {!sbStatus?.connected ? (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center text-slate-500 text-xs">
                    <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Chưa cấu hình dịch vụ lưu trữ Supabase Storage</p>
                    <p className="mt-1 text-slate-400">Vui lòng cung cấp URL & API Key ở form phía trên và đồng bộ bảng tri thức để bắt đầu dùng Bucket lưu trữ.</p>
                  </div>
                ) : sbLoadingStorage ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mx-auto mb-2" />
                    Đang quét danh bạ tập tin lưu trữ đám mây...
                  </div>
                ) : sbStorageFiles.length === 0 ? (
                  <div className="border border-dashed border-slate-250 rounded-xl p-10 text-center text-slate-500 text-xs">
                    <Upload className="w-8 h-8 text-slate-350 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Storage Bucket trống rỗng</p>
                    <p className="mt-1 text-slate-400">Chưa có tập tin đào tạo nào được đẩy lên Supabase Storage.</p>
                    <p className="mt-2 text-slate-400 text-[11px]">Hãy chuyển sang thẻ <strong className="text-blue-600">Huấn Luyện AI Bot</strong>, tải lên một file tài liệu thật (hoặc file mẫu), hệ thống sẽ tự động đồng bộ hóa lên đám mây của bạn!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sbStorageFiles.map((file, idx) => {
                      const isPdf = file.name.endsWith('.pdf');
                      const isDoc = file.name.endsWith('.docx') || file.name.endsWith('.doc');
                      const isTxt = file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json');
                      
                      let fileColor = "text-amber-500 bg-amber-50 border-amber-100";
                      if (isPdf) fileColor = "text-rose-500 bg-rose-50 border-rose-100";
                      else if (isDoc) fileColor = "text-blue-500 bg-blue-50 border-blue-100";
                      else if (isTxt) fileColor = "text-emerald-500 bg-emerald-50 border-emerald-100";

                      const simpleSize = file.metadata ? `${(file.metadata.size / 1024).toFixed(1)} KB` : "N/A";
                      
                      return (
                        <div key={idx} className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 flex flex-col justify-between hover:shadow-xs transition-shadow text-left">
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className={`p-2.5 rounded-lg border ${fileColor} shrink-0`}>
                                <FileText className="w-5 h-5" />
                              </div>
                              <button
                                onClick={() => handleDeleteStorageFile(file.name)}
                                className="p-1 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                                title="Xóa tập tin khỏi Bucket"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            <h4 className="font-bold text-slate-800 text-xs truncate mb-1" title={file.name}>
                              {file.name}
                            </h4>
                            <p className="text-[10.5px] text-slate-400">Dung lượng: <strong className="text-slate-600">{simpleSize}</strong></p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100">
                            <a
                              href={file.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10.5px] font-bold rounded-lg text-center transition-colors block cursor-pointer"
                            >
                              Tải về
                            </a>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(file.publicUrl);
                                alert('Đã sao chép liên kết tải công cộng vào Clipboard!');
                              }}
                              className="px-2.5 py-1.5 bg-slate-900 border border-transparent hover:bg-slate-800 text-white text-[10.5px] font-bold rounded-lg text-center transition-colors cursor-pointer"
                            >
                              Copy Link
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* DDL SQL SCRIPT INTERFACES */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs text-left">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Kịch bản khởi dựng cấu trúc SQL (DDL Schema)</h3>
                    <p className="text-xs text-slate-400">Dán tập lệnh SQL này vào mục SQL Editor tại Supabase project của bạn để tạo bảng ngay lập tức</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(sbSchema);
                      alert('Đã sao chép kịch bản SQL vào Clipboard. Vui lòng dán vào SQL Editor.');
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Copy SQL Script
                  </button>
                </div>

                <div className="relative">
                  <pre className="bg-slate-950 text-slate-300 font-mono text-[10.5px] p-5 rounded-xl overflow-x-auto max-h-80 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 text-left">
                    <code>{sbSchema || '... loading ...'}</code>
                  </pre>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'billing' && (
            <div className="space-y-6 animate-fade-in text-left">
              
              {/* HEADER INTERACTIVE PLAN */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-xl">
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
                  <CreditCard className="w-80 h-80 text-indigo-400 rotate-12" />
                </div>
                
                <div className="relative z-10 max-w-4xl">
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block font-sans">
                    Không gian thanh toán & gói cước dịch vụ
                  </span>
                  <h2 className="text-xl md:text-3xl font-extrabold tracking-normal">Quản Lý Gói Cước & Tài Nguyên Trợ Lý</h2>
                  <p className="text-slate-300 text-xs md:text-sm mt-2 leading-relaxed max-w-2xl">
                    Cập nhật hạn mức hệ thống, xem thông số sử dụng tài nguyên đồng bộ thời gian thực và nâng cấp tài khoản BalaBot của bạn để tối ưu hiệu quả vận hành và chăm sóc khách hàng.
                  </p>
                </div>
              </div>

              {/* OVERVIEW: SYSTEM USAGE & SUBSCRIPTION CARD ROWS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* CURRENT PLAN BOX */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full translate-x-10 -translate-y-10" />
                  <div className="space-y-2 relative z-10">
                    <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase block font-sans">Gói cước đang dùng</span>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">BalaBot Free Standard</h3>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Đang dùng
                      </span>
                    </div>
                    <p className="text-xs text-slate-550 leading-relaxed">
                      Lựa chọn phù hợp để bắt đầu ứng dụng AI tự động hóa tư vấn và chăm sóc khách hàng.
                    </p>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-slate-150 relative z-10">
                    <span className="text-[10px] font-extrabold text-slate-400 block uppercase mb-1 font-sans">Ghi chú cam kết hỗ trợ</span>
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 italic">
                      "{customPlanNotes}"
                    </p>
                  </div>
                </div>

                {/* BOT USAGE PROGRESS BAR */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase block font-sans">Số lượng Bot hoạt động</span>
                      <span className="text-xs font-mono font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {bots.length} / {freeBotsLimit} Bot
                      </span>
                    </div>
                    <p className="text-xs text-slate-550">
                      Tạo và quản lý các trợ lý trực tổng kho, bán sỉ hoặc phản hồi khách sỉ khác nhau.
                    </p>
                  </div>

                  {/* Visual scale */}
                  <div className="space-y-1.5 mt-4">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${bots.length >= freeBotsLimit ? 'bg-amber-500' : 'bg-blue-600'}`}
                        style={{ width: `${Math.min(100, (bots.length / freeBotsLimit) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10.5px] font-medium text-slate-400">
                      <span>Đã tạo {bots.length} Bot</span>
                      {bots.length >= freeBotsLimit ? (
                        <span className="text-amber-600 font-bold">Chạm giới hạn tối đa !</span>
                      ) : (
                        <span>Còn {(freeBotsLimit - bots.length)} lượt miễn phí</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* MONTHLY CONVERSATION CREDITS */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase block font-sans">Hạn mức tin nhắn tháng này</span>
                      <span className="text-xs font-mono font-extrabold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                        342 / {freeQueriesLimit.toLocaleString()} tin
                      </span>
                    </div>
                    <p className="text-xs text-slate-550">
                      Hạn mức phản hồi khách hàng tự động thông qua chatbot hoặc cổng Telegram.
                    </p>
                  </div>

                  {/* Visual scale */}
                  <div className="space-y-1.5 mt-4">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                        style={{ width: `${Math.min(100, (342 / freeQueriesLimit) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10.5px] font-medium text-slate-400">
                      <span>Đã sử dụng 34.2%</span>
                      <span>Còn {(freeQueriesLimit - 342).toLocaleString()} tin nhắn</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* SIMULATED DISASTER CHECKOUT ZONE (Render when active) */}
              {checkoutPlan && (
                <div className="bg-slate-900 text-white rounded-2xl p-6 border-2 border-indigo-500 relative overflow-hidden p-6 md:p-8 shadow-2xl animate-fade-in space-y-6">
                  <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-4 py-1 rounded-bl uppercase tracking-widest font-sans">
                    Thanh Toán Thử Nghiệm Hoá Đơn SaaS
                  </div>

                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-5 gap-4">
                    <div>
                      <h3 className="text-lg md:text-xl font-black flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                        Nâng Cấp Gói: {checkoutPlan === 'pro' ? 'BalaBot Premium Pro ⭐' : 'BalaBot Enterprise 👑'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Sở hữu toàn bộ những đặc quyền, hạ tầng tốc độ cao và mở khóa tối đa API tri thức.
                      </p>
                    </div>

                    <div className="text-right">
                      {checkoutPlan === 'pro' ? (
                        <div>
                          <span className="text-2xl md:text-3xl font-black text-indigo-400">
                            {billingCycle === 'yearly' ? '3.992.000 VNĐ' : '499.000 VNĐ'}
                          </span>
                          <span className="text-xs text-slate-400 block mt-0.5">
                            {billingCycle === 'yearly' ? 'Nạp 1 lần / năm (Mua 10 tặng 2 tháng)' : 'Thanh toán theo chu kỳ tháng'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xl font-black text-rose-450 uppercase">Phục vụ may đo theo yêu cầu</span>
                      )}
                    </div>
                  </div>

                  {checkoutCompleted ? (
                    <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-250 p-6 rounded-xl text-center space-y-4 animate-scale-in">
                      <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                        <Check className="w-7 h-7" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base text-white">Kích Hoạt Quyền Lợi Gói Pro Thành Công</h4>
                        <p className="text-xs text-slate-350 mt-1 max-w-lg mx-auto">
                          Hệ thống đã tự động nâng cấp thiết lập tài khoản của bạn. Mọi ranh giới của gói miễn phí đã được gỡ bỏ ngay lập tức thời gian thực.
                        </p>
                      </div>
                      <div className="flex justify-center gap-3 pt-2">
                        <button
                          onClick={() => {
                            setCheckoutCompleted(false);
                            setCheckoutPlan(null);
                          }}
                          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer font-sans"
                        >
                          Quay lại Dashboard Quản Lý
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      {/* Left Block: Payment Instruction */}
                      <div className="space-y-4 text-xs font-normal">
                        <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          Quyền lợi nhận được ngay sau khi Duyệt:
                        </h4>
                        
                        <ul className="space-y-2 text-slate-300">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Mở rộng hạn mức lên tới <strong>25.000 tin nhắn sỉ / tháng</strong>.</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Không giới hạn số lượng Trợ lý ảo AI tạo mới song song.</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Liên kết trực tiếp cơ sở dữ liệu bán hàng Supabase / Excel tri thức.</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Tạo nhãn trắng tùy biến thương hiệu riêng (White Label).</span>
                          </li>
                        </ul>

                        <div className="bg-indigo-950/50 p-3.5 rounded-xl border border-indigo-900/40 text-[11px] text-slate-350 leading-relaxed text-left">
                          <span className="font-extrabold text-white block mb-0.5">Thông báo mô phỏng luồng thanh toán:</span>
                          Không sài tiền thật để kích hoạt. Bạn chỉ cần điền nhanh thẻ Visa mô phỏng dưới đây hoặc bấm xác nhận để hệ thống chuyển đổi quyền hạn lập tức!
                        </div>
                      </div>

                      {/* Right Block: Simulated Payment Interface */}
                      <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                        <div className="space-y-3 text-left">
                          <div>
                            <label className="text-[10.5px] font-bold text-slate-400 block mb-1 uppercase tracking-wide">Tên chủ thẻ (Hoặc Tên Công Ty):</label>
                            <input
                              type="text"
                              required
                              value={simulatedCardHolder}
                              onChange={(e) => setSimulatedCardHolder(e.target.value)}
                              placeholder="NGUYEN VAN A"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10.5px] font-bold text-slate-400 block mb-1 uppercase tracking-wide">Số Thẻ Visa / Master:</label>
                              <input
                                type="text"
                                value={simulatedCardNumber}
                                onChange={(e) => setSimulatedCardNumber(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-bold text-slate-400 block mb-1 uppercase tracking-wide">Mã PIN/CVV:</label>
                              <input
                                type="password"
                                defaultValue="***"
                                disabled
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white opacity-60 font-mono"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCheckoutPlan(null);
                              setCheckoutCompleted(false);
                            }}
                            className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center"
                          >
                            Hủy Bỏ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!simulatedCardHolder.trim()) {
                                alert("Vui lòng nhập tên chủ thẻ để ghi nhận hóa đơn hệ thống nha bạn!");
                                return;
                              }
                              setCheckoutCompleted(true);
                            }}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold transition-colors cursor-pointer text-center"
                          >
                            Xác Nhận Thanh Toán
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* THREE PILLARS SAAS MARKETING PRICING LAYOUT */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6">
                
                {/* CYCLIC SELECTOR */}
                <div className="text-center max-w-lg mx-auto space-y-3">
                  <h3 className="font-extrabold text-slate-800 text-sm tracking-widest uppercase font-sans">
                    BÀNG GIÁ THÀNH VIÊN CO-BRANDED ĐỒNG BỘ REAL-TIME
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Áp dụng công nghệ Product-Led Growth. Bạn có thể tự do trải nghiệm gói tiêu chuẩn hoặc bứt phá không giới hạn với cấu trúc nâng cao.
                  </p>

                  {/* Cycle Switch Button */}
                  <div className="inline-flex items-center gap-1.5 bg-slate-200/60 p-1.5 rounded-full border border-slate-300/40 mt-1">
                    <button
                      onClick={() => setBillingCycle('monthly')}
                      className={`text-[11px] font-bold px-4 py-1.5 rounded-full transition-all cursor-pointer ${billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Thanh toán theo tháng
                    </button>
                    <button
                      onClick={() => setBillingCycle('yearly')}
                      className={`text-[11px] font-bold px-4 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1 ${billingCycle === 'yearly' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      <span>Trả theo năm</span>
                      <span className="bg-rose-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase scale-90">
                        🎁 Giảm 20%
                      </span>
                    </button>
                  </div>
                </div>

                {/* THE 3 COLUMNS CARD GRID */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                      
                  {/* CARD 1: EXTREMELY POLISHED FREE PLAN */}
                  <div className="bg-white rounded-2xl border-2 border-emerald-500 p-6 shadow-sm space-y-5 flex flex-col justify-between relative overflow-hidden text-left hover:shadow-md transition-shadow">
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl uppercase tracking-widest font-sans">
                      Quyền lợi đang áp dụng
                    </div>

                    <div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block font-sans">GÓI TRẢI NGHIỆM</span>
                        <h4 className="font-extrabold text-slate-800 text-lg mt-0.5">Free Standard</h4>
                      </div>

                      <div className="my-4">
                        <span className="text-3xl font-black text-slate-900">0 VNĐ</span>
                        <span className="text-xs text-slate-400 font-semibold block mt-1">Cam kết miễn phí hào phóng trọn đời</span>
                      </div>

                      {/* FEATURE LIST */}
                      <div className="space-y-3 text-[12px] border-t border-slate-100 pt-4">
                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span>Hạn mức tối đa <strong>{freeQueriesLimit.toLocaleString()}</strong> tin nhắn/tháng</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span>Vận hành đồng thời <strong>{freeBotsLimit} bot</strong> AI hỗ trợ bán hàng</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          {freeTelegramIntegration ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[9px] shrink-0">✕</span>
                          )}
                          <span className={freeTelegramIntegration ? 'text-slate-700 font-medium' : 'text-slate-400 line-through'}>Tích hợp Telegram Bot (Đồng bộ real-time)</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          {freePdfTraining ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[9px] shrink-0">✕</span>
                          )}
                          <span className={freePdfTraining ? 'text-slate-700 font-medium' : 'text-slate-400 line-through'}>Nạp tài liệu tri thức sâu (PDF/Excel)</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          {freeRealtimeTakeover ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[9px] shrink-0">✕</span>
                          )}
                          <span className={freeRealtimeTakeover ? 'text-slate-700 font-medium' : 'text-slate-400 line-through'}>Can thiệp live-chat thời gian thực</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          {freeAnalytics ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[9px] shrink-0">✕</span>
                          )}
                          <span className={freeAnalytics ? 'text-slate-700 font-medium' : 'text-slate-400 line-through'}>Báo cáo Insights hành vi người mua</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 space-y-2.5 mt-4">
                      <button disabled className="w-full py-2.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold font-sans cursor-default text-center block">
                        Kế Hoạch Khởi Hành Đang Kích Hoạt
                      </button>
                    </div>
                  </div>

                  {/* CARD 2: PRO PLAN FOR HEAVY GROWTH */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 flex flex-col justify-between text-left hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl uppercase tracking-widest font-sans group-hover:bg-indigo-700 transition-colors">
                      PHÙ HỢP CHO DOANH NGHIỆP
                    </div>

                    <div>
                      <div>
                        <span className="text-[10px] text-indigo-500 font-extrabold uppercase tracking-wider block font-sans">KHUYÊN DÙNG PHÁT TRIỂN TIẾP TRẬN</span>
                        <h4 className="font-extrabold text-slate-800 text-lg mt-0.5">BalaBot Premium Pro</h4>
                      </div>

                      <div className="my-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-indigo-600">
                            {billingCycle === 'yearly' ? '332.000 VNĐ' : '499.000 VNĐ'}
                          </span>
                          <span className="text-slate-400 text-xs font-semibold">/ tháng</span>
                        </div>
                        <span className="text-xs text-slate-400 font-semibold block mt-1">
                          {billingCycle === 'yearly' ? 'Tiết kiệm 20% (Thanh toán hằng năm)' : 'Thanh toán trực quan giản đơn linh động'}
                        </span>
                      </div>

                      <div className="space-y-3 text-[12px] border-t border-slate-100 pt-4">
                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>Mở khóa <strong>25.000 tin nhắn sỉ / tháng</strong> (Phản hồi tức thì)</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span><strong>Không giới hạn</strong> số lượng Bot AI khởi tạo cùng lúc</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>Liên kết hạ tầng Supabase / Cloud lưu dữ liệu riêng</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>Đầu ra cấu hình Webhooks nâng cao kết xuất hóa đơn</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>Nhãn trắng tùy chọn thương hiệu (Xóa bỏ Powered by BalaBot)</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>Hỗ trợ setup, tinh chỉnh kịch bản bởi chuyên gia 24/7</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4">
                      <button
                        onClick={() => {
                          setCheckoutPlan('pro');
                          setCheckoutCompleted(false);
                        }}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-slate-900 hover:text-white text-white rounded-lg text-xs font-bold transition-all cursor-pointer text-center font-sans tracking-wide"
                      >
                        Nâng Cấp Bản Pro Ngay
                      </button>
                    </div>
                  </div>

                  {/* CARD 3: ENTERPRISE PLAN FOR TAILORED SOLUTIONS */}
                  <div className="bg-gradient-to-b from-white to-slate-50/40 rounded-2xl border border-rose-200 p-6 shadow-sm space-y-5 flex flex-col justify-between text-left hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-rose-500 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl uppercase tracking-widest font-sans">
                      DÀNH CHO ĐƠN VỊ LỚN
                    </div>

                    <div>
                      <div>
                        <span className="text-[10px] text-rose-500 font-extrabold uppercase tracking-wider block font-sans">MAY ĐO ĐỘC QUYỀN HẠ TẦNG</span>
                        <h4 className="font-extrabold text-slate-800 text-lg mt-0.5">BalaBot Enterprise</h4>
                      </div>

                      <div className="my-4">
                        <span className="text-2xl font-black text-rose-600 block uppercase">Thỏa thuận trực tiếp</span>
                        <span className="text-xs text-slate-400 font-semibold block mt-1">Lắp ráp trạm vệ tinh đám mây riêng biệt hoàn toàn</span>
                      </div>

                      <div className="space-y-3 text-[12px] border-t border-slate-100 pt-4">
                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Nhận gói tin nhắn sỉ <strong>Tùy biến & Vô giới hạn</strong></span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Cơ sở hạ tầng 100% On-Premise bảo vệ nguồn cung độc quyền</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Custom riêng tư Mô hình ngôn ngữ lớn tinh chỉnh chuyên sâu</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Tích hợp cổng ERP doanh nghiệp nội bộ rộng lớn, SAP, CRM</span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Ký kết thỏa thuận chất lượng vận hành <strong>SLA 99.99% Uptime</strong></span>
                        </div>

                        <div className="flex items-center gap-2.5 text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Được kỹ sư đồng hành huấn luyện AI theo dữ liệu bí mật</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4">
                      <button
                        onClick={() => alert("📞 Vui lòng gửi email đến ox102.crypto@gmail.com hoặc gọi Hotline ưu tiên của BalaBot để được tư vấn thiết kế giải pháp Enterprise tức thì!")}
                        className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer text-center font-sans tracking-wide"
                      >
                        LIÊN HỆ TƯ VẤN DOANH NGHIỆP
                      </button>
                    </div>
                  </div>

                </div>

                {/* FAQ BILLING SECTION FOR TRUST */}
                <div className="pt-6 border-t border-slate-200 mt-4 text-left space-y-4">
                  <h4 className="font-extrabold text-slate-800 text-xs tracking-wider uppercase flex items-center gap-2 font-sans">
                    <HelpCircle className="w-4 h-4 text-amber-500" />
                    BẢO MẬT & MỘT SỐ CÂU HỎI THƯỜNG GẶP
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <span className="font-extrabold text-slate-800 block">Q: Gói cước Standard miễn phí có bị tính phí phát sinh không?</span>
                      <p className="text-slate-500 leading-relaxed text-[11px]">
                        Không. Định kỳ hằng tháng bạn sẽ nhận đủ 1.000 lượt phản hồi và 1 chatbot trợ sĩ hoàn toàn miễn phí mà không cần gắn bất kỳ thẻ tín dụng.
                      </p>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <span className="font-extrabold text-slate-800 block">Q: Dữ liệu đào tạo đại lý của tôi có được bảo mật tuyệt đối không?</span>
                      <p className="text-slate-500 leading-relaxed text-[11px]">
                        Có. BalaBot sử dụng phân mảnh cơ sở tri thức riêng biệt cho từng Bot, cam kết không dùng chung dữ liệu của đại lý này để cung cấp tri thức cho các đại lý khác.
                      </p>
                    </div>
                  </div>
                </div>

              </div>

              {/* COLLAPSIBLE ADMIN SIMULATOR PANEL (TIDILY NESTED & ELEGANT) */}
              <div className="bg-slate-50 rounded-xl border border-slate-250/80 p-5 mt-6 animate-fade-in relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-200 rounded-lg text-slate-700">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm font-sans flex items-center gap-2">
                        ⚙️ Bảng Điều Khiển Cấu Hình Monetization (Dành cho Admin)
                        <span className="bg-indigo-100 text-indigo-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">Mô phỏng động</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Tính năng đặc quyền để nhà sáng lập mô phỏng trực quan cơ chế phân mức tính năng cho khách hàng.
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setShowAdminConfig(!showAdminConfig)}
                    className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold transition-all text-slate-700 cursor-pointer flex items-center gap-1.5 font-sans"
                  >
                    {showAdminConfig ? "Thu Gọn Lại" : "Bật Trình Giả Lập"}
                  </button>
                </div>

                {showAdminConfig && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start border-t border-slate-200 pt-5 mt-5 text-left animate-slide-up">
                    
                    {/* SIMULATOR INPUTS - LEFT SIDE (6 col) */}
                    <div className="lg:col-span-6 space-y-4">
                      <h5 className="text-xs font-bold text-slate-800 tracking-wider uppercase font-sans">
                        Tùy Biến Ranh Giới Gói Miễn Phí (SaaS Tier Setting)
                      </h5>
                      
                      {/* SLIDER 1: QUERIES LIMIT */}
                      <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-700">Hạn mức tin nhắn Free:</span>
                          <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-extrabold text-xs">
                            {freeQueriesLimit === 10000 ? "Không giới hạn (10.000+)" : `${freeQueriesLimit.toLocaleString()} tin nhắn`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="200"
                          max="10000"
                          step="100"
                          value={freeQueriesLimit}
                          onChange={(e) => setFreeQueriesLimit(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold font-sans">
                          <span>200 (Hạn chế cũ)</span>
                          <span className="text-emerald-600 font-extrabold">Hiện tại: {freeQueriesLimit.toLocaleString()} tin</span>
                          <span>10.000</span>
                        </div>
                      </div>

                      {/* SLIDER 2: BOTS LIMIT */}
                      <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-700">Hạn mức số lượng Bot Free được tạo:</span>
                          <span className="font-mono text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-extrabold text-xs">
                            {freeBotsLimit} Bot
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={freeBotsLimit}
                          onChange={(e) => setFreeBotsLimit(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold font-sans">
                          <span>1 Bot (Cơ bản)</span>
                          <span className="text-emerald-600 font-extrabold">🍀 Hiện tại: {freeBotsLimit} Bot</span>
                          <span>10 Bots</span>
                        </div>
                      </div>
                    </div>

                    {/* FEATURES SWITCHES - RIGHT SIDE (6 col) */}
                    <div className="lg:col-span-6 space-y-3">
                      <h5 className="text-xs font-bold text-slate-800 tracking-wider uppercase font-sans">
                        Bật / Tắt Tiện Ích Cao Cấp Đưa Xuống Bản Free
                      </h5>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* TOGGLE 1 */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white">
                          <div>
                            <span className="text-xs font-bold text-slate-750 block">Telegram Link</span>
                          </div>
                          <button
                            onClick={() => setFreeTelegramIntegration(!freeTelegramIntegration)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${freeTelegramIntegration ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${freeTelegramIntegration ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* TOGGLE 2 */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white">
                          <div>
                            <span className="text-xs font-bold text-slate-755 block">Đào tạo file PDF</span>
                          </div>
                          <button
                            onClick={() => setFreePdfTraining(!freePdfTraining)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${freePdfTraining ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${freePdfTraining ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* TOGGLE 3 */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white">
                          <div>
                            <span className="text-xs font-bold text-slate-755 block">Live chat takeover</span>
                          </div>
                          <button
                            onClick={() => setFreeRealtimeTakeover(!freeRealtimeTakeover)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${freeRealtimeTakeover ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${freeRealtimeTakeover ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* TOGGLE 4 */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white">
                          <div>
                            <span className="text-xs font-bold text-slate-755 block">Báo cáo Phân tích</span>
                          </div>
                          <button
                            onClick={() => setFreeAnalytics(!freeAnalytics)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${freeAnalytics ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${freeAnalytics ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      </div>

                      {/* TEXTAREA FOR ANNOUNCEMENTS */}
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[10.5px] font-bold text-slate-600 block text-left">Ghi chú đặc quyền gói đang dùng:</label>
                        <textarea
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                          rows={2}
                          value={customPlanNotes}
                          onChange={(e) => setCustomPlanNotes(e.target.value)}
                        />
                      </div>

                      <div className="flex gap-2 pt-1.5">
                        <button
                          onClick={() => {
                            setFreeQueriesLimit(1000);
                            setFreeBotsLimit(1);
                            setFreeTelegramIntegration(true);
                            setFreePdfTraining(true);
                            setFreeRealtimeTakeover(true);
                            setFreeAnalytics(true);
                            setCustomPlanNotes("Đặc quyền cam kết: Ưu đãi trọn đời dành cho các đối tác doanh nghiệp triển khai quy mô lớn.");
                            alert("Đã khôi phục các mức mô phỏng về chuẩn: 1.000 tin nhắn sỉ / tháng và 1 bot hoạt động!");
                          }}
                          className="flex-1 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[11px] font-bold text-slate-600 transition-colors cursor-pointer text-center font-sans"
                        >
                          Khôi Phục Gốc
                        </button>
                        <button
                          onClick={() => {
                            alert("Đồng bộ hóa cấu hình monetization thành công. Toàn bộ trải nghiệm khách hàng sẽ cập nhật theo cấu trúc mới.");
                          }}
                          className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer text-center font-sans animate-pulse"
                        >
                          Lưu Cài Đặt Hệ Thống
                        </button>
                      </div>
                    </div>

                    {/* CUSTOMER DIRECTORY & MANUAL PACKAGE ASSIGNER */}
                    <div className="border-t border-slate-200 pt-6 mt-6 col-span-12 space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                        <div>
                          <h5 className="text-xs font-bold text-slate-800 tracking-wider uppercase font-sans flex items-center gap-1.5">
                            👥 CƠ SỞ DỮ LIỆU KHÁCH HÀNG & PHÂN HẠN MỨC GÓI CƯỚC THỦ CÔNG
                          </h5>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Quản trị viên có quyền ghi đè, nâng cấp gói VIP Pro hoặc điều chỉnh lưu lượng tin nhắn cho từng đại lý/khách hàng đặc thù.
                          </p>
                        </div>
                        <div className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg font-mono shrink-0">
                          Tổng số: {simulatedCustomers.length} đại lý
                        </div>
                      </div>

                      {/* QUICK ADD CUSTOMER FORM */}
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                        <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest block font-sans">
                          ➕ Thêm nhanh khách hàng mới vào hệ thống quản lý
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <input
                              type="text"
                              placeholder="Tên khách hàng / Đại lý"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <input
                              type="email"
                              placeholder="Địa chỉ Email"
                              value={newCustomerEmail}
                              onChange={(e) => setNewCustomerEmail(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Số điện thoại"
                              value={newCustomerPhone}
                              onChange={(e) => setNewCustomerPhone(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={newCustomerTier}
                              onChange={(e) => setNewCustomerTier(e.target.value as any)}
                              className="bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-left shrink-0"
                            >
                              <option value="free">Gói Free Standard</option>
                              <option value="pro">Gói Premium Pro</option>
                              <option value="enterprise">Gói Enterprise</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                if (!newCustomerName || !newCustomerEmail) {
                                  alert('Vui lòng nhập Tên và Email để khởi tạo khách hàng!');
                                  return;
                                }
                                const limitMap = { free: 1000, pro: 25000, enterprise: 150000 };
                                const newC = {
                                  name: newCustomerName,
                                  email: newCustomerEmail,
                                  phone: newCustomerPhone || 'N/A',
                                  tier: newCustomerTier,
                                  messageLimit: limitMap[newCustomerTier],
                                  joinedDate: new Date().toLocaleDateString('vi-VN')
                                };
                                fetch('/api/admin/customers', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() },
                                  body: JSON.stringify({ ...newC, password: newCustomerPassword, status: 'active' })
                                })
                                  .then(res => {
                                    if (!res.ok) throw new Error('Không có quyền hoặc tạo khách hàng thất bại');
                                    return res.json();
                                  })
                                  .then(addedCust => {
                                    setSimulatedCustomers(prev => [...prev, addedCust]);
                                    setNewCustomerName('');
                                    setNewCustomerEmail('');
                                    setNewCustomerPhone('');
                                    alert(`Khởi tạo thành công khách hàng mới: ${addedCust.name} (${addedCust.tier.toUpperCase()}).`);
                                  })
                                  .catch(err => {
                                    console.error("Lỗi khởi tạo khách hàng:", err);
                                    alert("Đã xảy ra lỗi khi tạo khách hàng.");
                                  });
                              }}
                              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer shrink-0 font-sans"
                            >
                              Khởi Tạo
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* DATATABLE LIST */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-550 font-sans font-bold text-[10.5px] uppercase tracking-wider">
                                <th className="p-3 pl-4">Khách hàng / Đại lý</th>
                                <th className="p-3">Gói dịch vụ</th>
                                <th className="p-3">Hạn mức tin nhắn / tháng</th>
                                <th className="p-3 text-right pr-4">Hành động nâng / hạ gói thủ công</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {simulatedCustomers.map((c) => {
                                let badgeClass = "bg-slate-100 text-slate-800 border-slate-200";
                                if (c.tier === 'pro') badgeClass = "bg-indigo-50 text-indigo-750 border-indigo-205 font-extrabold";
                                else if (c.tier === 'enterprise') badgeClass = "bg-rose-50 text-rose-700 border-rose-250 font-black animate-pulse";

                                return (
                                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-3 pl-4">
                                      <div className="font-bold text-slate-800">{c.name}</div>
                                      <div className="text-[10px] text-slate-400 font-semibold">{c.email} • {c.phone} • Tham gia: {c.joinedDate}</div>
                                    </td>
                                    <td className="p-3">
                                      <span className={`px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider border font-sans ${badgeClass}`}>
                                        {c.tier === 'free' ? 'Standard Free' : c.tier === 'pro' ? 'Premium Pro ⭐' : 'Enterprise 👑'}
                                      </span>
                                    </td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="number"
                                          value={c.messageLimit}
                                          onChange={(e) => {
                                            const val = Number(e.target.value);
                                            handleUpdateCustomer(c.id, { messageLimit: val });
                                          }}
                                          className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 font-mono text-center focus:bg-white focus:outline-none"
                                        />
                                        <span className="text-[10px] text-slate-400">tin / tháng</span>
                                      </div>
                                    </td>
                                    <td className="p-3 text-right pr-4">
                                      <div className="inline-flex gap-1">
                                        <button
                                          onClick={() => {
                                            handleUpdateCustomer(c.id, { tier: 'free', messageLimit: 1000 });
                                            alert(`Đã hạ cấp thủ công tài khoản ${c.name} về gói Standard Free (Giới hạn 1,000 tin).`);
                                          }}
                                          disabled={c.tier === 'free'}
                                          className={`px-2 py-1 rounded text-[10px] font-bold transition-colors font-sans cursor-pointer ${c.tier === 'free' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                        >
                                          Hạ Free
                                        </button>
                                        <button
                                          onClick={() => {
                                            handleUpdateCustomer(c.id, { tier: 'pro', messageLimit: 25000 });
                                            alert(`Đã nâng cấp thủ công tài khoản ${c.name} lên gói Premium Pro (Hạn mức 25,000 tin nhắn).`);
                                          }}
                                          disabled={c.tier === 'pro'}
                                          className={`px-2 py-1 rounded text-[10px] font-bold transition-colors font-sans cursor-pointer ${c.tier === 'pro' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'}`}
                                        >
                                          Lên Pro ⭐
                                        </button>
                                        <button
                                          onClick={() => {
                                            handleUpdateCustomer(c.id, { tier: 'enterprise', messageLimit: 150000 });
                                            alert(`Đã nâng cấp thủ công tài khoản ${c.name} lên gói Enterprise (Hạn mức 150,000 tin nhắn).`);
                                          }}
                                          disabled={c.tier === 'enterprise'}
                                          className={`px-2 py-1 rounded text-[10px] font-bold transition-colors font-sans cursor-pointer ${c.tier === 'enterprise' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'}`}
                                        >
                                          Lên Enterprise 👑
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (confirm(`Bạn chắc chắn muốn xóa khách hàng ${c.name} khỏi simulator?`)) {
                                              handleDeleteCustomer(c.id);
                                            }
                                          }}
                                          className="p-1 hover:bg-rose-50 text-slate-450 hover:text-rose-500 rounded transition-colors cursor-pointer"
                                          title="Xóa khách hàng"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* PHYSICAL METHOD STATEMENT WITH REAL SUPABASE INSTRUCTIONS */}
                      <div className="bg-blue-50/50 border border-blue-150 rounded-xl p-4.5 space-y-2 text-left">
                        <span className="font-extrabold text-blue-800 text-xs uppercase tracking-wide block font-sans">
                          HƯỚNG DẪN THỰC TẾ TRÊN SUPABASE CLOUD (KHI MUỐN NÂNG CẤP THẬT)
                        </span>
                        <p className="text-[11.5px] text-slate-600 leading-relaxed">
                          Trong môi trường vận hành thực tế (Production), dữ liệu khách hàng sẽ được liên kết trực tiếp với Supabase. Khi khách hàng mua gói, bạn có thể phân gói bằng 2 phương pháp thủ công:
                        </p>
                        <ul className="list-disc pl-5 text-[11px] text-slate-500 space-y-1">
                          <li>
                            <strong>Phương pháp 1: Chỉnh sửa trực tiếp trên Supabase Dashboard User Metadata (Không cần viết code)</strong>:
                            Vào mục <strong>Authentication -&gt; Users</strong> trong Supabase dashboard, tìm tài khoản của khách hàng, click chọn "Edit User Metadata" và sửa nội dung JSON lưu cấu hình ví dụ:
                            <code className="bg-slate-150 text-slate-805 px-1 rounded font-mono mx-1 text-[10px]">{"{\"tier\": \"pro\", \"message_limit\": 25000}"}</code>.
                          </li>
                          <li>
                            <strong>Phương pháp 2: Chạy câu lệnh SQL cập nhật</strong>:
                            Nhập mục <strong>SQL Editor</strong> tại Supabase Dashboard và thực thi câu lệnh SQL nâng cấu trúc tức thì:
                          </li>
                        </ul>
                        <pre className="bg-slate-950 text-emerald-400 p-3 rounded-lg font-mono text-[10px] overflow-x-auto text-left leading-relaxed">
{`-- Cập nhật gói Premium Pro và Set hạn mức 25,000 tin nhắn cho khách hàng cụ thể
UPDATE public.profiles 
SET tier = 'pro', message_limit = 25000, updated_at = NOW() 
WHERE email = 'customer-email@example.com';`}
                        </pre>
                      </div>
                    </div>

                  </div>
                )}
              </div>

            </div>
          )}

          {(activeTab === 'schedules' || (activeTab === 'telegram' && telegramPanel === 'schedules')) && (
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
                {([['list', 'Danh sách', Calendar], ['create', 'Tạo mới', Plus], ['logs', 'Lịch sử gửi', History]] as [string, string, any][]).map(([key, label, Icon]) => (
                  <button key={key} onClick={() => setSchedTab(key as any)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${schedTab === key ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
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
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${sched.status === 'active' ? 'bg-green-50 text-green-600 border-green-200' : sched.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                  {sched.status === 'active' ? 'Hoạt động' : sched.status === 'paused' ? 'Tạm dừng' : sched.status === 'completed' ? 'Hoàn thành' : sched.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-slate-600">{sched.triggerCount}{sched.maxTriggers ? `/${sched.maxTriggers}` : ''}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={async () => { await fetch(`/api/schedules/${sched.id}/toggle`, { method: 'PUT' }); const r = await fetch(`/api/bots/${selectedBotId}/schedules`); setSchedules(await r.json()); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" title={sched.status === 'active' ? 'Tạm dừng' : 'Bật lại'}>
                                    <Power className={`w-3.5 h-3.5 ${sched.status === 'active' ? 'text-green-500' : 'text-slate-400'}`} />
                                  </button>
                                  <button onClick={async () => { if (!confirm('Gửi nhắc nhở ngay?')) return; await fetch(`/api/schedules/${sched.id}/trigger-now`, { method: 'POST' }); const r = await fetch(`/api/bots/${selectedBotId}/schedules`); setSchedules(await r.json()); const lr = await fetch(`/api/bots/${selectedBotId}/reminder-logs`); setRemLogs(await lr.json()); alert('Đã gửi!'); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" title="Gửi ngay">
                                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                                  </button>
                                  <button onClick={async () => { if (!confirm('Xóa lịch nhắc?')) return; await fetch(`/api/schedules/${sched.id}`, { method: 'DELETE' }); setSchedules(p => p.filter(s => s.id !== sched.id)); }} className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title="Xóa">
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
                      const res = await fetch(`/api/bots/${selectedBotId}/schedules`, {
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
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nhóm Telegram nhận nhắc</label>
                        <button type="button" onClick={async () => {
                          if (!selectedBotId) return;
                          try {
                            const r = await fetch(`/api/bots/${selectedBotId}/telegram-groups`);
                            const d = await r.json();
                            setTgGroups(d.groups || []);
                          } catch { /* ignore */ }
                        }} className="text-[10px] font-semibold text-teal-600 hover:text-teal-700 cursor-pointer">↻ Làm mới</button>
                      </div>
                      {tgGroups.length > 0 ? (
                        <div className="space-y-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50/50 max-h-40 overflow-y-auto">
                          {tgGroups.map(g => {
                            const selected = schedForm.targetChatIds.split(',').map(s => s.trim()).filter(Boolean);
                            const checked = selected.includes(g.chatId);
                            return (
                              <label key={g.chatId} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white cursor-pointer text-sm">
                                <input type="checkbox" checked={checked} onChange={() => {
                                  const next = checked ? selected.filter(id => id !== g.chatId) : [...selected, g.chatId];
                                  setSchedForm({ ...schedForm, targetChatIds: next.join(', ') });
                                }} className="accent-teal-600" />
                                <span className="font-medium text-slate-700 flex-1 min-w-0 truncate">{g.title}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{g.chatId}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-300 rounded-lg p-3 text-center text-[11px] text-slate-400">
                          Chưa thấy nhóm nào. Thêm bot vào nhóm Telegram, gửi 1 tin nhắn trong nhóm, rồi bấm <b>Làm mới</b>.
                        </div>
                      )}
                      <details className="mt-2">
                        <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">Hoặc nhập Chat ID thủ công</summary>
                        <input type="text" placeholder="VD: -100123456789, -100987654321" value={schedForm.targetChatIds} onChange={e => setSchedForm({ ...schedForm, targetChatIds: e.target.value })}
                          className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" />
                      </details>
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
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${schedForm.aiTone === tone ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'}`}>
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

              {/* LOGS TAB */}
              {schedTab === 'logs' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-teal-500" />Lịch Sử Nhắc Nhở Đã Gửi</h3>
                    <button onClick={async () => { const r = await fetch(`/api/bots/${selectedBotId}/reminder-logs`); setRemLogs(await r.json()); }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1">
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
                        <div key={log.id} className={`bg-white rounded-xl border p-4 ${log.status === 'sent' ? 'border-green-200' : log.status === 'failed' ? 'border-rose-200' : 'border-slate-200'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${log.status === 'sent' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
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

          {(activeTab === 'train-schedules' || (activeTab === 'telegram' && telegramPanel === 'train-schedules')) && (
            <div className="space-y-6 animate-fade-in text-left">
              {/* HEADER BANNER */}
              <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-slate-800 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-xl">
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
                  <Sparkles className="w-80 h-80 text-teal-400 rotate-12" />
                </div>
                <div className="relative z-10 max-w-4xl">
                  <h2 className="text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-3">
                    <Sparkles className="w-6 h-6 text-teal-400" />
                    Đào Tạo Lịch Nhắc Tự Động (AI)
                  </h2>
                  <p className="text-slate-400 text-xs md:text-sm mt-2 max-w-2xl">
                    Nạp file quy trình hoặc viết mô tả quy trình bằng ngôn ngữ tự do. AI sẽ tự động phân tích thời gian và nội dung để sinh ra các lịch nhắc Telegram tương ứng.
                  </p>
                </div>
              </div>

              {/* UPLOAD & PARSE SECTIONS */}
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
                        const res = await fetch(`/api/bots/${selectedBotId}/schedules/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: schedUploadFile.name, fileData: base64 }) });
                        const data = await res.json();
                        if (data.success) {
                          setSchedules(prev => [...data.schedules, ...prev]);
                          alert(`Nạp thành công ${data.totalParsed} lịch nhắc!`);
                          setSchedUploadFile(null);
                          setActiveTab('telegram');
                          setTelegramPanel('schedules');
                          setSchedTab('list');
                        }
                        else { alert('Lỗi: ' + (data.errors?.join(', ') || 'Không thể parse')); }
                      } catch (err) { alert('Lỗi: ' + err); }
                      setSchedLoading(false);
                    };
                    reader.readAsDataURL(schedUploadFile);
                  }} className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer font-bold">
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
                      const res = await fetch(`/api/bots/${selectedBotId}/schedules/parse-text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: schedParseText }) });
                      const data = await res.json();
                      if (data.success) {
                        setSchedules(prev => [...data.schedules, ...prev]);
                        alert(`AI trích xuất thành công ${data.totalParsed} lịch nhắc!`);
                        setSchedParseText('');
                        setActiveTab('telegram');
                        setTelegramPanel('schedules');
                        setSchedTab('list');
                      }
                      else { alert('Lỗi: ' + (data.errors?.join(', ') || 'AI không thể phân tích')); }
                    } catch (err) { alert('Lỗi: ' + err); }
                    finally { setSchedLoading(false); }
                  }} className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer font-bold">
                    {schedLoading ? <><RefreshCw className="w-4 h-4 animate-spin" />AI đang phân tích...</> : <><Sparkles className="w-4 h-4" />AI Parse & Tạo Lịch Nhắc</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin' && sbUser?.email === ADMIN_EMAIL && (

            <div className="space-y-6 animate-fade-in text-left">
              {/* HEADER BANNER */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-700/50 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-xl">
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
                  <Shield className="w-80 h-80 text-white rotate-12" />
                </div>
                
                <div className="relative z-10 max-w-4xl">
                  <span className="bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block font-sans">
                    HỆ THỐNG QUẢN TRỊ TỐI CAO • ĐỘC QUYỀN FOUNDER
                  </span>
                  <h2 className="text-xl md:text-3xl font-extrabold tracking-normal text-white leading-snug">Cổng Quản Trị Hệ Thống SaaS & Phân Phối Hạn Mức Thủ Công</h2>
                  <p className="text-slate-300 text-xs md:text-sm mt-2 leading-relaxed max-w-2xl">
                    Chủ động ghi đè gói cước, bổ sung lưu lượng tin nhắn cho các đại lý VIP, kiểm soát ranh giới người dùng và tra cứu cấu trúc Mô-đun Cơ sở dữ liệu thực sự tương tác với API Supabase.
                  </p>
                </div>
              </div>

              {/* TOP AGGREGATE STATS STRIP */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase font-sans">Tổng Số Đại Lý Đăng Ký</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-slate-800">{simulatedCustomers.length}</span>
                    <span className="text-[10.5px] text-emerald-600 font-bold">HTX / Doanh nghiệp</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase font-sans">Tài khoản Premium Pro</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-indigo-600">
                      {simulatedCustomers.filter(c => c.tier === 'pro').length}
                    </span>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded uppercase font-semibold">Active</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase font-sans">Đại diện Enterprise</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-rose-600 font-extrabold">
                      {simulatedCustomers.filter(c => c.tier === 'enterprise').length}
                    </span>
                    <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded uppercase font-black animate-pulse">VIP</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase font-sans">Tổng Lượt Phân Bổ / Tháng</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-lg font-black text-slate-800 font-mono">
                      {simulatedCustomers.reduce((acc, curr) => acc + curr.messageLimit, 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">tin nhắn sỉ</span>
                  </div>
                </div>
              </div>

              {/* FULL WIDTH SAAS DIRECTORY PANEL */}
              <div className="grid grid-cols-1 gap-6 items-start">
                
                {/* MAIN COLUMN: USER DIRECTORY & ACTIONS */}
                <div className="space-y-6">
                  
                  {/* DIRECTORY CONSOLE CARD */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-5">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                          👥 Danh Sách Cơ Sở Dữ Liệu Khách Hàng Hoạt Động
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">Thực hiện thay đổi tức thì, hệ thống sẽ tự động chuyển mã lệnh SQL tương ứng xuống máy chủ.</p>
                      </div>
                      
                      {/* Search Bar */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="Tìm nhanh tên, email, sđt..."
                          className="pl-8.5 pr-4 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white text-xs text-slate-755 focus:outline-none rounded-lg w-full sm:w-60 font-sans transition-all"
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* QUICK ADD CUSTOMER IN-LINE WIDGET */}
                    <div className="bg-indigo-50/60 hover:bg-indigo-50/80 border border-indigo-150 rounded-xl p-5 space-y-3.5 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <Plus className="w-4 h-4 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">
                          Cấn nhanh Tài khoản Mới hoặc Đại lý Thử Nghiệm
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
                        <input
                          type="text"
                          placeholder="Tên doanh nghiệp / Người đại diện"
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 placeholder:text-slate-400 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                        />
                        <input
                          type="email"
                          placeholder="Địa chỉ Email (Đăng nhập)"
                          value={newCustomerEmail}
                          onChange={(e) => setNewCustomerEmail(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 placeholder:text-slate-400 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                        />
                        <input
                          type="text"
                          placeholder="Số điện thoại"
                          value={newCustomerPhone}
                          onChange={(e) => setNewCustomerPhone(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 placeholder:text-slate-400 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                        />
                        <input
                          type="password"
                          placeholder="Mật khẩu tạm"
                          value={newCustomerPassword}
                          onChange={(e) => setNewCustomerPassword(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 placeholder:text-slate-400 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                        />
                        <select
                          value={newCustomerTier}
                          onChange={(e) => setNewCustomerTier(e.target.value as 'free' | 'pro' | 'enterprise')}
                          className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (!newCustomerName || !newCustomerEmail) {
                              alert('Vui lòng điền đủ Tên và Email để đăng ký khách hàng!');
                              return;
                            }
                            const limitMap = { free: 1000, pro: 25000, enterprise: 150000 };
                            const defaultLimit = limitMap[newCustomerTier];
                            const newGuest = {
                              name: newCustomerName,
                              email: newCustomerEmail,
                              phone: newCustomerPhone || 'Không có',
                              password: newCustomerPassword,
                              tier: newCustomerTier,
                              messageLimit: defaultLimit,
                              status: 'active',
                              joinedDate: new Date().toLocaleDateString('vi-VN')
                            };
                            fetch('/api/admin/customers', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() },
                              body: JSON.stringify(newGuest)
                            })
                              .then(res => {
                                if (!res.ok) throw new Error('Không có quyền hoặc tạo tài khoản thất bại');
                                return res.json();
                              })
                              .then(addedCust => {
                                setSimulatedCustomers(prev => [...prev, addedCust]);
                                
                                // Log output trigger
                                const logText = `INSERT INTO public.profiles (id, full_name, email, phone, tier, message_limit, created_at) \nVALUES ('${addedCust.id}', '${addedCust.name}', '${addedCust.email}', '${addedCust.phone}', 'free', ${defaultLimit}, NOW());`;
                                setAdminActionLogs(prevLogs => [
                                  { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logText, status: 'SUCCESS' },
                                  ...prevLogs
                                ]);

                                setNewCustomerName('');
                                setNewCustomerEmail('');
                                setNewCustomerPhone('');
                                setNewCustomerPassword('');
                                setNewCustomerTier('free');
                                alert(`Đã tạo thành công khách hàng mới: ${addedCust.name}. Đã ghi nhận vào module SQL profiles.`);
                              })
                              .catch(err => {
                                console.error("Lỗi tạo khách hàng phụ:", err);
                                alert("Đã xảy ra lỗi khi đăng ký khách hàng trên máy chủ.");
                              });
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors font-sans w-full text-center flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shadow-xs"
                        >
                          Cấp Tài Khoản
                        </button>
                      </div>
                    </div>

                    {/* DATATABLE LIST */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-550 font-sans font-bold text-[10.5px] uppercase tracking-wider">
                              <th className="p-3 pl-4">Khách hàng / Đại lý</th>
                              <th className="p-3">Gói dịch vụ</th>
                              <th className="p-3">Trạng thái</th>
                              <th className="p-3">Mật khẩu</th>
                              <th className="p-3">Hạn mức tin nhắn / tháng</th>
                              <th className="p-3 text-right pr-4">Hành động nâng / hạ gói thủ công</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {simulatedCustomers
                              .filter(c => {
                                const searchLower = customerSearch.toLowerCase();
                                return (c.name || '').toLowerCase().includes(searchLower) ||
                                       (c.email || '').toLowerCase().includes(searchLower) ||
                                       (c.phone || '').toLowerCase().includes(searchLower);
                              })
                              .map((c) => {
                                let badgeClass = "bg-slate-100 text-slate-805 border-slate-200";
                                if (c.tier === 'pro') badgeClass = "bg-indigo-50 text-indigo-750 border-indigo-200 font-extrabold";
                                else if (c.tier === 'enterprise') badgeClass = "bg-rose-50 text-rose-700 border-rose-200 font-black animate-pulse";

                                return (
                                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-3 pl-4 text-left">
                                      <div className="font-bold text-slate-800">{c.name}</div>
                                      <div className="text-[10px] text-slate-400 font-semibold">{c.email} • {c.phone} • Tham gia: {c.joinedDate}</div>
                                    </td>
                                    <td className="p-3 text-left">
                                      <span className={`px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider border font-sans ${badgeClass}`}>
                                        {c.tier === 'free' ? 'Standard Free' : c.tier === 'pro' ? 'Premium Pro ⭐' : 'Enterprise 👑'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-left">
                                      <span className={`px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider border font-bold ${c.status === 'suspended' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                        {c.status === 'suspended' ? 'Đã khóa' : 'Đang hoạt động'}
                                      </span>
                                      <div className="text-[10px] text-slate-400 mt-1">Bot: {c.botsCount || 0}</div>
                                    </td>
                                    <td className="p-3 text-left">
                                      <div className="text-[10px] text-slate-600 font-bold">
                                        {c.passwordSet ? 'Đã thiết lập' : 'Chưa có mật khẩu tạm'}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        {c.passwordUpdatedAt ? new Date(c.passwordUpdatedAt).toLocaleDateString('vi-VN') : 'Không hiển thị mật khẩu thật'}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const password = prompt(`Nhập mật khẩu tạm mới cho ${c.email}`);
                                          if (!password) return;
                                          handleUpdateCustomer(c.id, { email: c.email, passwordSet: true, passwordUpdatedAt: new Date().toISOString(), ...({ password } as any) });
                                          setAdminActionLogs(prevLogs => [
                                            { timestamp: new Date().toLocaleTimeString('vi-VN'), query: `RESET PASSWORD FOR '${c.email}'; -- mật khẩu mới không được hiển thị lại`, status: 'SUCCESS' },
                                            ...prevLogs
                                          ]);
                                        }}
                                        className="mt-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold"
                                      >
                                        Reset mật khẩu
                                      </button>
                                    </td>
                                    <td className="p-3">
                                      <div className="space-y-1 text-left">
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="number"
                                            value={c.messageLimit}
                                            onChange={(e) => {
                                              const val = Number(e.target.value);
                                              handleUpdateCustomer(c.id, { messageLimit: val });
                                              
                                              // Log SQL Statement
                                              const logSQL = `UPDATE public.profiles \nSET message_limit = ${val}, updated_at = NOW() \nWHERE id = '${c.id}';`;
                                              setAdminActionLogs(prevLogs => [
                                                { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logSQL, status: 'SUCCESS' },
                                                ...prevLogs
                                              ]);
                                            }}
                                            className="w-[90px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-755 font-mono text-center focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                          />
                                          <span className="text-[10px] text-slate-400">tin / Mo</span>
                                        </div>
                                        {/* Real usage gauge tháng này */}
                                        {(() => {
                                          const used = Number((c as any).usageThisMonth || 0);
                                          const lim = Number(c.messageLimit) || 0;
                                          const pct = lim > 0 ? Math.min(100, Math.round(used / lim * 100)) : 0;
                                          const over = lim > 0 && used >= lim;
                                          const warn = lim > 0 && used >= lim * 0.8;
                                          return (
                                            <>
                                              <div className="text-[10px] font-bold text-slate-600">Đã dùng: {used.toLocaleString()} ({pct}%)</div>
                                              <div className="w-[120px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${over ? 'bg-rose-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                                              </div>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </td>

                                    <td className="p-3 text-right pr-4">
                                      <div className="flex flex-col items-end gap-2.5">
                                        {/* Tier Quick Buttons - Row 1 */}
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                          <button
                                            onClick={() => {
                                              handleUpdateCustomer(c.id, { tier: 'free', messageLimit: 1000 });
                                              
                                              // Log statement
                                              const logText = `UPDATE public.profiles \nSET tier = 'free', message_limit = 1000, updated_at = NOW() \nWHERE id = '${c.id}';`;
                                              setAdminActionLogs(prevLogs => [
                                                { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logText, status: 'SUCCESS' },
                                                ...prevLogs
                                              ]);
                                              alert(`Đã hạ cấp thủ công tài khoản ${c.name} về gói Standard Free (Giới hạn 1,000 tin).`);
                                            }}
                                            disabled={c.tier === 'free'}
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all whitespace-nowrap cursor-pointer ${c.tier === 'free' ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-slate-50 hover:bg-slate-100 text-slate-705 border border-slate-250 active:scale-95'}`}
                                            title="Đặt về gói Free tiêu chuẩn"
                                          >
                                            Standard Free
                                          </button>
                                          
                                          <button
                                            onClick={() => {
                                              handleUpdateCustomer(c.id, { tier: 'pro', messageLimit: 25000 });
                                              
                                              const logText = `UPDATE public.profiles \nSET tier = 'pro', message_limit = 25000, updated_at = NOW() \nWHERE id = '${c.id}';`;
                                              setAdminActionLogs(prevLogs => [
                                                { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logText, status: 'SUCCESS' },
                                                ...prevLogs
                                              ]);
                                              alert(`Đã nâng cấp thủ công tài khoản ${c.name} lên gói Premium Pro (Hạn mức 25,000 tin nhắn).`);
                                            }}
                                            disabled={c.tier === 'pro'}
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all whitespace-nowrap cursor-pointer ${c.tier === 'pro' ? 'bg-indigo-50/65 text-indigo-400 border border-indigo-150 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-750 border border-indigo-200 active:scale-95'}`}
                                            title="Nâng lên gói Premium Pro"
                                          >
                                            ⭐ Premium Pro
                                          </button>

                                          <button
                                            onClick={() => {
                                              handleUpdateCustomer(c.id, { tier: 'enterprise', messageLimit: 150000 });
                                              
                                              const logText = `UPDATE public.profiles \nSET tier = 'enterprise', message_limit = 150000, updated_at = NOW() \nWHERE id = '${c.id}';`;
                                              setAdminActionLogs(prevLogs => [
                                                { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logText, status: 'SUCCESS' },
                                                ...prevLogs
                                              ]);
                                              alert(`Đã nâng cấp thủ công tài khoản ${c.name} lên gói Enterprise (Hạn mức 150,000 tin nhắn).`);
                                            }}
                                            disabled={c.tier === 'enterprise'}
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all whitespace-nowrap cursor-pointer ${c.tier === 'enterprise' ? 'bg-amber-50/65 text-amber-400 border border-amber-200 cursor-not-allowed' : 'bg-amber-55/70 hover:bg-amber-100/80 text-amber-900 border border-amber-300 active:scale-95'}`}
                                            title="Nâng lên Enterprise cao cấp nhất"
                                          >
                                            👑 Enterprise VIP
                                          </button>
                                        </div>

                                        {/* Quick Volume compensation actions - Row 2 */}
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Cấp bù:</span>
                                          <button
                                            onClick={() => {
                                              const nextStatus = c.status === 'suspended' ? 'active' : 'suspended';
                                              handleUpdateCustomer(c.id, { email: c.email, status: nextStatus } as any);
                                              setAdminActionLogs(prevLogs => [
                                                { timestamp: new Date().toLocaleTimeString('vi-VN'), query: `UPDATE public.profiles SET status = '${nextStatus}' WHERE id = '${c.id}';`, status: 'SUCCESS' },
                                                ...prevLogs
                                              ]);
                                            }}
                                            disabled={c.role === 'owner'}
                                            className="px-2 py-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 border border-slate-200 text-[10px] font-bold rounded cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                                            title="Khóa hoặc mở tài khoản"
                                          >
                                            {c.status === 'suspended' ? 'Mở khóa' : 'Khóa'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              const targetVal = c.messageLimit + 5000;
                                              handleUpdateCustomer(c.id, { messageLimit: targetVal });
                                              
                                              const logText = `UPDATE public.profiles \nSET message_limit = ${targetVal}, updated_at = NOW() \nWHERE id = '${c.id}'; \n-- Cấp thêm 5.000 tin nhắn hoàn tất cho ${c.name}`;
                                              setAdminActionLogs(prevLogs => [
                                                { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logText, status: 'SUCCESS' },
                                                ...prevLogs
                                              ]);
                                              alert(`Cấp thêm thành công +5,000 lượt nhắn cho ${c.name}!`);
                                            }}
                                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                                            title="Cấp bù nhanh +5,000 tin nhắn"
                                          >
                                            +5,000 lượt
                                          </button>
                                          
                                          <button
                                            onClick={() => {
                                              const targetVal = c.messageLimit + 20000;
                                              handleUpdateCustomer(c.id, { messageLimit: targetVal });
                                              
                                              const logText = `UPDATE public.profiles \nSET message_limit = ${targetVal}, updated_at = NOW() \nWHERE id = '${c.id}'; \n-- Cấp thêm 20.000 tin nhắn hoàn tất cho ${c.name}`;
                                              setAdminActionLogs(prevLogs => [
                                                { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logText, status: 'SUCCESS' },
                                                ...prevLogs
                                              ]);
                                              alert(`Cấp thêm thành công +20,000 lượt nhắn cho ${c.name}!`);
                                            }}
                                            className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[10px] font-bold rounded cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                                            title="Cấp bù nhanh +20,000 tin nhắn"
                                          >
                                            +20,000 lượt
                                          </button>

                                          <button
                                            onClick={() => {
                                              if (confirm(`Bạn chắc chắn muốn ngắt kết nối & xóa vĩnh viễn khách hàng ${c.name} khỏi mô phỏng dữ liệu?`)) {
                                                handleDeleteCustomer(c.id);
                                                
                                                const logText = `DELETE FROM public.profiles WHERE id = '${c.id}'; \n-- Xóa đại lý ${c.name}`;
                                                setAdminActionLogs(prevLogs => [
                                                  { timestamp: new Date().toLocaleTimeString('vi-VN'), query: logText, status: 'SUCCESS' },
                                                  ...prevLogs
                                                ]);
                                              }
                                            }}
                                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-150"
                                            title="Xóa tài khoản khỏi hệ thống"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>



                </div>



              </div>

            </div>
          )}

        </main>

        {/* FOOTER */}
        <footer className="h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0 text-[10px]">
          <div className="flex items-center gap-4 text-slate-500">
            <div className="flex items-center gap-1 text-green-600 font-bold uppercase tracking-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span>Telegram Webhook Operational</span>
            </div>
            <span>|</span>
            <span>API Latency: 48ms</span>
          </div>
          <span className="text-slate-400">&copy; 2026 AAA BalaBot SaaS Infrastructure Việt Nam</span>
        </footer>

      </div>

      {/* CREATE NEW BOT MODAL OVERLAY */}
      {isCreatingBot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div>
              <h3 className="font-bold text-base text-slate-900">Thiết Lập Trực Trụ Trợ Lý Mới</h3>
              <p className="text-xs text-slate-400">Tạo một thực thể Bot mới tách biệt cơ sở tri thức cho mảng chi nhánh khác</p>
            </div>

            <form onSubmit={handleCreateBot} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Tên Thương Hiệu Bot</label>
                <input
                  type="text"
                  placeholder="Ví dụ: AAA Spa - Khỏe Đẹp Trị Liệu"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:outline-none"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mô tả định vị</label>
                <textarea
                  placeholder="Hỗ trợ tư vấn menu liệu trình spa làm móng tại quận 3..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:outline-none"
                  value={newBotDesc}
                  onChange={(e) => setNewBotDesc(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Mảng dịch vụ</label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:outline-none"
                    value={newBotField}
                    onChange={(e) => setNewBotField(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Tone phong cách</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:outline-none"
                    value={newBotTone}
                    onChange={(e) => setNewBotTone(e.target.value as any)}
                  >
                    <option value="friendly">Thân thiện</option>
                    <option value="professional">Lễ phép chuyên nghiệp</option>
                    <option value="sales">Chốt đơn sỉ lẻ</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setIsCreatingBot(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg font-bold text-slate-600"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                >
                  Kích Hoạt Khởi Tạo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SYSTEM AUTH MODAL OVERLAY */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-250 max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in duration-200 text-left">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-600 font-extrabold text-[10px] uppercase tracking-wider mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Hành trình Trực quan Bot Tri Thức
                </div>
                <h3 className="font-extrabold text-sm text-slate-800">Đăng Nhập / Đăng Ký</h3>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex border-b border-slate-150 text-xs font-sans">
              <button
                type="button"
                onClick={() => { setSbAuthMode('signin'); setSbAuthError(''); }}
                className={`flex-1 pb-2.5 text-center text-[11px] font-bold transition-colors cursor-pointer ${sbAuthMode === 'signin' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                ĐĂNG NHẬP
              </button>
              <button
                type="button"
                onClick={() => { setSbAuthMode('signup'); setSbAuthError(''); }}
                className={`flex-1 pb-2.5 text-center text-[11px] font-bold transition-colors cursor-pointer ${sbAuthMode === 'signup' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                ĐĂNG KÝ
              </button>
            </div>

            <form onSubmit={handleSbAuthSubmit} className="space-y-3">
              {sbAuthError && (
                <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 text-[11px] rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-medium whitespace-pre-line">{sbAuthError}</span>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Địa Chỉ Email của bạn
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-emerald-500/15 focus:outline-none focus:border-emerald-500 font-medium"
                  value={sbAuthEmail}
                  onChange={(e) => setSbAuthEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Mật Khẩu bảo mật
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Nhập tối thiểu 6 ký tự"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-emerald-500/15 focus:outline-none focus:border-emerald-500 font-medium"
                  value={sbAuthPassword}
                  onChange={(e) => setSbAuthPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={sbAuthLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-350 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer mt-1"
              >
                {sbAuthLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Đang gửi thông tin...
                  </>
                ) : sbAuthMode === 'signup' ? (
                  'Tạo Tài Khoản Hệ Thống'
                ) : (
                  'Đăng Nhập Hệ Thống'
                )}
              </button>

              <div className="text-[9.5px] text-slate-400 bg-slate-50/50 border border-slate-100 rounded-lg p-3 leading-relaxed text-center">
                Nhập email chính chủ để đồng bộ hóa và quản trị hệ thống bot tri thức của riêng bạn.
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
