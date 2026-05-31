import fs from 'fs';
import path from 'path';

const configsPath = path.join(process.cwd(), "supabase-user-configs.json");
if (fs.existsSync(configsPath)) {
  console.log('Found supabase-user-configs.json:');
  console.log(fs.readFileSync(configsPath, 'utf8'));
} else {
  console.log('supabase-user-configs.json does not exist.');
}
