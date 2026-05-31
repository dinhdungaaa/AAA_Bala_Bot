import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\server.ts';
const content = fs.readFileSync(filePath, 'utf8');

const signinIdx = content.indexOf('app.post("/api/supabase/auth/signin"');
if (signinIdx !== -1) {
  console.log('--- /api/supabase/auth/signin ---');
  console.log(content.substring(signinIdx, signinIdx + 1500));
} else {
  console.log('/api/supabase/auth/signin not found');
}

const signupIdx = content.indexOf('app.post("/api/supabase/auth/signup"');
if (signupIdx !== -1) {
  console.log('\n--- /api/supabase/auth/signup ---');
  console.log(content.substring(signupIdx, signupIdx + 1500));
} else {
  console.log('/api/supabase/auth/signup not found');
}
