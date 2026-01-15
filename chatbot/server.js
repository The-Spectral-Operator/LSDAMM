/**
 * LSDAMM Chatbot Server
 * Simple Express server to serve the chatbot frontend
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// Serve LSDAMM assets from root
app.use(express.static(join(__dirname, '..')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`LSDAMM Chatbot running at http://localhost:${PORT}`);
});
