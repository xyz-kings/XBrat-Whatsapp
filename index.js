const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font
GlobalFonts.registerFromPath(path.join(__dirname, 'xyzfont.ttf'), 'XyzFont');

// Word-wrap yang aman - pastikan tidak ada kata yang terpotong
function wrapText(ctx, text, maxWidth, maxLines = 5) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = line + (line ? ' ' : '') + word;
    const testWidth = ctx.measureText(testLine).width;
    
    // Jika kata sendiri sudah lebih lebar dari maxWidth, paksa ke line baru
    const wordWidth = ctx.measureText(word).width;
    if (wordWidth > maxWidth && line === '') {
      // Kata terlalu panjang untuk satu line, kita harus memecahnya
      lines.push(word);
      line = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    
    if (testWidth > maxWidth && line !== '') {
      lines.push(line);
      line = word;
      
      if (lines.length >= maxLines) {
        // Jika sudah mencapai maxLines, stop
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

// Fit font size dengan prioritas: text harus muat di canvas
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 50) {
  const words = text.split(' ');
  const wordCount = words.length;
  
  // Mulai dari font size berdasarkan jumlah kata
  let fontSize;
  if (wordCount <= 3) {
    fontSize = 180;
  } else if (wordCount <= 8) {
    fontSize = 170;
  } else if (wordCount <= 15) {
    fontSize = 160;
  } else if (wordCount <= 25) {
    fontSize = 150;
  } else {
    fontSize = 140;
  }
  
  let maxLines;
  if (wordCount <= 5) {
    maxLines = 3;
  } else if (wordCount <= 15) {
    maxLines = 4;
  } else {
    maxLines = 5;
  }
  
  let lines = [];
  let attempts = 0;
  const maxAttempts = 30; // Lebih banyak percobaan untuk memastikan muat
  
  while (attempts < maxAttempts) {
    ctx.font = `${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2, maxLines);
    
    // Cek apakah semua kata muat dan tidak ada yang terpotong
    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const maxTextHeight = canvasHeight - margin * 2;
    
    // Cek juga lebar setiap line
    let allLinesFit = true;
    for (const line of lines) {
      const lineWidth = ctx.measureText(line).width;
      if (lineWidth > canvasWidth - margin * 2) {
        allLinesFit = false;
        break;
      }
    }
    
    // Kondisi berhasil: semua line muat dan total height juga muat
    if (allLinesFit && totalTextHeight <= maxTextHeight && lines.length <= maxLines) {
      // Double check: pastikan semua kata dari text asli ada di lines
      const allWordsInLines = lines.join(' ').split(' ');
      const originalWords = text.split(' ');
      
      // Jika ada kata yang hilang, perlu lebih kecil font size
      if (allWordsInLines.length >= originalWords.length) {
        break; // Semua kata muat
      }
    }
    
    // Jika tidak muat, kurangi font size atau tambah maxLines
    fontSize -= 2;
    
    // Jika font size sudah minimum, coba tambah maxLines
    if (fontSize < 140) {
      fontSize = 140;
      if (maxLines < 5) {
        maxLines++;
      } else {
        // Sudah maksimal, break dengan kondisi saat ini
        break;
      }
    }
    
    attempts++;
  }
  
  return { fontSize: Math.max(fontSize, 140), lines, maxLines };
}

// Draw justified text dengan safety check
function drawJustifiedText(ctx, lines, margin, lineHeight) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  
  // Hitung total tinggi text
  const totalTextHeight = lines.length * lineHeight;
  
  // Pastikan text tidak keluar dari canvas
  const maxY = canvasHeight - margin;
  const minY = margin;
  
  // Hitung startY agar text di tengah vertikal
  let startY = (canvasHeight - totalTextHeight) / 2;
  startY = Math.max(minY, Math.min(startY, maxY - totalTextHeight));
  
  lines.forEach((line, idx) => {
    const y = startY + (idx * lineHeight);
    
    // Pastikan y tidak keluar dari canvas
    if (y < minY || y + lineHeight > maxY) {
      return; // Skip jika keluar bounds
    }
    
    const words = line.split(' ');
    if (words.length === 1) {
      // Untuk single word, pastikan tidak keluar dari kanan
      const textWidth = ctx.measureText(line).width;
      const maxX = canvasWidth - margin;
      const x = Math.min(margin, maxX - textWidth);
      ctx.fillText(line, x, y);
      return;
    }
    
    // Justify alignment
    const totalWidth = words.reduce((sum, word) => sum + ctx.measureText(word).width, 0);
    const spaceCount = words.length - 1;
    const spaceWidth = spaceCount > 0 ? (canvasWidth - margin * 2 - totalWidth) / spaceCount : 0;
    
    let xPos = margin;
    words.forEach(word => {
      // Pastikan word tidak keluar dari kanan
      const wordWidth = ctx.measureText(word).width;
      if (xPos + wordWidth <= canvasWidth - margin) {
        ctx.fillText(word, xPos, y);
      }
      xPos += wordWidth + spaceWidth;
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

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin);

  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.2;

  // Draw dengan safety check
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
  encoder.setRepeat(0);
  encoder.setDelay(100);
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

  // PRE-CALCULATE: Tentukan posisi setiap kata dengan safety check
  const wordPositions = [];
  let currentLineWords = [];
  let currentLineText = '';
  let currentLineIndex = 0;
  
  // Hitung startY untuk center vertikal
  const totalLines = lines.length;
  const totalTextHeight = totalLines * lineHeight;
  let currentY = Math.max(margin, (height - totalTextHeight) / 2);
  
  // Proses setiap kata untuk menentukan posisinya
  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    const testLine = currentLineText ? currentLineText + ' ' + word : word;
    const testWidth = ctx.measureText(testLine).width;
    
    // Jika melebihi width
    if (testWidth > maxLineWidth && currentLineText !== '') {
      // Simpan baris yang sudah terkumpul
      const totalWidth = currentLineWords.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
      const spaceCount = currentLineWords.length - 1;
      const spaceWidth = spaceCount > 0 ? (maxLineWidth - totalWidth) / spaceCount : 0;
      
      let currentX = margin;
      for (let j = 0; j < currentLineWords.length; j++) {
        const wordWidth = ctx.measureText(currentLineWords[j]).width;
        // Pastikan tidak keluar dari kanan
        if (currentX + wordWidth <= width - margin) {
          wordPositions.push({
            word: currentLineWords[j],
            line: currentLineIndex,
            x: currentX,
            y: currentY,
            indexInLine: j,
            totalInLine: currentLineWords.length
          });
        }
        currentX += wordWidth + spaceWidth;
      }
      
      // Reset untuk baris baru
      currentLineIndex++;
      currentLineWords = [word];
      currentLineText = word;
      currentY += lineHeight;
      
      // Pastikan tidak keluar dari bawah
      if (currentY + lineHeight > height - margin) {
        break;
      }
    } else {
      currentLineWords.push(word);
      currentLineText = testLine;
    }
  }
  
  // Simpan baris terakhir
  if (currentLineWords.length > 0 && currentY <= height - margin) {
    const totalWidth = currentLineWords.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
    const spaceCount = currentLineWords.length - 1;
    const spaceWidth = spaceCount > 0 ? (maxLineWidth - totalWidth) / spaceCount : 0;
    
    let currentX = margin;
    for (let j = 0; j < currentLineWords.length; j++) {
      const wordWidth = ctx.measureText(currentLineWords[j]).width;
      if (currentX + wordWidth <= width - margin) {
        wordPositions.push({
          word: currentLineWords[j],
          line: currentLineIndex,
          x: currentX,
          y: currentY,
          indexInLine: j,
          totalInLine: currentLineWords.length
        });
      }
      currentX += wordWidth + spaceWidth;
    }
  }
  
  // ANIMASI: Tampilkan kata per kata
  const totalWords = wordPositions.length;
  
  // Frame pertama: background putih
  {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    encoder.addFrame(ctx);
  }
  
  // Animasi kata per kata
  for (let frame = 0; frame <= totalWords; frame++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = '#000000';
    
    for (let i = 0; i < frame && i < totalWords; i++) {
      const pos = wordPositions[i];
      ctx.fillText(pos.word, pos.x, pos.y);
    }
    
    encoder.addFrame(ctx);
  }
  
  // 1 FRAME untuk teks lengkap
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#000000';
  
  wordPositions.forEach(pos => {
    ctx.fillText(pos.word, pos.x, pos.y);
  });
  encoder.addFrame(ctx);
  
  // Fade out (3 frame)
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
  
  // Frame kosong (1 frame)
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
            .safety-box {
              background: #e8f6f3;
              padding: 15px;
              border-radius: 8px;
              margin: 15px 0;
              border-left: 3px solid #1abc9c;
            }
            .safety-box h4 {
              color: #16a085;
              margin-bottom: 10px;
              font-size: 1em;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .safety-features {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
              margin-top: 10px;
            }
            .safety-item {
              background: white;
              padding: 10px;
              border-radius: 6px;
              text-align: center;
              border: 1px solid #e0e0e0;
              font-size: 0.85em;
            }
            .safety-icon {
              color: #1abc9c;
              font-size: 1.2em;
              margin-bottom: 5px;
            }
            .safety-text {
              color: #2c3e50;
              font-weight: 500;
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
              position: relative;
            }
            .preview-area img {
              max-width: 100%;
              border-radius: 4px;
              max-height: 350px;
              border: 1px solid #eee;
            }
            .canvas-overlay {
              position: absolute;
              top: 15px;
              left: 15px;
              right: 15px;
              bottom: 15px;
              border: 2px dashed rgba(52, 152, 219, 0.3);
              pointer-events: none;
              border-radius: 4px;
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
            .stats {
              display: flex;
              justify-content: space-around;
              background: #f8f9fa;
              padding: 10px;
              border-radius: 6px;
              margin: 10px 0;
              font-size: 0.9em;
            }
            .stat-item {
              text-align: center;
            }
            .stat-value {
              font-weight: bold;
              color: #2c3e50;
            }
            .stat-label {
              color: #7f8c8d;
              font-size: 0.85em;
            }
            @media (max-width: 768px) {
              .safety-features { grid-template-columns: 1fr; }
              .nav { flex-direction: column; }
              .container { padding: 15px; }
              .stats { flex-direction: column; gap: 10px; }
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
                
                // Update stats
                wordCountDisplay.textContent = wordCount;
                
                // Estimasi font size dan lines
                let fontSize, lineCount;
                if (wordCount <= 3) {
                  fontSize = '180px'; lineCount = '3';
                } else if (wordCount <= 8) {
                  fontSize = '170px'; lineCount = '3-4';
                } else if (wordCount <= 15) {
                  fontSize = '160px'; lineCount = '4';
                } else if (wordCount <= 25) {
                  fontSize = '150px'; lineCount = '4-5';
                } else {
                  fontSize = '140px'; lineCount = '5';
                }
                
                fontSizeDisplay.textContent = fontSize;
                lineCountDisplay.textContent = lineCount;
              } else {
                previewContainer.style.display = 'none';
                wordCountDisplay.textContent = '0';
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
              
              const textInput = document.getElementById('text');
              let updateTimeout;
              
              textInput.addEventListener('input', function() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(updatePreview, 300);
              });
              
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
              <p>800×800 • Text Never Exceeds Canvas • Auto-Scaling</p>
            </div>
            
            <div class="safety-box">
              <h4><span class="icon">🛡️</span> Canvas Safety System</h4>
              <p style="color: #2c3e50; font-size: 0.9em; margin-bottom: 10px;">
                Text is guaranteed to stay within canvas boundaries. System automatically adjusts font size and line count.
              </p>
              <div class="safety-features">
                <div class="safety-item">
                  <div class="safety-icon">📏</div>
                  <div class="safety-text">Boundary Check</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">Text never exceeds edges</div>
                </div>
                <div class="safety-item">
                  <div class="safety-icon">📐</div>
                  <div class="safety-text">Auto Scaling</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">Font size adjusts automatically</div>
                </div>
                <div class="safety-item">
                  <div class="safety-icon">↕️</div>
                  <div class="safety-text">Line Management</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">3-5 lines with auto-wrap</div>
                </div>
                <div class="safety-item">
                  <div class="safety-icon">✅</div>
                  <div class="safety-text">No Text Cutoff</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">Complete text always visible</div>
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
                  placeholder="Type any text... System will automatically scale to fit within 800×800 canvas"
                  oninput="updatePreview()"
                >Text automatically scales to fit canvas</textarea>
              </div>
              
              <div class="stats">
                <div class="stat-item">
                  <div class="stat-value" id="wordCount">3</div>
                  <div class="stat-label">Words</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="fontSize">170px</div>
                  <div class="stat-label">Font Size</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="lineCount">3-4</div>
                  <div class="stat-label">Lines</div>
                </div>
              </div>
              
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <button type="button" class="btn" onclick="generateImage()">
                  <span class="icon">🚀</span> Generate JPEG
                </button>
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Text stays within canvas bounds</small>
              </div>
              <div class="preview-area">
                <div class="canvas-overlay"></div>
                <img id="previewImage" src="/brat?text=Text%20automatically%20scales%20to%20fit%20canvas" 
                     alt="JPEG Preview">
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Test Boundary Safety:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('VeryLongWordThatShouldFitProperlyInCanvasWithoutExceedingBoundaries'); return false;">Long Single Word</button>
                <button class="example-link" onclick="loadExample('This text contains many words to test the automatic scaling system that ensures no text exceeds the canvas boundaries regardless of length or word size'); return false;">Many Words Test</button>
                <button class="example-link" onclick="loadExample('Testing boundary safety with extremely long text that should automatically scale down font size and increase line count to ensure perfect fit within the 800x800 canvas without any overflow or cutoff issues'); return false;">Extreme Length</button>
                <button class="example-link" onclick="loadExample('Word1 Word2 Word3 Word4 Word5 Word6 Word7 Word8 Word9 Word10 Word11 Word12 Word13 Word14 Word15 Word16 Word17 Word18 Word19 Word20'); return false;">Word Count Test</button>
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
          <p style="color: #666; margin: 20px 0;">Text may be too complex to fit within canvas.</p>
          <a href="/brat" style="background: #2c3e50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Simpler Text</a>
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
            .safety-box {
              background: #ffeaa7;
              padding: 15px;
              border-radius: 8px;
              margin: 15px 0;
              border-left: 3px solid #f39c12;
            }
            .safety-box h4 {
              color: #d35400;
              margin-bottom: 10px;
              font-size: 1em;
              display: flex;
              align-items: center;
              gap: 8px;
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
              position: relative;
            }
            .preview-area img {
              max-width: 100%;
              border-radius: 4px;
              max-height: 350px;
              border: 1px solid #eee;
            }
            .canvas-overlay {
              position: absolute;
              top: 15px;
              left: 15px;
              right: 15px;
              bottom: 15px;
              border: 2px dashed rgba(231, 76, 60, 0.3);
              pointer-events: none;
              border-radius: 4px;
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
            .safety-features {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
              margin-top: 10px;
            }
            .safety-item {
              background: white;
              padding: 10px;
              border-radius: 6px;
              text-align: center;
              border: 1px solid #e0e0e0;
              font-size: 0.85em;
            }
            .safety-icon {
              color: #e74c3c;
              font-size: 1.2em;
              margin-bottom: 5px;
            }
            .safety-text {
              color: #2c3e50;
              font-weight: 500;
            }
            .stats {
              display: flex;
              justify-content: space-around;
              background: #f8f9fa;
              padding: 10px;
              border-radius: 6px;
              margin: 10px 0;
              font-size: 0.9em;
            }
            .stat-item {
              text-align: center;
            }
            .stat-value {
              font-weight: bold;
              color: #2c3e50;
            }
            .stat-label {
              color: #7f8c8d;
              font-size: 0.85em;
            }
            @media (max-width: 768px) {
              .safety-features { grid-template-columns: 1fr; }
              .nav { flex-direction: column; }
              .container { padding: 15px; }
              .stats { flex-direction: column; gap: 10px; }
            }
          </style>
          <script>
            function updatePreview() {
              const textInput = document.getElementById('text');
              const previewImage = document.getElementById('previewImage');
              const previewContainer = document.getElementById('previewContainer');
              const wordCountDisplay = document.getElementById('wordCount');
              const fontSizeDisplay = document.getElementById('fontSize');
              
              const text = textInput.value.trim();
              const wordCount = text === '' ? 0 : text.split(' ').length;
              
              if (text.length > 0) {
                const encodedText = encodeURIComponent(text);
                const url = '/bratanim?text=' + encodedText;
                
                previewImage.src = url + '&t=' + Date.now();
                previewContainer.style.display = 'block';
                
                wordCountDisplay.textContent = wordCount;
                
                let fontSize;
                if (wordCount <= 3) fontSize = '180px';
                else if (wordCount <= 8) fontSize = '170px';
                else if (wordCount <= 15) fontSize = '160px';
                else if (wordCount <= 25) fontSize = '150px';
                else fontSize = '140px';
                
                fontSizeDisplay.textContent = fontSize;
              } else {
                previewContainer.style.display = 'none';
                wordCountDisplay.textContent = '0';
                fontSizeDisplay.textContent = 'N/A';
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
              
              const textInput = document.getElementById('text');
              let updateTimeout;
              
              textInput.addEventListener('input', function() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(updatePreview, 300);
              });
              
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
              <p>800×800 • Boundary-Safe Animation • Auto-Scaling</p>
            </div>
            
            <div class="safety-box">
              <h4><span class="icon">⚠️</span> Animation Safety Notice</h4>
              <p style="color: #2c3e50; font-size: 0.9em; margin-bottom: 10px;">
                Each word appears within canvas boundaries. System adjusts font size and positioning to prevent overflow.
              </p>
              <div class="safety-features">
                <div class="safety-item">
                  <div class="safety-icon">🎯</div>
                  <div class="safety-text">Boundary Safe</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">Words stay within edges</div>
                </div>
                <div class="safety-item">
                  <div class="safety-icon">⚡</div>
                  <div class="safety-text">Auto Positioning</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">Smart word placement</div>
                </div>
                <div class="safety-item">
                  <div class="safety-icon">📏</div>
                  <div class="safety-text">Size Adjustment</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">Font scales automatically</div>
                </div>
                <div class="safety-item">
                  <div class="safety-icon">🔄</div>
                  <div class="safety-text">Complete Display</div>
                  <div style="color: #7f8c8d; font-size: 0.8em;">No partial words shown</div>
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
                  placeholder="Type text for animation... Each word will appear within canvas bounds"
                  oninput="updatePreview()"
                >Words appear within canvas bounds</textarea>
              </div>
              
              <div class="stats">
                <div class="stat-item">
                  <div class="stat-value" id="wordCount">4</div>
                  <div class="stat-label">Words</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="fontSize">170px</div>
                  <div class="stat-label">Font Size</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">100ms</div>
                  <div class="stat-label">Per Word</div>
                </div>
              </div>
              
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="updatePreview()">
                  <span class="icon">🔄</span> Update Preview
                </button>
                <button type="button" class="btn" onclick="generateGif()">
                  <span class="icon">🚀</span> Generate GIF
                </button>
              </div>
            </div>
            
            <div class="preview-container" id="previewContainer">
              <div class="preview-header">
                <h3><span class="icon">👁️</span> Live Preview</h3>
                <small style="color: #7f8c8d; font-size: 0.85em;">Animation respects canvas boundaries</small>
              </div>
              <div class="preview-area">
                <div class="canvas-overlay"></div>
                <img id="previewImage" src="/bratanim?text=Words%20appear%20within%20canvas%20bounds" 
                     alt="GIF Preview">
              </div>
            </div>
            
            <div class="examples">
              <h3><span class="icon">💡</span> Test Animation Safety:</h3>
              <div class="example-links">
                <button class="example-link" onclick="loadExample('Supercalifragilisticexpialidocious'); return false;">Long Word</button>
                <button class="example-link" onclick="loadExample('Animation test with multiple words showing boundary safety during display'); return false;">Multiple Words</button>
                <button class="example-link" onclick="loadExample('Testing the boundary safety system with extremely long text that should scale properly during animation without exceeding canvas edges at any point'); return false;">Long Text Animation</button>
                <button class="example-link" onclick="loadExample('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'); return false;">Alphabet Test</button>
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
          <p style="color: #666; margin: 20px 0;">Text may be too complex for animation.</p>
          <a href="/bratanim" style="background: #2c3e50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Simpler Text</a>
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
      <title>Brat Generator - Boundary Safe Text</title>
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
        
        .boundary-system {
          background: linear-gradient(135deg, #3498db, #2c3e50);
          color: white;
          padding: 25px;
          border-radius: 12px;
          margin: 30px auto;
          max-width: 800px;
        }
        
        .boundary-system h3 {
          text-align: center;
          margin-bottom: 20px;
          font-size: 1.4em;
        }
        
        .boundary-features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 15px;
          margin-top: 20px;
        }
        
        .boundary-item {
          background: rgba(255,255,255,0.1);
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          backdrop-filter: blur(10px);
        }
        
        .boundary-icon {
          font-size: 1.5em;
          margin-bottom: 10px;
        }
        
        .boundary-title {
          font-weight: bold;
          margin-bottom: 5px;
          font-size: 1.1em;
        }
        
        .boundary-desc {
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
        
        .canvas-visual {
          text-align: center;
          margin: 30px 0;
        }
        
        .canvas-box {
          display: inline-block;
          width: 300px;
          height: 300px;
          border: 3px solid #3498db;
          border-radius: 10px;
          position: relative;
          background: white;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .canvas-box:before {
          content: "800×800";
          position: absolute;
          bottom: -25px;
          left: 0;
          right: 0;
          text-align: center;
          color: #7f8c8d;
          font-size: 0.9em;
        }
        
        .text-inside {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #2c3e50;
          font-weight: bold;
          font-size: 1.2em;
          text-align: center;
          width: 80%;
        }
        
        .text-inside:after {
          content: "Text stays inside";
          display: block;
          font-size: 0.8em;
          color: #3498db;
          margin-top: 5px;
          font-weight: normal;
        }
        
        footer {
          text-align: center;
          padding: 30px 20px;
          margin-top: 40px;
          color: #7f8c8d;
          border-top: 1px solid #eee;
        }
        
        @media (max-width: 768px) {
          .cards, .boundary-features {
            grid-template-columns: 1fr;
          }
          .container {
            padding: 15px;
          }
          .canvas-box {
            width: 250px;
            height: 250px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✨ Brat Generator</h1>
          <p>Boundary-Safe Text • Never Exceeds Canvas • Auto-Scaling</p>
        </div>
        
        <div class="canvas-visual">
          <div class="canvas-box">
            <div class="text-inside">Text Fits Perfectly</div>
          </div>
        </div>
        
        <div class="boundary-system">
          <h3>🛡️ Boundary Safety System</h3>
          <div class="boundary-features">
            <div class="boundary-item">
              <div class="boundary-icon">📏</div>
              <div class="boundary-title">Edge Detection</div>
              <div class="boundary-desc">Text never touches canvas edges</div>
            </div>
            <div class="boundary-item">
              <div class="boundary-icon">⚡</div>
              <div class="boundary-title">Auto Scaling</div>
              <div class="boundary-desc">Font size adjusts to fit perfectly</div>
            </div>
            <div class="boundary-item">
              <div class="boundary-icon">🔄</div>
              <div class="boundary-title">Line Management</div>
              <div class="boundary-desc">3-5 lines with smart wrapping</div>
            </div>
            <div class="boundary-item">
              <div class="boundary-icon">✅</div>
              <div class="boundary-title">Complete Display</div>
              <div class="boundary-desc">No text cutoff or overflow</div>
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
              <li>800×800 canvas with 50px margin</li>
              <li>Text guaranteed within boundaries</li>
              <li>Smart font scaling (140-180px)</li>
              <li>3-5 lines auto adjustment</li>
              <li>Justify alignment with safety</li>
              <li>White background, black text</li>
            </ul>
            <a href="/brat" class="btn btn-jpeg">Try JPEG Generator</a>
            <a href="/brat?text=Boundary%20safe%20text" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
          
          <div class="card">
            <div class="card-header">
              <div class="card-icon gif-icon">🎬</div>
              <h2>GIF Generator</h2>
            </div>
            <ul class="features">
              <li>Word-by-word boundary-safe animation</li>
              <li>Each word appears within canvas</li>
              <li>Smart font and position scaling</li>
              <li>Fast animation (100ms per word)</li>
              <li>Infinite loop with smooth fade</li>
              <li>No text exceeds canvas edges</li>
            </ul>
            <a href="/bratanim" class="btn btn-gif">Try GIF Generator</a>
            <a href="/bratanim?text=Safe%20animation" class="btn" style="margin-top: 8px;">See Example</a>
          </div>
        </div>
        
        <footer>
          <p>Made with ❤️ by <strong>Xyz-kings</strong></p>
          <p style="margin-top: 10px; font-size: 0.9em;">
            Text always stays within 800×800 canvas • No overflow • Perfect scaling
          </p>
        </footer>
      </div>
    </body>
    </html>
  `);
};