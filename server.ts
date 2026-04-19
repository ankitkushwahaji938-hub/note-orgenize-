
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
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = cheerio.load(response.data);
      const links: { title: string; url: string }[] = [];

      // Improved selectors for Blogspot pages
      const contentSelectors = ['.post-body', '.entry-content', '#main-wrapper', 'article'];
      
      contentSelectors.forEach(selector => {
        $(selector + ' a').each((_, element) => {
          const title = $(element).text().trim();
          const url = $(element).attr('href');
          if (title && url && url.startsWith('http') && !url.includes('google.com') && !url.includes('facebook') && title.length > 3) {
             // Avoid duplicate URLs
             if (!links.find(l => l.url === url)) {
               links.push({ title, url });
             }
          }
        });
      });

      // If still no links, try any link that looks like a post
      if (links.length === 0) {
        $('a').each((_, element) => {
           const title = $(element).text().trim();
           const url = $(element).attr('href');
           if (title && url && url.startsWith('http') && url.includes('.html') && title.length > 5) {
             if (!links.find(l => l.url === url)) {
               links.push({ title, url });
             }
           }
        });
      }

      res.json(links.slice(0, 100)); // Return more links
    } catch (error) {
      console.error('Scraping error:', error);
      res.json([]); // Return empty list on error instead of 500 to keep client working
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
