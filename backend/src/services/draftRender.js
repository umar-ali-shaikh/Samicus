// Renders an assembled draft to DOCX or PDF on the fly (nothing is stored server-side).
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";

const DRAFT_BANNER = "DRAFT — not executed. A standard draft, not legal advice, until reviewed by a verified advocate.";

export async function renderDocx({ title, blocks }) {
  const doc = new Document({
    creator: "Vidhira",
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
    const pdf = new PDFDocument({ margin: 56, info: { Title: title, Producer: "Vidhira" } });
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

const RESEARCH_DISCLAIMER =
  "AI-generated research aid, not legal advice. Every claim is grounded in the sources listed below — verify with the original judgment before relying on it.";

/**
 * Renders a saved research report — summary, one section per case, related searches — to PDF.
 * Pulled from already-persisted data (research_answers/research_answer_segments), never
 * regenerated, matching the report page's "instant reopen" guarantee.
 * @param {{
 *   title: string, question: string, date: string,
 *   summary: string|null,
 *   cases: Array<{title: string, citation: string|null, court: string|null, outcome: string|null,
 *     facts: string|null, issues: string|null, held: string|null, ratio: string|null,
 *     keyParagraph: string|null, url: string|null}>,
 *   relatedSearches: string[],
 * }} report
 */
export function renderResearchReportPdf({ title, question, date, summary, cases, relatedSearches }) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 56, info: { Title: title, Producer: "Vidhira" } });
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    pdf.font("Times-Bold").fontSize(18).text(title, { align: "center" }).moveDown(0.1);
    pdf.font("Times-Roman").fontSize(9).fillColor("#666").text(`${question} — ${date}`, { align: "center" }).fillColor("#000").moveDown(0.3);
    pdf.font("Times-Italic").fontSize(9).fillColor("#666").text(RESEARCH_DISCLAIMER, { align: "center" }).fillColor("#000").moveDown();

    if (summary) {
      pdf.font("Times-Bold").fontSize(13).text("Summary").moveDown(0.2);
      pdf.font("Times-Roman").fontSize(11).text(summary, { align: "justify" }).moveDown();
    }

    if (cases.length > 0) {
      pdf.font("Times-Bold").fontSize(13).text("Cases").moveDown(0.2);
      for (const [i, c] of cases.entries()) {
        pdf.font("Times-Bold").fontSize(12).text(`${i + 1}. ${c.title}`).moveDown(0.05);
        const meta = [c.court, c.citation, c.outcome && c.outcome !== "not_stated" ? c.outcome : null].filter(Boolean).join(" · ");
        if (meta) pdf.font("Times-Italic").fontSize(9).fillColor("#666").text(meta).fillColor("#000").moveDown(0.15);
        for (const [label, text] of [["Facts", c.facts], ["Issues", c.issues], ["Held", c.held], ["Ratio", c.ratio]]) {
          if (!text) continue;
          pdf.font("Times-Bold").fontSize(10).text(`${label}: `, { continued: true }).font("Times-Roman").text(text);
        }
        if (c.keyParagraph) pdf.font("Times-Italic").fontSize(10).text(`"${c.keyParagraph}"`).moveDown(0.1);
        if (c.url) pdf.font("Times-Roman").fontSize(9).fillColor("#2A5DB0").text(c.url, { link: c.url }).fillColor("#000");
        pdf.moveDown();
      }
    }

    if (relatedSearches.length > 0) {
      pdf.font("Times-Bold").fontSize(13).text("Related searches").moveDown(0.2);
      for (const s of relatedSearches) pdf.font("Times-Roman").fontSize(11).text(`• ${s}`);
    }

    pdf.end();
  });
}
