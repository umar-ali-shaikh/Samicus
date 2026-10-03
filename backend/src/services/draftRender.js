// Renders an assembled draft to DOCX or PDF on the fly (nothing is stored server-side).
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";

const DRAFT_BANNER = "DRAFT — not executed. A standard draft, not legal advice, until reviewed by a verified advocate.";

export async function renderDocx({ title, blocks }) {
  const doc = new Document({
    creator: "Samicus",
    title,
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: DRAFT_BANNER, italics: true, size: 18 })] }),
          ...blocks.flatMap((b) => [
            new Paragraph({ text: `${b.n}. ${b.heading}`, heading: HeadingLevel.HEADING_2, spacing: { before: 240 } }),
            ...String(b.text).split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] })),
          ]),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export function renderPdf({ title, blocks }) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 56, info: { Title: title, Producer: "Samicus" } });
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    pdf.font("Times-Bold").fontSize(18).text(title, { align: "center" }).moveDown(0.3);
    pdf.font("Times-Italic").fontSize(9).fillColor("#666").text(DRAFT_BANNER, { align: "center" }).fillColor("#000").moveDown();
    for (const b of blocks) {
      pdf.font("Times-Bold").fontSize(12).text(`${b.n}. ${b.heading}`).moveDown(0.2);
      pdf.font("Times-Roman").fontSize(11).text(String(b.text), { align: "justify" }).moveDown();
    }
    pdf.end();
  });
}
