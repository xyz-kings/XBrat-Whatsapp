const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font
GlobalFonts.registerFromPath(path.join(__dirname, 'xyzfont.ttf'), 'XyzFont');

// Word-wrap untuk justify TANPA ellipsis
function wrapText(ctx, text, maxWidth, maxLines = 5) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? ' ' : '') + words[i];
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = words[i];
      
      // Hentikan jika sudah mencapai maxLines
      if (lines.length === maxLines) {
        // Masukkan kata terakhir jika masih muat di line terakhir
        if (ctx.measureText(line).width <= maxWidth) {
          lines.push(line);
        }
        break;
      }
    } else {
      line = testLine;
    }
  }
  
  if (line && lines.length < maxLines) {
    lines.push(line);
  }
  
  return lines;
}

// Fit font size dengan logika cerdas: lebih sedikit kata = lebih besar font
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 50) {
  const words = text.split(' ');
  const wordCount = words.length;
  
  // Tentukan maxLines berdasarkan jumlah kata (3-5 lines)
  let maxLines;
  if (wordCount <= 5) {
    maxLines = 3; // Sangat pendek: 3 lines
  } else if (wordCount <= 15) {
    maxLines = 4; // Sedang: 4 lines
  } else {
    maxLines = 5; // Panjang: 5 lines
  }
  
  // Tentukan font size awal berdasarkan jumlah kata
  // Kurang kata = lebih besar font, lebih banyak kata = lebih kecil font
  let fontSize;
  if (wordCount <= 3) {
    fontSize = 180; // Sangat pendek: font maksimal
  } else if (wordCount <= 8) {
    fontSize = 170; // Pendek: font besar
  } else if (wordCount <= 15) {
    fontSize = 160; // Sedang: font medium
  } else if (wordCount <= 25) {
    fontSize = 150; // Agak panjang: font agak kecil
  } else {
    fontSize = 140; // Panjang: font minimum
  }
  
  let lines = [];
  let attempts = 0;
  const maxAttempts = 20; // Maksimal percobaan
  
  while (attempts < maxAttempts) {
    ctx.font = `${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2, maxLines);
    
    // Cek apakah text muat dalam canvas
    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const maxTextHeight = canvasHeight - margin * 2;
    
    // Jika text muat DAN jumlah lines tidak melebihi maxLines
    if (totalTextHeight <= maxTextHeight && lines.length <= maxLines) {
      break;
    }
    
    // Jika tidak muat, kurangi font size
    fontSize -= 2;
    attempts++;
    
    // Jangan biarkan font size terlalu kecil
    if (fontSize < 140) {
      fontSize = 140;
      break;
    }
  }
  
  return { fontSize, lines, maxLines };
}

// Draw justified text
function drawJustifiedText(ctx, lines, margin, lineHeight) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  
  // Hitung total tinggi text dan posisi Y awal (center vertikal)
  const totalTextHeight = lines.length * lineHeight;
  const startY = Math.max(margin, (canvasHeight - totalTextHeight) / 2);
  
  lines.forEach((line, idx) => {
    const y = startY + (idx * lineHeight);
    
    const words = line.split(' ');
    if (words.length === 1) {
      // Single word, draw biasa di margin kiri
      ctx.fillText(line, margin, y);
      return;
    }
    
    // Justify alignment untuk multiple words
    const totalWidth = words.reduce((sum, word) => sum + ctx.measureText(word).width, 0);
    const spaceCount = words.length - 1;
    const spaceWidth = spaceCount > 0 ? (canvasWidth - margin * 2 - totalWidth) / spaceCount : 0;
    let xPos = margin;
    
    words.forEach(word => {
      ctx.fillText(word, xPos, y);
      xPos += ctx.measureText(word).width + spaceWidth;
    });
  });
}

// --- BRAT BASIC JPEG ---
function generateImage(text) {
  const width = 1200, height = 1200, margin = 50;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background putih polos
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin);

  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.2;

  // Draw text
  drawJustifiedText(ctx, lines, margin, lineHeight);

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

// --- BRAT ANIMASI GIF KATA PER KATA ---
function generateGifAnimated(text) {
  const width = 800, height = 800, margin = 50;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Setup GIF encoder
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0); // Infinite loop
  encoder.setDelay(100); // 100ms per kata
  encoder.setQuality(20);

  // Tentukan font size dan lines
  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.2;
  const maxLineWidth = width - margin * 2;

  // Bangun semua kata dari lines
  const allWords = [];
  lines.forEach(line => {
    const words = line.split(' ');
    words.forEach(word => allWords.push(word));
  });

  // PRE-CALCULATE: Tentukan posisi setiap kata
  const wordPositions = [];
  let currentLineWords = [];
  let currentLineText = '';
  let currentLineIndex = 0;
  let currentY = margin;
  
  // Proses setiap kata untuk menentukan posisinya
  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    const testLine = currentLineText ? currentLineText + ' ' + word : word;
    const testWidth = ctx.measureText(testLine).width;
    
    // Jika melebihi width atau ini kata pertama di baris baru
    if ((testWidth > maxLineWidth && currentLineText !== '') || i === allWords.length) {
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
          y: currentY,
          indexInLine: j,
          totalInLine: currentLineWords.length
        });
        currentX += ctx.measureText(currentLineWords[j]).width + spaceWidth;
      }
      
      // Reset untuk baris baru
      currentLineIndex++;
      currentLineWords = [word];
      currentLineText = word;
      currentY += lineHeight;
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
        y: currentY,
        indexInLine: j,
        totalInLine: currentLineWords.length
      });
      currentX += ctx.measureText(currentLineWords[j]).width + spaceWidth;
    }
  }
  
  // ANIMASI: Tampilkan kata per kata
  const totalWords = wordPositions.length;
  
  // Frame pertama: hanya background putih
  {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    encoder.addFrame(ctx);
  }
  
  // Animasi kata per kata
  for (let frame = 0; frame <= totalWords; frame++) {
    // Clear canvas dengan background putih
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Setup font
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = '#000000';
    
    // Gambar kata-kata yang sudah muncul
    for (let i = 0; i < frame && i < totalWords; i++) {
      const pos = wordPositions[i];
      ctx.fillText(pos.word, pos.x, pos.y);
    }
    
    encoder.addFrame(ctx);
  }
  
  // HANYA 1 FRAME untuk teks lengkap
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  
  wordPositions.forEach(pos => {
    ctx.fillText(pos.word, pos.x, pos.y);
  });
  encoder.addFrame(ctx);
  
  // Fade out CEPAT (3 frame)
  for (let fade = 0; fade <= 3; fade++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - (fade / 3)})`;
    
    wordPositions.forEach(pos => {
      ctx.fillText(pos.word, pos.x, pos.y);
    });
    
    encoder.addFrame(ctx);
  }
  
  // Frame kosong sebelum loop (1 frame)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  encoder.addFrame(ctx);
  
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
              background: #f5f5f5;
              min-height: 100vh;
              padding: 20px;
              color: #333;
            }
            .container {
              max-width: 1000px;
              margin: 0 auto;
              background: white;
              border-radius: 12px;
              padding: 25px;
              box-shadow: 0 3px 10px rgba(0,0,0,0.08);
            }
            .header {
              text-align: center;
              margin-bottom: 25px;
              padding-bottom: 20px;
              border-bottom: 1px solid #eee;
            }
            .header h1 {
              color: #2c3e50;
              font-size: 1.8em;
              margin-bottom: 8px;
            }
            .header p {
              color: #7f8c8d;
              font-size: 1em;
            }
            .logic-box {
              background: #f0f7ff;
              padding: 15px;
              border-radius: 8px;
              margin: 15px 0;
              border-left: 3px solid #3498db;
            }
            .logic-box h4 {
              color: #2980b9;
              margin-bottom: 10px;
              font-size: 1em;
            }
            .logic-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
              margin-top: 10px;
            }
            .logic-item {
              background: white;
              padding: 10px;
              border-radius: 6px;
              text-align: center;
              border: 1px solid #e0e0e0;
            }
            .logic-label {
              font-size: 0.9em;
              color: #2c3e50;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .logic-value {
              font-size: 0.85em;
              color: #7f8c8d;
            }
            .form-container {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 20px;
              border: 1px solid #e0e0e0;
            }
            .form-group {
              margin-bottom: 15px;
            }
            label {
              display: block;
              margin-bottom: 6px;
              font-weight: 600;
              color: #2c3e50;
              font-size: 0.95em;
            }
            textarea {
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 6px;
              font-size: 14px;
              font-family: inherit;
              resize: vertical;
              transition: border-color 0.2s;
              min-height: 100px;
            }
            textarea:focus {
              outline: none;
              border-color: #3498db;
              box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.1);
            }
            .btn {
              background: #2c3e50;
              color: white;
              border: none;
              padding: 10px 20px;
              font-size: 14px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              transition: all 0.2s;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              text-decoration: none;
            }
            .btn:hover {
              background: #1a252f;
              transform: translateY(-1px);
            }
            .btn-primary {
              background: #3498db;
            }
            .btn-primary:hover {
              background: #2980b9;
            }
            .preview-container {
              margin: 20px 0;
            }
            .preview-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
              padding-bottom: 10px;
              border-bottom: 1px solid #eee;
            }
            .preview-header h3 {
              color: #2c3e50;
              margin: 0;
              font-size: 1.1em;
            }
            .preview-area {
              text-align: center;
              padding: 15px;
              background: white;
              border-radius: 8px;
              border: 2px solid #f0f0f0;
              overflow: hidden;
            }
            .preview-area img {
              max-width: 100%;
              border-radius: 4px;
              max-height: 350px;
              border: 1px solid #eee;
            }
            .examples {
              margin-top: 25px;
              padding-top: 15px;
              border-top: 1px solid #eee;
            }
            .examples h3 {
              margin-bottom: 12px;
              color: #2c3e50;
              font-size: 1.1em;
            }
            .example-links {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            .example-link {
              background: #ecf0f1;
              padding: 6px 12px;
              border-radius: 16px;
              text-decoration: none;
              color: #3498db;
              font-size: 0.85em;
              transition: background 0.2s;
              border: none;
              cursor: pointer;
            }
            .example-link:hover {
              background: #dde4e6;
            }
            .nav {
              margin-top: 25px;
              padding-top: 15px;
              border-top: 1px solid #eee;
              display: flex;
              gap: 10px;
              justify-content: center;
            }
            .icon {
              display: inline-flex;
              align-items: center;
              justify-content: center;
            }
            .info-text {
              color: #7f8c8d;
              font-size: 0.9em;
              margin-top: 5px;
              font-style: italic;
            }
            @media (max-width: 768px) {
              .logic-grid { grid-template-columns: 1fr; }
              .nav { flex-direction: column; }
              .container { padding: 15px; }
            }
          </style>
          <script>
            function updatePreview() {
              const textInput = document.getElementById('text');
              const previewImage = document.getElementById('previewImage');
              const previewContainer = document.getElementById('previewContainer');
              const wordCountDisplay = document.getElementById('wordCount');
              const fontSizeDisplay = document.getElementById('fontSize');
              const lineCountDisplay = document.getElementById('lineCount');
              
              const text = textInput.value.trim();
              const wordCount = text === '' ? 0 : text.split(' ').length;
              
              if (text.length > 0) {
                const encodedText = encodeURIComponent(text);
                const url = '/brat?text=' + encodedText;
                
                // Update preview image dengan cache bust
                previewImage.src = url + '&t=' + Date.now();
                previewContainer.style.display = 'block';
                
                // Update logic info
                wordCountDisplay.textContent = wordCount + ' words';
                
                // Tentukan font size berdasarkan jumlah kata
                let fontSize;
                if (wordCount <= 3) fontSize = '180px';
                else if (wordCount <= 8) fontSize = '170px';
                else if (wordCount <= 15) fontSize = '160px';
                else if (wordCount <= 25) fontSize = '150px';
                else fontSize = '140px';
                fontSizeDisplay.textContent = fontSize;
                
                // Tentukan line count
                let lineCount;
                if (wordCount <= 5) lineCount = '3 lines';
                else if (wordCount <= 15) lineCount = '4 lines';
                else lineCount = '5 lines';
                lineCountDisplay.textContent = lineCount;
              } else {
                previewContainer.style.display = 'none';
                wordCountDisplay.textContent = '0 words';
                fontSizeDisplay.textContent = 'N/A';
                lineCountDisplay.textContent = 'N/A';
              }
            }
            
            function loadExample(text) {
              document.getElementById('text').value = text;
              updatePreview();
            }
            
            function generateImage() {
              const text = document.getElementById('text').value.trim();
              if (text) {
                const encodedText = encodeURIComponent(text);
                window.location.href = '/brat?text=' + encodedText;
              }
            }
            
            document.addEventListener('DOMContentLoaded', function() {
              updatePreview();
              
              // Auto-update preview as user types
              const textInput = document.getElementById('text');
              let updateTimeout;
              
              textInput.addEventListener('input', function() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(updatePreview, 300);
              });
              
              // Also update on paste
              textInput.addEventListener('paste', function() {
                setTimeout(updatePreview, 100);
              });
            });
          </script>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1><span class="icon">🎨</span> Brat JPEG Generator</h1>
              <p>800×800 • Smart Font Scaling • 3-5 Lines</p>
            </div>
            
            <div class="logic-box">
              <h4>📈 Smart Scaling Logic:</h4>
              <p class="info-text">Fewer words = Larger font • More words = Smaller font • 3-5 lines maximum</p>
              <div class="logic-grid">
                <div class="logic-item">
                  <div class="logic-label">≤3 words</div>
                  <div class="logic-value">180px font • 3 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">4-8 words</div>
                  <div class="logic-value">170px font • 3-4 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">9-15 words</div>
                  <div class="logic-value">160px font • 4 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">16-25 words</div>
                  <div class="logic-value">150px font • 4-5 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">26+ words</div>
                  <div class="logic-value">140px font • 5 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">Canvas</div>
                  <div class="logic-value">800×800 • 50px margin</div>
                </div>
              </div>
            </div>
            
            <div class="form-container">
              <div class="form-group">
                <label for="text">Enter your text:</label>
                <textarea 
                  id="text" 
                  name="text" 
                  rows="4" 
                  placeholder="Type your text here... Font size and lines will adjust automatically based on word count."
                  oninput="updatePreview()"
                >Text size adjusts based on word count</textarea>
              </div>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <button type="button" class="btn" onclick="generateImage()">
                  <span class="icon">🚀</span> Generate JPEG
                </button>
              </div>
              
              <div style="margin-top: 15px; font-size: 0.9em; color: #7f8c8d;">
                <div><strong>Current text:</strong> <span id="wordCount">2 words</span></div>
                <div><strong>Font size:</strong> <span id="fontSize">170px</span></div>
                <div><strong>Lines:</strong> <span id="lineCount">3 lines</span></div>
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Font size adjusts automatically</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/brat?text=Text%20size%20adjusts%20based%20on%20word%20count" 
                     alt="JPEG Preview">
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Test Examples:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('Hello'); return false;">Very Short (1 word)</button>
                <button class="example-link" onclick="loadExample('This is a short text'); return false;">Short (4 words)</button>
                <button class="example-link" onclick="loadExample('This is a medium length text example with several words'); return false;">Medium (8 words)</button>
                <button class="example-link" onclick="loadExample('This is a longer text example that demonstrates how the font size decreases as the word count increases while maintaining readability within the canvas boundaries'); return false;">Long (15+ words)</button>
              </div>
            </div>
            
            <div class="nav">
              <a href="/" class="btn">
                <span class="icon">🏠</span> Home
              </a>
              <a href="/bratanim" class="btn btn-primary">
                <span class="icon">🎬</span> Try GIF Version
              </a>
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
          <a href="/brat" style="background: #2c3e50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Again</a>
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
              background: #f5f5f5;
              min-height: 100vh;
              padding: 20px;
              color: #333;
            }
            .container {
              max-width: 1000px;
              margin: 0 auto;
              background: white;
              border-radius: 12px;
              padding: 25px;
              box-shadow: 0 3px 10px rgba(0,0,0,0.08);
            }
            .header {
              text-align: center;
              margin-bottom: 25px;
              padding-bottom: 20px;
              border-bottom: 1px solid #eee;
            }
            .header h1 {
              color: #2c3e50;
              font-size: 1.8em;
              margin-bottom: 8px;
            }
            .header p {
              color: #7f8c8d;
              font-size: 1em;
            }
            .logic-box {
              background: #fff0f0;
              padding: 15px;
              border-radius: 8px;
              margin: 15px 0;
              border-left: 3px solid #e74c3c;
            }
            .logic-box h4 {
              color: #c0392b;
              margin-bottom: 10px;
              font-size: 1em;
            }
            .logic-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
              margin-top: 10px;
            }
            .logic-item {
              background: white;
              padding: 10px;
              border-radius: 6px;
              text-align: center;
              border: 1px solid #e0e0e0;
            }
            .logic-label {
              font-size: 0.9em;
              color: #2c3e50;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .logic-value {
              font-size: 0.85em;
              color: #7f8c8d;
            }
            .form-container {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 20px;
              border: 1px solid #e0e0e0;
            }
            .form-group {
              margin-bottom: 15px;
            }
            label {
              display: block;
              margin-bottom: 6px;
              font-weight: 600;
              color: #2c3e50;
              font-size: 0.95em;
            }
            textarea {
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 6px;
              font-size: 14px;
              font-family: inherit;
              resize: vertical;
              transition: border-color 0.2s;
              min-height: 100px;
            }
            textarea:focus {
              outline: none;
              border-color: #e74c3c;
              box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.1);
            }
            .btn {
              background: #2c3e50;
              color: white;
              border: none;
              padding: 10px 20px;
              font-size: 14px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              transition: all 0.2s;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              text-decoration: none;
            }
            .btn:hover {
              background: #1a252f;
              transform: translateY(-1px);
            }
            .btn-primary {
              background: #e74c3c;
            }
            .btn-primary:hover {
              background: #c0392b;
            }
            .preview-container {
              margin: 20px 0;
            }
            .preview-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
              padding-bottom: 10px;
              border-bottom: 1px solid #eee;
            }
            .preview-header h3 {
              color: #2c3e50;
              margin: 0;
              font-size: 1.1em;
            }
            .preview-area {
              text-align: center;
              padding: 15px;
              background: white;
              border-radius: 8px;
              border: 2px solid #f0f0f0;
              overflow: hidden;
            }
            .preview-area img {
              max-width: 100%;
              border-radius: 4px;
              max-height: 350px;
              border: 1px solid #eee;
            }
            .examples {
              margin-top: 25px;
              padding-top: 15px;
              border-top: 1px solid #eee;
            }
            .examples h3 {
              margin-bottom: 12px;
              color: #2c3e50;
              font-size: 1.1em;
            }
            .example-links {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            .example-link {
              background: #ecf0f1;
              padding: 6px 12px;
              border-radius: 16px;
              text-decoration: none;
              color: #e74c3c;
              font-size: 0.85em;
              transition: background 0.2s;
              border: none;
              cursor: pointer;
            }
            .example-link:hover {
              background: #dde4e6;
            }
            .nav {
              margin-top: 25px;
              padding-top: 15px;
              border-top: 1px solid #eee;
              display: flex;
              gap: 10px;
              justify-content: center;
            }
            .icon {
              display: inline-flex;
              align-items: center;
              justify-content: center;
            }
            .info-text {
              color: #7f8c8d;
              font-size: 0.9em;
              margin-top: 5px;
              font-style: italic;
            }
            @media (max-width: 768px) {
              .logic-grid { grid-template-columns: 1fr; }
              .nav { flex-direction: column; }
              .container { padding: 15px; }
            }
          </style>
          <script>
            function updatePreview() {
              const textInput = document.getElementById('text');
              const previewImage = document.getElementById('previewImage');
              const previewContainer = document.getElementById('previewContainer');
              const wordCountDisplay = document.getElementById('wordCount');
              const fontSizeDisplay = document.getElementById('fontSize');
              const lineCountDisplay = document.getElementById('lineCount');
              
              const text = textInput.value.trim();
              const wordCount = text === '' ? 0 : text.split(' ').length;
              
              if (text.length > 0) {
                const encodedText = encodeURIComponent(text);
                const url = '/bratanim?text=' + encodedText;
                
                // Update preview image dengan cache bust
                previewImage.src = url + '&t=' + Date.now();
                previewContainer.style.display = 'block';
                
                // Update logic info
                wordCountDisplay.textContent = wordCount + ' words';
                
                // Tentukan font size berdasarkan jumlah kata
                let fontSize;
                if (wordCount <= 3) fontSize = '180px';
                else if (wordCount <= 8) fontSize = '170px';
                else if (wordCount <= 15) fontSize = '160px';
                else if (wordCount <= 25) fontSize = '150px';
                else fontSize = '140px';
                fontSizeDisplay.textContent = fontSize;
                
                // Tentukan line count
                let lineCount;
                if (wordCount <= 5) lineCount = '3 lines';
                else if (wordCount <= 15) lineCount = '4 lines';
                else lineCount = '5 lines';
                lineCountDisplay.textContent = lineCount;
              } else {
                previewContainer.style.display = 'none';
                wordCountDisplay.textContent = '0 words';
                fontSizeDisplay.textContent = 'N/A';
                lineCountDisplay.textContent = 'N/A';
              }
            }
            
            function loadExample(text) {
              document.getElementById('text').value = text;
              updatePreview();
            }
            
            function generateGif() {
              const text = document.getElementById('text').value.trim();
              if (text) {
                const encodedText = encodeURIComponent(text);
                window.location.href = '/bratanim?text=' + encodedText;
              }
            }
            
            document.addEventListener('DOMContentLoaded', function() {
              updatePreview();
              
              // Auto-update preview as user types
              const textInput = document.getElementById('text');
              let updateTimeout;
              
              textInput.addEventListener('input', function() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(updatePreview, 300);
              });
              
              // Also update on paste
              textInput.addEventListener('paste', function() {
                setTimeout(updatePreview, 100);
              });
            });
          </script>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1><span class="icon">🎬</span> Brat GIF Generator</h1>
              <p>800×800 • Smart Font Scaling • Word-by-Word Animation</p>
            </div>
            
            <div class="logic-box">
              <h4>📈 Animation Scaling Logic:</h4>
              <p class="info-text">Fewer words = Larger font • More words = Smaller font • 3-5 lines maximum</p>
              <div class="logic-grid">
                <div class="logic-item">
                  <div class="logic-label">≤3 words</div>
                  <div class="logic-value">180px font • 3 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">4-8 words</div>
                  <div class="logic-value">170px font • 3-4 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">9-15 words</div>
                  <div class="logic-value">160px font • 4 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">16-25 words</div>
                  <div class="logic-value">150px font • 4-5 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">26+ words</div>
                  <div class="logic-value">140px font • 5 lines</div>
                </div>
                <div class="logic-item">
                  <div class="logic-label">Animation</div>
                  <div class="logic-value">100ms/word • 3 frame fade</div>
                </div>
              </div>
            </div>
            
            <div class="form-container">
              <div class="form-group">
                <label for="text">Enter your text:</label>
                <textarea 
                  id="text" 
                  name="text" 
                  rows="4" 
                  placeholder="Type your text here... Font size adjusts automatically during animation."
                  oninput="updatePreview()"
                >Watch font size adjust during animation</textarea>
              </div>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <button type="button" class="btn" onclick="generateGif()">
                  <span class="icon">🚀</span> Generate GIF
                </button>
              </div>
              
              <div style="margin-top: 15px; font-size: 0.9em; color: #7f8c8d;">
                <div><strong>Current text:</strong> <span id="wordCount">4 words</span></div>
                <div><strong>Font size:</strong> <span id="fontSize">170px</span></div>
                <div><strong>Lines:</strong> <span id="lineCount">3 lines</span></div>
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Animation with smart font scaling</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/bratanim?text=Watch%20font%20size%20adjust%20during%20animation" 
                     alt="GIF Preview">
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Test Examples:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('Hello'); return false;">Very Short (1 word)</button>
                <button class="example-link" onclick="loadExample('Words appear one by one'); return false;">Short (4 words)</button>
                <button class="example-link" onclick="loadExample('This animation demonstrates smart font scaling based on word count'); return false;">Medium (6 words)</button>
                <button class="example-link" onclick="loadExample('This is a longer animation example that shows how font size decreases as more words are added to maintain readability within the canvas'); return false;">Long (15+ words)</button>
              </div>
            </div>
            
            <div class="nav">
              <a href="/" class="btn">
                <span class="icon">🏠</span> Home
              </a>
              <a href="/brat" class="btn btn-primary">
                <span class="icon">📸</span> Try JPEG Version
              </a>
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
          <a href="/bratanim" style="background: #2c3e50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Again</a>
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
      <title>Brat Generator - Smart Font Scaling</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
          color: #333;
          min-height: 100vh;
          line-height: 1.6;
        }
        
        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }
        
        .header {
          text-align: center;
          padding: 40px 20px;
          background: white;
          border-radius: 12px;
          margin-bottom: 30px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.08);
        }
        
        .header h1 {
          font-size: 2.2em;
          margin-bottom: 15px;
          color: #2c3e50;
        }
        
        .header p {
          color: #7f8c8d;
          font-size: 1.1em;
          max-width: 700px;
          margin: 0 auto 20px;
        }
        
        .scaling-system {
          background: linear-gradient(135deg, #3498db, #2c3e50);
          color: white;
          padding: 20px;
          border-radius: 12px;
          margin: 30px auto;
          max-width: 800px;
        }
        
        .scaling-system h3 {
          text-align: center;
          margin-bottom: 20px;
          font-size: 1.4em;
        }
        
        .scaling-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
        }
        
        .scale-item {
          background: rgba(255,255,255,0.1);
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          backdrop-filter: blur(10px);
        }
        
        .scale-words {
          font-size: 1.1em;
          font-weight: bold;
          margin-bottom: 8px;
        }
        
        .scale-font {
          font-size: 1.3em;
          font-weight: bold;
          margin-bottom: 5px;
        }
        
        .scale-lines {
          font-size: 0.9em;
          opacity: 0.9;
        }
        
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        
        .card {
          background: white;
          border-radius: 12px;
          padding: 25px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.08);
          transition: transform 0.2s;
        }
        
        .card:hover {
          transform: translateY(-5px);
        }
        
        .card-header {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 20px;
        }
        
        .card-icon {
          font-size: 2em;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          color: white;
        }
        
        .jpeg-icon {
          background: #3498db;
        }
        
        .gif-icon {
          background: #e74c3c;
        }
        
        .card-header h2 {
          font-size: 1.4em;
          color: #2c3e50;
        }
        
        .features {
          list-style: none;
          margin-bottom: 25px;
        }
        
        .features li {
          padding: 8px 0;
          color: #555;
          border-bottom: 1px solid #f0f0f0;
          display: flex;
          align-items: center;
        }
        
        .features li:last-child {
          border-bottom: none;
        }
        
        .features li:before {
          content: "✓";
          color: #27ae60;
          font-weight: bold;
          margin-right: 10px;
          font-size: 1.1em;
        }
        
        .btn {
          display: block;
          width: 100%;
          padding: 12px;
          text-align: center;
          background: #2c3e50;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1em;
          transition: background 0.2s;
          margin-top: 10px;
        }
        
        .btn:hover {
          background: #1a252f;
        }
        
        .btn-jpeg {
          background: #3498db;
        }
        
        .btn-jpeg:hover {
          background: #2980b9;
        }
        
        .btn-gif {
          background: #e74c3c;
        }
        
        .btn-gif:hover {
          background: #c0392b;
        }
        
        footer {
          text-align: center;
          padding: 30px 20px;
          margin-top: 40px;
          color: #7f8c8d;
          border-top: 1px solid #eee;
        }
        
        @media (max-width: 768px) {
          .cards, .scaling-grid {
            grid-template-columns: 1fr;
          }
          .container {
            padding: 15px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✨ Brat Generator</h1>
          <p>Smart font scaling based on word count • 3-5 lines maximum</p>
        </div>
        
        <div class="scaling-system">
          <h3>📊 Font Scaling System</h3>
          <div class="scaling-grid">
            <div class="scale-item">
              <div class="scale-words">1-3 words</div>
              <div class="scale-font">180px</div>
              <div class="scale-lines">3 lines max</div>
            </div>
            <div class="scale-item">
              <div class="scale-words">4-8 words</div>
              <div class="scale-font">170px</div>
              <div class="scale-lines">3-4 lines</div>
            </div>
            <div class="scale-item">
              <div class="scale-words">9-15 words</div>
              <div class="scale-font">160px</div>
              <div class="scale-lines">4 lines max</div>
            </div>
            <div class="scale-item">
              <div class="scale-words">16-25 words</div>
              <div class="scale-font">150px</div>
              <div class="scale-lines">4-5 lines</div>
            </div>
            <div class="scale-item">
              <div class="scale-words">26+ words</div>
              <div class="scale-font">140px</div>
              <div class="scale-lines">5 lines max</div>
            </div>
          </div>
        </div>
        
        <div class="cards">
          <div class="card">
            <div class="card-header">
              <div class="card-icon jpeg-icon">🎨</div>
              <h2>JPEG Generator</h2>
            </div>
            <ul class="features">
              <li>800×800 square canvas</li>
              <li>Smart font scaling (140-180px)</li>
              <li>3-5 lines based on word count</li>
              <li>White background, black text</li>
              <li>Justify text alignment</li>
              <li>No ellipsis - text always fits</li>
            </ul>
            <a href="/brat" class="btn btn-jpeg">Try JPEG Generator</a>
            <a href="/brat?text=Test%20smart%20scaling" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
          
          <div class="card">
            <div class="card-header">
              <div class="card-icon gif-icon">🎬</div>
              <h2>GIF Generator</h2>
            </div>
            <ul class="features">
              <li>Word-by-word animation</li>
              <li>Smart font scaling</li>
              <li>3-5 lines auto adjustment</li>
              <li>Fast animation (100ms/word)</li>
              <li>Infinite loop</li>
              <li>Text always fits canvas</li>
            </ul>
            <a href="/bratanim" class="btn btn-gif">Try GIF Generator</a>
            <a href="/bratanim?text=Smart%20animation%20scaling" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
        </div>
        
        <footer>
          <p>Made with ❤️ by <strong>Xyz-kings</strong></p>
          <p style="margin-top: 10px; font-size: 0.9em;">
            Font size adjusts based on word count • Fewer words = Larger font • More words = Smaller font
          </p>
        </footer>
      </div>
    </body>
    </html>
  `);
};