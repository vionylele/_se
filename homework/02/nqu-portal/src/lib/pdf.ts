export interface PdfExportOptions {
  filename: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
  marginMm?: number;
  /** Canvas pixel ratio. 2 gives crisp text without huge files. */
  scale?: number;
  /**
   * false (default): scale everything onto a single page.
   * true: keep the natural size and flow onto as many A4 pages as needed, breaking only above
   * elements marked with data-pdf-block so rows and sections are never cut in half.
   */
  paginate?: boolean;
  /** Adds "Page X of Y" in the bottom margin (paginate mode only). */
  pageNumbers?: boolean;
}

/** Greedy page planner: each page ends at the last block boundary that still fits. */
function planPages(totalHeight: number, pageHeight: number, blockTops: number[]): Array<[number, number]> {
  const pages: Array<[number, number]> = [];
  let start = 0;
  while (start < totalHeight - 1) {
    const limit = start + pageHeight;
    if (limit >= totalHeight) {
      pages.push([start, totalHeight]);
      break;
    }
    const fitting = blockTops.filter((t) => t > start + 40 && t <= limit);
    const end = fitting.length > 0 ? Math.max(...fitting) : limit; // oversized block: hard cut
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

/**
 * Renders a DOM element with html2canvas and writes it to an A4 PDF with jsPDF. Both libraries are
 * loaded on demand so they stay out of the initial bundle.
 *
 * The element may live off-screen (e.g., `position:absolute; left:-10000px`): the cloned copy that
 * html2canvas renders is moved back into view first.
 */
export async function exportElementToPdf(element: HTMLElement, options: PdfExportOptions): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  // Make sure web fonts are loaded so the PDF text matches the on-screen design.
  if (document.fonts?.ready) await document.fonts.ready;

  if (!element.id) element.id = 'pdf-export-target';
  const targetId = element.id;

  // Measure break candidates BEFORE rendering (CSS pixels, relative to the element's top).
  const bounds = element.getBoundingClientRect();
  const blockTops = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-block]')).map(
    (el) => el.getBoundingClientRect().top - bounds.top,
  );

  const canvas = await html2canvas(element, {
    scale: options.scale ?? 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    onclone: (clonedDoc) => {
      const parent = clonedDoc.getElementById(targetId)?.parentElement;
      if (parent) {
        parent.style.position = 'static';
        parent.style.left = '0';
        parent.style.top = '0';
      }
    },
  });

  const pdf = new jsPDF({ orientation: options.orientation ?? 'landscape', unit: 'mm', format: 'a4' });
  if (options.title) pdf.setProperties({ title: options.title });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = options.marginMm ?? 10;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  if (!options.paginate) {
    // Single page: fit inside the printable area, preserving aspect ratio.
    const ratio = canvas.height / canvas.width;
    let width = maxWidth;
    let height = width * ratio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height / ratio;
    }
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageWidth - width) / 2, margin, width, height, undefined, 'FAST');
    pdf.save(options.filename);
    return;
  }

  // Multi-page: map CSS pixels -> millimetres at full printable width.
  const mmPerPx = maxWidth / bounds.width;
  const canvasPerPx = canvas.width / bounds.width;
  const pages = planPages(bounds.height, maxHeight / mmPerPx, blockTops);

  pages.forEach(([top, bottom], index) => {
    if (index > 0) pdf.addPage();
    const sourceY = Math.round(top * canvasPerPx);
    const sliceHeight = Math.min(canvas.height - sourceY, Math.round((bottom - top) * canvasPerPx));

    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const heightMm = (sliceHeight / canvasPerPx) * mmPerPx;
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, maxWidth, heightMm, undefined, 'FAST');
  });

  if (options.pageNumbers !== false) {
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    for (let i = 1; i <= pages.length; i += 1) {
      pdf.setPage(i);
      pdf.text(`Page ${i} of ${pages.length}`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
    }
  }
  pdf.save(options.filename);
}
