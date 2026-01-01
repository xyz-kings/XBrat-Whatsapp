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

// Fit font size
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, margin = 40, maxLines = 6, maxFontSize = 290) {
  let fontSize = maxFontSize;
  let lines = [];

  do {
    ctx.font = `${fontSize}px XyzFont`; // Tidak bold
    lines = wrapText(ctx, text, canvasWidth - margin * 2);
    if (lines.length > maxLines) fontSize -= 2;
    else break;
  } while (fontSize > 12);

  return { fontSize, lines };
}

// Draw justified text (kiri ke kanan, atas ke bawah)
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
  const width = 600, height = 600, margin = 40;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background dengan gradient subtle
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f8f9fa');
  gradient.addColorStop(1, '#e9ecef');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (text.length > 200) text = text.substring(0, 200);

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin, 6, 40);

  ctx.font = `${fontSize}px XyzFont`; // Tidak bold
  ctx.fillStyle = '#2d3436';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.4;
  const totalTextHeight = lines.length * lineHeight;
  const yStart = (height - totalTextHeight) / 2;

  drawJustifiedText(ctx, lines, margin, yStart, lineHeight, width, margin);

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

// --- BRAT ANIMASI GIF KATA PER KATA ---
function generateGifAnimated(text) {
  const width = 600, height = 600, margin = 40;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Setup GIF encoder
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(150); // 150ms per kata
  encoder.setQuality(15);

  const words = text.split(' ');
  const maxWords = Math.min(words.length, 20); // Batasi maksimal 20 kata
  
  // Setup font (cari ukuran yang pas)
  const tempText = words.slice(0, Math.min(5, words.length)).join(' ');
  const { fontSize } = fitTextToCanvas(ctx, tempText, width, height, margin, 6, 40);
  ctx.font = `${fontSize}px XyzFont`;
  ctx.fillStyle = '#2d3436';
  ctx.textBaseline = 'top';
  
  const lineHeight = fontSize * 1.4;
  const maxLineWidth = width - margin * 2;
  
  // Pre-calculate semua kata dengan posisi yang tepat
  const wordPositions = [];
  let currentLine = '';
  let currentLineIndex = 0;
  let currentX = margin;
  let currentY = 150; // Mulai dari atas
  
  for (const word of words.slice(0, maxWords)) {
    const wordWithSpace = currentLine ? ' ' + word : word;
    const testLine = currentLine + wordWithSpace;
    const testWidth = ctx.measureText(testLine).width;
    
    if (testWidth > maxLineWidth && currentLine !== '') {
      // Pindah ke baris baru
      currentLineIndex++;
      currentLine = word;
      currentY += lineHeight;
      currentX = margin;
    } else {
      currentLine = testLine;
    }
    
    // Hitung posisi X untuk kata ini (dengan justify)
    const wordsInLine = currentLine.split(' ');
    let wordX = margin;
    
    if (wordsInLine.length > 1) {
      const lineText = currentLine;
      const wordsInCurrentLine = lineText.split(' ');
      const totalWidth = wordsInCurrentLine.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
      const spaceWidth = (maxLineWidth - totalWidth) / (wordsInCurrentLine.length - 1);
      
      // Cari posisi kata ini dalam baris
      let tempX = margin;
      for (let i = 0; i < wordsInCurrentLine.length; i++) {
        if (wordsInCurrentLine[i] === word) {
          wordX = tempX;
          break;
        }
        tempX += ctx.measureText(wordsInCurrentLine[i]).width + spaceWidth;
      }
    }
    
    wordPositions.push({
      word,
      line: currentLineIndex,
      x: wordX,
      y: currentY,
      show: false
    });
  }
  
  // ANIMASI: Tampilkan kata per kata
  const totalFrames = wordPositions.length + 2; // +2 untuk frame awal dan akhir
  
  for (let frame = 0; frame < totalFrames; frame++) {
    // Clear canvas dengan background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#e9ecef');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = '#2d3436';
    
    // Tentukan kata mana yang harus ditampilkan
    const wordsToShow = frame - 1; // frame 0: kosong, frame 1: kata 1, dst
    
    // Gambar semua kata yang sudah muncul
    for (let i = 0; i < Math.min(wordsToShow, wordPositions.length); i++) {
      const pos = wordPositions[i];
      ctx.fillText(pos.word, pos.x, pos.y);
    }
    
    encoder.addFrame(ctx);
  }
  
  // Tahan frame terakhir sedikit lebih lama (3 frame)
  for (let i = 0; i < 3; i++) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#e9ecef');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = '#2d3436';
    
    // Gambar semua kata
    wordPositions.forEach(pos => {
      ctx.fillText(pos.word, pos.x, pos.y);
    });
    
    encoder.addFrame(ctx);
  }
  
  // Fade out (5 frame)
  for (let fade = 0; fade <= 5; fade++) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#e9ecef');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = `${fontSize}px XyzFont`;
    ctx.fillStyle = `rgba(45, 52, 54, ${1 - (fade / 5)})`;
    
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎨 Brat JPEG Generator</h1>
              <p>Create beautiful justified text images</p>
            </div>
            
            <div class="form-container">
              <form action="/brat" method="get">
                <div class="form-group">
                  <label for="text">Enter your text:</label>
                  <textarea 
                    id="text" 
                    name="text" 
                    rows="4" 
                    placeholder="Type your text here... Example: Hello this is a justified text example that will look beautiful"
                    required
                  ></textarea>
                </div>
                <button type="submit" class="btn">Generate JPEG Image</button>
              </form>
            </div>
            
            <div class="preview">
              <h3>Preview:</h3>
              <img src="/brat?text=Welcome%20to%20Brat%20Generator%20Create%20beautiful%20justified%20text%20images%20with%20perfect%20alignment" 
                   alt="JPEG Preview">
            </div>
            
            <div class="examples">
              <h3>Try these examples:</h3>
              <div class="example-links">
                <a href="/brat?text=Hello%20World%20This%20is%20a%20test" class="example-link">Simple Test</a>
                <a href="/brat?text=The%20quick%20brown%20fox%20jumps%20over%20the%20lazy%20dog" class="example-link">Quick Brown Fox</a>
                <a href="/brat?text=Create%20amazing%20text%20images%20with%20perfect%20justify%20alignment" class="example-link">Justify Example</a>
                <a href="/brat?text=This%20is%20a%20longer%20text%20example%20that%20will%20show%20how%20the%20justify%20alignment%20works%20with%20multiple%20lines" class="example-link">Multi-line</a>
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
              <p>Create animated typing effect GIFs</p>
            </div>
            
            <div class="form-container">
              <form action="/bratanim" method="get">
                <div class="form-group">
                  <label for="text">Enter your text:</label>
                  <textarea 
                    id="text" 
                    name="text" 
                    rows="4" 
                    placeholder="Type your text here... Example: Hello this text will appear word by word with smooth animation"
                    required
                  ></textarea>
                </div>
                <button type="submit" class="btn">Generate Animated GIF</button>
              </form>
            </div>
            
            <div class="preview">
              <h3>Live Preview:</h3>
              <img src="/bratanim?text=Hello%20Welcome%20to%20Brat%20GIF%20Generator%20Watch%20words%20appear%20one%20by%20one" 
                   alt="GIF Preview">
            </div>
            
            <div class="feature-list">
              <h3>✨ Features:</h3>
              <ul>
                <li>Word-by-word typing animation</li>
                <li>Justified text alignment</li>
                <li>Smooth fade effects</li>
                <li>Infinite loop animation</li>
                <li>Clean modern design</li>
              </ul>
            </div>
            
            <div class="examples">
              <h3>Try these examples:</h3>
              <div class="example-links">
                <a href="/bratanim?text=Hello%20World" class="example-link">Hello World</a>
                <a href="/bratanim?text=This%20is%20amazing" class="example-link">Simple Message</a>
                <a href="/bratanim?text=Watch%20each%20word%20appear%20smoothly" class="example-link">Word by Word</a>
                <a href="/bratanim?text=Create%20beautiful%20animated%20text%20for%20social%20media" class="example-link">Social Media</a>
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

  // ROOT INFO - MODERN DESIGN
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
        
        .features {
          list-style: none;
          margin-bottom: 25px;
        }
        
        .features li {
          padding: 8px 0;
          display: flex;
          align-items: center;
        }
        
        .features li i {
          color: var(--success);
          margin-right: 10px;
          font-size: 1.2em;
        }
        
        .preview-area {
          text-align: center;
          margin: 20px 0;
        }
        
        .preview-area img {
          max-width: 100%;
          border-radius: 12px;
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
            <i class="fas fa-magic"></i> Transform Text into Beautiful Images & Animations
          </div>
          <p>Create stunning JPEG images and animated GIFs with word-by-word typing effects. Perfect for social media, presentations, and creative projects.</p>
        </section>
        
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
              <ul class="features">
                <li><i class="fas fa-check-circle"></i> Perfect justify alignment</li>
                <li><i class="fas fa-check-circle"></i> Clean modern typography</li>
                <li><i class="fas fa-check-circle"></i> Gradient backgrounds</li>
                <li><i class="fas fa-check-circle"></i> Automatic text wrapping</li>
              </ul>
              
              <div class="preview-area">
                <img src="/brat?text=Create%20Beautiful%20Text%20Images%20With%20Perfect%20Justify%20Alignment%20And%20Clean%20Modern%20Design" 
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
              <ul class="features">
                <li><i class="fas fa-check-circle"></i> Word-by-word animation</li>
                <li><i class="fas fa-check-circle"></i> Smooth fade effects</li>
                <li><i class="fas fa-check-circle"></i> Infinite loop</li>
                <li><i class="fas fa-check-circle"></i> Justified text alignment</li>
              </ul>
              
              <div class="preview-area">
                <img src="/bratanim?text=Watch%20Words%20Appear%20One%20By%20One%20With%20Smooth%20Typing%20Animation" 
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
            <div class="stat-number">2</div>
            <div class="stat-label">Generators</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">∞</div>
            <div class="stat-label">Animations</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">100%</div>
            <div class="stat-label">Justify Text</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">🚀</div>
            <div class="stat-label">Fast Processing</div>
          </div>
        </div>
        
        <!-- Footer -->
        <footer>
          <p>Made with <i class="fas fa-heart" style="color: var(--accent);"></i> for creative minds</p>
          <div class="creator">
            Powered by <strong>XYZ Font</strong> • Created by <strong>Xyz-kings</strong>
          </div>
          <p style="margin-top: 20px; font-size: 0.9em;">
            Simply enter text and let the magic happen. No registration required!
          </p>
        </footer>
      </div>
      
      <script>
        // Add some interactivity
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
          const texts = [
            "Create Amazing Text Content With Our Powerful Generator Tools",
            "Transform Your Ideas Into Beautiful Visual Content Instantly",
            "Perfect For Social Media Marketing And Creative Projects"
          ];
          
          let textIndex = 0;
          setInterval(() => {
            textIndex = (textIndex + 1) % texts.length;
            previews.forEach(img => {
              const src = img.src.includes('bratanim') 
                ? '/bratanim?text=' + encodeURIComponent(texts[textIndex])
                : '/brat?text=' + encodeURIComponent(texts[textIndex]);
              
              // Create new image to preload
              const newImg = new Image();
              newImg.onload = function() {
                img.src = src;
              };
              newImg.src = src;
            });
          }, 5000);
        });
      </script>
    </body>
    </html>
  `);
};