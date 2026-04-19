
import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API endpoint to fetch links from Blogspot
  app.get('/api/links', async (req, res) => {
    try {
      const targetUrl = 'https://ankitstudypoint.blogspot.com/p/ankitstudypoint.html';
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = cheerio.load(response.data);
      const links: { title: string; url: string }[] = [];

      // Scrape post links - adjustment might be needed based on actual HTML structure
      // Usually, Blogspot pages like this have links inside the main post body
      $('.post-body a').each((_, element) => {
        const title = $(element).text().trim();
        const url = $(element).attr('href');
        if (title && url && url.startsWith('http')) {
          links.push({ title, url });
        }
      });

      // If no links found in post-body, try broader selectors
      if (links.length === 0) {
        $('a').each((_, element) => {
           const title = $(element).text().trim();
           const url = $(element).attr('href');
           if (title && url && url.startsWith('http') && !url.includes('google.com') && !url.includes('blogspot.com/p/')) {
             links.push({ title, url });
           }
        });
      }

      res.json(links.slice(0, 50)); // Limit to top 50 links
    } catch (error) {
      console.error('Scraping error:', error);
      res.status(500).json({ error: 'Failed to fetch links' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
