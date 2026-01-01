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

    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

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

// Fungsi untuk membuat gambar PNG (tetap sama)
function generateImage(text) {
  const width = 500;
  const height = 500;
  const margin = 15;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  if (text.length > 100) {
    text = text.substring(0, 100);
  }

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, 120, margin);

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

  return canvas.toBuffer('image/png');
}

// Fungsi untuk membuat GIF animasi dengan efek ketik karakter per karakter
function generateGif(text) {
  const width = 500;
  const height = 500;
  const margin = 15;
  const charDelay = 80; // ms per karakter (bisa diubah sesuai selera)
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(charDelay);
  encoder.setQuality(10);

  // Tambahkan frame kosong di awal (opsional, biar ada jeda sebelum mulai ngetik)
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  encoder.addFrame(ctx);

  // Efek ketik karakter per karakter
  for (let i = 1; i <= text.length; i++) {
    const currentText = text.substring(0, i);

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

  // Frame terakhir ditahan lebih lama (opsional)
  encoder.setDelay(1000); // 1 detik untuk frame akhir
  encoder.addFrame(ctx);

  encoder.finish();
  return encoder.out.getData();
}

// Handler utama
module.exports = async (req, res) => {
  const url = req.url || '';

  // Route: / (root) - tampilkan info dengan pretty print
  if (url === '/' || url === '') {
    const info = {
      info: "Brat Text & GIF Generator API",
      endpoints: {
        "/brat?text=...": "Generate PNG image with text",
        "/bratanim?text=...": "Generate animated GIF with typing effect",
        "/": "This info page"
      },
      examples: {
        PNG: "/brat?text=Hello%20World",
        GIF: "/bratanim?text=This%20is%20animated%20text",
        "with special chars": "/brat?text=Custom%20text%20here!"
      },
      notes: [
        "Text will be automatically wrapped and resized to fit canvas",
        "Maximum 100 characters for PNG (GIF bisa lebih panjang)",
        "Font: XyzFont (custom)",
        "Canvas size: 500x500 pixels",
        "GIF now uses character-by-character typing effect"
      ],
      creator: "Xyz-kings"
    };

    res.setHeader('Content-Type', 'application/json');
    // Pretty print dengan indentasi 2 spasi
    return res.status(200).send(JSON.stringify(info, null, 2));
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

  // Route: /bratanim - generate GIF dengan efek ketik
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
    error: "Endpoint tidak ditemukan",
    available_endpoints: ["/", "/brat", "/bratanim"]
  });
};