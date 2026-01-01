const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

GlobalFonts.registerFromPath(
  path.join(__dirname, 'xyzfont.ttf'),
  'XyzFont'
);

// Word wrap (sama)
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

// Justify manual
function drawJustifiedText(ctx, text, x, y, maxWidth, isLastLine = false) {
  const words = text.split(' ');
  if (words.length <= 1 || isLastLine) {
    ctx.textAlign = 'center';
    ctx.fillText(text, x + maxWidth / 2, y);
    return;
  }

  const wordWidths = words.map(word => ctx.measureText(word).width);
  const totalWordsWidth = wordWidths.reduce((a, b) => a + b, 0);
  const spaceWidth = ctx.measureText(' ').width;
  const totalSpaces = words.length - 1;
  const extraSpace = (maxWidth - totalWordsWidth) / totalSpaces;

  let currentX = x;
  ctx.textAlign = 'left';

  for (let i = 0; i < words.length; i++) {
    ctx.fillText(words[i], currentX, y);
    currentX += wordWidths[i] + spaceWidth + (i < totalSpaces ? extraSpace : 0);
  }
}

// Fit text
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

// Generate PNG (justify) - tetap sama
function generateImage(text) {
  const width = 500;
  const height = 500;
  const margin = 15;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  if (text.length > 100) text = text.substring(0, 100);

  const { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, 120, margin);

  ctx.font = `bold ${fontSize}px XyzFont`;
  ctx.fillStyle = 'black';

  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  let y = height / 2 - totalHeight / 2 + fontSize / 2;

  const textAreaX = margin;
  const textAreaWidth = width - margin * 2;

  lines.forEach((line, index) => {
    const isLastLine = index === lines.length - 1;
    drawJustifiedText(ctx, line, textAreaX, y, textAreaWidth, isLastLine);
    y += lineHeight;
  });

  return canvas.toBuffer('image/png');
}

// Generate GIF - FIX TOTAL: setDelay sebelum setiap addFrame!
function generateGif(text) {
  const width = 500;
  const height = 500;
  const margin = 15;
  const charDelay = 120;    // 120ms per karakter → jelas banget efek ketikannya
  const startDelay = 600;   // jeda awal sebelum mulai ngetik
  const endPause = 2500;    // pause 2.5 detik di akhir sebelum loop

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);     // loop forever
  encoder.setQuality(10);

  // Frame kosong awal
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  encoder.setDelay(startDelay);
  encoder.addFrame(ctx);

  // Frame ketik karakter per karakter
  for (let i = 1; i <= text.length; i++) {
    const currentText = text.substring(0, i);

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    const { fontSize, lines } = fitTextToCanvas(ctx, currentText, width, height, 120, margin);

    ctx.font = `bold ${fontSize}px XyzFont`;
    ctx.fillStyle = 'black';

    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    let y = height / 2 - totalHeight / 2 + fontSize / 2;

    const textAreaX = margin;
    const textAreaWidth = width - margin * 2;

    lines.forEach((line, index) => {
      const isLastLine = index === lines.length - 1;
      drawJustifiedText(ctx, line, textAreaX, y, textAreaWidth, isLastLine);
      y += lineHeight;
    });

    // PENTING: set delay sebelum add frame!
    encoder.setDelay(charDelay);
    encoder.addFrame(ctx);
  }

  // Frame terakhir: pause lama
  encoder.setDelay(endPause);
  encoder.addFrame(ctx);

  encoder.finish();
  return encoder.out.getData();
}

// Handler (info pretty print)
module.exports = async (req, res) => {
  const url = req.url || '';

  if (url === '/' || url === '') {
    const info = {
      info: "Brat Text & GIF Generator API",
      status: "WORKING 100% - Animasi ketik FIX!",
      endpoints: {
        "/brat?text=...": "PNG dengan teks JUSTIFY",
        "/bratanim?text=...": "GIF efek ketik karakter + JUSTIFY",
        "/": "Info ini"
      },
      examples: {
        PNG: "/brat?text=Halo%20ini%20teks%20panjang%20yang%20akan%20diratakan%20kiri%20kanan",
        GIF: "/bratanim?text=Sekarang%20efek%20ketikannya%20sudah%20muncul%20bro!"
      },
      notes: [
        "Teks JUSTIFY (rata kiri-kanan)",
        "GIF: efek ketik 120ms per karakter",
        "Ada jeda awal + pause 2.5 detik di akhir",
        "Loop mulus tanpa glitch"
      ],
      creator: "Xyz-kings"
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify(info, null, 2));
  }

  if (url.startsWith('/brat')) {
    const text = new URL(req.url, `http://${req.headers.host}`).searchParams.get('text') || '';
    if (!text) return res.status(400).json({ error: "Parameter text diperlukan!" });

    try {
      const buf = generateImage(text);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error generate PNG');
    }
    return;
  }

  if (url.startsWith('/bratanim')) {
    const text = new URL(req.url, `http://${req.headers.host}`).searchParams.get('text') || '';
    if (!text) return res.status(400).json({ error: "Parameter text diperlukan!" });

    try {
      const buf = generateGif(text);
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error generate GIF');
    }
    return;
  }

  res.status(404).json({ error: "Endpoint tidak ada", available: ["/", "/brat", "/bratanim"] });
};