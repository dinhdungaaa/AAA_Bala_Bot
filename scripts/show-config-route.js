import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\server.ts';
const content = fs.readFileSync(filePath, 'utf8');

// Find the code block for the /api/supabase/config endpoints
const startIdx = content.indexOf('app.get("/api/supabase/config"');
if (startIdx !== -1) {
  console.log('--- app.get("/api/supabase/config") ---');
  console.log(content.substring(startIdx, startIdx + 1500));
}

const postIdx = content.indexOf('app.post("/api/supabase/config"');
if (postIdx !== -1) {
  console.log('\n--- app.post("/api/supabase/config") ---');
  console.log(content.substring(postIdx, postIdx + 1500));
}
