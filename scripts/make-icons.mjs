// Draws the app's icons from the logo shape (the payment stub in Sidebar.tsx `Logo`), with no dependencies.
//   build/icon.png                 1024 px app icon (macOS needs 512+; Windows' .ico is made from it too)
//   resources/trayTemplate.png     16 px macOS menu bar icon: black + alpha, so macOS tints it for light and dark bars
//   resources/trayTemplate@2x.png  32 px, the same for Retina screens
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BLUE = [0x2f, 0x45, 0xc8, 255]
const WHITE = [255, 255, 255, 255]
const PALE = [0xc7, 0xcd, 0xef, 255] // the second bar: white at 70% over the blue
const CLEAR = null

// Shapes in the logo's 32-unit viewBox.
const inRoundRect = (x, y, l, t, r, b, rad) => {
  if (x < l || x > r || y < t || y > b) return false
  const cx = Math.min(Math.max(x, l + rad), r - rad)
  const cy = Math.min(Math.max(y, t + rad), b - rad)
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad
}
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
const inDash = (x, y) => x >= 20 && x <= 22 && y >= 6 && y <= 26 && (y - 6) % 5 < 2.5

/** Paint order matches the SVG. `template` turns every cut-out into transparency and the body black. */
function sample(x, y, template) {
  let c = CLEAR
  if (inRoundRect(x, y, 2, 6, 30, 26, 4)) c = template ? [0, 0, 0, 255] : BLUE
  if (c && inDash(x, y)) c = template ? CLEAR : WHITE
  if (c && inRoundRect(x, y, 6, 11, 16, 13.5, 1.25)) c = template ? CLEAR : WHITE
  if (c && inRoundRect(x, y, 6, 17, 12, 19.5, 1.25)) c = template ? CLEAR : PALE
  // The stub's notches are cut out, so the desktop or dock shows through.
  if (inCircle(x, y, 21, 6, 2.4) || inCircle(x, y, 21, 26, 2.4)) c = CLEAR
  return c
}

function render(size, { template = false, inset = 0 } = {}) {
  const ss = 4
  const px = Buffer.alloc(size * size * 4)
  const scale = (32 - inset * 2) / size
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample(inset + (i + (sx + 0.5) / ss) * scale, inset + (j + (sy + 0.5) / ss) * scale, template)
          if (!c) continue
          const al = c[3] / 255
          r += c[0] * al; g += c[1] * al; b += c[2] * al; a += al
        }
      }
      const o = (j * size + i) * 4
      const n = ss * ss
      px[o + 3] = Math.round((a / n) * 255)
      if (a > 0) {
        px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a)
      }
    }
  }
  return png(size, size, px)
}

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('build/icon.png', render(1024))
// The ticket is wider than tall; a 1-unit inset keeps its edges off the menu bar's.
writeFileSync('resources/trayTemplate.png', render(16, { template: true, inset: 1 }))
writeFileSync('resources/trayTemplate@2x.png', render(32, { template: true, inset: 1 }))
console.log('Wrote build/icon.png, resources/trayTemplate.png, resources/trayTemplate@2x.png')
