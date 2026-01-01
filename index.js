const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font
GlobalFonts.registerFromPath(path.join(__dirname, 'xyzfont.ttf'), 'XyzFont');

// Word-wrap untuk justify
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

// Fit font size dengan batasan line lebih fleksibel
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 40, maxLines = 4, maxFontSize = 100) {
  let fontSize = maxFontSize;
  let lines = [];

  do {
    ctx.font = `${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2);
    if (lines.length > maxLines) fontSize -= 3;
    else break;
  } while (fontSize > 60); // Minimum 20px

  return { fontSize, lines };
}

// Draw justified text
function drawJustifiedText(ctx, lines, x, yStart, lineHeight, canvasWidth, margin) {
  lines.forEach((line, idx) => {
    const words = line.split(' ');
    if (words.length === 1) {
      ctx.fillText(line, margin, yStart + idx * lineHeight);
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
  const width = 700, height = 700, margin = 40;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background dengan gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f5f7fa');
  gradient.addColorStop(1, '#c3cfe2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (text.length > 250) text = text.substring(0, 250);

  // Tentukan maxLines berdasarkan panjang text
  const textLength = text.length;
  const maxLines = textLength > 100 ? 4 : 3;
  const maxFontSize = textLength > 150 ? 50 : 60;

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin, maxLines, maxFontSize);

  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#2d3436';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.5;
  const totalTextHeight = lines.length * lineHeight;
  const yStart = (height - totalTextHeight) / 2;

  drawJustifiedText(ctx, lines, margin, yStart, lineHeight, width, margin);

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

// --- BRAT ANIMASI GIF KATA PER KATA YANG RAPI ---
function generateGifAnimated(text) {
  const width = 700, height = 700, margin = 40;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Setup GIF encoder
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0); // Infinite loop
  encoder.setDelay(120); // 120ms per kata
  encoder.setQuality(15);

  // Persiapan text
  const words = text.split(' ');
  if (words.length > 30) {
    words.length = 30; // Batasi maksimal 30 kata
  }

  // Tentukan ukuran font berdasarkan jumlah kata
  const tempText = words.slice(0, Math.min(8, words.length)).join(' ');
  const maxLines = words.length > 15 ? 4 : 3;
  const maxFontSize = words.length > 20 ? 48 : 60;
  
  const { fontSize } = fitTextToCanvas(ctx, tempText, width, height, margin, maxLines, maxFontSize);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#2d3436';
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.5;
  const maxLineWidth = width - margin * 2;

  // PRE-CALCULATE: Tentukan posisi setiap kata dengan benar
  const wordPositions = [];
  let currentLineWords = [];
  let currentLineText = '';
  let currentLineIndex = 0;
  let currentLineY = 0;
  
  // Hitung posisi Y awal (center vertikal)
  const estimatedLines = Math.ceil(words.length / 5); // Estimasi kasar
  const startY = (height - (estimatedLines * lineHeight)) / 2;
  currentLineY = startY;
  
  // Proses setiap kata untuk menentukan posisinya
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLineText ? currentLineText + ' ' + word : word;
    const testWidth = ctx.measureText(testLine).width;
    
    // Jika melebihi width atau ini kata pertama di baris baru
    if ((testWidth > maxLineWidth && currentLineText !== '') || i === words.length) {
      // Simpan baris yang sudah terkumpul dengan posisi X yang benar
      const totalWidth = currentLineWords.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
      const spaceCount = currentLineWords.length - 1;
      const spaceWidth = spaceCount > 0 ? (maxLineWidth - totalWidth) / spaceCount : 0;
      
      let currentX = margin;
      for (let j = 0; j < currentLineWords.length; j++) {
        wordPositions.push({
          word: currentLineWords[j],
          line: currentLineIndex,
          x: currentX,
          y: currentLineY,
          indexInLine: j,
          totalInLine: currentLineWords.length
        });
        currentX += ctx.measureText(currentLineWords[j]).width + spaceWidth;
      }
      
      // Reset untuk baris baru
      currentLineIndex++;
      currentLineWords = [word];
      currentLineText = word;
      currentLineY += lineHeight;
    } else {
      // Tambah ke baris saat ini
      currentLineWords.push(word);
      currentLineText = testLine;
    }
  }
  
  // Simpan baris terakhir
  if (currentLineWords.length > 0) {
    const totalWidth = currentLineWords.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
    const spaceCount = currentLineWords.length - 1;
    const spaceWidth = spaceCount > 0 ? (maxLineWidth - totalWidth) / spaceCount : 0;
    
    let currentX = margin;
    for (let j = 0; j < currentLineWords.length; j++) {
      wordPositions.push({
        word: currentLineWords[j],
        line: currentLineIndex,
        x: currentX,
        y: currentLineY,
        indexInLine: j,
        totalInLine: currentLineWords.length
      });
      currentX += ctx.measureText(currentLineWords[j]).width + spaceWidth;
    }
  }
  
  // ANIMASI: Tampilkan kata per kata dengan urutan yang benar
  const totalWords = wordPositions.length;
  
  // Frame pertama: hanya background
  {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f5f7fa');
    gradient.addColorStop(1, '#c3cfe2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    encoder.addFrame(ctx);
  }
  
  // Animasi kata per kata
  for (let frame = 0; frame <= totalWords; frame++) {
    // Clear canvas dengan background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f5f7fa');
    gradient.addColorStop(1, '#c3cfe2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Setup font
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = '#2d3436';
    
    // Gambar kata-kata yang sudah muncul
    for (let i = 0; i < frame && i < totalWords; i++) {
      const pos = wordPositions[i];
      ctx.fillText(pos.word, pos.x, pos.y);
    }
    
    encoder.addFrame(ctx);
    
    // Tambah extra frame untuk kata terakhir di setiap baris
    if (frame < totalWords) {
      const currentWord = wordPositions[frame];
      const isLastInLine = currentWord && (currentWord.indexInLine === currentWord.totalInLine - 1);
      
      if (isLastInLine) {
        // Duplicate frame untuk jeda kecil di akhir baris
        encoder.addFrame(ctx);
      }
    }
  }
  
  // Tahan teks lengkap (8 frame)
  for (let i = 0; i < 8; i++) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f5f7fa');
    gradient.addColorStop(1, '#c3cfe2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = '#2d3436';
    
    wordPositions.forEach(pos => {
      ctx.fillText(pos.word, pos.x, pos.y);
    });
    
    encoder.addFrame(ctx);
  }
  
  // Fade out (6 frame)
  for (let fade = 0; fade <= 6; fade++) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f5f7fa');
    gradient.addColorStop(1, '#c3cfe2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = `rgba(45, 52, 54, ${1 - (fade / 6)})`;
    
    wordPositions.forEach(pos => {
      ctx.fillText(pos.word, pos.x, pos.y);
    });
    
    encoder.addFrame(ctx);
  }
  
  encoder.finish();
  return encoder.out.getData();
}

// --- HANDLER ---
module.exports = async (req, res) => {
  const url = req.url || '';
  const host = req.headers.host || 'localhost';

  // BRAT BASIC JPEG
  if (url.startsWith('/brat') && !url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${host}`).searchParams;
    const text = urlParams.get('text');
    
    if (!text) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Brat JPEG Generator</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              padding: 20px;
              color: #333;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .header {
              text-align: center;
              margin-bottom: 40px;
            }
            .header h1 {
              color: #667eea;
              font-size: 2.5em;
              margin-bottom: 10px;
            }
            .header p {
              color: #666;
              font-size: 1.1em;
            }
            .form-container {
              background: white;
              padding: 30px;
              border-radius: 15px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
              margin-bottom: 30px;
            }
            .form-group {
              margin-bottom: 20px;
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-weight: 600;
              color: #444;
            }
            textarea {
              width: 100%;
              padding: 15px;
              border: 2px solid #e0e0e0;
              border-radius: 10px;
              font-size: 16px;
              font-family: inherit;
              resize: vertical;
              transition: border-color 0.3s;
            }
            textarea:focus {
              outline: none;
              border-color: #667eea;
            }
            .btn {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              padding: 15px 30px;
              font-size: 16px;
              border-radius: 10px;
              cursor: pointer;
              font-weight: 600;
              transition: transform 0.3s, box-shadow 0.3s;
              display: inline-block;
              text-decoration: none;
            }
            .btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
            }
            .preview {
              text-align: center;
              margin: 30px 0;
              padding: 20px;
              background: #f8f9fa;
              border-radius: 15px;
            }
            .preview img {
              max-width: 100%;
              border-radius: 10px;
              box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            }
            .examples {
              margin-top: 30px;
            }
            .examples h3 {
              margin-bottom: 15px;
              color: #444;
            }
            .example-links {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            .example-link {
              background: #e9ecef;
              padding: 8px 15px;
              border-radius: 20px;
              text-decoration: none;
              color: #667eea;
              font-size: 0.9em;
              transition: background 0.3s;
            }
            .example-link:hover {
              background: #dee2e6;
            }
            .nav {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              text-align: center;
            }
            .info-box {
              background: #e3f2fd;
              padding: 15px;
              border-radius: 10px;
              margin: 20px 0;
              border-left: 4px solid #2196f3;
            }
            .info-box h4 {
              color: #1976d2;
              margin-bottom: 8px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎨 Brat JPEG Generator</h1>
              <p>Create beautiful justified text images with perfect alignment</p>
            </div>
            
            <div class="info-box">
              <h4>✨ Fitur Unggulan:</h4>
              <p>• Text justify alignment yang rapi</p>
              <p>• Font size otomatis (besar untuk teks pendek, optimal untuk teks panjang)</p>
              <p>• 3-4 lines maksimal dengan font yang mudah dibaca</p>
              <p>• Background gradient yang eye-catching</p>
            </div>
            
            <div class="form-container">
              <form action="/brat" method="get">
                <div class="form-group">
                  <label for="text">Enter your text:</label>
                  <textarea 
                    id="text" 
                    name="text" 
                    rows="4" 
                    placeholder="Type your text here... Example: Create beautiful justified text images with perfect alignment and readable font size"
                    required
                  ></textarea>
                </div>
                <button type="submit" class="btn">Generate JPEG Image</button>
              </form>
            </div>
            
            <div class="preview">
              <h3>Preview:</h3>
              <img src="/brat?text=Create%20Beautiful%20Justified%20Text%20Images%20With%20Perfect%20Alignment%20And%20Optimal%20Font%20Size%20For%20Best%20Readability" 
                   alt="JPEG Preview">
            </div>
            
            <div class="examples">
              <h3>Try these examples:</h3>
              <div class="example-links">
                <a href="/brat?text=Hello%20World" class="example-link">Short Text</a>
                <a href="/brat?text=This%20is%20a%20medium%20length%20text%20example" class="example-link">Medium Text</a>
                <a href="/brat?text=Create%20amazing%20text%20images%20with%20perfect%20justify%20alignment%20and%20beautiful%20typography%20for%20your%20projects" class="example-link">Long Text</a>
                <a href="/brat?text=The%20quick%20brown%20fox%20jumps%20over%20the%20lazy%20dog%20This%20sentence%20contains%20all%20letters" class="example-link">All Letters</a>
              </div>
            </div>
            
            <div class="nav">
              <a href="/" class="btn">🏠 Back to Home</a>
              <a href="/bratanim" class="btn">🎬 Try GIF Version</a>
            </div>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const imageBuffer = generateImage(text);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `inline; filename="brat-${Date.now()}.jpg"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imageBuffer);
    } catch (err) {
      console.error('Error:', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">⚠️ Error Generating Image</h1>
          <p style="color: #666; margin: 20px 0;">${err.message}</p>
          <a href="/brat" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Try Again</a>
        </body>
        </html>
      `);
    }
  }

  // BRAT ANIMASI GIF
  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${host}`).searchParams;
    const text = urlParams.get('text');
    
    if (!text) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Brat GIF Generator</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #00b09b 0%, #96c93d 100%);
              min-height: 100vh;
              padding: 20px;
              color: #333;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .header {
              text-align: center;
              margin-bottom: 40px;
            }
            .header h1 {
              color: #00b09b;
              font-size: 2.5em;
              margin-bottom: 10px;
            }
            .header p {
              color: #666;
              font-size: 1.1em;
            }
            .form-container {
              background: white;
              padding: 30px;
              border-radius: 15px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
              margin-bottom: 30px;
            }
            .form-group {
              margin-bottom: 20px;
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-weight: 600;
              color: #444;
            }
            textarea {
              width: 100%;
              padding: 15px;
              border: 2px solid #e0e0e0;
              border-radius: 10px;
              font-size: 16px;
              font-family: inherit;
              resize: vertical;
              transition: border-color 0.3s;
            }
            textarea:focus {
              outline: none;
              border-color: #00b09b;
            }
            .btn {
              background: linear-gradient(135deg, #00b09b 0%, #96c93d 100%);
              color: white;
              border: none;
              padding: 15px 30px;
              font-size: 16px;
              border-radius: 10px;
              cursor: pointer;
              font-weight: 600;
              transition: transform 0.3s, box-shadow 0.3s;
              display: inline-block;
              text-decoration: none;
            }
            .btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(0, 176, 155, 0.4);
            }
            .preview {
              text-align: center;
              margin: 30px 0;
              padding: 20px;
              background: #f8f9fa;
              border-radius: 15px;
            }
            .preview img {
              max-width: 100%;
              border-radius: 10px;
              box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            }
            .examples {
              margin-top: 30px;
            }
            .examples h3 {
              margin-bottom: 15px;
              color: #444;
            }
            .example-links {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            .example-link {
              background: #e9ecef;
              padding: 8px 15px;
              border-radius: 20px;
              text-decoration: none;
              color: #00b09b;
              font-size: 0.9em;
              transition: background 0.3s;
            }
            .example-link:hover {
              background: #dee2e6;
            }
            .feature-list {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 15px;
              margin: 20px 0;
            }
            .feature-list ul {
              list-style: none;
              padding-left: 0;
            }
            .feature-list li {
              padding: 8px 0;
              color: #555;
            }
            .feature-list li:before {
              content: "✓ ";
              color: #00b09b;
              font-weight: bold;
            }
            .info-box {
              background: #e8f5e9;
              padding: 15px;
              border-radius: 10px;
              margin: 20px 0;
              border-left: 4px solid #4caf50;
            }
            .info-box h4 {
              color: #2e7d32;
              margin-bottom: 8px;
            }
            .nav {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎬 Brat GIF Generator</h1>
              <p>Create animated word-by-word typing GIFs</p>
            </div>
            
            <div class="info-box">
              <h4>✨ Animasi yang Rapi:</h4>
              <p>• Kata muncul satu per satu dengan urutan yang benar</p>
              <p>• Text justify alignment yang sempurna</p>
              <p>• Otomatis pindah baris ketika penuh</p>
              <p>• Font size besar dan mudah dibaca</p>
              <p>• Tidak ada tumpukan kata, layout yang teratur</p>
            </div>
            
            <div class="form-container">
              <form action="/bratanim" method="get">
                <div class="form-group">
                  <label for="text">Enter your text:</label>
                  <textarea 
                    id="text" 
                    name="text" 
                    rows="4" 
                    placeholder="Type your text here... Example: Hello welcome to Brat GIF generator watch each word appear one by one with perfect alignment"
                    required
                  ></textarea>
                </div>
                <button type="submit" class="btn">Generate Animated GIF</button>
              </form>
            </div>
            
            <div class="preview">
              <h3>Live Preview:</h3>
              <img src="/bratanim?text=Welcome%20to%20Brat%20GIF%20Generator%20Watch%20words%20appear%20one%20by%20one%20with%20perfect%20alignment%20and%20smooth%20animation" 
                   alt="GIF Preview">
            </div>
            
            <div class="feature-list">
              <h3>✨ Features:</h3>
              <ul>
                <li>Word-by-word animation (tanpa cursor)</li>
                <li>Justified text alignment yang rapi</li>
                <li>Otomatis wrap ke baris berikutnya</li>
                <li>Font size besar dan optimal</li>
                <li>Background gradient yang eye-catching</li>
                <li>Infinite loop animation</li>
              </ul>
            </div>
            
            <div class="examples">
              <h3>Try these examples:</h3>
              <div class="example-links">
                <a href="/bratanim?text=Hello%20World" class="example-link">Short Text</a>
                <a href="/bratanim?text=This%20is%20a%20word%20by%20word%20animation" class="example-link">Animation Demo</a>
                <a href="/bratanim?text=Create%20beautiful%20animated%20text%20with%20perfect%20justify%20alignment%20for%20your%20social%20media%20posts" class="example-link">Long Example</a>
                <a href="/bratanim?text=Watch%20each%20word%20appear%20smoothly%20in%20perfect%20order%20with%20no%20overlapping" class="example-link">Smooth Animation</a>
              </div>
            </div>
            
            <div class="nav">
              <a href="/" class="btn">🏠 Back to Home</a>
              <a href="/brat" class="btn">📸 Try JPEG Version</a>
            </div>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const gifBuffer = generateGifAnimated(text);
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Content-Disposition', `inline; filename="brat-anim-${Date.now()}.gif"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(gifBuffer);
    } catch (err) {
      console.error('Error:', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">⚠️ Error Generating GIF</h1>
          <p style="color: #666; margin: 20px 0;">${err.message}</p>
          <a href="/bratanim" style="background: #00b09b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Try Again</a>
        </body>
        </html>
      `);
    }
  }

  // ROOT INFO
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>✨ Brat Generator - Text to Image & GIF</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        :root {
          --primary: #6c5ce7;
          --secondary: #a29bfe;
          --accent: #fd79a8;
          --dark: #2d3436;
          --light: #f8f9fa;
          --success: #00b894;
          --warning: #fdcb6e;
        }
        
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: var(--dark);
          min-height: 100vh;
          line-height: 1.6;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        
        /* Hero Section */
        .hero {
          text-align: center;
          padding: 60px 20px;
          color: white;
          animation: fadeIn 1s ease-out;
        }
        
        .hero h1 {
          font-size: 3.5em;
          margin-bottom: 20px;
          text-shadow: 0 4px 12px rgba(0,0,0,0.3);
          background: linear-gradient(to right, #fff, #f0f0f0);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        
        .hero p {
          font-size: 1.3em;
          max-width: 700px;
          margin: 0 auto 30px;
          opacity: 0.9;
        }
        
        .tagline {
          display: inline-block;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          padding: 10px 25px;
          border-radius: 50px;
          margin: 20px 0;
          border: 1px solid rgba(255,255,255,0.2);
        }
        
        /* Info Box */
        .info-container {
          max-width: 800px;
          margin: 30px auto;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          padding: 30px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
        }
        
        .info-container h2 {
          text-align: center;
          margin-bottom: 25px;
          color: white;
        }
        
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        
        .feature-item {
          background: rgba(255,255,255,0.15);
          padding: 20px;
          border-radius: 15px;
          text-align: center;
          border: 1px solid rgba(255,255,255,0.1);
        }
        
        .feature-icon {
          font-size: 2.5em;
          margin-bottom: 15px;
          color: var(--warning);
        }
        
        .feature-item h3 {
          margin-bottom: 10px;
          font-size: 1.3em;
        }
        
        .feature-item p {
          font-size: 0.95em;
          opacity: 0.9;
        }
        
        /* Cards Grid */
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 30px;
          margin: 40px 0;
        }
        
        .card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
          transition: all 0.3s ease;
          position: relative;
        }
        
        .card:hover {
          transform: translateY(-10px);
          box-shadow: 0 30px 60px rgba(0,0,0,0.2);
        }
        
        .card-header {
          padding: 30px 30px 20px;
          text-align: center;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        
        .card-icon {
          font-size: 3em;
          margin-bottom: 15px;
          display: block;
        }
        
        .jpeg-icon { color: var(--primary); }
        .gif-icon { color: var(--accent); }
        
        .card h3 {
          font-size: 1.8em;
          margin-bottom: 10px;
          color: var(--dark);
        }
        
        .card-content {
          padding: 25px;
        }
        
        .card-features {
          list-style: none;
          margin-bottom: 25px;
        }
        
        .card-features li {
          padding: 10px 0;
          display: flex;
          align-items: center;
          color: #555;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        
        .card-features li:last-child {
          border-bottom: none;
        }
        
        .card-features li i {
          color: var(--success);
          margin-right: 12px;
          font-size: 1.2em;
          min-width: 24px;
        }
        
        .preview-area {
          text-align: center;
          margin: 20px 0;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 12px;
        }
        
        .preview-area img {
          max-width: 100%;
          border-radius: 10px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          border: 3px solid white;
        }
        
        .btn-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        
        .btn {
          flex: 1;
          padding: 14px 20px;
          text-align: center;
          text-decoration: none;
          border-radius: 12px;
          font-weight: 600;
          font-size: 1em;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .btn-primary {
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          color: white;
        }
        
        .btn-secondary {
          background: rgba(108, 92, 231, 0.1);
          color: var(--primary);
          border: 2px solid var(--primary);
        }
        
        .btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 20px rgba(108, 92, 231, 0.3);
        }
        
        /* Stats */
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 50px 0;
        }
        
        .stat-item {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 15px;
          padding: 25px;
          text-align: center;
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
        }
        
        .stat-number {
          font-size: 2.5em;
          font-weight: bold;
          margin-bottom: 10px;
          color: white;
        }
        
        .stat-label {
          font-size: 1em;
          opacity: 0.9;
        }
        
        /* Footer */
        footer {
          text-align: center;
          padding: 40px 20px;
          margin-top: 50px;
          border-top: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.8);
        }
        
        .creator {
          font-size: 1.1em;
          margin-top: 20px;
          color: white;
        }
        
        .creator strong {
          color: var(--warning);
        }
        
        /* Animations */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        
        .floating {
          animation: float 3s ease-in-out infinite;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .hero h1 { font-size: 2.5em; }
          .cards-grid { grid-template-columns: 1fr; }
          .btn-group { flex-direction: column; }
          .feature-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Hero Section -->
        <section class="hero">
          <div class="floating">
            <h1>✨ Brat Generator</h1>
          </div>
          <div class="tagline">
            <i class="fas fa-magic"></i> Create Perfectly Aligned Text Images & Animations
          </div>
          <p>Generate stunning JPEG images and animated GIFs with word-by-word typing effects and perfect justify alignment.</p>
        </section>
        
        <!-- Features Info -->
        <div class="info-container">
          <h2>🚀 Enhanced Features</h2>
          <div class="feature-grid">
            <div class="feature-item">
              <div class="feature-icon"><i class="fas fa-text-height"></i></div>
              <h3>Optimal Font Size</h3>
              <p>Font besar untuk teks pendek (3 lines), optimal untuk teks panjang (4 lines)</p>
            </div>
            <div class="feature-item">
              <div class="feature-icon"><i class="fas fa-align-justify"></i></div>
              <h3>Perfect Justify</h3>
              <p>Text alignment justify yang rapi dari kiri ke kanan</p>
            </div>
            <div class="feature-item">
              <div class="feature-icon"><i class="fas fa-film"></i></div>
              <h3>Smooth Animation</h3>
              <p>Animasi kata-per-kata tanpa tumpukan, layout teratur</p>
            </div>
          </div>
        </div>
        
        <!-- Cards Grid -->
        <div class="cards-grid">
          <!-- JPEG Card -->
          <div class="card">
            <div class="card-header">
              <span class="card-icon jpeg-icon">
                <i class="fas fa-image"></i>
              </span>
              <h3>JPEG Generator</h3>
              <p>High-quality justified text images</p>
            </div>
            <div class="card-content">
              <ul class="card-features">
                <li><i class="fas fa-check"></i> Font size 60px untuk teks pendek</li>
                <li><i class="fas fa-check"></i> Maksimal 3-4 lines</li>
                <li><i class="fas fa-check"></i> Justify alignment sempurna</li>
                <li><i class="fas fa-check"></i> Background gradient premium</li>
                <li><i class="fas fa-check"></i> Format JPEG kualitas tinggi</li>
              </ul>
              
              <div class="preview-area">
                <img src="/brat?text=Create%20Beautiful%20Justified%20Text%20With%20Perfect%20Alignment%20And%20Optimal%20Font%20Size%20For%20Best%20Readability" 
                     alt="JPEG Preview">
              </div>
              
              <div class="btn-group">
                <a href="/brat" class="btn btn-primary">
                  <i class="fas fa-play-circle"></i> Try JPEG Generator
                </a>
                <a href="/brat?text=Hello%20World%20Example%20Text" class="btn btn-secondary">
                  <i class="fas fa-eye"></i> See Example
                </a>
              </div>
            </div>
          </div>
          
          <!-- GIF Card -->
          <div class="card">
            <div class="card-header">
              <span class="card-icon gif-icon">
                <i class="fas fa-film"></i>
              </span>
              <h3>GIF Generator</h3>
              <p>Animated word-by-word typing</p>
            </div>
            <div class="card-content">
              <ul class="card-features">
                <li><i class="fas fa-check"></i> Kata muncul satu per satu</li>
                <li><i class="fas fa-check"></i> Layout rapi tanpa tumpukan</li>
                <li><i class="fas fa-check"></i> Otomatis wrap ke baris baru</li>
                <li><i class="fas fa-check"></i> Font size besar dan jelas</li>
                <li><i class="fas fa-check"></i> Infinite loop animation</li>
              </ul>
              
              <div class="preview-area">
                <img src="/bratanim?text=Watch%20Words%20Appear%20One%20By%20One%20With%20Perfect%20Alignment%20And%20Smooth%20Animation%20Effects" 
                     alt="GIF Preview">
              </div>
              
              <div class="btn-group">
                <a href="/bratanim" class="btn btn-primary">
                  <i class="fas fa-play-circle"></i> Try GIF Generator
                </a>
                <a href="/bratanim?text=Typing%20Animation%20Example" class="btn btn-secondary">
                  <i class="fas fa-eye"></i> See Example
                </a>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Stats -->
        <div class="stats">
          <div class="stat-item">
            <div class="stat-number">60px</div>
            <div class="stat-label">Max Font Size</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">4</div>
            <div class="stat-label">Max Lines</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">100%</div>
            <div class="stat-label">Justify Align</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">⚡</div>
            <div class="stat-label">Fast Processing</div>
          </div>
        </div>
        
        <!-- Footer -->
        <footer>
          <p>Made with <i class="fas fa-heart" style="color: var(--accent);"></i> for creative content creators</p>
          <div class="creator">
            Powered by <strong>XYZ Font</strong> • Created by <strong>Xyz-kings</strong>
          </div>
          <p style="margin-top: 20px; font-size: 0.9em;">
            No registration required • Instant generation • Perfect for social media
          </p>
        </footer>
      </div>
      
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          // Add click animation to buttons
          document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
              this.style.transform = 'scale(0.95)';
              setTimeout(() => {
                this.style.transform = '';
              }, 200);
            });
          });
          
          // Update preview images periodically
          const previews = document.querySelectorAll('.preview-area img');
          const jpegTexts = [
            "Create Stunning Justified Text Images With Perfect Alignment And Optimal Font Size",
            "Generate Beautiful Text Graphics With Professional Justify Alignment In Seconds",
            "Perfect For Social Media Posts With Clean Typography And Modern Design"
          ];
          
          const gifTexts = [
            "Watch Words Appear One By One With Smooth Animation And Perfect Alignment",
            "Create Engaging Animated Text For Your Social Media Content Instantly",
            "Word By Word Typing Animation With Clean Layout And Professional Design"
          ];
          
          let textIndex = 0;
          setInterval(() => {
            textIndex = (textIndex + 1) % jpegTexts.length;
            
            previews.forEach((img, index) => {
              const isGif = img.src.includes('bratanim');
              const text = isGif ? gifTexts[textIndex] : jpegTexts[textIndex];
              const endpoint = isGif ? '/bratanim' : '/brat';
              
              // Create new image to preload
              const newImg = new Image();
              newImg.onload = function() {
                img.src = endpoint + '?text=' + encodeURIComponent(text);
              };
              newImg.src = endpoint + '?text=' + encodeURIComponent(text);
            });
          }, 6000);
        });
      </script>
    </body>
    </html>
  `);
};