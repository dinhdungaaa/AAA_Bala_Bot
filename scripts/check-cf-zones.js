import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkZoneDetails() {
  try {
    const defaultTomlPath = 'C:\\Users\\dungl\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
    const content = fs.readFileSync(defaultTomlPath, 'utf8');
    const tokenMatch = content.match(/oauth_token\s*=\s*"([^"]+)"/);
    const token = tokenMatch[1];

    const zoneId = '0f53409dc019c8967c4634c0dc2c6160';
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.log(`Failed to fetch zone details: ${res.status} ${res.statusText}`);
      return;
    }

    const data = await res.json();
    console.log('Zone Details:');
    console.log(JSON.stringify(data.result, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

checkZoneDetails();
