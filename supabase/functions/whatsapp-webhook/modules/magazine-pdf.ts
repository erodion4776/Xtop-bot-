// supabase/functions/whatsapp-webhook/modules/magazine-pdf.ts
// PDF Builder using jsPDF (Deno-compatible, Timeout-Protected)

import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { fetchImageBytes } from "./magazine-images.ts";

interface MagazineData {
  title: string;
  topic: string;
  magazineType: string;
  audience: string;
  visualStyle: string;
  template: string;
  coverImageUrl?: string | null;
}

interface PageData {
  page_number: number;
  page_type: string;
  title: string;
  content: string;
  image_url?: string | null;
  layout_type: string;
}

const TEMPLATE_COLORS: Record<string, { primary: string; accent: string; text: string }> = {
  modern: { primary: "#1e293b", accent: "#38bdf8", text: "#0f172a" },
  corporate: { primary: "#1e40af", accent: "#3b82f6", text: "#111827" },
  minimal: { primary: "#000000", accent: "#666666", text: "#000000" },
  luxury: { primary: "#78350f", accent: "#d4af37", text: "#1c1917" },
  african: { primary: "#7c2d12", accent: "#f59e0b", text: "#1c1917" },
  school: { primary: "#065f46", accent: "#10b981", text: "#064e3b" },
  technology: { primary: "#0c4a6e", accent: "#0ea5e9", text: "#0f172a" },
  fashion: { primary: "#831843", accent: "#ec4899", text: "#1f2937" },
  church: { primary: "#581c87", accent: "#a855f7", text: "#1f2937" },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export async function buildMagazinePdf(mag: MagazineData, pages: PageData[]): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const colors = TEMPLATE_COLORS[mag.template] || TEMPLATE_COLORS.modern;

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (i > 0) doc.addPage();

    if (page.page_type === "cover") {
      await drawCoverPage(doc, mag, page, pageWidth, pageHeight, colors);
    } else {
      await drawContentPage(doc, mag, page, pageWidth, pageHeight, margin, contentWidth, colors, i + 1, pages.length);
    }
  }

  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}

async function drawCoverPage(
  doc: jsPDF,
  mag: MagazineData,
  page: PageData,
  pageWidth: number,
  pageHeight: number,
  colors: { primary: string; accent: string; text: string }
) {
  const [pR, pG, pB] = hexToRgb(colors.primary);
  const [aR, aG, aB] = hexToRgb(colors.accent);

  doc.setFillColor(pR, pG, pB);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  if (page.image_url || mag.coverImageUrl) {
    const imgUrl = page.image_url || mag.coverImageUrl!;
    try {
      const bytes = await fetchImageBytes(imgUrl);
      if (bytes) {
        const b64 = btoa(String.fromCharCode(...bytes));
        doc.addImage(`data:image/jpeg;base64,${b64}`, "JPEG", 0, 40, pageWidth, 180, undefined, "FAST");
      }
    } catch (_) {}
  }

  doc.setFillColor(0, 0, 0);
  doc.setGState(new (doc as any).GState({ opacity: 0.7 }));
  doc.rect(0, 220, pageWidth, 77, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  const titleLines = doc.splitTextToSize(mag.title, pageWidth - 20);
  doc.text(titleLines, pageWidth / 2, 240, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const topicShort = mag.topic.length > 80 ? mag.topic.substring(0, 80) + "..." : mag.topic;
  const topicLines = doc.splitTextToSize(topicShort, pageWidth - 30);
  doc.text(topicLines, pageWidth / 2, 260, { align: "center" });

  doc.setDrawColor(aR, aG, aB);
  doc.setLineWidth(1);
  doc.line(pageWidth / 2 - 20, 275, pageWidth / 2 + 20, 275);

  doc.setFontSize(10);
  doc.setTextColor(220, 220, 220);
  const issueText = `Issue 1 | ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
  doc.text(issueText, pageWidth / 2, 283, { align: "center" });

  doc.setFillColor(aR, aG, aB);
  doc.rect(0, 0, pageWidth, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("XTOP RETAIL TECHNOLOGIES", pageWidth / 2, 5.5, { align: "center" });
}

async function drawContentPage(
  doc: jsPDF,
  mag: MagazineData,
  page: PageData,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  contentWidth: number,
  colors: { primary: string; accent: string; text: string },
  currentPageNum: number,
  totalPages: number
) {
  const [pR, pG, pB] = hexToRgb(colors.primary);
  const [aR, aG, aB] = hexToRgb(colors.accent);
  const [tR, tG, tB] = hexToRgb(colors.text);

  doc.setFillColor(pR, pG, pB);
  doc.rect(0, 0, pageWidth, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(mag.title.toUpperCase(), margin, 8);
  doc.text(mag.magazineType.toUpperCase(), pageWidth - margin, 8, { align: "right" });

  doc.setTextColor(tR, tG, tB);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(page.title, contentWidth);
  doc.text(titleLines, margin, 25);
  const titleHeight = titleLines.length * 8;

  doc.setDrawColor(aR, aG, aB);
  doc.setLineWidth(1.5);
  doc.line(margin, 27 + titleHeight, margin + 40, 27 + titleHeight);

  let yPos = 35 + titleHeight;

  if (page.image_url) {
    try {
      const bytes = await fetchImageBytes(page.image_url);
      if (bytes) {
        const b64 = btoa(String.fromCharCode(...bytes));
        const imgHeight = 80;
        doc.addImage(`data:image/jpeg;base64,${b64}`, "JPEG", margin, yPos, contentWidth, imgHeight, undefined, "FAST");
        yPos += imgHeight + 5;

        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Image: ${page.title}`, margin, yPos);
        yPos += 6;
      }
    } catch (_) {}
  }

  doc.setTextColor(tR, tG, tB);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const bodyLines = doc.splitTextToSize(page.content, contentWidth);
  const lineHeight = 5;
  const maxY = pageHeight - 20;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    if (yPos > maxY) break;

    const isHeading = /^[A-Z][A-Za-z0-9 &,'-]+$/.test(line) && line.length < 60 && !line.endsWith(".") && !line.endsWith(",");

    if (isHeading) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(pR, pG, pB);
      yPos += 2;
      doc.text(line, margin, yPos);
      yPos += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(tR, tG, tB);
    } else {
      doc.text(line, margin, yPos);
      yPos += lineHeight;
    }
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Page ${currentPageNum} of ${totalPages}`, margin, pageHeight - 7);
  doc.text("Xtop Retail Technologies | Magazine Studio", pageWidth - margin, pageHeight - 7, { align: "right" });
}
