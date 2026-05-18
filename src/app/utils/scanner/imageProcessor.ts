export interface Point { x: number; y: number }
export type FilterType = 'original' | 'bw' | 'hd' | 'grayscale'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toGrayscale(data: Uint8ClampedArray): Float32Array {
  const gray = new Float32Array(data.length / 4)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  return gray
}

function gaussianBlur3(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, sum = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.max(0, Math.min(w - 1, x + kx))
          const py = Math.max(0, Math.min(h - 1, y + ky))
          const ki = (ky + 1) * 3 + (kx + 1)
          const wt = kernel[ki]
          const idx = (py * w + px) * 4
          r += data[idx] * wt
          g += data[idx + 1] * wt
          b += data[idx + 2] * wt
          sum += wt
        }
      }
      const oi = (y * w + x) * 4
      out[oi] = r / sum
      out[oi + 1] = g / sum
      out[oi + 2] = b / sum
      out[oi + 3] = data[oi + 3]
    }
  }
  return out
}

function sobelEdges(gray: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h)
  let maxVal = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const g = (dy: number, dx: number) => gray[(y + dy) * w + (x + dx)]
      const gx = -g(-1,-1) + g(-1,1) - 2*g(0,-1) + 2*g(0,1) - g(1,-1) + g(1,1)
      const gy = -g(-1,-1) - 2*g(-1,0) - g(-1,1) + g(1,-1) + 2*g(1,0) + g(1,1)
      const mag = Math.sqrt(gx * gx + gy * gy)
      edges[y * w + x] = mag
      if (mag > maxVal) maxVal = mag
    }
  }
  if (maxVal > 0) for (let i = 0; i < edges.length; i++) edges[i] /= maxVal
  return edges
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = A.length
  const m = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[maxRow][col])) maxRow = row
    }
    ;[m[col], m[maxRow]] = [m[maxRow], m[col]]
    if (Math.abs(m[col][col]) < 1e-12) continue
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col] / m[col][col]
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j]
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]))
}

function dist(a: Point, b: Point) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function applyH(H: Float64Array, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8]
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w }
}

function bilinearInterp(
  data: Uint8ClampedArray, w: number, h: number, x: number, y: number
): [number, number, number] {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)))
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const dx = x - Math.floor(x), dy = y - Math.floor(y)
  const p = (px: number, py: number) => (py * w + px) * 4
  const w00 = (1 - dx) * (1 - dy), w10 = dx * (1 - dy)
  const w01 = (1 - dx) * dy, w11 = dx * dy
  return [0, 1, 2].map(c =>
    data[p(x0, y0) + c] * w00 + data[p(x1, y0) + c] * w10 +
    data[p(x0, y1) + c] * w01 + data[p(x1, y1) + c] * w11
  ) as [number, number, number]
}

// Compute integral image for fast local mean
function computeIntegral(gray: Float32Array, w: number, h: number): Float64Array {
  const integ = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      integ[idx] = gray[idx]
        + (x > 0 ? integ[idx - 1] : 0)
        + (y > 0 ? integ[idx - w] : 0)
        - (x > 0 && y > 0 ? integ[idx - w - 1] : 0)
    }
  }
  return integ
}

function integralSum(integ: Float64Array, w: number,
  x1: number, y1: number, x2: number, y2: number): number {
  return integ[y2 * w + x2]
    - (y1 > 0 ? integ[(y1 - 1) * w + x2] : 0)
    - (x1 > 0 ? integ[y2 * w + (x1 - 1)] : 0)
    + (x1 > 0 && y1 > 0 ? integ[(y1 - 1) * w + (x1 - 1)] : 0)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')) }
    img.src = url
  })
}

export function computeHomography(
  src: [Point, Point, Point, Point],
  dst: [Point, Point, Point, Point]
): Float64Array {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i]
    const { x: dx, y: dy } = dst[i]
    A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx])
    b.push(-dx)
    A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy])
    b.push(-dy)
  }
  const h = gaussianElimination(A, b)
  return new Float64Array([...h, 1])
}

