const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font
GlobalFonts.registerFromPath(path.join(__dirname, 'xyzfont.ttf'), 'XyzFont');

// Word-wrap
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? ' ' : '') + words[i];
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Fit font size & max lines
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 20, maxLines = 3, maxFontSize = 60) {
  let fontSize = maxFontSize;
  let lines = [];

  do {
    ctx.font = `bold ${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2);
    if (lines.length > maxLines) fontSize -= 2;
    else break;
  } while (fontSize > 10);

  return { fontSize, lines };
}

// Draw justified text
function drawJustifiedText(ctx, lines, x, yStart, lineHeight, canvasWidth, margin) {
  lines.forEach((line, idx) => {
    const words = line.split(' ');
    if (words.length === 1) {
      ctx.fillText(line, x, yStart + idx * lineHeight);
      return;
    }
    const totalWidth = words.reduce((sum, word) => sum + ctx.measureText(word).width, 0);
    const spaceWidth = (canvasWidth - margin * 2 - totalWidth) / (words.length - 1);
    let xPos = margin;
    words.forEach(word => {
      ctx.fillText(word, xPos, yStart + idx * lineHeight);
      xPos += ctx.measureText(word).width + spaceWidth;
    });
  });
}

// --- BRAT BASIC JPEG ---
function generateImage(text) {
  const width = 500, height = 500, margin = 20;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient untuk lebih menarik
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#f0f0f0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (text.length > 100) text = text.substring(0, 100);

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin, 3, 60);

  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.2;
  const yStart = margin;

  drawJustifiedText(ctx, lines, margin, yStart, lineHeight, width, margin);

  // Return sebagai JPEG
  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

// --- BRAT ANIMASI GIF TYPING EFFECT ---
function generateGifAnimated(text) {
  const width = 500, height = 500, margin = 20;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Setup GIF encoder
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0); // Loop forever
  encoder.setDelay(80); // 80ms per frame untuk animasi ketikan yang jelas
  encoder.setQuality(15);
  encoder.setTransparent(null); // Tidak transparan untuk video/gif

  // Teks yang akan dianimasikan
  const displayText = text.length > 100 ? text.substring(0, 100) : text;
  const words = displayText.split(' ');
  
  // Setup font
  const { fontSize, lines } = fitTextToCanvas(ctx, displayText, width, height, margin, 3, 60);
  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.2;
  const maxLineWidth = width - margin * 2;
  
  // Hitung posisi teks (center vertikal)
  const totalTextHeight = lines.length * lineHeight;
  const yStart = (height - totalTextHeight) / 2;
  
  // Pre-calculate semua garis dengan word-wrap
  const allLines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const testWidth = ctx.measureText(testLine).width;
    
    if (testWidth <= maxLineWidth || currentLine === '') {
      currentLine = testLine;
    } else {
      allLines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) {
    allLines.push(currentLine);
  }
  
  // Batasi maksimal 3 baris
  const displayLines = allLines.slice(0, 3);
  
  // Animasi mengetik kata per kata
  let currentWords = [];
  const lineWords = displayLines.map(line => line.split(' '));
  
  // INFINITE LOOP ANIMASI
  while (true) {
    // Reset untuk loop baru
    currentWords = [];
    
    // TAHAP 1: MENGETIK TEKS
    for (let lineIdx = 0; lineIdx < lineWords.length; lineIdx++) {
      for (let wordIdx = 0; wordIdx < lineWords[lineIdx].length; wordIdx++) {
        // Tambah kata baru
        currentWords.push({
          line: lineIdx,
          word: lineWords[lineIdx][wordIdx],
          index: wordIdx
        });
        
        // Frame 1: Gambar tanpa cursor
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#000000';
        
        // Gambar semua kata yang sudah ditampilkan
        for (let l = 0; l <= lineIdx; l++) {
          const wordsInLine = currentWords.filter(cw => cw.line === l).map(cw => cw.word);
          if (wordsInLine.length === 0) continue;
          
          const lineText = wordsInLine.join(' ');
          const lineY = yStart + (l * lineHeight);
          const lineWidth = ctx.measureText(lineText).width;
          const xStart = (width - lineWidth) / 2;
          
          ctx.fillText(lineText, xStart, lineY);
        }
        encoder.addFrame(ctx);
        
        // Frame 2: Gambar dengan cursor (efek ketikan)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#000000';
        
        for (let l = 0; l <= lineIdx; l++) {
          const wordsInLine = currentWords.filter(cw => cw.line === l).map(cw => cw.word);
          if (wordsInLine.length === 0) continue;
          
          let lineText = wordsInLine.join(' ');
          const lineY = yStart + (l * lineHeight);
          const lineWidth = ctx.measureText(lineText).width;
          const xStart = (width - lineWidth) / 2;
          
          // Tambah cursor hanya di kata terakhir yang sedang diketik
          if (l === lineIdx && wordIdx === wordsInLine.length - 1) {
            lineText = lineText + '|';
          }
          
          ctx.fillText(lineText, xStart, lineY);
        }
        encoder.addFrame(ctx);
      }
    }
    
    // TAHAP 2: TEKS LENGKAP DITAMPILKAN (10 frame)
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      
      for (let l = 0; l < displayLines.length; l++) {
        const lineY = yStart + (l * lineHeight);
        const lineText = displayLines[l];
        const lineWidth = ctx.measureText(lineText).width;
        const xStart = (width - lineWidth) / 2;
        
        ctx.fillText(lineText, xStart, lineY);
      }
      encoder.addFrame(ctx);
    }
    
    // TAHAP 3: EFEK HILANG (fade out - 5 frame)
    for (let fade = 0; fade <= 5; fade++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - (fade / 5)})`;
      
      for (let l = 0; l < displayLines.length; l++) {
        const lineY = yStart + (l * lineHeight);
        const lineText = displayLines[l];
        const lineWidth = ctx.measureText(lineText).width;
        const xStart = (width - lineWidth) / 2;
        
        ctx.fillText(lineText, xStart, lineY);
      }
      encoder.addFrame(ctx);
    }
    
    // TAHAP 4: JEDA SEBELUM RESTART (3 frame kosong)
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      encoder.addFrame(ctx);
    }
    
    // Untuk mencegah infinite loop di Node.js, kita batasi 5 loop saja
    // Tapi karena encoder.setRepeat(0), GIF akan loop terus
    break;
  }
  
  encoder.finish();
  return encoder.out.getData();
}

