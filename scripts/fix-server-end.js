import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, '..', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf-8');

const marker = `// Serve static/vite assets as required by environment`;
const firstIdx = content.indexOf(marker);
if (firstIdx === -1) {
  console.log("Marker not found");
  process.exit(1);
}

const before = content.substring(0, firstIdx);

const replacement = `// Serve static/vite assets as required by environment
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(\`BalaBot Server running on http://0.0.0.0:\${PORT}\`);

    // Initialize Scheduler Engine
    await loadSchedulesFromDB();
    startSchedulerEngine();
  });
}

startServer();
`;

fs.writeFileSync(serverPath, before + replacement, 'utf-8');
console.log("Fixed server.ts successfully. Total size:", (before + replacement).length);
