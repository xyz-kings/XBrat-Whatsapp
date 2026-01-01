const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

// Register font xyzfont.ttf
GlobalFonts.registerFromPath(
  path.join(__dirname, 'xyzfont.ttf'),
  'XyzFont'
);

// Fungsi word-wrap
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

// Cari font size supaya semua line muat (width & height)
function fitTextToCanvas(ctx, text, canvasWidth, canvasHeight, maxFontSize = 120, margin = 15) {
  let fontSize = maxFontSize;
  let lines = [];

  do {
    ctx.font = `bold ${fontSize}px XyzFont`;
    lines = wrapText(ctx, text, canvasWidth - margin * 2);

    const lineHeight = fontSize * 1.2;
    const textHeight = lines.length * lineHeight;

    // cari line terpanjang
    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    // cek muat secara vertikal + horizontal
    if (
      textHeight <= canvasHeight - margin * 2 &&
      maxLineWidth <= canvasWidth - margin * 2
    ) {
      break;
    }

    fontSize -= 2;
  } while (fontSize > 10);

  return { fontSize, lines };
}

// Fungsi untuk membuat gambar PNG
function generateImage(text) {
  const width = 500;
  const height = 500;
  const margin = 15;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // background putih
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // limit teks
  if (text.length > 100) {
    text = text.substring(0, 100);
  }

  // cari ukuran font + wrap
  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, 120, margin);

  // set font final
  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // hitung posisi awal (center vertical di area margin)
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  let y = height / 2 - totalHeight / 2 + fontSize / 2;

  // tulis tiap line
  lines.forEach(line => {
    ctx.fillText(line, width / 2, y);
    y += lineHeight;
  });

  return canvas.toBuffer('image/png');
}

// Fungsi untuk membuat GIF animasi
function generateGif(text) {
  const width = 500;
  const height = 500;
  const margin = 15;
  const delay = 500; // ms per frame
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const words = text.split(' ');
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0); // loop forever
  encoder.setDelay(delay);
  encoder.setQuality(10);

  for (let i = 1; i <= words.length; i++) {
    const currentText = words.slice(0, i).join(' ');

    // background putih
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    const { fontSize, lines } = fitTextToCanvas(ctx, currentText, width, height, 120, margin);

    ctx.font = `bold ${fontSize}px XyzFont`;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    let y = height / 2 - totalHeight / 2 + fontSize / 2;

    lines.forEach(line => {
      ctx.fillText(line, width / 2, y);
      y += lineHeight;
    });

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

// Handler utama
module.exports = async (req, res) => {
  const url = req.url || '';
  
  // Route: / (root) - tampilkan info
  if (url === '/' || url === '') {
    return res.status(200).json({
      "info": "Brat Text & GIF Generator API",
      "endpoints": {
        "/brat?text=...": "Generate PNG image with text",
        "/bratanim?text=...": "Generate animated GIF with text",
        "/": "This info page"
      },
      "examples": {
        "PNG": "/brat?text=Hello%20World",
        "GIF": "/bratanim?text=This%20is%20animated%20text",
        "with special chars": "/brat?text=Custom%20text%20here!"
      },
      "notes": [
        "Text will be automatically wrapped and resized to fit canvas",
        "Maximum 100 characters for PNG",
        "Font: XyzFont (custom)",
        "Canvas size: 500x500 pixels"
      ],
      "creator": "Xyz-kings"
    });
  }

  // Route: /brat - generate PNG
  if (url.startsWith('/brat')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');

    if (!text) {
      return res.status(400).json({
        "Warning!!": 'Parameter "text" diperlukan.',
        "Contoh Pemakaian": '/brat?text=example%20text',
        "Creator": 'Xyz-kings'
      });
    }

    try {
      const imageBuffer = generateImage(text);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(imageBuffer);
    } catch (err) {
      console.error('Gagal membuat gambar:', err);
      res.status(500).send('Gagal membuat gambar.');
    }
    return;
  }

  // Route: /bratanim - generate GIF
  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');

    if (!text) {
      return res.status(400).json({
        "Warning!!": 'Parameter "text" diperlukan.',
        "Contoh Pemakaian": '/bratanim?text=woi%20kucing%20goreng',
        "Creator": 'Xyz-kings'
      });
    }

    try {
      const gifBuffer = generateGif(text);
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(gifBuffer);
    } catch (err) {
      console.error('Gagal membuat GIF:', err);
      res.status(500).send('Gagal membuat GIF.');
    }
    return;
  }

  // Route tidak ditemukan
  res.status(404).json({
    "error": "Endpoint tidak ditemukan",
    "available_endpoints": ["/", "/brat", "/bratanim"]
  });
};