
import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON request bodies
  app.use(express.json());

  // Initialize Google GenAI client
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // AI-powered Text Summarizer Endpoint (Hybrid fallback)
  app.post('/api/summarize-ai', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: "Text is required for summarization." });
      }

      const systemInstruction = `Aap ek bahut achha aur professional Text Summarizer assistant hain.

Rules:
- Text ko carefully padho aur samjho.
- Sirf sabse important points aur main ideas ko rakho.
- Summary short, clear aur natural Hindi mein likho (agar input Hindi ho to).
- Agar English text ho to Hindi + English mix mein bhi likh sakte ho.
- Redundant cheezein hatao.
- Original text ka matlab badlo mat.
- Summary ki length user ke hisaab se adjust karo.

Agar text bahut lamba ho to important sections ko prioritize karo.
Provide output in a structured JSON schema. Create proper sections (as headings), detailed bullet points, and definitions. Make sure to identify and highlight important biology keywords in capital letters wrapped in ** (e.g. **EPIDERMIS**, **TRICHOMES**, **PARENCHYMA**).`;

      const userPrompt = `Niche diya gaya text ka summary banao:

${text}

Summary (Hindi mein, concise aur clear):`;

      const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-1.5-flash"
      ];

      let response;
      let lastError = null;

      for (const model of modelsToTry) {
        try {
          console.log(`Trying summarization using model: ${model}...`);
          response = await ai.models.generateContent({
            model: model,
            contents: userPrompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: "A highly engaging SEO title for the study notes based on the text."
                  },
                  description: {
                    type: Type.STRING,
                    description: "A professional brief meta description summary for Google Search."
                  },
                  keywords: {
                    type: Type.STRING,
                    description: "Search keywords or LSI terms, comma separated."
                  },
                  blocks: {
                    type: Type.ARRAY,
                    description: "Structured bullet notes matching sections.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: {
                          type: Type.STRING,
                          description: "Must be 'heading' or 'point' or 'def'."
                        },
                        text: {
                          type: Type.STRING,
                          description: "Heading text or Bullet point text (highlight keywords in uppercase with **)."
                        },
                        k: {
                          type: Type.STRING,
                          description: "If type is 'def', this is the term/key being defined."
                        },
                        v: {
                          type: Type.STRING,
                          description: "If type is 'def', this is the explanation/definition value."
                        }
                      },
                      required: ["type"]
                    }
                  }
                },
                required: ["title", "description", "keywords", "blocks"]
              }
            }
          });
          if (response && response.text) {
            console.log(`Successfully summarized using model: ${model}`);
            break;
          }
        } catch (err: any) {
          console.warn(`Model ${model} failed: ${err.message}`);
          lastError = err;
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error("All model fallback options failed.");
      }

      if (!response.text) {
        throw new Error("Empty response received from Gemini.");
      }

      const summaryData = JSON.parse(response.text.trim());
      res.json(summaryData);
    } catch (error: any) {
      console.error('AI Summarizer Error:', error.message);
      res.status(500).json({ error: 'Failed to generate AI summary', message: error.message });
    }
  });

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
