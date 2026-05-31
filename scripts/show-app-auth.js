import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const authIdx = content.indexOf('/api/supabase/auth');
if (authIdx !== -1) {
  console.log('--- /api/supabase/auth usage ---');
  console.log(content.substring(authIdx - 1000, authIdx + 1500));
} else {
  console.log('/api/supabase/auth not found');
}
