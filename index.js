const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

GlobalFonts.registerFromPath(
  path.join(__dirname, 'xyzfont.ttf'),
  'XyzFont'
);

// Fungsi word-wrap (tetap sama)
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

// Fungsi JUSTIFY manual per baris
function drawJustifiedText(ctx, text, x, y, maxWidth, isLastLine = false) {
  const words = text.split(' ');
  if (words.length <= 1 || isLastLine) {
    // Kalau cuma 1 kata atau baris terakhir → center biasa
    ctx.textAlign = 'center';
    ctx.fillText(text, x + maxWidth / 2, y);
    return;
  }

  // Hitung total lebar semua kata
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

// Fit text seperti sebelumnya
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

// Generate PNG dengan teks JUSTIFY
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

// Generate GIF dengan efek ketik + justify
function generateGif(text) {
  const width = 500;
  const height = 500;
  const margin = 15;
  const charDelay = 100;    // 100ms per karakter → kelihatan banget
  const pauseAtEnd = 2000;  // 2 detik pause setelah selesai ngetik

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setQuality(10);

  // Frame kosong di awal (biar ada jeda sebelum mulai ngetik)
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  encoder.setDelay(800);
  encoder.addFrame(ctx);

  // Frame per karakter
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

    encoder.setDelay(charDelay);
    encoder.addFrame(ctx);
  }

  // Pause panjang di frame terakhir
  encoder.setDelay(pauseAtEnd);
  encoder.addFrame(ctx);

  encoder.finish();
  return encoder.out.getData();
}

// Handler (info tetap pretty print)
module.exports = async (req, res) => {
  const url = req.url || '';

  if (url === '/' || url === '') {
    const info = {
      info: "Brat Text & GIF Generator API",
      endpoints: {
        "/brat?text=...": "Generate PNG image (justified text)",
        "/bratanim?text=...": "Generate animated GIF (typing effect + justified)",
        "/": "This info page"
      },
      examples: {
        PNG: "/brat?text=Hello%20World%20ini%20contoh%20teks%20panjang",
        GIF: "/bratanim?text=Ketik%20perlahan%20biar%20keliatan%20efeknya"
      },
      notes: [
        "Text now JUSTIFIED (rata kiri-kanan, kecuali baris terakhir)",
        "GIF: karakter per karakter (100ms), pause 2 detik di akhir",
        "Canvas: 500x500 px",
        "Font: XyzFont"
      ],
      creator: "Xyz-kings"
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify(info, null, 2));
  }

  if (url.startsWith('/brat')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text') || '';

    if (!text) {
      return res.status(400).json({
        "Warning!!": 'Parameter "text" diperlukan.',
        "Contoh": '/brat?text=teks%20kamu%20disini',
        "Creator": 'Xyz-kings'
      });
    }

    try {
      const imageBuffer = generateImage(text);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(imageBuffer);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal generate gambar');
    }
    return;
  }

  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text') || '';

    if (!text) {
      return res.status(400).json({
        "Warning!!": 'Parameter "text" diperlukan.',
        "Contoh": '/bratanim?text=efek%20ketik%20ini%20keren',
        "Creator": 'Xyz-kings'
      });
    }

    try {
      const gifBuffer = generateGif(text);
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(gifBuffer);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal generate GIF');
    }
    return;
  }

  res.status(404).json({
    error: "Endpoint tidak ditemukan",
    available: ["/", "/brat", "/bratanim"]
  });
};