
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
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const $ = cheerio.load(response.data);
      const links: { title: string; url: string }[] = [];

      // Primary selectors for Blogspot
      const selectors = [
        '.post-body a', 
        '.entry-content a', 
        '#main-wrapper a', 
        'article a',
        '.widget-content a'
      ];
      
      selectors.forEach(selector => {
        $(selector).each((_, element) => {
          const title = $(element).text().trim();
          const url = $(element).attr('href');
          if (title && url && url.startsWith('http') && !url.includes('google.com') && !url.includes('facebook') && title.length > 2) {
             if (!links.find(l => l.url === url)) {
               links.push({ title, url });
             }
          }
        });
      });

      // Secondary fallback: Any relative or absolute link that looks like a post
      if (links.length < 5) {
        $('a').each((_, element) => {
          let url = $(element).attr('href');
          const title = $(element).text().trim();
          if (url && title && title.length > 4) {
             if (!url.startsWith('http')) {
                url = 'https://ankitstudypoint.blogspot.com' + (url.startsWith('/') ? '' : '/') + url;
             }
             if (url.includes('.html') && !links.find(l => l.url === url)) {
                links.push({ title: title.replace(/\n/g, ' '), url });
             }
          }
        });
      }

      res.json(links.slice(0, 150));
    } catch (error: any) {
      console.error('Scraping error details:', error.message);
      res.status(500).json({ error: 'Failed to sync blog links', message: error.message });
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
