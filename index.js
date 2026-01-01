const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font
GlobalFonts.registerFromPath(path.join(__dirname, 'xyzfont.ttf'), 'XyzFont');

// Word-wrap untuk justify dengan ellipsis di akhir jika perlu
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
      
      // Jika sudah mencapai maxLines, tambah ellipsis di line terakhir
      if (lines.length === maxLines) {
        // Coba tambah ellipsis di line terakhir jika masih ada kata lagi
        if (i < words.length - 1) {
          const lastLine = lines[maxLines - 1];
          let ellipsisLine = lastLine;
          
          // Kurangi kata satu per satu sampai muat ellipsis
          while (ctx.measureText(ellipsisLine + '...').width > maxWidth && ellipsisLine.length > 3) {
            const lastSpace = ellipsisLine.lastIndexOf(' ');
            if (lastSpace > 0) {
              ellipsisLine = ellipsisLine.substring(0, lastSpace);
            } else {
              ellipsisLine = ellipsisLine.substring(0, ellipsisLine.length - 1);
            }
          }
          
          if (ctx.measureText(ellipsisLine + '...').width <= maxWidth) {
            lines[maxLines - 1] = ellipsisLine + '...';
          }
        }
        break;
      }
    } else {
      line = testLine;
    }
  }
  
  if (line && lines.length < maxLines) {
    // Cek apakah line terakhir perlu ellipsis (harusnya tidak karena ini line terakhir asli)
    lines.push(line);
  }
  
  return lines;
}

