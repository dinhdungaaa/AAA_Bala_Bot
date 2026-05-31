import fs from 'fs';
import path from 'path';

async function checkBindings() {
  try {
    const defaultTomlPath = 'C:\\Users\\dungl\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
    const content = fs.readFileSync(defaultTomlPath, 'utf8');
    const tokenMatch = content.match(/oauth_token\s*=\s*"([^"]+)"/);
    const token = tokenMatch[1];
    const accountId = '2d5a4ecb1ce39fe925435329e0117cf8';

    console.log('Fetching bindings/settings for balabot-proxy...');
    
    // Check bindings
    const resBindings = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/balabot-proxy/bindings`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (resBindings.ok) {
      console.log('--- Bindings ---');
      console.log(await resBindings.text());
    } else {
      console.log('Failed to fetch bindings:', resBindings.status, await resBindings.text());
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

checkBindings();