// --- HANDLER ---
module.exports = async (req, res) => {
  const url = req.url || '';

  // BRAT BASIC JPEG
  if (url.startsWith('/brat') && !url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');
    if (!text) return res.status(400).json({ Warning: 'Parameter "text" diperlukan.' });

    try {
      const imageBuffer = generateImage(text);
      // Content-Type: image/jpeg
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imageBuffer);
    } catch (err) {
      console.error('Gagal membuat JPEG:', err);
      return res.status(500).send('Gagal membuat JPEG.');
    }
  }

  // BRAT ANIMASI GIF
  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');
    if (!text) return res.status(400).json({ Warning: 'Parameter "text" diperlukan.' });

    try {
      const gifBuffer = generateGifAnimated(text);
      // Content-Type: video/gif (sesuai permintaan)
      res.setHeader('Content-Type', 'video/gif');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(gifBuffer);
    } catch (err) {
      console.error('Gagal membuat GIF:', err);
      return res.status(500).send('Gagal membuat GIF.');
    }
  }

  // ROOT INFO
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify({
    info: "Brat Text & GIF Generator API",
    endpoints: {
      "/brat?text=...": "Generate JPEG image",
      "/bratanim?text=...": "Generate animated typing GIF"
    },
    examples: {
      JPEG: "/brat?text=Halo%20dunia",
      GIF: "/bratanim?text=Typing%20effect%20kata%20per%20kata"
    },
    content_types: {
      "/brat": "image/jpeg",
      "/bratanim": "video/gif"
    },
    creator: "Xyz-kings"
  }, null, 2));
};