// Fit font size dengan logika cerdas
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 50, maxFontSize = 180, minFontSize = 140) {
  let fontSize = maxFontSize;
  let lines = [];
  const words = text.split(' ');
  const isShortText = words.length <= 10 || text.length <= 50;
  
  // Tentukan maxLines berdasarkan panjang text
  let maxLines;
  if (isShortText) {
    maxLines = 3; // Text pendek: maksimal 3 lines
  } else if (words.length <= 20) {
    maxLines = 4; // Text sedang: maksimal 4 lines
  } else {
    maxLines = 5; // Text panjang: maksimal 5 lines
  }

  do {
    ctx.font = `${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2, maxLines);
    
    // Cek apakah text muat dalam canvas
    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const maxTextHeight = canvasHeight - margin * 2;
    
    // Kondisi berhenti: text muat DAN font size masih di atas minimum
    if (totalTextHeight <= maxTextHeight && lines.length <= maxLines && fontSize >= minFontSize) {
      break;
    }
    
    fontSize -= 2; // Kurangi font size sedikit demi sedikit
    
    // Jika font size sudah terlalu kecil, break
    if (fontSize < minFontSize) {
      fontSize = minFontSize;
      // Coba lagi dengan font size minimum
      ctx.font = `${fontSize}px XyzFont`;
      lines = wrapText(ctx, text, canvasWidth - margin * 2, maxLines);
      break;
    }
  } while (true);

  return { fontSize, lines, maxLines };
}

// Draw justified text dengan ellipsis handling
function drawJustifiedText(ctx, lines, margin, lineHeight) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  
  // Hitung total tinggi text dan posisi Y awal (center vertikal)
  const totalTextHeight = lines.length * lineHeight;
  const startY = Math.max(margin, (canvasHeight - totalTextHeight) / 2);
  
  lines.forEach((line, idx) => {
    const y = startY + (idx * lineHeight);
    
    // Cek apakah line sudah mengandung ellipsis
    const hasEllipsis = line.endsWith('...');
    const displayLine = line;
    
    const words = displayLine.split(' ');
    if (words.length === 1 || hasEllipsis) {
      // Single word atau sudah ada ellipsis, draw biasa
      ctx.fillText(displayLine, margin, y);
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
  const width = 800, height = 800, margin = 50;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background putih polos
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Tidak perlu batasi panjang text, system akan handle sendiri
  const { fontSize, lines, maxLines } = fitTextToCanvas(ctx, text, width, height, margin);

  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.2;

  // Draw dengan ellipsis handling
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
  const { fontSize, lines, maxLines } = fitTextToCanvas(ctx, text, width, height, margin);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.2;
  const maxLineWidth = width - margin * 2;

  // Bangun semua kata dari lines yang sudah di-wrap
  const allWords = [];
  lines.forEach(line => {
    if (line.endsWith('...')) {
      // Jika line berakhir dengan ellipsis, pecah dan tambah ellipsis sebagai kata terakhir
      const words = line.substring(0, line.length - 3).split(' ');
      words.forEach(word => allWords.push(word));
      allWords.push('...'); // Tambah ellipsis sebagai kata terpisah
    } else {
      const words = line.split(' ');
      words.forEach(word => allWords.push(word));
    }
  });

  // PRE-CALCULATE: Tentukan posisi setiap kata
  const wordPositions = [];
  let currentLineWords = [];
  let currentLineText = '';
  let currentLineIndex = 0;
  let currentY = margin; // Mulai dari margin atas
  
  // Proses setiap kata untuk menentukan posisinya
  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    
    // Handle ellipsis khusus
    if (word === '...') {
      // Ellipsis selalu di akhir line
      if (currentLineWords.length > 0) {
        const lineText = currentLineWords.join(' ');
        const lineWidth = ctx.measureText(lineText).width;
        const ellipsisWidth = ctx.measureText('...').width;
        
        // Tambah ellipsis di posisi yang tepat
        wordPositions.push({
          word: '...',
          line: currentLineIndex,
          x: margin + lineWidth + (currentLineWords.length > 1 ? 5 : 0), // Sedikit spacing
          y: currentY,
          indexInLine: currentLineWords.length,
          totalInLine: currentLineWords.length + 1,
          isEllipsis: true
        });
      }
      continue;
    }
    
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
          totalInLine: currentLineWords.length,
          isEllipsis: false
        });
        currentX += ctx.measureText(currentLineWords[j]).width + spaceWidth;
      }
      
      // Reset untuk baris baru
      currentLineIndex++;
      currentLineWords = [word];
      currentLineText = word;
      currentY += lineHeight;
      
      // STOP jika sudah mencapai maxLines atau keluar dari canvas
      if (currentLineIndex >= maxLines || currentY + lineHeight > height - margin) {
        // Jika masih ada kata lain, tambah ellipsis
        if (i < allWords.length - 1) {
          const lineText = currentLineWords.join(' ');
          const lineWidth = ctx.measureText(lineText).width;
          const ellipsisWidth = ctx.measureText('...').width;
          
          if (margin + lineWidth + ellipsisWidth < width - margin) {
            wordPositions.push({
              word: '...',
              line: currentLineIndex - 1,
              x: margin + lineWidth + 5,
              y: currentY - lineHeight,
              indexInLine: currentLineWords.length,
              totalInLine: currentLineWords.length + 1,
              isEllipsis: true
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
  
  // Simpan baris terakhir jika masih ada kata
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
        totalInLine: currentLineWords.length,
        isEllipsis: false
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
            .auto-adjust-info {
              background: #e8f4fd;
              border: 1px solid #b3e0ff;
              color: #0066cc;
              padding: 10px;
              border-radius: 6px;
              margin: 10px 0;
              font-size: 0.9em;
            }
            .auto-adjust-info ul {
              margin: 5px 0 0 15px;
              padding: 0;
            }
            .auto-adjust-info li {
              margin-bottom: 3px;
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
                
                // Tentukan info berdasarkan panjang text
                const wordCount = text.split(' ').length;
                let textInfo;
                if (wordCount <= 10) {
                  textInfo = 'Short text (≤10 words): 3 lines, font up to 180px';
                } else if (wordCount <= 20) {
                  textInfo = 'Medium text (11-20 words): 4 lines, font auto-adjusted';
                } else {
                  textInfo = 'Long text (>20 words): 5 lines max, font down to 140px, ellipsis if needed';
                }
                
                const body = \`JPEG 800×800 • Auto font size (140-180px) • 3-5 lines • \${textInfo}\`;
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
              <p>800×800 • Smart Font Sizing (140-180px) • Auto Line Adjustment (3-5 lines)</p>
            </div>
            
            <div class="auto-adjust-info">
              <strong>✨ Smart Text Adjustment:</strong>
              <ul>
                <li><strong>Short text</strong> (≤10 words): 3 lines max, font up to 180px</li>
                <li><strong>Medium text</strong> (11-20 words): 4 lines max, font auto-adjusted</li>
                <li><strong>Long text</strong> (>20 words): 5 lines max, font down to 140px</li>
                <li>Auto ellipsis (...) at the end if text doesn't fit</li>
                <li>No character limit - system adjusts automatically</li>
              </ul>
            </div>
            
            <div class="info-box">
              <h4><span class="icon">📐</span> Canvas Specifications:</h4>
              <div class="specs">
                <div class="spec-item">
                  <div class="spec-label">Size</div>
                  <div class="spec-value">800×800 px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font Range</div>
                  <div class="spec-value">140-180px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Lines</div>
                  <div class="spec-value">3-5 lines</div>
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
                  <div class="spec-label">Overflow</div>
                  <div class="spec-value">Auto ellipsis</div>
                </div>
              </div>
            </div>
            
            <div class="form-container">
              <div class="form-group">
                <label for="text">Enter your text (any length):</label>
                <textarea 
                  id="text" 
                  name="text" 
                  rows="4" 
                  placeholder="Type any amount of text here... System will automatically adjust font size and lines to fit perfectly."
                  oninput="updatePreview()"
                >This is a smart text system that adjusts font size and line count based on content length</textarea>
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
                ${host}/brat?text=This%20is%20a%20smart%20text%20system%20that%20adjusts%20font%20size%20and%20line%20count%20based%20on%20content%20length
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Updates automatically with smart adjustment</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/brat?text=This%20is%20a%20smart%20text%20system%20that%20adjusts%20font%20size%20and%20line%20count%20based%20on%20content%20length" 
                     alt="JPEG Preview"
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:40px;color:#7f8c8d;\\'>Preview loading...</div>';">
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
                
                JPEG 800×800 • Auto font size (140-180px) • 3-5 lines • Medium text (11-20 words): 4 lines, font auto-adjusted
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Test Examples:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('Hello'); return false;">Very Short</button>
                <button class="example-link" onclick="loadExample('This is a medium length text example'); return false;">Medium</button>
                <button class="example-link" onclick="loadExample('This is a very long text that will test the automatic adjustment system to see how it handles multiple lines and reduces font size when necessary to fit everything perfectly within the canvas bounds'); return false;">Long Text</button>
                <button class="example-link" onclick="loadExample('Extremely long text that definitely requires font size reduction and line increase with possible ellipsis at the end to indicate truncation when the content exceeds the maximum allowed space within the defined canvas dimensions and formatting constraints'); return false;">Extreme Length</button>
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
            .auto-adjust-info {
              background: #ffe8e8;
              border: 1px solid #ffcccc;
              color: #cc0000;
              padding: 10px;
              border-radius: 6px;
              margin: 10px 0;
              font-size: 0.9em;
            }
            .auto-adjust-info ul {
              margin: 5px 0 0 15px;
              padding: 0;
            }
            .auto-adjust-info li {
              margin-bottom: 3px;
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
                
                // Tentukan info berdasarkan panjang text
                const wordCount = text.split(' ').length;
                let textInfo;
                if (wordCount <= 10) {
                  textInfo = 'Short text: 3 lines, 180px font';
                } else if (wordCount <= 20) {
                  textInfo = 'Medium text: 4 lines, auto font';
                } else {
                  textInfo = 'Long text: 5 lines, 140px font, ellipsis if needed';
                }
                
                const body = \`Animated GIF 800×800 • Smart adjustment • \${textInfo} • Fast animation\`;
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
              <p>800×800 • Smart Text Adjustment • Word-by-Word Animation</p>
            </div>
            
            <div class="auto-adjust-info">
              <strong>✨ Smart Animation Adjustment:</strong>
              <ul>
                <li><strong>Short text</strong> (≤10 words): 3 lines, font up to 180px</li>
                <li><strong>Medium text</strong> (11-20 words): 4 lines, font auto-adjusted</li>
                <li><strong>Long text</strong> (>20 words): 5 lines max, font down to 140px</li>
                <li>Auto ellipsis (...) at animation end if text overflows</li>
                <li>No word limit - system adjusts automatically</li>
                <li>Fast animation with minimal delay between words</li>
              </ul>
            </div>
            
            <div class="info-box">
              <h4><span class="icon">⚡</span> Animation Specifications:</h4>
              <div class="specs">
                <div class="spec-item">
                  <div class="spec-label">Size</div>
                  <div class="spec-value">800×800 px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Font Range</div>
                  <div class="spec-value">140-180px</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label">Max Lines</div>
                  <div class="spec-value">5 lines</div>
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
                <li>Smart font size adjustment based on text length</li>
                <li>Auto ellipsis when text exceeds canvas space</li>
                <li>Fast animation with minimal pauses</li>
                <li>Text guaranteed to stay within bounds</li>
                <li>Perfect justify alignment for all text lengths</li>
              </ul>
            </div>
            
            <div class="form-container">
              <div class="form-group">
                <label for="text">Enter your text (any length):</label>
                <textarea 
                  id="text" 
                  name="text" 
                  rows="4" 
                  placeholder="Type any amount of text here... System will automatically adjust font size, lines, and add ellipsis if needed."
                  oninput="updatePreview()"
                >Watch words appear one by one with smart font adjustment based on text length</textarea>
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
                ${host}/bratanim?text=Watch%20words%20appear%20one%20by%20one%20with%20smart%20font%20adjustment%20based%20on%20text%20length
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Updates automatically with smart adjustment</small>
              </div>
              <div class="preview-area">
                <img id="previewImage" src="/bratanim?text=Watch%20words%20appear%20one%20by%20one%20with%20smart%20font%20adjustment%20based%20on%20text%20length" 
                     alt="GIF Preview"
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:40px;color:#7f8c8d;\\'>Preview loading...</div>';">
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
                
                Animated GIF 800×800 • Smart adjustment • Medium text: 4 lines, auto font • Fast animation
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Test Examples:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('Hello Animation'); return false;">Very Short</button>
                <button class="example-link" onclick="loadExample('This animation shows smart text adjustment'); return false;">Medium</button>
                <button class="example-link" onclick="loadExample('This is a very long text that will test the automatic adjustment system to see how it handles multiple lines and reduces font size when necessary to fit everything perfectly within the canvas bounds while animating word by word'); return false;">Long Text</button>
                <button class="example-link" onclick="loadExample('Extremely long text that definitely requires font size reduction and line increase with possible ellipsis at the end to indicate truncation when the content exceeds the maximum allowed space within the defined canvas dimensions and formatting constraints while still maintaining smooth animation between each word appearing on screen'); return false;">Extreme Length</button>
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
      <title>Brat Generator - Smart Text Adjustment</title>
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
        
        .smart-feature {
          background: linear-gradient(135deg, #3498db, #2c3e50);
          color: white;
          padding: 15px;
          border-radius: 10px;
          margin: 20px auto;
          max-width: 600px;
          text-align: center;
        }
        
        .smart-feature h3 {
          margin-bottom: 10px;
          font-size: 1.3em;
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
        
        .adjustment-info {
          background: white;
          border-radius: 12px;
          padding: 25px;
          margin-top: 30px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.08);
        }
        
        .adjustment-info h3 {
          color: #2c3e50;
          margin-bottom: 20px;
          font-size: 1.3em;
          text-align: center;
        }
        
        .adjustment-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
        }
        
        .adjustment-item {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          text-align: center;
          border: 2px solid transparent;
        }
        
        .adjustment-item.short {
          border-color: #3498db;
        }
        
        .adjustment-item.medium {
          border-color: #f39c12;
        }
        
        .adjustment-item.long {
          border-color: #e74c3c;
        }
        
        .adjustment-label {
          font-size: 1.1em;
          font-weight: bold;
          margin-bottom: 10px;
          color: #2c3e50;
        }
        
        .adjustment-short { color: #3498db; }
        .adjustment-medium { color: #f39c12; }
        .adjustment-long { color: #e74c3c; }
        
        .adjustment-details {
          font-size: 0.9em;
          color: #7f8c8d;
          line-height: 1.5;
        }
        
        footer {
          text-align: center;
          padding: 30px 20px;
          margin-top: 40px;
          color: #7f8c8d;
          border-top: 1px solid #eee;
        }
        
        .ellipsis-note {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          color: #856404;
          padding: 12px;
          border-radius: 8px;
          margin: 20px 0;
          text-align: center;
          font-size: 0.95em;
        }
        
        @media (max-width: 768px) {
          .cards, .adjustment-grid {
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
          <p>Smart text adjustment system with automatic font sizing and line management</p>
          
          <div class="smart-feature">
            <h3>🤖 Smart Text Adjustment</h3>
            <p>System automatically adjusts font size (140-180px) and lines (3-5) based on text length</p>
          </div>
        </div>
        
        <div class="adjustment-info">
          <h3>📊 Smart Adjustment Rules</h3>
          <div class="adjustment-grid">
            <div class="adjustment-item short">
              <div class="adjustment-label adjustment-short">Short Text</div>
              <div class="adjustment-details">
                ≤10 words<br>
                <strong>3 lines max</strong><br>
                Font up to <strong>180px</strong><br>
                Perfect for short messages
              </div>
            </div>
            
            <div class="adjustment-item medium">
              <div class="adjustment-label adjustment-medium">Medium Text</div>
              <div class="adjustment-details">
                11-20 words<br>
                <strong>4 lines max</strong><br>
                Font <strong>auto-adjusted</strong><br>
                Balanced text display
              </div>
            </div>
            
            <div class="adjustment-item long">
              <div class="adjustment-label adjustment-long">Long Text</div>
              <div class="adjustment-details">
                >20 words<br>
                <strong>5 lines max</strong><br>
                Font down to <strong>140px</strong><br>
                Auto ellipsis if needed
              </div>
            </div>
          </div>
          
          <div class="ellipsis-note">
            <strong>Note:</strong> If text exceeds available space, automatic ellipsis (...) will be added at the end
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
              <li>Smart font size (140-180px)</li>
              <li>Auto line adjustment (3-5 lines)</li>
              <li>White background, black text</li>
              <li>Auto ellipsis for overflow</li>
              <li>No text length limits</li>
            </ul>
            <a href="/brat" class="btn btn-jpeg">Try JPEG Generator</a>
            <a href="/brat?text=Test%20smart%20adjustment" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
          
          <div class="card">
            <div class="card-header">
              <div class="card-icon gif-icon">🎬</div>
              <h2>GIF Generator</h2>
            </div>
            <ul class="features">
              <li>Word-by-word animation</li>
              <li>Smart font adjustment</li>
              <li>Auto line management (3-5)</li>
              <li>Fast animation (100ms/word)</li>
              <li>Infinite loop</li>
              <li>Auto ellipsis if needed</li>
            </ul>
            <a href="/bratanim" class="btn btn-gif">Try GIF Generator</a>
            <a href="/bratanim?text=Smart%20animation%20adjustment" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
        </div>
        
        <footer>
          <p>Made with ❤️ by <strong>Xyz-kings</strong></p>
          <p style="margin-top: 10px; font-size: 0.9em;">
            Intelligent text adjustment • No limits • Perfect for all text lengths
          </p>
        </footer>
      </div>
    </body>
    </html>
  `);
};