/** Detect document corners in the image. Returns [TL, TR, BR, BL] in source px coords. */
export function detectDocumentCorners(srcCanvas: HTMLCanvasElement): [Point, Point, Point, Point] {
  const MAX_W = 800
  const scale = Math.min(1, MAX_W / srcCanvas.width)
  const sw = Math.round(srcCanvas.width * scale)
  const sh = Math.round(srcCanvas.height * scale)

  const work = document.createElement('canvas')
  work.width = sw; work.height = sh
  const ctx = work.getContext('2d')!
  ctx.drawImage(srcCanvas, 0, 0, sw, sh)

  const { data } = ctx.getImageData(0, 0, sw, sh)
  const blurred = gaussianBlur3(data, sw, sh)
  const gray = toGrayscale(blurred)
  const edges = sobelEdges(gray, sw, sh)

  // Collect strong edge pixels (top 20%)
  const threshold = 0.20
  const edgePts: Point[] = []
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (edges[y * sw + x] > threshold) edgePts.push({ x, y })
    }
  }

  const margin = 0.05
  const defaultCorners: [Point, Point, Point, Point] = [
    { x: srcCanvas.width * margin, y: srcCanvas.height * margin },
    { x: srcCanvas.width * (1 - margin), y: srcCanvas.height * margin },
    { x: srcCanvas.width * (1 - margin), y: srcCanvas.height * (1 - margin) },
    { x: srcCanvas.width * margin, y: srcCanvas.height * (1 - margin) },
  ]

  if (edgePts.length < 100) return defaultCorners

  // Find extremal points using diagonal sums/differences
  let tlMin = Infinity, trMax = -Infinity, brMax = -Infinity, blMin = Infinity
  let tl = edgePts[0], tr = edgePts[0], br = edgePts[0], bl = edgePts[0]

  for (const { x, y } of edgePts) {
    const s = x + y, d = x - y
    if (s < tlMin) { tlMin = s; tl = { x, y } }
    if (d > trMax) { trMax = d; tr = { x, y } }
    if (s > brMax) { brMax = s; br = { x, y } }
    if (d < blMin) { blMin = d; bl = { x, y } }
  }

  // Validate: the detected quad must cover at least 10% of the image area
  const area = Math.abs(
    (tr.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (tr.y - tl.y)
  ) / 2
  if (area < sw * sh * 0.10) return defaultCorners

  const invScale = 1 / scale
  return [
    { x: tl.x * invScale, y: tl.y * invScale },
    { x: tr.x * invScale, y: tr.y * invScale },
    { x: br.x * invScale, y: br.y * invScale },
    { x: bl.x * invScale, y: bl.y * invScale },
  ]
}

/** Perspective-correct the source canvas given 4 corners [TL, TR, BR, BL]. */
export function perspectiveCorrect(
  srcCanvas: HTMLCanvasElement,
  corners: [Point, Point, Point, Point],
  maxDim = 3000
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners
  const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)))
  const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)))

  const scaleFactor = Math.min(1, maxDim / Math.max(outW, outH))
  const dstW = Math.max(1, Math.round(outW * scaleFactor))
  const dstH = Math.max(1, Math.round(outH * scaleFactor))

  const dst: [Point, Point, Point, Point] = [
    { x: 0, y: 0 }, { x: dstW, y: 0 },
    { x: dstW, y: dstH }, { x: 0, y: dstH },
  ]

  let H: Float64Array
  try {
    H = computeHomography(dst, corners) // inverse map: output → source
  } catch {
    // Fallback: just crop the bounding rect
    const minX = Math.min(tl.x, bl.x), minY = Math.min(tl.y, tr.y)
    const maxX = Math.max(tr.x, br.x), maxY = Math.max(bl.y, br.y)
    const out = document.createElement('canvas')
    out.width = Math.round(maxX - minX); out.height = Math.round(maxY - minY)
    out.getContext('2d')!.drawImage(srcCanvas, -minX, -minY)
    return out
  }

  const srcCtx = srcCanvas.getContext('2d')!
  const { data: sData, width: sW, height: sH } = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)

  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = dstW; dstCanvas.height = dstH
  const dstCtx = dstCanvas.getContext('2d')!
  const dstImg = dstCtx.createImageData(dstW, dstH)
  const { data: dData } = dstImg

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const { x: sx, y: sy } = applyH(H, dx, dy)
      if (sx < 0 || sx >= sW || sy < 0 || sy >= sH) continue
      const [r, g, b] = bilinearInterp(sData, sW, sH, sx, sy)
      const idx = (dy * dstW + dx) * 4
      dData[idx] = r; dData[idx + 1] = g; dData[idx + 2] = b; dData[idx + 3] = 255
    }
  }

  dstCtx.putImageData(dstImg, 0, 0)
  return dstCanvas
}

/** Remove shadows by normalizing against a blurred background estimate. */
export function removeShadows(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const W = canvas.width, H = canvas.height
  const srcCtx = canvas.getContext('2d')!
  const { data: sData } = srcCtx.getImageData(0, 0, W, H)

  // Downsample to estimate background illumination
  const bgScale = Math.min(1, 200 / Math.max(W, H))
  const bw = Math.max(1, Math.round(W * bgScale))
  const bh = Math.max(1, Math.round(H * bgScale))

  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = bw; blurCanvas.height = bh
  const blurCtx = blurCanvas.getContext('2d')!
  blurCtx.drawImage(canvas, 0, 0, bw, bh)

  let blurData = blurCtx.getImageData(0, 0, bw, bh)
  for (let i = 0; i < 4; i++) {
    blurData = new ImageData(gaussianBlur3(blurData.data, bw, bh), bw, bh)
  }
  blurCtx.putImageData(blurData, 0, 0)

  // Upsample background back to full size
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = W; bgCanvas.height = H
  const bgCtx = bgCanvas.getContext('2d')!
  bgCtx.drawImage(blurCanvas, 0, 0, W, H)
  const { data: bgData } = bgCtx.getImageData(0, 0, W, H)

  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const outCtx = out.getContext('2d')!
  const outImg = outCtx.createImageData(W, H)
  const { data: oData } = outImg

  for (let i = 0; i < sData.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const bg = Math.max(1, bgData[i + c])
      oData[i + c] = Math.min(255, Math.round((sData[i + c] / bg) * 240))
    }
    oData[i + 3] = 255
  }

  outCtx.putImageData(outImg, 0, 0)
  return out
}

