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

// --- BRAT BASIC PNG ---
function generateImage(text) {
  const width = 500, height = 500, margin = 20;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

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

  return canvas.toBuffer('image/png');
}

// --- BRAT ANIMASI GIF ---
function generateGifAnimated(text) {
  const width = 500, height = 500, margin = 20;
  const delay = 200; // tiap frame 200ms → animasi halus
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const words = text.split(' ');
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delay);
  encoder.setQuality(10);

  const positions = [
    { x: margin, y: margin, align: 'left' },
    { x: width / 2, y: height / 2, align: 'center' },
    { x: width - margin, y: height / 2, align: 'right' },
    { x: width / 2, y: height - margin, align: 'center' }
  ];

  // Loop posisi + kata per kata
  for (let loop = 0; loop < 2; loop++) {
    for (const pos of positions) {
      let { fontSize, lines } = fitTextToCanvas(ctx, text, width, height, margin, 3, 60);
      ctx.font = `bold ${fontSize}px XyzFont`;
      ctx.fillStyle = 'black';
      ctx.textBaseline = 'top';
      const lineHeight = fontSize * 1.2;

      let displayedWords = '';
      for (let i = 0; i < words.length; i++) {
        displayedWords += (i === 0 ? '' : ' ') + words[i];

        for (let frame = 0; frame < 10; frame++) { // gerakan halus
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);

          ctx.fillStyle = 'black';
          const curLines = wrapText(ctx, displayedWords, width - margin * 2);

          let yStart;
          if (pos.align === 'left') yStart = pos.y + Math.sin(frame / 2) * 2;
          else if (pos.align === 'center') yStart = pos.y - (curLines.length * lineHeight) / 2 + Math.sin(frame / 2) * 2;
          else if (pos.align === 'right') yStart = pos.y + Math.sin(frame / 2) * 2;

          drawJustifiedText(ctx, curLines, pos.x, yStart, lineHeight, width, margin);

          encoder.addFrame(ctx);
        }
      }
    }
  }

  encoder.finish();
  return encoder.out.getData();
}

// --- HANDLER ---
module.exports = async (req, res) => {
  const url = req.url || '';

  // BRAT BASIC PNG
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
      console.error('Gagal membuat PNG:', err);
      return res.status(500).send('Gagal membuat PNG.');
    }
  }

  // BRAT ANIMASI GIF
  if (url.startsWith('/bratanim')) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const text = urlParams.get('text');
    if (!text) return res.status(400).json({ Warning: 'Parameter "text" diperlukan.' });

    try {
      const gifBuffer = generateGifAnimated(text);
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(gifBuffer);
    } catch (err) {
      console.error('Gagal membuat GIF:', err);
      return res.status(500).send('Gagal membuat GIF.');
    }
  }

  // ROOT INFO
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify({
    info: "Brat Text & GIF Generator API",
    endpoints: {
      "/brat?text=...": "Generate PNG image",
      "/bratanim?text=...": "Generate animated GIF"
    },
    examples: {
      PNG: "/brat?text=Hello%20World",
      GIF: "/bratanim?text=Hello%20World"
    },
    notes: [
      "PNG basic tetap ada",
      "GIF animasi kata-per-kata + gerak-gerak",
      "Margin 20px, font auto-fit"
    ],
    creator: "Xyz-kings"
  }, null, 2));
};