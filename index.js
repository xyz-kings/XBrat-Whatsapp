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

// --- BRAT BASIC PNG ---
function generateImage(text) {
  const width = 500, height = 500, margin = 20;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  if (text.length > 100) text = text.substring(0, 100);

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin, 3, 60);

  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.2;
  const yStart = margin;

  drawJustifiedText(ctx, lines, margin, yStart, lineHeight, width, margin);

  return canvas.toBuffer('image/png');
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
  encoder.setDelay(50); // 50ms per frame untuk animasi lebih smooth
  encoder.setQuality(10);
  encoder.setTransparent(0xFFFFFF); // Background putih jadi transparan

  // Teks yang akan dianimasikan
  const displayText = text.length > 100 ? text.substring(0, 100) : text;
  const words = displayText.split(' ');
  
  // Setup font
  const { fontSize, lines } = fitTextToCanvas(ctx, displayText, width, height, margin, 3, 60);
  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.2;
  const maxLineWidth = width - margin * 2;
  
  // Hitung posisi teks (center vertikal dan horizontal)
  const totalTextHeight = lines.length * lineHeight;
  const yStart = (height - totalTextHeight) / 2;
  
  // Pre-calculate semua garis dengan word-wrap
  const allLines = [];
  let currentLine = '';
  let currentLineWidth = 0;
  
  for (const word of words) {
    const wordWidth = ctx.measureText(word + ' ').width;
    
    if (currentLineWidth + wordWidth <= maxLineWidth || currentLine === '') {
      currentLine += (currentLine ? ' ' : '') + word;
      currentLineWidth += wordWidth;
    } else {
      allLines.push({ text: currentLine, width: currentLineWidth });
      currentLine = word;
      currentLineWidth = wordWidth;
    }
  }
  
  if (currentLine) {
    allLines.push({ text: currentLine, width: currentLineWidth });
  }
  
  // Batasi maksimal 3 baris
  const displayLines = allLines.slice(0, 3);
  
  // TYPING ANIMATION
  let currentWords = [];
  let currentLineIndex = 0;
  let currentWordIndex = 0;
  let typingFrames = 0;
  
  // Loop animasi (untuk infinite loop)
  const totalLoops = 2; // Jumlah loop sebelum restart typing
  let currentLoop = 0;
  
  while (currentLoop < totalLoops) {
    // Reset untuk loop baru
    currentWords = [];
    currentLineIndex = 0;
    currentWordIndex = 0;
    
    // ANIMASI PENGETIKAN
    const lineWords = displayLines.map(line => line.text.split(' '));
    
    // Animasi mengetik kata per kata
    for (let l = 0; l < lineWords.length; l++) {
      for (let w = 0; w < lineWords[l].length; w++) {
        // Tambah kata baru ke display
        currentWords.push({ line: l, word: lineWords[l][w] });
        
        // Buat 3 frame untuk efek ketikan per kata
        for (let frame = 0; frame < 3; frame++) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = 'black';
          
          // Gambar semua kata yang sudah ditampilkan
          const displayedWordsByLine = {};
          
          for (const cw of currentWords) {
            if (!displayedWordsByLine[cw.line]) {
              displayedWordsByLine[cw.line] = [];
            }
            displayedWordsByLine[cw.line].push(cw.word);
          }
          
          // Gambar setiap baris
          for (const lineNum in displayedWordsByLine) {
            const lineY = yStart + (parseInt(lineNum) * lineHeight);
            const lineText = displayedWordsByLine[lineNum].join(' ');
            
            // Center horizontal
            const lineWidth = ctx.measureText(lineText).width;
            const xStart = (width - lineWidth) / 2;
            
            // Efek cursor berkedip untuk kata terakhir
            let displayText = lineText;
            if (parseInt(lineNum) === l && displayedWordsByLine[lineNum].length === w + 1 && frame % 2 === 0) {
              displayText = lineText + '|'; // Tambah cursor
            }
            
            ctx.fillText(displayText, xStart, lineY);
          }
          
          encoder.addFrame(ctx);
        }
      }
    }
    
    // Tahan teks lengkap sebentar (20 frame)
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'black';
      
      // Gambar semua baris lengkap
      for (let l = 0; l < displayLines.length; l++) {
        const lineY = yStart + (l * lineHeight);
        const lineText = displayLines[l].text;
        const lineWidth = ctx.measureText(lineText).width;
        const xStart = (width - lineWidth) / 2;
        
        ctx.fillText(lineText, xStart, lineY);
      }
      
      encoder.addFrame(ctx);
    }
    
    // ANIMASI PENGHAPUSAN (fade out)
    for (let fadeFrame = 0; fadeFrame < 10; fadeFrame++) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'black';
      ctx.globalAlpha = 1 - (fadeFrame / 10);
      
      for (let l = 0; l < displayLines.length; l++) {
        const lineY = yStart + (l * lineHeight);
        const lineText = displayLines[l].text;
        const lineWidth = ctx.measureText(lineText).width;
        const xStart = (width - lineWidth) / 2;
        
        ctx.fillText(lineText, xStart, lineY);
      }
      
      ctx.globalAlpha = 1;
      encoder.addFrame(ctx);
    }
    
    currentLoop++;
    
    // Jika bukan loop terakhir, tambah jeda singkat sebelum restart
    if (currentLoop < totalLoops) {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        encoder.addFrame(ctx);
      }
    }
  }
  
  encoder.finish();
  return encoder.out.getData();
}

// --- HANDLER ---
module.exports = async (req, res) => {
  const url = req.url || '';

  // BRAT BASIC PNG
  if (url.startsWith('/brat')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');
    if (!text) return res.status(400).json({ Warning: 'Parameter "text" diperlukan.' });

    try {
      const imageBuffer = generateImage(text);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imageBuffer);
    } catch (err) {
      console.error('Gagal membuat PNG:', err);
      return res.status(500).send('Gagal membuat PNG.');
    }
  }

  // BRAT ANIMASI GIF
  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');
    if (!text) return res.status(400).json({ Warning: 'Parameter "text" diperlukan.' });

    try {
      const gifBuffer = generateGifAnimated(text);
      res.setHeader('Content-Type', 'image/gif');
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
      "/brat?text=...": "Generate PNG image",
      "/bratanim?text=...": "Generate animated typing GIF"
    },
    examples: {
      PNG: "/brat?text=Hello%20World",
      GIF: "/bratanim?text=Hello%20World"
    },
    features: {
      "PNG": "Text dengan justify alignment",
      "GIF": "Typing animation kata-per-kata dengan efek cursor, infinite loop, center alignment"
    },
    creator: "Xyz-kings"
  }, null, 2));
};