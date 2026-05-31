import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appPath = path.join(__dirname, '..', 'src', 'App.tsx');
let content = fs.readFileSync(appPath, 'utf-8');
const lines = content.split('\n');

// Find and fix the broken area around line 295-320
// We need to find the handleManualRegisterWebhook function end
// and restore the missing code

let fixStart = -1;
let fixEnd = -1;

for (let i = 0; i < lines.length; i++) {
  // Find the duplicate "const botRes" line
  if (lines[i].includes('const botRes = await fetch(botUrl);') && i > 0 && lines[i-1].includes('const botRes = await fetch(botUrl);')) {
    // Remove the duplicate
    lines.splice(i, 1);
    console.log(`Removed duplicate botRes line at ${i}`);
    break;
  }
}

// Now find where we need to restore the missing code
// Look for "replaceVisibleBots(freshBots, selectedBotId);" followed by issues
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('replaceVisibleBots(freshBots, selectedBotId)')) {
    // Check next few lines - should have closing braces and else clause
    let j = i + 1;
    // Skip whitespace
    while (j < lines.length && lines[j].trim() === '') j++;
    // Check if it goes directly to "// Rehydrate" which means we're missing code
    if (lines[j] && (lines[j].includes('Rehydrate') || lines[j].includes('useEffect'))) {
      console.log(`Found missing code area after line ${i}. Inserting restoration...`);
      const restoration = [
        '        }',
        '      } else {',
        '        setWebhookActionMsg({ status: \'error\', text: data.error || \'Đăng ký thất bại với Telegram.\' });',
        '      }',
        '    } catch (err: any) {',
        '      setWebhookActionMsg({ status: \'error\', text: \'Lỗi đồng bộ webhook: \' + err.message });',
        '    } finally {',
        '      setIsFetchingWebhook(false);',
        '    }',
        '  };',
        '',
        '  // Telegram incoming client simulator',
        '  const [simMessageText, setSimMessageText] = useState(\'Bên mình súp lơ xanh chuẩn VietGAP hôm nay giá bao nhiêu á shop ơi?\');',
        '  const [isSimulatingMessage, setIsSimulatingMessage] = useState(false);',
        '  const [simUserFullName, setSimUserFullName] = useState(\'Quốc Anh Bùi\');',
        '  const [simUserUsername, setSimUserUsername] = useState(\'quoc_anh_9x\');',
        '',
        '  // Human operator takeover reply',
        '  const [operatorReply, setOperatorReply] = useState(\'\');',
        '',
        '  // Search Knowledge Filter',
        '  const [kbSearchQuery, setKbSearchQuery] = useState(\'\');',
        '',
        '  // Schedule/Reminder System States',
        '  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);',
        '  const [remLogs, setRemLogs] = useState<ReminderLog[]>([]);',
        '  const [schedForm, setSchedForm] = useState({',
        '    label: \'\', content: \'\', time: \'08:00\', frequency: \'daily\' as string,',
        '    targetChatIds: \'\', aiEnhanced: false, aiTone: \'friendly\' as string,',
        '    daysOfWeek: [] as number[], dayOfMonth: 1, category: \'task\',',
        '    targetType: \'group\' as string, maxTriggers: 0',
        '  });',
        '  const [schedUploadFile, setSchedUploadFile] = useState<File | null>(null);',
        '  const [schedParseText, setSchedParseText] = useState(\'\');',
        '  const [schedLoading, setSchedLoading] = useState(false);',
        '  const [schedTab, setSchedTab] = useState<\'list\' | \'create\' | \'upload\' | \'logs\'>(\'list\');',
        '',
      ];
      lines.splice(i + 1, 0, ...restoration);
      console.log(`Inserted ${restoration.length} lines of restoration after line ${i}`);
      break;
    } else {
      console.log(`Area after line ${i} looks OK: "${lines[j]?.trim().substring(0, 60)}"`);
    }
  }
}

// Now add the sidebar button for schedules
// Find the billing button in nav
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Gói Cước') && lines[i].includes('Bảng Giá') && lines[i].includes('</button>')) {
    console.log(`Found billing button end at line ${i}`);
    const schedBtn = [
      '',
      '          <button',
      '            onClick={() => { setActiveTab(\'schedules\'); setIsMobileMenuOpen(false); }}',
      '            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === \'schedules\' ? \'bg-blue-600/10 text-teal-400 border-l-4 border-teal-500 font-semibold\' : \'text-slate-400 hover:text-white hover:bg-slate-800/50\'}`}',
      '          >',
      '            <Clock className="w-4 h-4 text-teal-400" />',
      '            Lịch Nhắc Tự Động',
      '          </button>',
    ];
    lines.splice(i + 1, 0, ...schedBtn);
    console.log(`Inserted sidebar button after line ${i}`);
    break;
  }
}

// Add fetch schedules in useEffect (find "fetch(`/api/bots/${selectedBotId}/faqs`)")
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('setFaqs(data)') && lines[i].includes('.then')) {
    console.log(`Found setFaqs line at ${i}`);
    const fetchSched = [
      '',
      '    fetch(`/api/bots/${selectedBotId}/schedules`)',
      '      .then(res => res.json())',
      '      .then(data => setSchedules(data));',
      '',
      '    fetch(`/api/bots/${selectedBotId}/reminder-logs`)',
      '      .then(res => res.json())',
      '      .then(data => setRemLogs(data));',
    ];
    lines.splice(i + 1, 0, ...fetchSched);
    console.log(`Inserted schedule fetch after line ${i}`);
    break;
  }
}

content = lines.join('\n');
fs.writeFileSync(appPath, content, 'utf-8');
console.log("Fix script completed. File size:", content.length);
