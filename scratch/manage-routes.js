import fs from 'fs';

async function deleteConflictingRoute() {
  try {
    const defaultTomlPath = 'C:\\Users\\dungl\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
    const content = fs.readFileSync(defaultTomlPath, 'utf8');
    const tokenMatch = content.match(/oauth_token\s*=\s*"([^"]+)"/);
    const token = tokenMatch[1];
    
    const zoneId = '0f53409dc019c8967c4634c0dc2c6160';
    const routeId = '2e74809488f94bb3bfb6038e2970c543'; // ID of antiantiai.xyz/balabot* -> balabot-proxy

    console.log(`Deleting route ${routeId}...`);
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes/${routeId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      console.log('Successfully deleted conflicting route!');
      console.log(await res.text());
    } else {
      console.log('Failed to delete route:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

deleteConflictingRoute();
