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
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 60, maxLines = 6, maxFontSize = 180) {
  let fontSize = maxFontSize;
  let lines = [];

  do {
    ctx.font = `${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2);
    if (lines.length > maxLines) fontSize -= 10;
    else break;
  } while (fontSize > 30);

  return { fontSize, lines };
}

// Draw justified text dari kiri atas
function drawJustifiedText(ctx, lines, margin, lineHeight) {
  lines.forEach((line, idx) => {
    const y = margin + (idx * lineHeight);
    
    const words = line.split(' ');
    if (words.length === 1) {
      ctx.fillText(line, margin, y);
      return;
    }
    
    const totalWidth = words.reduce((sum, word) => sum + ctx.measureText(word).width, 0);
    const spaceCount = words.length - 1;
    const spaceWidth = spaceCount > 0 ? (ctx.canvas.width - margin * 2 - totalWidth) / spaceCount : 0;
    let xPos = margin;
    
    words.forEach(word => {
      ctx.fillText(word, xPos, y);
      xPos += ctx.measureText(word).width + spaceWidth;
    });
  });
}

// --- BRAT BASIC JPEG ---
function generateImage(text) {
  const width = 800, height = 800, margin = 60;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background putih polos
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (text.length > 400) text = text.substring(0, 400);

  // Tentukan maxLines berdasarkan panjang text
  const textLength = text.length;
  const maxLines = textLength > 200 ? 6 : 5;
  const maxFontSize = 180; // Tetap 180px

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin, maxLines, maxFontSize);

  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000'; // Hitam untuk kontras dengan putih
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.2;

  // Mulai dari kiri atas (margin, margin)
  drawJustifiedText(ctx, lines, margin, lineHeight);

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

// --- BRAT ANIMASI GIF KATA PER KATA YANG RAPI ---
function generateGifAnimated(text) {
  const width = 800, height = 800, margin = 60;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Setup GIF encoder
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0); // Infinite loop
  encoder.setDelay(80); // 80ms per kata - lebih cepat
  encoder.setQuality(20);

  // Persiapan text
  const words = text.split(' ');
  if (words.length > 40) {
    words.length = 40; // Batasi maksimal 40 kata
  }

  // Tentukan ukuran font berdasarkan jumlah kata
  const tempText = words.slice(0, Math.min(10, words.length)).join(' ');
  const maxLines = Math.min(Math.ceil(words.length / 4), 6); // Maksimal 6 lines
  const maxFontSize = 180; // Tetap 180px
  
  const { fontSize } = fitTextToCanvas(ctx, tempText, width, height, margin, maxLines, maxFontSize);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.2;
  const maxLineWidth = width - margin * 2;

  // PRE-CALCULATE: Tentukan posisi setiap kata dengan benar (justify alignment)
  const wordPositions = [];
  let currentLineWords = [];
  let currentLineText = '';
  let currentLineIndex = 0;
  let currentY = margin; // Mulai dari margin atas
  
  // Proses setiap kata untuk menentukan posisinya
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLineText ? currentLineText + ' ' + word : word;
    const testWidth = ctx.measureText(testLine).width;
    
    // Jika melebihi width atau ini kata pertama di baris baru
    if ((testWidth > maxLineWidth && currentLineText !== '') || i === words.length) {
      // Simpan baris yang sudah terkumpul dengan posisi X yang benar (justify)
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
      
      // Cek apakah masih muat di canvas
      if (currentY + lineHeight > height - margin) {
        break; // Stop jika sudah melebihi batas bawah
      }
    } else {
      // Tambah ke baris saat ini
      currentLineWords.push(word);
      currentLineText = testLine;
    }
  }
  
  // Simpan baris terakhir jika masih ada kata dan masih muat
  if (currentLineWords.length > 0 && currentY <= height - margin) {
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
  
  // ANIMASI: Tampilkan kata per kata dengan urutan yang benar
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
  
  // Tahan teks lengkap (8 frame)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = '#000000';
    
    wordPositions.forEach(pos => {
      ctx.fillText(pos.word, pos.x, pos.y);
    });
    
    encoder.addFrame(ctx);
  }
  
  // Fade out (6 frame)
  for (let fade = 0; fade <= 6; fade++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - (fade / 6)})`;
    
    wordPositions.forEach(pos => {
      ctx.fillText(pos.word, pos.x, pos.y);
    });
    
    encoder.addFrame(ctx);
  }
  
  // Frame kosong sebelum loop (2 frame)
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
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
              background: #f8f9fa;
              min-height: 100vh;
              padding: 20px;
              color: #333;
            }
            .container {
              max-width: 1000px;
              margin: 0 auto;
              background: white;
              border-radius: 15px;
              padding: 30px;
              box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #f0f0f0;
            }
            .header h1 {
              color: #2c3e50;
              font-size: 2.2em;
              margin-bottom: 10px;
            }
            .header p {
              color: #7f8c8d;
              font-size: 1.1em;
            }
            .info-box {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 10px;
              margin: 20px 0;
              border-left: 4px solid #3498db;
            }
            .info-box h4 {
              color: #2980b9;
              margin-bottom: 8px;
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .specs {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
              margin: 20px 0;
            }
            .spec-item {
              background: white;
              padding: 12px;
              border-radius: 8px;
              text-align: center;
              border: 1px solid #e0e0e0;
            }
            .spec-label {
              font-size: 0.9em;
              color: #7f8c8d;
              margin-bottom: 5px;
            }
            .spec-value {
              font-size: 1.1em;
              font-weight: bold;
              color: #2c3e50;
            }
            .form-container {
              background: #f8f9fa;
              padding: 25px;
              border-radius: 10px;
              margin-bottom: 25px;
              border: 1px solid #e0e0e0;
            }
            .form-group {
              margin-bottom: 20px;
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-weight: 600;
              color: #2c3e50;
            }
            textarea {
              width: 100%;
              padding: 15px;
              border: 2px solid #ddd;
              border-radius: 8px;
              font-size: 16px;
              font-family: inherit;
              resize: vertical;
              transition: border-color 0.3s;
            }
            textarea:focus {
              outline: none;
              border-color: #3498db;
            }
            .btn {
              background: #2c3e50;
              color: white;
              border: none;
              padding: 12px 24px;
              font-size: 16px;
              border-radius: 8px;
              cursor: pointer;
              font-weight: 600;
              transition: background 0.3s;
              display: inline-block;
              text-decoration: none;
            }
            .btn:hover {
              background: #1a252f;
            }
            .btn-primary {
              background: #3498db;
            }
            .btn-primary:hover {
              background: #2980b9;
            }
            .url-display {
              background: #2c3e50;
              color: white;
              padding: 12px;
              border-radius: 8px;
              margin: 15px 0;
              font-family: 'Courier New', monospace;
              font-size: 14px;
              word-break: break-all;
              display: none;
            }
            .preview-container {
              margin: 25px 0;
            }
            .preview-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 15px;
              padding-bottom: 10px;
              border-bottom: 1px solid #eee;
            }
            .preview-header h3 {
              color: #2c3e50;
              margin: 0;
            }
            .preview-area {
              text-align: center;
              padding: 20px;
              background: white;
              border-radius: 10px;
              border: 2px dashed #ddd;
            }
            .preview-area img {
              max-width: 100%;
              border-radius: 5px;
              max-height: 400px;
            }
            .no-preview {
              color: #7f8c8d;
              font-style: italic;
              padding: 40px;
            }
            .response-info {
              margin: 25px 0;
            }
            .response-header {
              background: #2c3e50;
              color: white;
              padding: 10px 15px;
              border-radius: 8px 8px 0 0;
              font-weight: 600;
            }
            .response-body {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 0 0 8px 8px;
              border: 1px solid #ddd;
              border-top: none;
              font-family: 'Courier New', monospace;
              font-size: 13px;
              white-space: pre-wrap;
              max-height: 200px;
              overflow-y: auto;
            }
            .examples {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
            }
            .examples h3 {
              margin-bottom: 15px;
              color: #2c3e50;
            }
            .example-links {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            .example-link {
              background: #ecf0f1;
              padding: 8px 15px;
              border-radius: 20px;
              text-decoration: none;
              color: #3498db;
              font-size: 0.9em;
              transition: background 0.3s;
            }
            .example-link:hover {
              background: #dde4e6;
            }
            .nav {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              text-align: center;
              display: flex;
              gap: 10px;
              justify-content: center;
            }
            .icon {
              margin-right: 8px;
            }
            @media (max-width: 768px) {
              .specs { grid-template-columns: 1fr; }
              .nav { flex-direction: column; }
            }
          </style>
          <script>
            function updatePreview() {
              const textInput = document.getElementById('text');
              const urlDisplay = document.getElementById('urlDisplay');
              const previewImage = document.getElementById('previewImage');
              const responseBody = document.getElementById('responseBody');
              const previewContainer = document.getElementById('previewContainer');
              
              const text = textInput.value.trim();
              
              if (text.length > 0) {
                const encodedText = encodeURIComponent(text);
                const url = '/brat?text=' + encodedText;
                
                // Update URL display
                urlDisplay.textContent = window.location.origin + url;
                urlDisplay.style.display = 'block';
                
                // Update preview image
                previewImage.src = url + '&t=' + Date.now(); // Cache bust
                previewContainer.style.display = 'block';
                
                // Update response info
                const headers = [
                  'HTTP/1.1 200 OK',
                  'Content-Type: image/jpeg',
                  'Content-Length: [dynamic]',
                  'Cache-Control: public, max-age=3600',
                  'Content-Disposition: inline; filename="brat-image.jpg"'
                ].join('\\n');
                
                const body = 'Binary JPEG image data (800×800, white background, black text)';
                responseBody.textContent = headers + '\\n\\n' + body;
              } else {
                urlDisplay.style.display = 'none';
                previewContainer.style.display = 'none';
                responseBody.textContent = 'Enter text to see preview and response info';
              }
            }
            
            function loadExample(text) {
              document.getElementById('text').value = text;
              updatePreview();
            }
            
            document.addEventListener('DOMContentLoaded', function() {
              updatePreview();
              
              // Auto-update preview as user types
              const textInput = document.getElementById('text');
              let updateTimeout;
              
              textInput.addEventListener('input', function() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(updatePreview, 500);
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
              <p>800×800 • Font 180px • White Background • Justify Alignment</p>
            </div>
            
            <div class="info-box">
              <h4><span class="icon">⚙️</span> Generator Specifications:</h4>
              <div class="specs">
                <div class="spec-item">
                  <div class="spec-label">Canvas Size</div>
                  <div class="spec-value">800×800 px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font Size</div>
                  <div class="spec-value">180px Max</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Background</div>
                  <div class="spec-value">White</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Text Color</div>
                  <div class="spec-value">Black</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Alignment</div>
                  <div class="spec-value">Justify</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Start Position</div>
                  <div class="spec-value">Top Left</div>
                </div>
              </div>
            </div>
            
            <div class="form-container">
              <form onsubmit="return false;">
                <div class="form-group">
                  <label for="text">Enter your text:</label>
                  <textarea 
                    id="text" 
                    name="text" 
                    rows="4" 
                    placeholder="Type your text here... Example: Create stunning 800x800 images with massive 180px font size on pure white background"
                    required
                    oninput="updatePreview()"
                  >Create stunning 800x800 images with massive 180px font size on pure white background</textarea>
                </div>
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <a href="#" id="generateLink" class="btn" onclick="document.getElementById('generateForm').submit()">
                  <span class="icon">🚀</span> Generate JPEG Image
                </a>
                <form id="generateForm" action="/brat" method="get" style="display: none;">
                  <input type="hidden" name="text" id="hiddenText">
                </form>
              </form>
              
              <div id="urlDisplay" class="url-display">
                ${host}/brat?text=Create%20stunning%20800x800%20images%20with%20massive%20180px%20font%20size%20on%20pure%20white%20background
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small>Updates as you type</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/brat?text=Create%20stunning%20800x800%20images%20with%20massive%20180px%20font%20size%20on%20pure%20white%20background" 
                     alt="JPEG Preview">
              </div>
            </div>
            
            <div class="response-info">
              <div class="response-header">
                <span class="icon">📡</span> Response Information
              </div>
              <div class="response-body" id="responseBody">
                HTTP/1.1 200 OK
                Content-Type: image/jpeg
                Content-Length: [dynamic]
                Cache-Control: public, max-age=3600
                Content-Disposition: inline; filename="brat-image.jpg"
                
                Binary JPEG image data (800×800, white background, black text)
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Quick Examples:</h3>
              <div class="example-links">
                <a href="#" class="example-link" onclick="loadExample('Hello World'); return false;">Hello World</a>
                <a href="#" class="example-link" onclick="loadExample('Large font justify alignment example'); return false;">Justify Example</a>
                <a href="#" class="example-link" onclick="loadExample('Create stunning 800x800 images with massive 180px font size on pure white background with perfect justify alignment'); return false;">Full Example</a>
                <a href="#" class="example-link" onclick="loadExample('This is a demonstration of text flow from left to right and top to bottom with large 180px font size in 800x800 square canvas'); return false;">Flow Demo</a>
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
          
          <script>
            // Initialize hidden form
            document.getElementById('generateForm').addEventListener('submit', function(e) {
              document.getElementById('hiddenText').value = document.getElementById('text').value;
            });
            
            // Update generate link
            function updateGenerateLink() {
              const text = document.getElementById('text').value;
              const encodedText = encodeURIComponent(text);
              document.getElementById('generateLink').href = '/brat?text=' + encodedText;
            }
            
            // Update on input
            document.getElementById('text').addEventListener('input', function() {
              setTimeout(updateGenerateLink, 100);
            });
            
            // Initial update
            updateGenerateLink();
          </script>
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
          <a href="/brat" style="background: #2c3e50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Try Again</a>
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
              background: #f8f9fa;
              min-height: 100vh;
              padding: 20px;
              color: #333;
            }
            .container {
              max-width: 1000px;
              margin: 0 auto;
              background: white;
              border-radius: 15px;
              padding: 30px;
              box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #f0f0f0;
            }
            .header h1 {
              color: #2c3e50;
              font-size: 2.2em;
              margin-bottom: 10px;
            }
            .header p {
              color: #7f8c8d;
              font-size: 1.1em;
            }
            .info-box {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 10px;
              margin: 20px 0;
              border-left: 4px solid #e74c3c;
            }
            .info-box h4 {
              color: #c0392b;
              margin-bottom: 8px;
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .specs {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
              margin: 20px 0;
            }
            .spec-item {
              background: white;
              padding: 12px;
              border-radius: 8px;
              text-align: center;
              border: 1px solid #e0e0e0;
            }
            .spec-label {
              font-size: 0.9em;
              color: #7f8c8d;
              margin-bottom: 5px;
            }
            .spec-value {
              font-size: 1.1em;
              font-weight: bold;
              color: #2c3e50;
            }
            .form-container {
              background: #f8f9fa;
              padding: 25px;
              border-radius: 10px;
              margin-bottom: 25px;
              border: 1px solid #e0e0e0;
            }
            .form-group {
              margin-bottom: 20px;
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-weight: 600;
              color: #2c3e50;
            }
            textarea {
              width: 100%;
              padding: 15px;
              border: 2px solid #ddd;
              border-radius: 8px;
              font-size: 16px;
              font-family: inherit;
              resize: vertical;
              transition: border-color 0.3s;
            }
            textarea:focus {
              outline: none;
              border-color: #e74c3c;
            }
            .btn {
              background: #2c3e50;
              color: white;
              border: none;
              padding: 12px 24px;
              font-size: 16px;
              border-radius: 8px;
              cursor: pointer;
              font-weight: 600;
              transition: background 0.3s;
              display: inline-block;
              text-decoration: none;
            }
            .btn:hover {
              background: #1a252f;
            }
            .btn-primary {
              background: #e74c3c;
            }
            .btn-primary:hover {
              background: #c0392b;
            }
            .url-display {
              background: #2c3e50;
              color: white;
              padding: 12px;
              border-radius: 8px;
              margin: 15px 0;
              font-family: 'Courier New', monospace;
              font-size: 14px;
              word-break: break-all;
              display: none;
            }
            .preview-container {
              margin: 25px 0;
            }
            .preview-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 15px;
              padding-bottom: 10px;
              border-bottom: 1px solid #eee;
            }
            .preview-header h3 {
              color: #2c3e50;
              margin: 0;
            }
            .preview-area {
              text-align: center;
              padding: 20px;
              background: white;
              border-radius: 10px;
              border: 2px dashed #ddd;
            }
            .preview-area img {
              max-width: 100%;
              border-radius: 5px;
              max-height: 400px;
            }
            .no-preview {
              color: #7f8c8d;
              font-style: italic;
              padding: 40px;
            }
            .response-info {
              margin: 25px 0;
            }
            .response-header {
              background: #2c3e50;
              color: white;
              padding: 10px 15px;
              border-radius: 8px 8px 0 0;
              font-weight: 600;
            }
            .response-body {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 0 0 8px 8px;
              border: 1px solid #ddd;
              border-top: none;
              font-family: 'Courier New', monospace;
              font-size: 13px;
              white-space: pre-wrap;
              max-height: 200px;
              overflow-y: auto;
            }
            .examples {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
            }
            .examples h3 {
              margin-bottom: 15px;
              color: #2c3e50;
            }
            .example-links {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            .example-link {
              background: #ecf0f1;
              padding: 8px 15px;
              border-radius: 20px;
              text-decoration: none;
              color: #e74c3c;
              font-size: 0.9em;
              transition: background 0.3s;
            }
            .example-link:hover {
              background: #dde4e6;
            }
            .nav {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              text-align: center;
              display: flex;
              gap: 10px;
              justify-content: center;
            }
            .icon {
              margin-right: 8px;
            }
            .feature-list {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 10px;
              margin: 20px 0;
            }
            .feature-list ul {
              list-style: none;
              padding-left: 0;
            }
            .feature-list li {
              padding: 8px 0;
              color: #555;
              display: flex;
              align-items: center;
            }
            .feature-list li:before {
              content: "✓ ";
              color: #27ae60;
              font-weight: bold;
              margin-right: 10px;
            }
            @media (max-width: 768px) {
              .specs { grid-template-columns: 1fr; }
              .nav { flex-direction: column; }
            }
          </style>
          <script>
            function updatePreview() {
              const textInput = document.getElementById('text');
              const urlDisplay = document.getElementById('urlDisplay');
              const previewImage = document.getElementById('previewImage');
              const responseBody = document.getElementById('responseBody');
              const previewContainer = document.getElementById('previewContainer');
              
              const text = textInput.value.trim();
              
              if (text.length > 0) {
                const encodedText = encodeURIComponent(text);
                const url = '/bratanim?text=' + encodedText;
                
                // Update URL display
                urlDisplay.textContent = window.location.origin + url;
                urlDisplay.style.display = 'block';
                
                // Update preview image with cache bust
                previewImage.src = url + '&t=' + Date.now();
                previewContainer.style.display = 'block';
                
                // Update response info
                const headers = [
                  'HTTP/1.1 200 OK',
                  'Content-Type: image/gif',
                  'Content-Length: [dynamic]',
                  'Cache-Control: public, max-age=3600',
                  'Content-Disposition: inline; filename="brat-animation.gif"'
                ].join('\\n');
                
                const body = 'Animated GIF image data (800×800, white background, word-by-word animation)';
                responseBody.textContent = headers + '\\n\\n' + body;
              } else {
                urlDisplay.style.display = 'none';
                previewContainer.style.display = 'none';
                responseBody.textContent = 'Enter text to see preview and response info';
              }
            }
            
            function loadExample(text) {
              document.getElementById('text').value = text;
              updatePreview();
            }
            
            document.addEventListener('DOMContentLoaded', function() {
              updatePreview();
              
              // Auto-update preview as user types
              const textInput = document.getElementById('text');
              let updateTimeout;
              
              textInput.addEventListener('input', function() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(updatePreview, 500);
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
              <p>800×800 • Font 180px • Animated Word-by-Word</p>
            </div>
            
            <div class="info-box">
              <h4><span class="icon">⚙️</span> Animation Specifications:</h4>
              <div class="specs">
                <div class="spec-item">
                  <div class="spec-label">Canvas Size</div>
                  <div class="spec-value">800×800 px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font Size</div>
                  <div class="spec-value">180px Max</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Background</div>
                  <div class="spec-value">White</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Animation</div>
                  <div class="spec-value">Word-by-Word</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Delay</div>
                  <div class="spec-value">80ms per word</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Loop</div>
                  <div class="spec-value">Infinite</div>
                </div>
              </div>
            </div>
            
            <div class="feature-list">
              <ul>
                <li>Words appear one by one with smooth animation</li>
                <li>Perfect justify alignment from left to right</li>
                <li>Auto-wrap to next line when space is full</li>
                <li>Fade in/out effects for smooth transitions</li>
                <li>White background with black text for maximum contrast</li>
              </ul>
            </div>
            
            <div class="form-container">
              <form onsubmit="return false;">
                <div class="form-group">
                  <label for="text">Enter your text:</label>
                  <textarea 
                    id="text" 
                    name="text" 
                    rows="4" 
                    placeholder="Type your text here... Example: Watch words appear one by one with 180px font size on white background"
                    required
                    oninput="updatePreview()"
                  >Watch words appear one by one with 180px font size on white background</textarea>
                </div>
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <a href="#" id="generateLink" class="btn" onclick="document.getElementById('generateForm').submit()">
                  <span class="icon">🚀</span> Generate Animated GIF
                </a>
                <form id="generateForm" action="/bratanim" method="get" style="display: none;">
                  <input type="hidden" name="text" id="hiddenText">
                </form>
              </form>
              
              <div id="urlDisplay" class="url-display">
                ${host}/bratanim?text=Watch%20words%20appear%20one%20by%20one%20with%20180px%20font%20size%20on%20white%20background
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small>Updates as you type</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/bratanim?text=Watch%20words%20appear%20one%20by%20one%20with%20180px%20font%20size%20on%20white%20background" 
                     alt="GIF Preview">
              </div>
            </div>
            
            <div class="response-info">
              <div class="response-header">
                <span class="icon">📡</span> Response Information
              </div>
              <div class="response-body" id="responseBody">
                HTTP/1.1 200 OK
                Content-Type: image/gif
                Content-Length: [dynamic]
                Cache-Control: public, max-age=3600
                Content-Disposition: inline; filename="brat-animation.gif"
                
                Animated GIF image data (800×800, white background, word-by-word animation)
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Quick Examples:</h3>
              <div class="example-links">
                <a href="#" class="example-link" onclick="loadExample('Hello World Animation'); return false;">Hello World</a>
                <a href="#" class="example-link" onclick="loadExample('Word by word typing animation'); return false;">Typing Demo</a>
                <a href="#" class="example-link" onclick="loadExample('Watch words appear one by one with 180px font size on white background with perfect justify alignment'); return false;">Full Example</a>
                <a href="#" class="example-link" onclick="loadExample('This animation demonstrates text flow from left to right and top to bottom in 800x800 square'); return false;">Flow Animation</a>
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
          
          <script>
            // Initialize hidden form
            document.getElementById('generateForm').addEventListener('submit', function(e) {
              document.getElementById('hiddenText').value = document.getElementById('text').value;
            });
            
            // Update generate link
            function updateGenerateLink() {
              const text = document.getElementById('text').value;
              const encodedText = encodeURIComponent(text);
              document.getElementById('generateLink').href = '/bratanim?text=' + encodedText;
            }
            
            // Update on input
            document.getElementById('text').addEventListener('input', function() {
              setTimeout(updateGenerateLink, 100);
            });
            
            // Initial update
            updateGenerateLink();
          </script>
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
          <a href="/bratanim" style="background: #2c3e50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Try Again</a>
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
      <title>✨ Brat Generator - 800×800 Text to Image & GIF</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        :root {
          --primary: #2c3e50;
          --secondary: #34495e;
          --accent: #3498db;
          --accent2: #e74c3c;
          --dark: #2c3e50;
          --light: #ecf0f1;
          --white: #ffffff;
        }
        
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background: #f8f9fa;
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
          background: white;
          border-radius: 20px;
          margin-bottom: 40px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }
        
        .hero h1 {
          font-size: 3em;
          margin-bottom: 20px;
          color: var(--dark);
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        
        .hero p {
          font-size: 1.2em;
          max-width: 700px;
          margin: 0 auto 30px;
          color: #7f8c8d;
        }
        
        .tagline {
          display: inline-block;
          background: var(--light);
          padding: 10px 25px;
          border-radius: 50px;
          margin: 20px 0;
          font-size: 1.1em;
          color: var(--dark);
          border: 2px solid var(--accent);
        }
        
        /* Stats */
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 40px 0;
        }
        
        .stat-item {
          background: white;
          border-radius: 15px;
          padding: 25px;
          text-align: center;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          border-top: 4px solid var(--accent);
        }
        
        .stat-number {
          font-size: 2.5em;
          font-weight: bold;
          margin-bottom: 10px;
          color: var(--dark);
        }
        
        .stat-label {
          font-size: 1em;
          color: #7f8c8d;
        }
        
        /* Cards Grid */
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 30px;
          margin: 50px 0;
        }
        
        .card {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
        }
        
        .card:hover {
          transform: translateY(-10px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
        }
        
        .card-header {
          padding: 30px 30px 20px;
          text-align: center;
          background: var(--primary);
          color: white;
        }
        
        .card-icon {
          font-size: 3em;
          margin-bottom: 15px;
          display: block;
        }
        
        .card h3 {
          font-size: 1.8em;
          margin-bottom: 10px;
        }
        
        .card-content {
          padding: 25px;
        }
        
        .spec-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin: 20px 0;
        }
        
        .spec-item {
          background: var(--light);
          padding: 12px;
          border-radius: 10px;
          text-align: center;
        }
        
        .spec-label {
          font-size: 0.9em;
          color: #7f8c8d;
          margin-bottom: 5px;
        }
        
        .spec-value {
          font-size: 1.1em;
          font-weight: bold;
          color: var(--dark);
        }
        
        .preview-area {
          text-align: center;
          margin: 20px 0;
          padding: 15px;
          background: var(--light);
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
          border-radius: 10px;
          font-weight: 600;
          font-size: 1em;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .btn-primary {
          background: var(--accent);
          color: white;
        }
        
        .btn-secondary {
          background: var(--accent2);
          color: white;
        }
        
        .btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 20px rgba(52, 152, 219, 0.3);
        }
        
        /* Features */
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 25px;
          margin: 40px 0;
        }
        
        .feature-item {
          background: white;
          padding: 25px;
          border-radius: 15px;
          text-align: center;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .feature-icon {
          font-size: 2.5em;
          margin-bottom: 15px;
          color: var(--accent);
        }
        
        .feature-item h3 {
          margin-bottom: 10px;
          color: var(--dark);
        }
        
        .feature-item p {
          color: #7f8c8d;
          font-size: 0.95em;
        }
        
        /* Footer */
        footer {
          text-align: center;
          padding: 40px 20px;
          margin-top: 50px;
          border-top: 2px solid var(--light);
          color: #7f8c8d;
        }
        
        .creator {
          font-size: 1.1em;
          margin-top: 20px;
          color: var(--dark);
        }
        
        .creator strong {
          color: var(--accent);
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
          .hero h1 { font-size: 2.2em; }
          .cards-grid { grid-template-columns: 1fr; }
          .btn-group { flex-direction: column; }
          .features { grid-template-columns: 1fr; }
          .spec-grid { grid-template-columns: 1fr; }
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
            <i class="fas fa-expand-alt"></i> 800×800 • Font 180px • White Background
          </div>
          <p>Create high-contrast text images and animations with massive 180px font size on pure white background.</p>
        </section>
        
        <!-- Stats -->
        <div class="stats">
          <div class="stat-item">
            <div class="stat-number">180px</div>
            <div class="stat-label">Max Font Size</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">800×800</div>
            <div class="stat-label">Square Format</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">⚪</div>
            <div class="stat-label">White Background</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">⚡</div>
            <div class="stat-label">Instant Generation</div>
          </div>
        </div>
        
        <!-- Features -->
        <div class="features">
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-font"></i></div>
            <h3>Massive Font</h3>
            <p>180px maximum font size for maximum impact</p>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-align-justify"></i></div>
            <h3>Justify Alignment</h3>
            <p>Perfect text alignment from left to right</p>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-play"></i></div>
            <h3>Smooth Animation</h3>
            <p>Word-by-word typing animation</p>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-square"></i></div>
            <h3>Square Format</h3>
            <p>Perfect 800×800 for social media</p>
          </div>
        </div>
        
        <!-- Cards Grid -->
        <div class="cards-grid">
          <!-- JPEG Card -->
          <div class="card">
            <div class="card-header">
              <span class="card-icon">
                <i class="fas fa-image"></i>
              </span>
              <h3>JPEG Generator</h3>
              <p>Static Text Images</p>
            </div>
            <div class="card-content">
              <div class="spec-grid">
                <div class="spec-item">
                  <div class="spec-label">Size</div>
                  <div class="spec-value">800×800</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font</div>
                  <div class="spec-value">180px Max</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Format</div>
                  <div class="spec-value">JPEG</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Quality</div>
                  <div class="spec-value">95%</div>
                </div>
              </div>
              
              <div class="preview-area">
                <img src="/brat?text=Create%20Stunning%20Images%20With%20180px%20Font%20On%20White%20Background%20In%20Perfect%20800x800%20Square%20Format" 
                     alt="JPEG Preview">
              </div>
              
              <div class="btn-group">
                <a href="/brat" class="btn btn-primary">
                  <i class="fas fa-play-circle"></i> Try JPEG Generator
                </a>
                <a href="/brat?text=180px%20Font%20Example" class="btn btn-secondary">
                  <i class="fas fa-eye"></i> Live Demo
                </a>
              </div>
            </div>
          </div>
          
          <!-- GIF Card -->
          <div class="card">
            <div class="card-header">
              <span class="card-icon">
                <i class="fas fa-film"></i>
              </span>
              <h3>GIF Generator</h3>
              <p>Animated Text</p>
            </div>
            <div class="card-content">
              <div class="spec-grid">
                <div class="spec-item">
                  <div class="spec-label">Size</div>
                  <div class="spec-value">800×800</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font</div>
                  <div class="spec-value">180px Max</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Animation</div>
                  <div class="spec-value">Word-by-Word</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Delay</div>
                  <div class="spec-value">80ms/word</div>
                </div>
              </div>
              
              <div class="preview-area">
                <img src="/bratanim?text=Watch%20Massive%20180px%20Text%20Appear%20Word%20By%20Word%20On%20White%20Background%20In%20800x800%20Format" 
                     alt="GIF Preview">
              </div>
              
              <div class="btn-group">
                <a href="/bratanim" class="btn btn-primary">
                  <i class="fas fa-play-circle"></i> Try GIF Generator
                </a>
                <a href="/bratanim?text=Animation%20Demo" class="btn btn-secondary">
                  <i class="fas fa-eye"></i> Live Demo
                </a>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <footer>
          <p>Made with <i class="fas fa-heart" style="color: var(--accent2);"></i> for content creators</p>
          <div class="creator">
            Powered by <strong>XYZ Font</strong> • Created by <strong>Xyz-kings</strong>
          </div>
          <p style="margin-top: 20px; font-size: 0.9em;">
            No registration required • Real-time preview • Perfect for social media
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
        });
      </script>
    </body>
    </html>
  `);
};