/** Auto-level (stretch histogram) for brightness/contrast correction. */
export function autoEnhance(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const lo = [255, 255, 255], hi = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      if (data[i + c] < lo[c]) lo[c] = data[i + c]
      if (data[i + c] > hi[c]) hi[c] = data[i + c]
    }
  }

  const out = document.createElement('canvas')
  out.width = canvas.width; out.height = canvas.height
  const outCtx = out.getContext('2d')!
  const outImg = outCtx.createImageData(canvas.width, canvas.height)
  const { data: oData } = outImg

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const range = hi[c] - lo[c]
      oData[i + c] = range > 10 ? Math.round((data[i + c] - lo[c]) * 255 / range) : data[i + c]
    }
    oData[i + 3] = 255
  }

  outCtx.putImageData(outImg, 0, 0)
  return out
}

function unsharpMask(data: Uint8ClampedArray, w: number, h: number, strength = 0.7): Uint8ClampedArray {
  const blurred = gaussianBlur3(data, w, h)
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.max(0, Math.min(255, Math.round(
        data[i + c] + strength * (data[i + c] - blurred[i + c])
      )))
    }
    out[i + 3] = data[i + 3]
  }
  return out
}

function adaptiveThreshold(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const gray = toGrayscale(data)
  const integ = computeIntegral(gray, w, h)
  const half = Math.max(10, Math.round(Math.min(w, h) * 0.04))
  const out = new Uint8ClampedArray(data.length)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half), y1 = Math.max(0, y - half)
      const x2 = Math.min(w - 1, x + half), y2 = Math.min(h - 1, y + half)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)
      const mean = integralSum(integ, w, x1, y1, x2, y2) / count
      const pixel = gray[y * w + x] < mean - 8 ? 0 : 255
      const idx = (y * w + x) * 4
      out[idx] = out[idx + 1] = out[idx + 2] = pixel
      out[idx + 3] = 255
    }
  }
  return out
}

/** Apply a visual filter to the canvas. Returns a new canvas. */
export function applyFilter(canvas: HTMLCanvasElement, filter: FilterType): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  const { data } = ctx.getImageData(0, 0, W, H)

  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const outCtx = out.getContext('2d')!

  if (filter === 'original') {
    outCtx.drawImage(canvas, 0, 0)
    return out
  }

  let outData: Uint8ClampedArray

  if (filter === 'grayscale') {
    const gray = toGrayscale(data)
    outData = new Uint8ClampedArray(data.length)
    for (let i = 0; i < gray.length; i++) {
      outData[i * 4] = outData[i * 4 + 1] = outData[i * 4 + 2] = Math.round(gray[i])
      outData[i * 4 + 3] = 255
    }
  } else if (filter === 'bw') {
    outData = adaptiveThreshold(data, W, H)
  } else {
    // HD: grayscale + auto-contrast + sharpen
    const gray = toGrayscale(data)
    let minV = 255, maxV = 0
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] < minV) minV = gray[i]
      if (gray[i] > maxV) maxV = gray[i]
    }
    const range = maxV - minV
    outData = new Uint8ClampedArray(data.length)
    for (let i = 0; i < gray.length; i++) {
      const v = range > 10 ? Math.round((gray[i] - minV) * 255 / range) : Math.round(gray[i])
      outData[i * 4] = outData[i * 4 + 1] = outData[i * 4 + 2] = v
      outData[i * 4 + 3] = 255
    }
    outData = unsharpMask(outData, W, H, 0.8)
  }

  const outImg = outCtx.createImageData(W, H)
  outImg.data.set(outData)
  outCtx.putImageData(outImg, 0, 0)
  return out
}

/**
 * Full scan pipeline: perspective correction → shadow removal → auto-enhance → filter.
 * maxDim controls output resolution (800 for preview, 3000+ for export).
 */
export function processScan(
  srcCanvas: HTMLCanvasElement,
  corners: [Point, Point, Point, Point],
  filter: FilterType,
  maxDim = 3000
): HTMLCanvasElement {
  let result = perspectiveCorrect(srcCanvas, corners, maxDim)
  result = removeShadows(result)
  if (filter !== 'bw') result = autoEnhance(result)
  result = applyFilter(result, filter)
  return result
}
