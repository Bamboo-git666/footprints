// 零依赖生成 PWA 所需 PNG 图标（暗色底 + 金色定位环）
// node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
mkdirSync(publicDir, { recursive: true })

const BG = [10, 11, 13]
const GOLD = [229, 178, 93]
const WHITE = [236, 238, 241]

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, draw) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size)
      const i = (y * size + x) * 4
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a
    }
  }
  // 加 filter 字节
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function inDisk(x, y, cx, cy, rOuter, rInner) {
  const d = Math.hypot(x - cx, y - cy)
  return d <= rOuter && d >= rInner
}

function makeIcon(size, { maskable = false } = {}) {
  const cx = size / 2
  const cy = size * (maskable ? 0.52 : 0.46)
  const ringOuter = size * (maskable ? 0.30 : 0.34)
  const ringInner = ringOuter * 0.66
  const dotR = ringOuter * 0.30
  return encodePng(size, (x, y) => {
    const d = Math.hypot(x - cx, y - cy)
    // 圆角矩形裁剪（非 maskable）
    const radius = size * 0.22
    if (!maskable) {
      const corner = size - radius
      if ((x < radius || x > corner) && (y < radius || y > corner)) {
        const dx = x < radius ? radius - x : x - corner
        const dy = y < radius ? radius - y : y - corner
        if (Math.hypot(dx, dy) > radius) return [0, 0, 0, 0]
      }
    }
    // 金色定位环
    if (d <= ringOuter && d >= ringInner) return [...GOLD, 255]
    // 中心实点
    if (d <= dotR) return [...GOLD, 255]
    // 底部细横线，暗示“地图 / 足迹”
    const lineY = size * (maskable ? 0.74 : 0.78)
    const lineHalf = size * 0.22
    if (Math.abs(y - lineY) <= Math.max(1, size * 0.006) && Math.abs(x - cx) <= lineHalf) {
      return [...WHITE, 60]
    }
    return [...BG, 255]
  })
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon-32.png', 32, false]
]
for (const [name, size, maskable] of targets) {
  writeFileSync(join(publicDir, name), makeIcon(size, { maskable }))
  console.log('generated', name)
}
