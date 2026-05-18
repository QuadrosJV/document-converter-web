import { jsPDF } from "jspdf";

export interface ScanPDFOptions {
  quality?: number   // JPEG quality 0-1, default 0.92
  margin?: number    // Page margin in mm, default 0
}

/** Generate a scanner-style PDF from a processed canvas. */
export async function generateScannedPDF(
  canvas: HTMLCanvasElement,
  options: ScanPDFOptions = {}
): Promise<Blob> {
  const { quality = 0.92, margin = 0 } = options
  const imgData = canvas.toDataURL("image/jpeg", quality)
  const aspectRatio = canvas.width / canvas.height
  const landscape = aspectRatio > 1

  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const innerW = pageW - 2 * margin
  const innerH = pageH - 2 * margin

  // Fit proportionally
  let imgW = innerW
  let imgH = innerW / aspectRatio
  if (imgH > innerH) {
    imgH = innerH
    imgW = innerH * aspectRatio
  }

  const x = margin + (innerW - imgW) / 2
  const y = margin + (innerH - imgH) / 2

  pdf.addImage(imgData, "JPEG", x, y, imgW, imgH)

  return pdf.output("blob")
}

/** Convert a processed canvas to a PNG Blob. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar PNG"))),
      "image/png"
    )
  })
}

/** Convert a processed canvas to a JPEG Blob. */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar JPEG"))),
      "image/jpeg",
      quality
    )
  })
}
