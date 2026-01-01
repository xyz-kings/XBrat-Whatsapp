const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font
GlobalFonts.registerFromPath(path.join(__dirname, 'xyzfont.ttf'), 'XyzFont');

// Word-wrap untuk justify dengan batasan lines
function wrapText(ctx, text, maxWidth, maxLines = 4) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? ' ' : '') + words[i];
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = words[i];
      
      // Jika sudah mencapai maxLines, potong dan tambah ellipsis
      if (lines.length === maxLines) {
        // Potong kata terakhir jika perlu
        const lastLine = lines[maxLines - 1];
        if (lastLine.length > 15) {
          lines[maxLines - 1] = lastLine.substring(0, Math.min(lastLine.length, 20)) + '...';
        } else if (lines.length === maxLines && i < words.length - 1) {
          lines[maxLines - 1] += '...';
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

// Fit font size dengan batasan line ketat
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 50, maxLines = 4, maxFontSize = 180) {
  let fontSize = maxFontSize;
  let lines = [];

  do {
    ctx.font = `${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2, maxLines);
    
    // Cek apakah text muat dalam canvas (termasuk margin atas/bawah)
    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const maxTextHeight = canvasHeight - margin * 2;
    
    if (lines.length > maxLines || totalTextHeight > maxTextHeight) {
      fontSize -= 5;
    } else {
      break;
    }
  } while (fontSize > 30);

  return { fontSize, lines };
}

// Draw justified text dari kiri atas dengan batasan
function drawJustifiedText(ctx, lines, margin, lineHeight) {
  const canvasWidth = ctx.canvas.width;
  
  lines.forEach((line, idx) => {
    const y = margin + (idx * lineHeight);
    
    const words = line.split(' ');
    if (words.length === 1) {
      // Pastikan text tidak keluar dari canvas
      const textWidth = ctx.measureText(line).width;
      if (textWidth > canvasWidth - margin * 2) {
        // Potong text jika terlalu panjang
        let truncated = line;
        while (ctx.measureText(truncated + '...').width > canvasWidth - margin * 2 && truncated.length > 3) {
          truncated = truncated.substring(0, truncated.length - 1);
        }
        ctx.fillText(truncated + '...', margin, y);
      } else {
        ctx.fillText(line, margin, y);
      }
      return;
    }
    
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
  const width = 800, height = 800, margin = 50;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background putih polos
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (text.length > 200) text = text.substring(0, 200); // Batasi text input

  // Tentukan maxLines (3 untuk normal, 4 jika panjang)
  const textLength = text.length;
  const maxLines = 4;
  const maxFontSize = 140;

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin, maxLines, maxFontSize);

  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.2;

  // Pastikan text tidak keluar dari canvas
  const totalTextHeight = lines.length * lineHeight;
  const startY = margin; // mulai dari atas canvas, biar tidak numpuk tengah

  // Draw dengan batasan yang aman
  drawJustifiedText(ctx, lines, startY, lineHeight);

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

// --- BRAT ANIMASI GIF KATA PER KATA YANG RAPI ---
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

  // Persiapan text
  const words = text.split(' ');
  if (words.length > 50) {
    words.length = 50; // Batasi maksimal 30 kata
  }

  // Tentukan ukuran font berdasarkan jumlah kata
  const tempText = words.slice(0, Math.min(8, words.length)).join(' ');
  const maxLines = 5; // MAKSIMAL 4 LINES
  const maxFontSize = 140;
  
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
      
      // STOP jika sudah mencapai maxLines (4) atau keluar dari canvas
      if (currentLineIndex >= maxLines || currentY + lineHeight > height - margin) {
        // Tambah ellipsis di baris terakhir jika perlu
        if (i < words.length - 1) {
          const ellipsisWidth = ctx.measureText('...').width;
          if (currentX + ellipsisWidth < width - margin) {
            wordPositions.push({
              word: '...',
              line: currentLineIndex - 1,
              x: currentX,
              y: currentY - lineHeight,
              indexInLine: currentLineWords.length,
              totalInLine: currentLineWords.length + 1
            });
          }
        }
        break;
      }
    } else {
      // Tambah ke baris saat ini
      currentLineWords.push(word);
      currentLineText = testLine;
    }
  }
  
  // Simpan baris terakhir jika masih ada kata dan masih muat
  if (currentLineWords.length > 0 && currentLineIndex < maxLines && currentY <= height - margin) {
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
  
  // HANYA 1 FRAME untuk teks lengkap (cepat!)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  
  wordPositions.forEach(pos => {
    ctx.fillText(pos.word, pos.x, pos.y);
  });
  encoder.addFrame(ctx);
  
  // Fade out CEPAT (hanya 3 frame)
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
            .info-box {
              background: #f8f9fa;
              padding: 12px 15px;
              border-radius: 8px;
              margin: 15px 0;
              border-left: 3px solid #3498db;
            }
            .info-box h4 {
              color: #2980b9;
              margin-bottom: 6px;
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 0.95em;
            }
            .specs {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 10px;
              margin: 15px 0;
            }
            .spec-item {
              background: white;
              padding: 10px;
              border-radius: 6px;
              text-align: center;
              border: 1px solid #e0e0e0;
              font-size: 0.9em;
            }
            .spec-label {
              font-size: 0.8em;
              color: #7f8c8d;
              margin-bottom: 4px;
            }
            .spec-value {
              font-size: 0.95em;
              font-weight: bold;
              color: #2c3e50;
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
            .url-display {
              background: #2c3e50;
              color: white;
              padding: 10px;
              border-radius: 6px;
              margin: 12px 0;
              font-family: 'Courier New', monospace;
              font-size: 13px;
              word-break: break-all;
              display: none;
            }
            .preview-container {
              margin: 20px 0;
              display: none;
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
            .response-info {
              margin: 20px 0;
            }
            .response-header {
              background: #2c3e50;
              color: white;
              padding: 8px 12px;
              border-radius: 6px 6px 0 0;
              font-weight: 600;
              font-size: 0.95em;
            }
            .response-body {
              background: #f8f9fa;
              padding: 12px;
              border-radius: 0 0 6px 6px;
              border: 1px solid #ddd;
              border-top: none;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              white-space: pre-wrap;
              max-height: 180px;
              overflow-y: auto;
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
            .warning {
              background: #fff3cd;
              border: 1px solid #ffeaa7;
              color: #856404;
              padding: 8px 12px;
              border-radius: 6px;
              margin: 10px 0;
              font-size: 0.9em;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .warning-icon {
              color: #f39c12;
            }
            @media (max-width: 768px) {
              .specs { grid-template-columns: repeat(2, 1fr); }
              .nav { flex-direction: column; }
              .container { padding: 15px; }
            }
            @media (max-width: 480px) {
              .specs { grid-template-columns: 1fr; }
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
                
                // Update preview image dengan cache bust
                previewImage.src = url + '&t=' + Date.now();
                previewContainer.style.display = 'block';
                
                // Update response info
                const headers = [
                  'HTTP/1.1 200 OK',
                  'Content-Type: image/jpeg',
                  'Content-Length: [dynamic]',
                  'Cache-Control: public, max-age=3600',
                  'Content-Disposition: inline; filename="brat-image.jpg"'
                ].join('\\n');
                
                const body = 'JPEG image 800×800 • White background • Black text • 3-4 lines max';
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
              
              // Enter key to generate
              textInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && e.ctrlKey) {
                  generateImage();
                }
              });
            });
          </script>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1><span class="icon">🎨</span> Brat JPEG Generator</h1>
              <p>800×800 • Font up to 180px • White Background • Max 4 Lines</p>
            </div>
            
            <div class="warning">
              <span class="icon warning-icon">⚠</span>
              <span><strong>Note:</strong> Text automatically fits within 3-4 lines. Long text will be truncated with "..."</span>
            </div>
            
            <div class="info-box">
              <h4><span class="icon">📐</span> Canvas Specifications:</h4>
              <div class="specs">
                <div class="spec-item">
                  <div class="spec-label">Size</div>
                  <div class="spec-value">800×800 px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font</div>
                  <div class="spec-value">up to 180px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Lines</div>
                  <div class="spec-value">3-4 max</div>
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
                  <div class="spec-label">Text Overflow</div>
                  <div class="spec-value">Auto-truncate</div>
                </div>
              </div>
            </div>
            
            <div class="form-container">
              <div class="form-group">
                <label for="text">Enter your text:</label>
                <textarea 
                  id="text" 
                  name="text" 
                  rows="3" 
                  placeholder="Type text here... (Max 200 characters)"
                  oninput="updatePreview()"
                >Create perfect text images that fit within 3-4 lines</textarea>
              </div>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <button type="button" class="btn" onclick="generateImage()">
                  <span class="icon">🚀</span> Generate JPEG
                </button>
              </div>
              
              <div id="urlDisplay" class="url-display">
                ${host}/brat?text=Create%20perfect%20text%20images%20that%20fit%20within%203-4%20lines
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Updates automatically</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/brat?text=Create%20perfect%20text%20images%20that%20fit%20within%203-4%20lines" 
                     alt="JPEG Preview"
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:40px;color:#7f8c8d;\\'>Preview failed to load. Text may be too long.</div>';">
              </div>
            </div>
            
            <div class="response-info">
              <div class="response-header">
                <span class="icon">📡</span> HTTP Response
              </div>
              <div class="response-body" id="responseBody">
                HTTP/1.1 200 OK
                Content-Type: image/jpeg
                Content-Length: [dynamic]
                Cache-Control: public, max-age=3600
                Content-Disposition: inline; filename="brat-image.jpg"
                
                JPEG image 800×800 • White background • Black text • 3-4 lines max
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Quick Examples:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('Hello World'); return false;">Hello World</button>
                <button class="example-link" onclick="loadExample('Text fits perfectly within canvas'); return false;">Perfect Fit</button>
                <button class="example-link" onclick="loadExample('This is a longer text example that will automatically adjust to fit within maximum 4 lines without overflowing'); return false;">Long Text</button>
                <button class="example-link" onclick="loadExample('Max lines test for overflow prevention with ellipsis'); return false;">Overflow Test</button>
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
          <p style="color: #666; margin: 20px 0;">Text may be too long or contain invalid characters.</p>
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
            .info-box {
              background: #f8f9fa;
              padding: 12px 15px;
              border-radius: 8px;
              margin: 15px 0;
              border-left: 3px solid #e74c3c;
            }
            .info-box h4 {
              color: #c0392b;
              margin-bottom: 6px;
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 0.95em;
            }
            .specs {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 10px;
              margin: 15px 0;
            }
            .spec-item {
              background: white;
              padding: 10px;
              border-radius: 6px;
              text-align: center;
              border: 1px solid #e0e0e0;
              font-size: 0.9em;
            }
            .spec-label {
              font-size: 0.8em;
              color: #7f8c8d;
              margin-bottom: 4px;
            }
            .spec-value {
              font-size: 0.95em;
              font-weight: bold;
              color: #2c3e50;
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
            .url-display {
              background: #2c3e50;
              color: white;
              padding: 10px;
              border-radius: 6px;
              margin: 12px 0;
              font-family: 'Courier New', monospace;
              font-size: 13px;
              word-break: break-all;
              display: none;
            }
            .preview-container {
              margin: 20px 0;
              display: none;
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
            .response-info {
              margin: 20px 0;
            }
            .response-header {
              background: #2c3e50;
              color: white;
              padding: 8px 12px;
              border-radius: 6px 6px 0 0;
              font-weight: 600;
              font-size: 0.95em;
            }
            .response-body {
              background: #f8f9fa;
              padding: 12px;
              border-radius: 0 0 6px 6px;
              border: 1px solid #ddd;
              border-top: none;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              white-space: pre-wrap;
              max-height: 180px;
              overflow-y: auto;
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
            .feature-list {
              background: #f8f9fa;
              padding: 12px 15px;
              border-radius: 8px;
              margin: 15px 0;
              font-size: 0.9em;
            }
            .feature-list ul {
              list-style: none;
              padding-left: 0;
              margin: 0;
            }
            .feature-list li {
              padding: 5px 0;
              color: #555;
              display: flex;
              align-items: center;
            }
            .feature-list li:before {
              content: "✓ ";
              color: #27ae60;
              font-weight: bold;
              margin-right: 8px;
            }
            .warning {
              background: #fff3cd;
              border: 1px solid #ffeaa7;
              color: #856404;
              padding: 8px 12px;
              border-radius: 6px;
              margin: 10px 0;
              font-size: 0.9em;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .warning-icon {
              color: #f39c12;
            }
            @media (max-width: 768px) {
              .specs { grid-template-columns: repeat(2, 1fr); }
              .nav { flex-direction: column; }
              .container { padding: 15px; }
            }
            @media (max-width: 480px) {
              .specs { grid-template-columns: 1fr; }
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
                
                // Update preview image dengan cache bust
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
                
                const body = 'Animated GIF 800×800 • Word-by-word animation • Max 4 lines • Fast fade';
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
              
              // Enter key to generate
              textInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && e.ctrlKey) {
                  generateGif();
                }
              });
            });
          </script>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1><span class="icon">🎬</span> Brat GIF Generator</h1>
              <p>800×800 • Fast Animation • Max 4 Lines • Word-by-Word</p>
            </div>
            
            <div class="warning">
              <span class="icon warning-icon">⚠</span>
              <span><strong>Fast Animation:</strong> 1 frame pause + 3 frame fade out. Max 4 lines with auto-truncate.</span>
            </div>
            
            <div class="info-box">
              <h4><span class="icon">⚡</span> Animation Specifications:</h4>
              <div class="specs">
                <div class="spec-item">
                  <div class="spec-label">Size</div>
                  <div class="spec-value">800×800 px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font</div>
                  <div class="spec-value">up to 180px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Max Lines</div>
                  <div class="spec-value">4 lines</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Delay</div>
                  <div class="spec-value">100ms/word</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Fade Out</div>
                  <div class="spec-value">3 frames</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Loop</div>
                  <div class="spec-value">Infinite</div>
                </div>
              </div>
            </div>
            
            <div class="feature-list">
              <ul>
                <li>Words appear one by one from top-left</li>
                <li>Auto-truncate with "..." when text exceeds limits</li>
                <li>Fast animation with minimal delay</li>
                <li>Text guaranteed to stay within canvas bounds</li>
                <li>Perfect justify alignment</li>
              </ul>
            </div>
            
            <div class="form-container">
              <div class="form-group">
                <label for="text">Enter your text:</label>
                <textarea 
                  id="text" 
                  name="text" 
                  rows="3" 
                  placeholder="Type text here for animation... (Max 30 words)"
                  oninput="updatePreview()"
                >Watch words appear one by one with fast animation</textarea>
              </div>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <button type="button" class="btn" onclick="generateGif()">
                  <span class="icon">🚀</span> Generate GIF
                </button>
              </div>
              
              <div id="urlDisplay" class="url-display">
                ${host}/bratanim?text=Watch%20words%20appear%20one%20by%20one%20with%20fast%20animation
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Updates automatically</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/bratanim?text=Watch%20words%20appear%20one%20by%20one%20with%20fast%20animation" 
                     alt="GIF Preview"
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:40px;color:#7f8c8d;\\'>Preview failed to load. Text may be too long.</div>';">
              </div>
            </div>
            
            <div class="response-info">
              <div class="response-header">
                <span class="icon">📡</span> HTTP Response
              </div>
              <div class="response-body" id="responseBody">
                HTTP/1.1 200 OK
                Content-Type: image/gif
                Content-Length: [dynamic]
                Cache-Control: public, max-age=3600
                Content-Disposition: inline; filename="brat-animation.gif"
                
                Animated GIF 800×800 • Word-by-word animation • Max 4 lines • Fast fade
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Quick Examples:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('Hello Animation'); return false;">Hello Animation</button>
                <button class="example-link" onclick="loadExample('Fast word by word typing effect'); return false;">Typing Effect</button>
                <button class="example-link" onclick="loadExample('This text demonstrates the 4 line limit with auto truncation feature for long content'); return false;">4 Line Demo</button>
                <button class="example-link" onclick="loadExample('Watch each word appear smoothly within canvas bounds'); return false;">Bounds Test</button>
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
          <p style="color: #666; margin: 20px 0;">Text may be too long or contain invalid characters.</p>
          <a href="/bratanim" style="background: #2c3e50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Again</a>
        </body>
        </html>
      `);
    }
  }

  // ROOT INFO - SIMPLE AND CLEAN
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Brat Generator - Text to Image & GIF</title>
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
          max-width: 800px;
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
          margin-bottom: 10px;
          color: #2c3e50;
        }
        
        .header p {
          color: #7f8c8d;
          font-size: 1.1em;
          max-width: 600px;
          margin: 0 auto;
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
        
        .info-box {
          background: white;
          border-radius: 12px;
          padding: 25px;
          margin-top: 30px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.08);
        }
        
        .info-box h3 {
          color: #2c3e50;
          margin-bottom: 15px;
          font-size: 1.3em;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-top: 20px;
        }
        
        .info-item {
          text-align: center;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        
        .info-value {
          font-size: 1.5em;
          font-weight: bold;
          color: #2c3e50;
          margin-bottom: 5px;
        }
        
        .info-label {
          font-size: 0.9em;
          color: #7f8c8d;
        }
        
        footer {
          text-align: center;
          padding: 30px 20px;
          margin-top: 40px;
          color: #7f8c8d;
          border-top: 1px solid #eee;
        }
        
        @media (max-width: 768px) {
          .cards {
            grid-template-columns: 1fr;
          }
          .info-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (max-width: 480px) {
          .info-grid {
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
          <p>Create perfect 800×800 text images and animations with guaranteed bounds</p>
        </div>
        
        <div class="cards">
          <div class="card">
            <div class="card-header">
              <div class="card-icon jpeg-icon">🎨</div>
              <h2>JPEG Generator</h2>
            </div>
            <ul class="features">
              <li>800×800 square canvas</li>
              <li>Font up to 180px</li>
              <li>Max 3-5 lines (auto-adjust)</li>
              <li>White background, black text</li>
              <li>Text never exceeds canvas</li>
              <li>Justify alignment</li>
            </ul>
            <a href="/brat" class="btn btn-jpeg">Try JPEG Generator</a>
            <a href="/brat?text=Create%20perfect%20text%20images" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
          
          <div class="card">
            <div class="card-header">
              <div class="card-icon gif-icon">🎬</div>
              <h2>GIF Generator</h2>
            </div>
            <ul class="features">
              <li>Word-by-word animation</li>
              <li>800×800 square format</li>
              <li>Max 4 lines (auto-truncate)</li>
              <li>Fast fade (3 frames)</li>
              <li>Infinite loop</li>
              <li>Text stays within bounds</li>
            </ul>
            <a href="/bratanim" class="btn btn-gif">Try GIF Generator</a>
            <a href="/bratanim?text=Watch%20words%20appear" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
        </div>
        
        <div class="info-box">
          <h3>📊 Technical Specifications</h3>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-value">800×800</div>
              <div class="info-label">Canvas Size</div>
            </div>
            <div class="info-item">
              <div class="info-value">180px</div>
              <div class="info-label">Max Font Size</div>
            </div>
            <div class="info-item">
              <div class="info-value">3-5</div>
              <div class="info-label">Max Lines</div>
            </div>
            <div class="info-item">
              <div class="info-value">100ms</div>
              <div class="info-label">Animation Delay</div>
            </div>
            <div class="info-item">
              <div class="info-value">⚪</div>
              <div class="info-label">White BG</div>
            </div>
            <div class="info-item">
              <div class="info-value">⚫</div>
              <div class="info-label">Black Text</div>
            </div>
          </div>
        </div>
        
        <footer>
          <p>Made with ❤️ by <strong>Xyz-kings</strong></p>
          <p style="margin-top: 10px; font-size: 0.9em;">
            Text automatically fits within bounds • No overflow • Perfect for social media
          </p>
        </footer>
      </div>
    </body>
    </html>
  `);
};