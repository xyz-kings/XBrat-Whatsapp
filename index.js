const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font xyzfont.ttf
GlobalFonts.registerFromPath(
  path.join(__dirname, 'xyzfont.ttf'),
  'XyzFont'
);

// Fungsi word-wrap dengan justify
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

// Fungsi untuk menggambar teks justify
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

// Cari font size supaya semua line muat (width & height)
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, maxFontSize = 120, margin = 15) {
  let fontSize = maxFontSize;
  let lines = [];

  do {
    ctx.font = `bold ${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2);
    const lineHeight = fontSize * 1.2;
    const textHeight = lines.length * lineHeight;
    const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));

    if (textHeight <= canvasHeight - margin * 2 && maxLineWidth <= canvasWidth - margin * 2) break;
    fontSize -= 2;
  } while (fontSize > 10);

  return { fontSize, lines };
}

// Fungsi untuk membuat gambar PNG
function generateImage(text) {
  const width = 500, height = 500, margin = 15;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  if (text.length > 100) text = text.substring(0, 100);

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, 120, margin);

  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'middle';

  const lineHeight = fontSize * 1.2;
  let yStart = height / 2 - (lines.length * lineHeight) / 2 + fontSize / 2;

  drawJustifiedText(ctx, lines, width / 2, yStart, lineHeight, width, margin);

  return canvas.toBuffer('image/png');
}

// Fungsi untuk membuat GIF animasi ketikan perkata
function generateGif(text) {
  const width = 500, height = 500, margin = 15, delay = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const words = text.split(' ');
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delay);
  encoder.setQuality(10);

  for (let i = 1; i <= words.length; i++) {
    const currentText = words.slice(0, i).join(' ');

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    const { fontSize, lines } = fitTextToCanvas(ctx, currentText, width, height, 120, margin);

    ctx.font = `bold ${fontSize}px XyzFont`;
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'middle';

    const lineHeight = fontSize * 1.2;
    let yStart = height / 2 - (lines.length * lineHeight) / 2 + fontSize / 2;

    drawJustifiedText(ctx, lines, width / 2, yStart, lineHeight, width, margin);

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

// Handler utama
module.exports = async (req, res) => {
  const url = req.url || '';

  // ROOT INFO
  if (url === '/' || url === '') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(JSON.stringify({
      info: "Brat Text & GIF Generator API",
      endpoints: {
        "/brat?text=...": "Generate PNG image with text",
        "/bratanim?text=...": "Generate animated GIF with text",
        "/": "This info page"
      },
      examples: {
        PNG: "/brat?text=Hello%20World",
        GIF: "/bratanim?text=This%20is%20animated%20text",
        "with special chars": "/brat?text=Custom%20text%20here!"
      },
      notes: [
        "Text will be automatically wrapped and resized to fit canvas",
        "Maximum 100 characters for PNG",
        "Font: XyzFont (custom)",
        "Canvas size: 500x500 pixels"
      ],
      creator: "Xyz-kings"
    }, null, 2)); // <-- pretty print
  }

  // PNG
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
      console.error('Gagal membuat gambar:', err);
      return res.status(500).send('Gagal membuat gambar.');
    }
  }

  // GIF
  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');

    if (!text) return res.status(400).json({ Warning: 'Parameter "text" diperlukan.' });

    try {
      const gifBuffer = generateGif(text);
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(gifBuffer);
    } catch (err) {
      console.error('Gagal membuat GIF:', err);
      return res.status(500).send('Gagal membuat GIF.');
    }
  }

  // Route tidak ditemukan
  res.status(404).json({
    error: "Endpoint tidak ditemukan",
    available_endpoints: ["/", "/brat", "/bratanim"]
  });
};