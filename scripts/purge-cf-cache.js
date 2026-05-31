import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function purgeCache() {
  try {
    const defaultTomlPath = 'C:\\Users\\dungl\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
    if (!fs.existsSync(defaultTomlPath)) {
      console.log('default.toml not found');
      return;
    }
    const content = fs.readFileSync(defaultTomlPath, 'utf8');
    const tokenMatch = content.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (!tokenMatch) {
      console.log('OAuth token not found');
      return;
    }
    const token = tokenMatch[1];

    const zoneId = '0f53409dc019c8967c4634c0dc2c6160';
    console.log('Purging cache for zone:', zoneId);
    
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ purge_everything: true })
    });

    if (!res.ok) {
      console.log(`Failed to purge cache: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log(text);
      return;
    }

    const data = await res.json();
    console.log('Purge result:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}

purgeCache();
