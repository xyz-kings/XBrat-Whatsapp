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

  // Background
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

  // Return sebagai JPEG
  return canvas.toBuffer('image/jpeg', { quality: 0.9 });
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
  encoder.setDelay(100); // 100ms per frame
  encoder.setQuality(10);

  // Teks yang akan dianimasikan
  const displayText = text.length > 100 ? text.substring(0, 100) : text;
  const words = displayText.split(' ');
  
  // Setup font
  const { fontSize } = fitTextToCanvas(ctx, displayText, width, height, margin, 3, 60);
  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.2;
  
  // Hitung posisi teks (center)
  const totalLines = Math.ceil(words.length / 3); // approx
  const totalTextHeight = totalLines * lineHeight;
  const yStart = (height - totalTextHeight) / 2;
  
  // ANIMASI TYPING KATA PER KATA
  let currentText = "";
  let wordIndex = 0;
  
  // Frame pertama: background putih
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  encoder.addFrame(ctx);
  
  // Animasi mengetik
  while (wordIndex < words.length) {
    // Tambah satu kata
    currentText += (currentText ? " " : "") + words[wordIndex];
    
    // Buat 2 frame untuk efek ketikan
    for (let frame = 0; frame < 2; frame++) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'black';
      
      // Render text dengan word wrap
      const lines = wrapText(ctx, currentText, width - margin * 2);
      
      // Gambar setiap baris
      lines.forEach((line, idx) => {
        const lineY = yStart + (idx * lineHeight);
        const lineWidth = ctx.measureText(line).width;
        const xStart = (width - lineWidth) / 2;
        
        // Tambah cursor di akhir untuk frame genap
        let displayLine = line;
        if (frame === 1 && idx === lines.length - 1) {
          displayLine = line + "|";
        }
        
        ctx.fillText(displayLine, xStart, lineY);
      });
      
      encoder.addFrame(ctx);
    }
    
    wordIndex++;
  }
  
  // Tampilkan teks lengkap tanpa cursor (5 frame)
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'black';
    
    const lines = wrapText(ctx, currentText, width - margin * 2);
    lines.forEach((line, idx) => {
      const lineY = yStart + (idx * lineHeight);
      const lineWidth = ctx.measureText(line).width;
      const xStart = (width - lineWidth) / 2;
      ctx.fillText(line, xStart, lineY);
    });
    
    encoder.addFrame(ctx);
  }
  
  // Reset dan mulai lagi
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    encoder.addFrame(ctx);
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
    if (!text) {
      // Kalau tidak ada parameter, tampilkan contoh
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Brat Image Generator</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            form { margin: 20px 0; }
            input { padding: 8px; width: 300px; }
            button { padding: 8px 16px; }
            .example { margin: 10px 0; color: #666; }
          </style>
        </head>
        <body>
          <h1>Brat Image Generator</h1>
          <p>Generate JPEG images with text</p>
          
          <form action="/brat" method="get">
            <input type="text" name="text" placeholder="Enter text here..." required>
            <button type="submit">Generate JPEG</button>
          </form>
          
          <div class="example">
            <strong>Examples:</strong><br>
            <a href="/brat?text=Hello%20World">/brat?text=Hello World</a><br>
            <a href="/brat?text=This%20is%20a%20test">/brat?text=This is a test</a>
          </div>
          
          <p><a href="/">Back to API Info</a> | <a href="/bratanim">Try GIF Version</a></p>
        </body>
        </html>
      `);
    }

    try {
      const imageBuffer = generateImage(text);
      // HEADER UNTUK TAMPIL LANGSUNG DI BROWSER
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', 'inline; filename="brat-image.jpg"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imageBuffer);
    } catch (err) {
      console.error('Gagal membuat JPEG:', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error creating JPEG</h1>
          <p>${err.message}</p>
          <p><a href="/brat">Try again</a></p>
        </body>
        </html>
      `);
    }
  }

  // BRAT ANIMASI GIF
  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');
    if (!text) {
      // Kalau tidak ada parameter, tampilkan contoh
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Brat GIF Generator</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            form { margin: 20px 0; }
            input { padding: 8px; width: 300px; }
            button { padding: 8px 16px; }
            .example { margin: 10px 0; color: #666; }
            .preview { margin: 20px 0; border: 1px solid #ddd; padding: 10px; }
          </style>
        </head>
        <body>
          <h1>Brat GIF Generator</h1>
          <p>Generate animated GIF with typing effect</p>
          
          <form action="/bratanim" method="get">
            <input type="text" name="text" placeholder="Enter text for typing animation..." required>
            <button type="submit">Generate GIF</button>
          </form>
          
          <div class="example">
            <strong>Examples:</strong><br>
            <a href="/bratanim?text=Typing%20effect%20kata%20per%20kata">/bratanim?text=Typing effect kata per kata</a><br>
            <a href="/bratanim?text=Hello%20World%20this%20is%20animated">/bratanim?text=Hello World this is animated</a>
          </div>
          
          <div class="preview">
            <strong>Preview:</strong><br>
            <img src="/bratanim?text=Hello%20World" alt="Preview GIF" style="max-width: 500px; border: 1px solid #ccc;">
          </div>
          
          <p><a href="/">Back to API Info</a> | <a href="/brat">Try JPEG Version</a></p>
        </body>
        </html>
      `);
    }

    try {
      const gifBuffer = generateGifAnimated(text);
      // HEADER UNTUK TAMPIL LANGSUNG DI BROWSER
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Content-Disposition', 'inline; filename="brat-animation.gif"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(gifBuffer);
    } catch (err) {
      console.error('Gagal membuat GIF:', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error creating GIF</h1>
          <p>${err.message}</p>
          <p><a href="/bratanim">Try again</a></p>
        </body>
        </html>
      `);
    }
  }

  // ROOT INFO
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Brat Text Generator API</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 15px;
          padding: 30px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: white;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }
        .endpoint {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          padding: 15px;
          margin: 15px 0;
          border-left: 4px solid #4CAF50;
        }
        .endpoint h3 {
          margin-top: 0;
          color: #4CAF50;
        }
        code {
          background: rgba(0, 0, 0, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
        }
        .example-box {
          background: rgba(0, 0, 0, 0.2);
          padding: 15px;
          border-radius: 10px;
          margin: 20px 0;
        }
        a {
          color: #4CAF50;
          text-decoration: none;
          font-weight: bold;
        }
        a:hover {
          text-decoration: underline;
        }
        .btn {
          display: inline-block;
          background: #4CAF50;
          color: white;
          padding: 10px 20px;
          border-radius: 5px;
          margin: 5px;
          text-decoration: none;
        }
        .btn:hover {
          background: #45a049;
        }
        .preview {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          margin: 20px 0;
        }
        .preview-item {
          text-align: center;
          background: rgba(255, 255, 255, 0.1);
          padding: 10px;
          border-radius: 8px;
        }
        .preview-item img {
          max-width: 200px;
          border: 2px solid white;
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎨 Brat Text & GIF Generator API</h1>
        <p>Generate text images and animated GIFs with typing effect</p>
        
        <div class="preview">
          <div class="preview-item">
            <p><strong>JPEG Example</strong></p>
            <img src="/brat?text=Hello%20World" alt="JPEG Preview">
          </div>
          <div class="preview-item">
            <p><strong>GIF Example</strong></p>
            <img src="/bratanim?text=Typing%20Animation" alt="GIF Preview">
          </div>
        </div>
        
        <div class="endpoint">
          <h3>📸 JPEG Endpoint</h3>
          <p><code>GET /brat?text=Your+Text+Here</code></p>
          <p>Content-Type: <code>image/jpeg</code></p>
          <a class="btn" href="/brat">Try JPEG Generator</a>
          <a class="btn" href="/brat?text=Hello%20World%20Example">Example</a>
        </div>
        
        <div class="endpoint">
          <h3>🎬 GIF Endpoint</h3>
          <p><code>GET /bratanim?text=Your+Text+Here</code></p>
          <p>Content-Type: <code>image/gif</code></p>
          <a class="btn" href="/bratanim">Try GIF Generator</a>
          <a class="btn" href="/bratanim?text=Typing%20effect%20kata%20per%20kata">Example</a>
        </div>
        
        <div class="example-box">
          <h3>📚 Examples:</h3>
          <ul>
            <li><a href="/brat?text=Hello%20World">/brat?text=Hello World</a></li>
            <li><a href="/brat?text=This%20is%20a%20test">/brat?text=This is a test</a></li>
            <li><a href="/bratanim?text=Typing%20animation">/bratanim?text=Typing animation</a></li>
            <li><a href="/bratanim?text=Hello%20World%20GIF">/bratanim?text=Hello World GIF</a></li>
          </ul>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.3);">
          <p><strong>Note:</strong> Images will display directly in your browser, no download required!</p>
          <p>Made with ❤️ by <strong>Xyz-kings</strong></p>
        </div>
      </div>
    </body>
    </html>
  `);
};