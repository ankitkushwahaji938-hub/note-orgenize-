import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Download, 
  Eye, 
  Copy, 
  Trash2, 
  Settings, 
  Check, 
  AlertCircle, 
  ExternalLink,
  ChevronRight,
  User,
  Search,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Types
interface Block {
  type: 'heading' | 'sub' | 'point' | 'def' | 'plain' | 'link';
  text?: string;
  k?: string;
  v?: string;
  num?: number;
  url?: string;
}

interface ScrapingLink {
  title: string;
  url: string;
}

export default function App() {
  const [inputText, setInputText] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [links, setLinks] = useState<ScrapingLink[]>([]);
  const [userName, setUserName] = useState('');
  const [options, setOptions] = useState({
    headings: true,
    points: true,
    defs: true,
    numbered: false,
    seo: false,
    includeBlogLinks: true
  });
  const [seo, setSeo] = useState({
    title: '',
    desc: '',
    keywords: ''
  });
  const [status, setStatus] = useState('READY');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);

  const [blogLinksStatus, setBlogLinksStatus] = useState<'LOADING' | 'READY' | 'ERROR'>('LOADING');

  // Fetch links from Blogspot via our server API
  useEffect(() => {
    setBlogLinksStatus('LOADING');
    fetch('/api/links')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLinks(data);
          setBlogLinksStatus('READY');
        } else {
          setBlogLinksStatus('ERROR');
        }
      })
      .catch(err => {
        console.error('Failed to fetch links:', err);
        setBlogLinksStatus('ERROR');
      });
  }, []);

  const organizeNotes = () => {
    if (!inputText.trim()) {
      setStatus('EMPTY');
      return;
    }

    setStatus('ORGANIZING...');
    const lines = inputText.split('\n');
    const newBlocks: Block[] = [];
    let pNum = 0;

    // Enhanced patterns
    const H_PAT = [
      /^([A-Z][A-Za-z\s\-\/]{2,50})\s*:?\s*$/, 
      /^(\d+[\.\)]\s*.{3,60})$/, 
      /^[A-Z\s]{4,50}$/, 
      /^#{1,3}\s+(.+)$/,
      /^[0-9]+\.\s+[A-Z].+/
    ];
    const D_PAT = /^([A-Za-z0-9][^:]{1,40})\s*:\s*(.{2,})$/;
    const B_RE = [/^[-\u2022*\u25BA\u25B8\u2192\u2713\u2717]\s+/, /^\d+[\.\)]\s+/];

    const isH = (l: string) => options.headings && (H_PAT.some(p => p.test(l.trim())) || l.startsWith('#'));
    const isD = (l: string) => options.defs && D_PAT.test(l.trim());
    const hasB = (l: string) => B_RE.some(p => p.test(l.trim()));
    const cln = (l: string) => l.trim().replace(/^[-\u2022*\u25BA\u25B8\u2192\u2713\u2717]\s+/, '').replace(/^\d+[\.\)]\s+/, '').replace(/^#+\s*/, '');

    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;

      // Smart Highlighting: Highlight first few words if they look like a subject
      const processText = (txt: string) => {
        const words = txt.split(' ');
        if (words.length > 5 && /^[A-Z]/.test(words[0])) {
           // If sentence starts with Capital, bold first 2 words as "Topic"
           return `**${words.slice(0, 2).join(' ')}** ${words.slice(2).join(' ')}`;
        }
        return txt;
      };

      if (isH(t)) {
        newBlocks.push({ type: 'heading', text: cln(t) });
        pNum = 0;
      } else if (isD(t)) {
        const m = t.match(D_PAT);
        if (m) newBlocks.push({ type: 'def', k: m[1].trim(), v: m[2].trim() });
      } else if (hasB(t) && options.points) {
        pNum++;
        newBlocks.push({ type: 'point', text: processText(cln(t)), num: pNum });
      } else if (options.points && (t.startsWith('-') || t.startsWith('*') || t.startsWith('•'))) {
         pNum++;
         newBlocks.push({ type: 'point', text: processText(cln(t)), num: pNum });
      } else if (options.points && t.length > 5 && t.split(' ').length <= 25) {
        pNum++;
        newBlocks.push({ type: 'point', text: processText(t), num: pNum });
      } else if (t.length > 80) {
        // Splitting Paragraphs aggressively into Points
        const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z])/); 
        if (sentences.length > 1) {
          sentences.forEach(s => {
            if (s.length > 10) {
              pNum++;
              newBlocks.push({ type: 'point', text: processText(s.trim()), num: pNum });
            }
          });
        } else {
          newBlocks.push({ type: 'plain', text: processText(t) });
        }
      } else {
        newBlocks.push({ type: 'plain', text: processText(t) });
      }
    });

    // Add Blogspot links with proper branding
    if (options.includeBlogLinks && links.length > 0) {
      newBlocks.push({ type: 'heading', text: 'Related Posts from AnkitStudyPoint' });
      // Take only top 10 relevant links or random mix
      const shuffled = [...links].slice(0, 15);
      shuffled.forEach(link => {
        newBlocks.push({ type: 'link', text: link.title, url: link.url });
      });
    }

    setBlocks(newBlocks);
    setTimeout(() => {
      setStatus('DONE ✓');
      const out = document.getElementById('outputArea');
      if (out) out.scrollTop = 0;
    }, 400);
  };

  const clearAll = () => {
    setInputText('');
    setBlocks([]);
    setStatus('READY');
  };

  const [toast, setToast] = useState<{ msg: string, type: 'SUCCESS' | 'ERROR' } | null>(null);

  const showToast = (msg: string, type: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const buildFullSEOHTML = () => {
    const title = seo.title || 'Professional Study Notes | AnkitStudyPoint';
    const desc = seo.desc || 'Optimized study notes and educational content organized for better learning.';
    const keywords = seo.keywords || blocks.filter(b => b.type === 'heading').map(b => b.text).join(', ');
    const author = userName || 'AnkitStudyPoint Editorial';
    const date = new Date().toISOString();
    const displayDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const baseUrl = 'https://ankitstudypoint.blogspot.com';

    let hasH1 = false;
    const bodyContent = blocks.map((b) => {
      if (b.type === 'heading') {
        if (!hasH1) {
          hasH1 = true;
          return `<h1 style="color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 12px; margin-top: 40px; font-size: 2.5rem; letter-spacing: -0.02em;">${b.text}</h1>`;
        }
        return `<h2 style="color: #2c5282; border-bottom: 2px solid #4299e1; padding-bottom: 8px; margin-top: 35px; font-size: 1.8rem;">${b.text}</h2>`;
      }
      if (b.type === 'point') return `<li style="margin-bottom: 12px; list-style-type: disc; margin-left: 25px; color: #2d3748; font-size: 1.05rem;">${(b.text || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`;
      if (b.type === 'def') return `
        <div style="margin: 25px 0; padding: 20px; background: #fffaf0; border-left: 6px solid #ed8936; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <h3 style="margin-top: 0; color: #c05621; font-size: 1.3rem; margin-bottom: 10px;">${b.k}</h3>
          <p style="margin-bottom: 0; color: #4a5568; line-height: 1.6;">${b.v}</p>
        </div>`;
      if (b.type === 'link') return `<p style="margin: 20px 0;"><a href="${b.url}" style="color: #3182ce; text-decoration: none; font-weight: 700; border-bottom: 2px solid #ebf8ff; transition: all 0.2s;" target="_blank">🔗 ${b.text}</a></p>`;
      return `<p style="margin: 15px 0; color: #4a5568; line-height: 1.8; font-size: 1.05rem;">${b.text}</p>`;
    }).join('\n');

    // Wrap list items
    const processedBody = bodyContent.replace(/(<li.*?>.*?<\/li>\n)+/g, m => `<ul style="margin-bottom: 30px; padding-left: 0;">\n${m}</ul>\n`);

    // Schema JSON-LD
    const schemaData = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": title,
      "description": desc,
      "author": {
        "@type": "Person",
        "name": author
      },
      "datePublished": date,
      "image": "REPLACE_WITH_IMAGE_URL",
      "publisher": {
        "@type": "Organization",
        "name": "AnkitStudyPoint",
        "logo": {
          "@type": "ImageObject",
          "url": "https://ankitstudypoint.blogspot.com/favicon.ico"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": baseUrl
      },
      "keywords": keywords
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | AnkitStudyPoint</title>
  <meta name="description" content="${desc}">
  <meta name="keywords" content="${keywords}">
  <meta name="author" content="${author}">
  <meta name="robots" content="index, follow">
  
  <!-- Open Graph / Social Media -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="REPLACE_WITH_IMAGE_URL">
  <meta property="og:url" content="${baseUrl}">
  
  <script type="application/ld+json">
    ${JSON.stringify(schemaData, null, 2)}
  </script>

  <style>
    body { font-family: 'Inter', -apple-system, system-ui, sans-serif; line-height: 1.7; color: #2d3748; background-color: #f7fafc; padding: 20px; margin: 0; }
    .page-container { max-width: 900px; margin: 50px auto; background: #ffffff; padding: 60px; border-radius: 20px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid #edf2f7; }
    h1, h2, h3 { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 800; color: #1a202c; }
    .post-metadata { color: #718096; font-size: 0.9rem; margin-bottom: 40px; border-bottom: 1px solid #edf2f7; padding-bottom: 20px; display: flex; gap: 20px; }
    .featured-image-placeholder { width: 100%; height: 400px; background: #edf2f7; border-radius: 12px; margin-bottom: 40px; display: flex; items-center; justify-center; color: #a0aec0; border: 2px dashed #cbd5e0; position: relative; overflow: hidden; }
    /* Tip: Edit the schema above and this placeholder to add your image */
    @media (max-width: 768px) { .page-container { padding: 30px; margin: 10px; } .featured-image-placeholder { height: 250px; } }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="featured-image-placeholder">
       <p>Featured Image Area (Edit HTML to insert img tag)</p>
       <!-- <img src="YOUR_IMAGE_URL_HERE" style="width:100%; height:100%; object-fit:cover;" /> -->
    </div>
    
    <div class="post-metadata">
      <span>By <strong>${author}</strong></span>
      <span>Published: ${displayDate}</span>
    </div>

    ${!hasH1 ? `<h1 style="color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 12px; margin-top: 0; font-size: 2.5rem; letter-spacing: -0.02em;">${title}</h1>` : ''}
    
    <div class="excerpt" style="font-size: 1.2rem; color: #4a5568; margin-bottom: 40px; line-height: 1.6; border-left: 4px solid #3182ce; padding-left: 20px;">
      ${desc}
    </div>

    <article>
      ${processedBody}
    </article>

    <footer style="margin-top: 80px; padding-top: 40px; border-top: 2px solid #edf2f7; text-align: center;">
      <p style="color: #718096; font-size: 0.9rem;">
        &copy; ${new Date().getFullYear()} <strong>AnkitStudyPoint</strong>. All rights reserved.
      </p>
      <p style="color: #a0aec0; font-size: 0.8rem; margin-top: 10px;">
        Optimized Learning & Professional Note Organization Tools.
      </p>
    </footer>
  </div>
</body>
</html>`;
  };

  const copyToClipboard = async (type: 'text' | 'html') => {
    let content = '';
    if (type === 'text') {
      blocks.forEach(b => {
        if (b.type === 'heading') content += `\n== ${b.text?.toUpperCase()} ==\n\n`;
        else if (b.type === 'point') content += `  ${options.numbered ? `${b.num}. ` : '- '}${b.text}\n`;
        else if (b.type === 'def') content += `  ${b.k}: ${b.v}\n`;
        else if (b.type === 'link') content += `  Link: ${b.text} (${b.url})\n`;
        else content += `${b.text}\n`;
      });
    } else {
      content = buildFullSEOHTML();
    }

    try {
      await navigator.clipboard.writeText(content.trim());
      showToast('Copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy', 'ERROR');
    }
  };

  const downloadHTML = () => {
    if (blocks.length === 0) {
      showToast('Organize notes first!', 'ERROR');
      return;
    }
    const html = buildFullSEOHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${seo.title || 'organized-notes'}-ankitstudypoint.html`;
    a.click();
    showToast('HTML Downloaded!');
  };

  const generatePDF = async (isPreview = false) => {
    if (blocks.length === 0) return;
    setLoadingPdf(true);
    
    try {
      const doc = await PDFDocument.create();
      const fBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fReg = await doc.embedFont(StandardFonts.Helvetica);
      
      const PW = 595, PH = 842;
      const margin = 50;
      let y = PH - margin;
      let page = doc.addPage([PW, PH]);

      const cleanForPdf = (txt: string) => {
        // Standard fonts only support WinAnsi (no emojis or complex unicode)
        return (txt || '')
          .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
          .replace(/[^\x00-\x7F]/g, ''); // Remove non-ascii characters for safety
      };

      const drawHeader = (p: any, titleStr: string) => {
        const safeTitle = cleanForPdf(titleStr);
        if (options.seo) {
          // Stylish Professional Header for SEO mode
          p.drawRectangle({ x: 0, y: PH - 40, width: PW, height: 40, color: rgb(0.05, 0.06, 0.08) });
          p.drawText('AnkitStudyPoint Notes', { x: margin, y: PH - 25, size: 12, font: fBold, color: rgb(0, 0.9, 0.6) });
          p.drawText(safeTitle.substring(0, 40), { x: PW - margin - 150, y: PH - 25, size: 8, font: fReg, color: rgb(0.6, 0.6, 0.6) });
        } else {
          // Simple Simple Header for normal mode
          p.drawText('Organized Study Notes', { x: margin, y: PH - 30, size: 10, font: fReg, color: rgb(0.5, 0.5, 0.5) });
          p.drawLine({ start: { x: margin, y: PH - 35 }, end: { x: PW - margin, y: PH - 35 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        }
      };

      const checkPage = (height: number) => {
        if (y - height < margin + 40) {
          page = doc.addPage([PW, PH]);
          y = PH - 60;
          drawHeader(page, seo.title || 'Study Notes');
        }
      };

      drawHeader(page, seo.title || 'Study Notes');
      y -= options.seo ? 40 : 45;

      // Title Section
      const docTitle = cleanForPdf(seo.title || 'Structured Study Notes');
      page.drawText(docTitle, { 
        x: margin, 
        y, 
        size: options.seo ? 22 : 18, 
        font: fBold, 
        color: options.seo ? rgb(0.1, 0.2, 0.5) : rgb(0.1, 0.1, 0.1) 
      });
      y -= 30;

      for (const b of blocks) {
        if (b.type === 'heading') {
          const bText = cleanForPdf(b.text || '');
          checkPage(40);
          y -= 10;
          if (options.seo) {
             page.drawRectangle({ x: margin, y: y - 5, width: PW - 2 * margin, height: 20, color: rgb(0.9, 0.95, 1) });
             page.drawText(bText, { x: margin + 5, y, size: 14, font: fBold, color: rgb(0.1, 0.4, 0.8) });
          } else {
             page.drawText(bText.toUpperCase(), { x: margin, y, size: 12, font: fBold, color: rgb(0.2, 0.2, 0.2) });
             page.drawLine({ start: { x: margin, y: y - 4 }, end: { x: margin + 100, y: y - 4 }, thickness: 2, color: rgb(0.2, 0.2, 0.2) });
          }
          y -= 30;
        } else if (b.type === 'point') {
          const rawText = b.text || '';
          const cleanText = cleanForPdf(rawText.replace(/\*\*/g, '')); // Clean bold AND emoji
          const lines = wrapText(cleanText, fReg, 11, PW - 2 * margin - 20);
          checkPage(lines.length * 15 + 10);
          page.drawText('>', { x: margin + 5, y: y + 2, size: 10, font: fBold, color: options.seo ? rgb(0, 0.7, 0.5) : rgb(0.3, 0.3, 0.3) });
          lines.forEach(line => {
            page.drawText(line, { x: margin + 20, y, size: 11, font: fReg });
            y -= 15;
          });
          y -= 5;
        } else if (b.type === 'def') {
          const key = cleanForPdf(`${b.k}: `);
          const val = cleanForPdf(b.v || '');
          const keyWidth = fBold.widthOfTextAtSize(key, 11);
          const valLines = wrapText(val, fReg, 11, PW - 2 * margin - keyWidth - 10);
          checkPage(valLines.length * 15 + 10);
          page.drawText(key, { x: margin, y, size: 11, font: fBold, color: options.seo ? rgb(0.8, 0.4, 0) : rgb(0.1, 0.1, 0.1) });
          valLines.forEach(line => {
            page.drawText(line, { x: margin + keyWidth, y, size: 11, font: fReg, color: rgb(0.2, 0.2, 0.2) });
            y -= 15;
          });
          y -= 5;
        } else if (b.type === 'link') {
          const bText = cleanForPdf(b.text || '');
          checkPage(20);
          page.drawText('>', { x: margin, y, size: 10, font: fBold, color: rgb(0.2, 0.2, 0.9) });
          page.drawText(bText, { x: margin + 15, y, size: 11, font: fReg, color: rgb(0.2, 0.2, 0.9) });
          y -= 20;
        } else {
          const cleanText = cleanForPdf(b.text || '');
          const lines = wrapText(cleanText, fReg, 11, PW - 2 * margin);
          checkPage(lines.length * 15 + 10);
          lines.forEach(line => {
            page.drawText(line, { x: margin, y, size: 11, font: fReg, color: rgb(0.3, 0.3, 0.3) });
            y -= 15;
          });
          y -= 10;
        }
      }

      // Footer
      const pageCount = doc.getPageCount();
      for (let i = 0; i < pageCount; i++) {
        const p = doc.getPage(i);
        const footerText = options.seo 
          ? `Page ${i + 1} of ${pageCount} | Generated for AnkitStudyPoint | ${userName || 'User'}`
          : `Note Page ${i + 1} | ${new Date().toLocaleDateString()}`;
        p.drawText(footerText, {
          x: margin, y: 20, size: 8, font: fReg, color: rgb(0.5, 0.5, 0.5)
        });
      }

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (isPreview) {
        setPreviewUrl(url);
        setShowPreview(true);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${seo.title || 'organized-notes'}.pdf`;
        a.click();
      }
    } catch (err) {
      console.error('PDF Error:', err);
      alert('Failed to generate PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const getPortableHTML = () => {
    // This generates a single HTML file using CDN for dependencies
    // so it can be used on GitHub Pages or locally without a server.
    const title = seo.title || 'Auto Notes Organizer | AnkitStudyPoint';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
  <style>
    body { background-color: #0d0f12; color: #e8ecf4; font-family: sans-serif; }
    textarea { background: #0d0f12; border: 1px solid #2a3045; }
    .btn-primary { background: #00e5a0; color: #0d0f12; }
  </style>
</head>
<body class="p-4 md:p-8">
  <div class="max-w-4xl mx-auto">
    <header class="mb-8 border-b border-gray-800 pb-4">
      <h1 class="text-2xl font-bold">Auto <span class="text-[#00e5a0]">Notes</span> Organizer</h1>
      <p class="text-xs text-gray-500 uppercase tracking-widest mt-1">Portable Static Version for GitHub Pages</p>
    </header>
    
    <div class="grid grid-cols-1 gap-6">
      <textarea id="portableInput" rows="10" class="w-full rounded-xl p-4 text-sm font-mono focus:ring-1 focus:ring-[#00e5a0] outline-none" placeholder="Paste notes here..."></textarea>
      
      <div class="flex flex-wrap gap-3">
        <button onclick="organizePortable()" class="btn-primary px-6 py-2 rounded-lg font-bold uppercase text-xs">Organize</button>
        <button onclick="downloadPDFPortable()" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold uppercase text-xs">Download PDF</button>
      </div>

      <div id="portableOutput" class="mt-8 space-y-4 bg-black/20 p-6 rounded-2xl border border-gray-800 hidden"></div>
    </div>
  </div>

  <script>
    let organizedBlocks = [];
    
    function organizePortable() {
      const text = document.getElementById('portableInput').value;
      const lines = text.split('\\n');
      const out = document.getElementById('portableOutput');
      out.innerHTML = '';
      out.classList.remove('hidden');
      organizedBlocks = [];

      lines.forEach(line => {
        const t = line.trim();
        if(!t) return;
        
        let block = { type: 'plain', text: t };
        if (t.startsWith('#')) block = { type: 'heading', text: t.replace(/^#+\\s*/, '') };
        else if (t.includes(':') && t.length < 100) {
          const parts = t.split(':');
          block = { type: 'def', k: parts[0].trim(), v: parts.slice(1).join(':').trim() };
        }
        
        organizedBlocks.push(block);
        
        const el = document.createElement('div');
        if(block.type === 'heading') {
          el.innerHTML = '<h2 class="text-xl font-bold text-blue-400 border-b border-blue-900 pb-1 mt-4">' + block.text + '</h2>';
        } else if(block.type === 'def') {
          el.innerHTML = '<div class="pl-4 border-l-2 border-orange-500 bg-orange-500/5 p-2"><strong class="text-orange-400">' + block.k + ':</strong> <span class="text-sm">' + block.v + '</span></div>';
        } else {
          el.innerHTML = '<p class="text-sm border-l border-gray-700 pl-4 py-1">' + t + '</p>';
        }
        out.appendChild(el);
      });
    }

    async function downloadPDFPortable() {
      if(organizedBlocks.length === 0) return alert('Organize first');
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const doc = await PDFDocument.create();
      const fBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fReg = await doc.embedFont(StandardFonts.Helvetica);
      let page = doc.addPage([595, 842]);
      let y = 780;

      page.drawText('AnkitStudyPoint - Standardized Notes', { x: 50, y: 810, size: 10, font: fBold, color: rgb(0, 0.7, 0.5) });

      organizedBlocks.forEach(b => {
        if (y < 100) { page = doc.addPage([595, 842]); y = 780; }
        if(b.type === 'heading') {
          page.drawRectangle({ x: 50, y: y-5, width: 495, height: 20, color: rgb(0.9, 0.95, 1) });
          page.drawText(b.text, { x: 55, y, size: 14, font: fBold, color: rgb(0.1, 0.4, 0.8) });
          y -= 30;
        } else if(b.type === 'def') {
          page.drawText(b.k + ': ', { x: 50, y, size: 11, font: fBold });
          page.drawText(b.v, { x: 120, y, size: 11, font: fReg });
          y -= 20;
        } else {
          page.drawText(b.text.substring(0, 80), { x: 50, y, size: 10, font: fReg, color: rgb(0.3, 0.3, 0.3) });
          y -= 15;
        }
      });

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'organized-notes.pdf'; a.click();
    }
  </script>
</body>
</html>`;
  };

  const downloadPortableVersion = () => {
    const html = getPortableHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    a.click();
    alert('Portable Version Downloaded! \n\nUpload this index.html to your GitHub repository to fix the blank page.');
  };

  const wrapText = (text: string, font: any, size: number, maxWidth: number) => {
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      try {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, size);
        if (width <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      } catch (e) {
        // Fallback for weird characters
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#e8ecf4] font-sans selection:bg-[#00e5a0]/30">
      {/* Grid Pattern Background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M40 40H0V0h40v40zM1 1h38v38H1V1z' fill='%23ffffff'/%3E%3C/svg%3E")` }}>
      </div>

      <header className="relative z-10 border-bottom border-[#2a3045] bg-[#0a0c0f]/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#00e5a0]/10 border border-[#00e5a0]/20 rounded-xl flex items-center justify-center">
              <FileText className="text-[#00e5a0] w-6 h-6" />
            </div>
            <div>
              <h1 className="font-mono font-bold text-xl tracking-tight">Auto <span className="text-[#00e5a0]">Notes</span> Organizer</h1>
              <p className="text-[10px] text-[#7a8499] uppercase tracking-widest font-mono">Professional Study Tool by AnkitStudyPoint</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs font-mono">
            <span className="text-[#7a8499]">Status:</span>
            <span className={`px-2 py-0.5 rounded-full border ${status.includes('DONE') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-[#2a3045] border-[#2a3045] text-[#7a8499]'}`}>
              {status}
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Input */}
        <div className="flex flex-col gap-6">
          <section className="bg-[#1c2030] border border-[#2a3045] rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-3 bg-[#151820] border-b border-[#2a3045] flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold tracking-widest uppercase flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> Input Raw Data
              </span>
              <span className="text-[10px] text-[#7a8499]">{inputText.length} characters</span>
            </div>
            
            <div className="p-5 flex-1 flex flex-col gap-4">
              <textarea 
                className="w-full h-80 bg-[#0d0f12] border border-[#2a3045] rounded-xl p-4 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:border-[#00e5a0]/50 transition-colors"
                placeholder="Paste your raw notes here... headers will be detected automatically."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#7a8499] font-mono ml-1">Creator Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7a8499]" />
                    <input 
                      className="w-full bg-[#0d0f12] border border-[#2a3045] rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-[#00e5a0]/50"
                      placeholder="e.g. Ankit Kushwaha"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#7a8499] font-mono ml-1">Quick Actions</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={organizeNotes}
                      className="flex-1 bg-[#00e5a0] text-[#0d0f12] font-mono font-bold text-xs uppercase py-2.5 rounded-lg hover:bg-[#00ffb5] transition-all transform active:scale-95 flex items-center justify-center gap-2"
                    >
                      Organize Notes
                    </button>
                    <button 
                      onClick={clearAll}
                      className="px-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[#1c2030] border border-[#2a3045] rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#7a8499]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-widest">Configuration</h3>
              </div>
              <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                <div className={`w-1.5 h-1.5 rounded-full ${blogLinksStatus === 'READY' ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                <span className="text-[9px] font-mono font-bold text-blue-400">BLOG SYNC: {blogLinksStatus}</span>
              </div>
            </div>
            
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-orange-200 uppercase tracking-wide mb-1">GitHub Blank Page Fix?</h4>
                  <p className="text-[10px] text-orange-200/70 leading-relaxed mb-3">
                    If your GitHub link is white/blank, it's because GitHub can't read your source files directly. You need the <strong>Single-File Portable Version</strong>.
                  </p>
                  <button 
                    onClick={downloadPortableVersion}
                    className="w-full bg-orange-500 text-[#0d0f12] py-1.5 rounded-lg text-[10px] font-mono font-bold hover:bg-orange-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Fixing index.html
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-[#2a3045] bg-[#0d0f12] text-[#00e5a0] focus:ring-0"
                  checked={options.headings}
                  onChange={() => setOptions({...options, headings: !options.headings})}
                />
                <span className="text-xs text-[#7a8499] group-hover:text-[#e8ecf4] transition-colors">Headings</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-[#2a3045] bg-[#0d0f12] text-[#00e5a0] focus:ring-0"
                  checked={options.points}
                  onChange={() => setOptions({...options, points: !options.points})}
                />
                <span className="text-xs text-[#7a8499] group-hover:text-[#e8ecf4] transition-colors">Bullets</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-[#2a3045] bg-[#0d0f12] text-[#00e5a0] focus:ring-0"
                  checked={options.defs}
                  onChange={() => setOptions({...options, defs: !options.defs})}
                />
                <span className="text-xs text-[#7a8499] group-hover:text-[#e8ecf4] transition-colors">Definitions</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-[#2a3045] bg-[#0d0f12] text-[#00e5a0] focus:ring-0"
                  checked={options.includeBlogLinks}
                  onChange={() => setOptions({...options, includeBlogLinks: !options.includeBlogLinks})}
                />
                <span className="text-xs text-[#7a8499] group-hover:text-[#e8ecf4] transition-colors">Blog Links</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-[#2a3045] bg-[#0d0f12] text-[#00e5a0] focus:ring-0"
                  checked={options.seo}
                  onChange={() => setOptions({...options, seo: !options.seo})}
                />
                <span className="text-xs text-[#7a8499] group-hover:text-[#e8ecf4] transition-colors">SEO Fields</span>
              </label>
            </div>

            <AnimatePresence>
              {options.seo && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-4 pt-4 border-t border-[#2a3045] flex flex-col gap-3"
                >
                  <input 
                    className="w-full bg-[#0d0f12] border border-[#2a3045] rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-blue-500/50"
                    placeholder="H1 & Meta Title (Primary Topic)"
                    value={seo.title}
                    onChange={(e) => setSeo({...seo, title: e.target.value})}
                  />
                  <input 
                    className="w-full bg-[#0d0f12] border border-[#2a3045] rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-blue-500/50"
                    placeholder="Meta Description (Brief Summary for Google)"
                    value={seo.desc}
                    onChange={(e) => setSeo({...seo, desc: e.target.value})}
                  />
                  <input 
                    className="w-full bg-[#0d0f12] border border-[#2a3045] rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-blue-500/50"
                    placeholder="Search Keywords / LSI Terms (Comma separated)"
                    value={seo.keywords}
                    onChange={(e) => setSeo({...seo, keywords: e.target.value})}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Right Panel: Output */}
        <section className="bg-[#1c2030] border border-[#2a3045] rounded-2xl overflow-hidden flex flex-col shadow-2xl h-fit">
          <div className="px-5 py-3 bg-[#151820] border-b border-[#2a3045] flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold tracking-widest uppercase flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00e5a0]"></div> Organized Structure
            </span>
            <div className="flex gap-2">
              <button 
                onClick={downloadPortableVersion}
                className="text-[10px] font-bold uppercase tracking-widest bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded hover:bg-orange-500/20 flex items-center gap-1.5"
                title="Download single HTML file for GitHub Pages"
              >
                <Download className="w-3 h-3" /> GitHub Version
              </button>
              <button 
                onClick={() => generatePDF(true)}
                className="text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded hover:bg-blue-500/20 flex items-center gap-1.5"
              >
                <Eye className="w-3 h-3" /> Preview
              </button>
            </div>
          </div>

          <div className="p-6 max-h-[600px] overflow-y-auto custom-scrollbar bg-[#0d0f12]">
            {blocks.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-[#7a8499] gap-3">
                <Search className="w-10 h-10 opacity-20" />
                <p className="text-sm">Organize some notes to see the magic</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {blocks.map((block, idx) => (
                  <motion.div 
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    key={idx}
                  >
                    {block.type === 'heading' && (
                      <div className="mt-4 first:mt-0 pb-1 border-b border-[#2a3045] flex items-center gap-3">
                        <span className="bg-[#00e5a0]/10 text-[#00e5a0] text-[8px] font-bold border border-[#00e5a0]/20 px-1.5 rounded uppercase">Topic</span>
                        <h2 className="text-lg font-bold text-blue-400">{block.text}</h2>
                      </div>
                    )}
                    {block.type === 'point' && (
                      <div className="flex items-start gap-3 pl-2 py-1 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                        <span className="text-[#00e5a0] mt-1.5 font-bold">{options.numbered ? `${block.num}.` : '•'}</span>
                        <p className="text-sm leading-relaxed" 
                           dangerouslySetInnerHTML={{ __html: (block.text || '').replace(/\*\*(.*?)\*\*/g, '<b class="text-[#00e5a0]"> $1 </b>') }} 
                        />
                      </div>
                    )}
                    {block.type === 'def' && (
                      <div className="pl-4 border-l-2 border-orange-500/50 bg-orange-500/5 py-2 rounded-r-lg">
                        <span className="font-mono text-[10px] uppercase font-bold text-orange-400 block mb-1">Definition</span>
                        <span className="font-bold text-orange-200">{block.k}:</span>
                        <span className="text-sm ml-2 text-[#e8ecf4]">{block.v}</span>
                      </div>
                    )}
                    {block.type === 'link' && (
                      <a 
                        href={block.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-2 p-2 bg-indigo-500/5 border border-indigo-500/10 rounded-lg hover:bg-indigo-500/10 transition-colors group"
                      >
                        <BookOpen className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-medium text-indigo-300 group-hover:underline">{block.text}</span>
                        <ExternalLink className="w-3 h-3 text-indigo-500/50 ml-auto" />
                      </a>
                    )}
                    {block.type === 'plain' && (
                      <p className="text-sm text-[#7a8499] italic pl-2">{block.text}</p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-[#151820] border-t border-[#2a3045] flex flex-wrap gap-3">
            <button 
              onClick={() => copyToClipboard('text')}
              className="flex-1 min-w-[120px] bg-[#2a3045] border border-[#3a4055] py-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 hover:border-[#00e5a0]/50 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" /> Plain Text
            </button>
            <button 
              onClick={() => copyToClipboard('html')}
              className="flex-1 min-w-[120px] bg-[#2a3045] border border-[#3a4055] py-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 hover:border-[#00e5a0]/50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> HTML Code
            </button>
            <button 
              onClick={downloadHTML}
              className="flex-1 min-w-[120px] bg-[#2a3045] border border-[#3a4055] py-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 hover:border-[#00e5a0]/50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download HTML
            </button>
            <button 
              onClick={() => generatePDF(false)}
              disabled={loadingPdf}
              className="w-full bg-[#00e5a0] text-[#0d0f12] py-2.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 hover:bg-[#00ffb5] transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {loadingPdf ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </section>
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPreview(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative z-10 w-full max-w-4xl bg-[#1c2030] rounded-2xl overflow-hidden flex flex-col h-[90vh] shadow-2xl border border-[#2a3045]"
            >
              <div className="p-4 bg-[#151820] border-b border-[#2a3045] flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-400" /> PDF Preview
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => generatePDF(false)}
                    className="bg-[#00e5a0] text-[#0d0f12] px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button 
                    onClick={() => setShowPreview(false)}
                    className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-[#525659]">
                {previewUrl && (
                  <iframe 
                    src={`${previewUrl}#toolbar=0`} 
                    className="w-full h-full border-none"
                    title="PDF Preview"
                  />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="relative z-10 max-w-7xl mx-auto p-8 border-t border-[#2a3045] text-center">
        <p className="text-[#7a8499] text-xs font-mono">
          Made with ❤️ for <a href="https://ankitstudypoint.blogspot.com" target="_blank" rel="noreferrer" className="text-[#00e5a0] hover:underline">AnkitStudyPoint</a>
        </p>
        <p className="text-[#3a4055] text-[10px] mt-2 font-mono uppercase tracking-[0.2em]">
          No AI used &middot; Rule-based Organization &middot; pdf-lib powered
        </p>
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-xl font-mono text-xs font-bold shadow-2xl flex items-center gap-3 border ${
              toast.type === 'SUCCESS' 
                ? 'bg-[#00e5a0] text-[#0d0f12] border-[#00e5a0]' 
                : 'bg-red-500 text-white border-red-500'
            }`}
          >
            {toast.type === 'SUCCESS' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0d0f12;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2a3045;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3a4055;
        }
      `}</style>
    </div>
  );
}
