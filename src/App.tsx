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

  // Fetch links from Blogspot via our server API
  useEffect(() => {
    fetch('/api/links')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setLinks(data);
      })
      .catch(err => console.error('Failed to fetch links:', err));
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

    const H_PAT = [/^([A-Z][A-Za-z\s\-\/]{2,50})\s*:?\s*$/, /^(\d+[\.\)]\s*.{3,60})$/, /^[A-Z\s]{4,50}$/, /^#{1,3}\s+(.+)$/];
    const D_PAT = /^([A-Za-z][^:]{1,40})\s*:\s*(.{3,})$/;
    const B_RE = [/^[-\u2022*\u25BA\u25B8\u2192\u2713\u2717]\s+/, /^\d+[\.\)]\s+/];

    const isH = (l: string) => options.headings && (H_PAT.some(p => p.test(l.trim())) || l.startsWith('#'));
    const isD = (l: string) => options.defs && D_PAT.test(l.trim());
    const hasB = (l: string) => B_RE.some(p => p.test(l.trim()));
    const cln = (l: string) => l.trim().replace(/^[-\u2022*\u25BA\u25B8\u2192\u2713\u2717]\s+/, '').replace(/^\d+[\.\)]\s+/, '').replace(/^#+\s*/, '');

    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;

      if (isH(t)) {
        newBlocks.push({ type: 'heading', text: cln(t) });
      } else if (isD(t)) {
        const m = t.match(D_PAT);
        if (m) newBlocks.push({ type: 'def', k: m[1].trim(), v: m[2].trim() });
      } else if (hasB(t) && options.points) {
        pNum++;
        newBlocks.push({ type: 'point', text: cln(t), num: pNum });
      } else if (options.points && t.length > 5 && t.split(' ').length <= 15) {
        pNum++;
        newBlocks.push({ type: 'point', text: t, num: pNum });
      } else {
        newBlocks.push({ type: 'plain', text: t });
      }
    });

    // Add Blogspot links if enabled
    if (options.includeBlogLinks && links.length > 0) {
      newBlocks.push({ type: 'heading', text: 'Important Links from AnkitStudyPoint' });
      links.forEach(link => {
        newBlocks.push({ type: 'link', text: link.title, url: link.url });
      });
    }

    setBlocks(newBlocks);
    setStatus('DONE ✓');
  };

  const clearAll = () => {
    setInputText('');
    setBlocks([]);
    setStatus('READY');
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
      content = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: auto; padding: 20px;">
  ${blocks.map(b => {
    if (b.type === 'heading') return `<h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 30px;">${b.text}</h2>`;
    if (b.type === 'point') return `<li style="margin-bottom: 8px;">${b.text}</li>`;
    if (b.type === 'def') return `<p><strong>${b.k}:</strong> ${b.v}</p>`;
    if (b.type === 'link') return `<p><a href="${b.url}" style="color: #4f46e5; text-decoration: none;" target="_blank">🔗 ${b.text}</a></p>`;
    return `<p>${b.text}</p>`;
  }).join('\n')}
</div>`;
      // Handle list wrapping
      content = content.replace(/(<li.*?>.*?<\/li>\n)+/g, m => `<ul>\n${m}</ul>\n`);
    }

    try {
      await navigator.clipboard.writeText(content.trim());
      alert('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
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

      const drawHeader = (p: any, title: string) => {
        p.drawRectangle({ x: 0, y: PH - 40, width: PW, height: 40, color: rgb(0.05, 0.06, 0.08) });
        p.drawText('AnkitStudyPoint Notes', { x: margin, y: PH - 25, size: 12, font: fBold, color: rgb(0, 0.9, 0.6) });
        p.drawText(title.substring(0, 40), { x: PW - margin - 150, y: PH - 25, size: 8, font: fReg, color: rgb(0.6, 0.6, 0.6) });
      };

      const checkPage = (height: number) => {
        if (y - height < margin + 40) {
          page = doc.addPage([PW, PH]);
          y = PH - 60;
          drawHeader(page, seo.title || 'Study Notes');
        }
      };

      drawHeader(page, seo.title || 'Study Notes');
      y -= 40;

      // Title
      const docTitle = seo.title || 'Organized Notes';
      page.drawText(docTitle, { x: margin, y, size: 20, font: fBold, color: rgb(0.1, 0.2, 0.5) });
      y -= 30;

      for (const b of blocks) {
        if (b.type === 'heading') {
          checkPage(40);
          y -= 10;
          page.drawRectangle({ x: margin, y: y - 5, width: PW - 2 * margin, height: 20, color: rgb(0.9, 0.95, 1) });
          page.drawText(b.text || '', { x: margin + 5, y, size: 14, font: fBold, color: rgb(0.1, 0.4, 0.8) });
          y -= 30;
        } else if (b.type === 'point') {
          const lines = wrapText(b.text || '', fReg, 11, PW - 2 * margin - 20);
          checkPage(lines.length * 15 + 10);
          page.drawText('•', { x: margin + 5, y, size: 14, font: fBold, color: rgb(0, 0.7, 0.5) });
          lines.forEach(line => {
            page.drawText(line, { x: margin + 20, y, size: 11, font: fReg });
            y -= 15;
          });
          y -= 5;
        } else if (b.type === 'def') {
          const key = `${b.k}: `;
          const val = b.v || '';
          const keyWidth = fBold.widthOfTextAtSize(key, 11);
          const valLines = wrapText(val, fReg, 11, PW - 2 * margin - keyWidth - 10);
          checkPage(valLines.length * 15 + 10);
          page.drawText(key, { x: margin, y, size: 11, font: fBold, color: rgb(0.8, 0.4, 0) });
          valLines.forEach(line => {
            page.drawText(line, { x: margin + keyWidth, y, size: 11, font: fReg });
            y -= 15;
          });
          y -= 5;
        } else if (b.type === 'link') {
          checkPage(20);
          page.drawText('🔗', { x: margin, y, size: 10, font: fReg });
          page.drawText(b.text || '', { x: margin + 15, y, size: 11, font: fReg, color: rgb(0.2, 0.2, 0.9) });
          y -= 20;
        } else {
          const lines = wrapText(b.text || '', fReg, 11, PW - 2 * margin);
          checkPage(lines.length * 15 + 10);
          lines.forEach(line => {
            page.drawText(line, { x: margin, y, size: 11, font: fReg, color: rgb(0.3, 0.3, 0.3) });
            y -= 15;
          });
          y -= 10;
        }
      }

      // Footer with page numbers
      const pageCount = doc.getPageCount();
      for (let i = 0; i < pageCount; i++) {
        const p = doc.getPage(i);
        p.drawText(`Page ${i + 1} of ${pageCount} | Generated by ${userName || 'AnkitStudyPoint'}`, {
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
        a.download = `${seo.title || 'organized-notes'}-ankitstudypoint.pdf`;
        a.click();
      }
    } catch (err) {
      console.error('PDF Error:', err);
      alert('Failed to generate PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const wrapText = (text: string, font: any, size: number, maxWidth: number) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    });
    lines.push(currentLine);
    return lines;
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
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-[#7a8499]" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest">Configuration</h3>
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
                    placeholder="Document Title (for PDF & HTML)"
                    value={seo.title}
                    onChange={(e) => setSeo({...seo, title: e.target.value})}
                  />
                  <input 
                    className="w-full bg-[#0d0f12] border border-[#2a3045] rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-blue-500/50"
                    placeholder="Meta Description (for SEO HTML)"
                    value={seo.desc}
                    onChange={(e) => setSeo({...seo, desc: e.target.value})}
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
                        <p className="text-sm leading-relaxed">{block.text}</p>
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
