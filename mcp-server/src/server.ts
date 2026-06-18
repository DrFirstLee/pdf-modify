#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import PptxGenJSModule from 'pptxgenjs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod/v4';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages?: number }>;
const PptxGenJS = PptxGenJSModule as unknown as { new (): any };

const server = new McpServer({ name: 'pdf-modify-mcp', version: '1.0.0' });

function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

async function readFileBuffer(filePath: string): Promise<Buffer> {
  return fs.readFile(resolvePath(filePath));
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(resolvePath(filePath)), { recursive: true });
}

async function writeBytes(outputPath: string, bytes: Uint8Array | Buffer): Promise<string> {
  const resolved = resolvePath(outputPath);
  await ensureParentDirectory(resolved);
  await fs.writeFile(resolved, bytes);
  return resolved;
}

function outputPathFor(inputPath: string, suffix: string, extension: string): string {
  const parsed = path.parse(resolvePath(inputPath));
  return path.join(parsed.dir, `${parsed.name}${suffix}${extension}`);
}

function parseRanges(rangeText: string, maxPages: number): number[] {
  const cleaned = rangeText.trim();
  if (!cleaned) return Array.from({ length: maxPages }, (_, index) => index);

  const pages: number[] = [];
  for (const part of cleaned.split(',')) {
    const segment = part.trim();
    if (!segment) continue;
    const match = segment.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`Invalid page range segment: ${segment}`);

    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < 1 || start > maxPages || end > maxPages) {
      throw new Error(`Page range out of bounds: ${segment}; document has ${maxPages} pages`);
    }

    const step = start <= end ? 1 : -1;
    for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
      pages.push(page - 1);
    }
  }

  if (!pages.length) throw new Error('No pages selected');
  return pages;
}

function safePdfText(value: string): string {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wrapText(value: string, maxLength = 88): string[] {
  const words = safePdfText(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if ((line + word).length > maxLength) {
      if (line.trim()) lines.push(line.trim());
      line = `${word} `;
    } else {
      line += `${word} `;
    }
  }

  if (line.trim()) lines.push(line.trim());
  return lines.length ? lines : [''];
}

async function createTextPdf(pages: Array<{ title: string; text: string }>, landscape = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageSize: [number, number] = landscape ? [842, 595] : [595, 842];

  for (const textPage of pages) {
    let page = pdf.addPage(pageSize);
    let y = pageSize[1] - 56;
    const title = safePdfText(textPage.title);

    if (title) {
      page.drawText(title.slice(0, 95), { x: 48, y, size: 18, font, color: rgb(0.09, 0.13, 0.19) });
      y -= 34;
    }

    const lines = textPage.text.split('\n').flatMap((line) => wrapText(line, landscape ? 104 : 84));
    for (const line of lines) {
      if (y < 54) {
        page = pdf.addPage(pageSize);
        y = pageSize[1] - 56;
      }
      page.drawText(line.slice(0, 140), { x: 48, y, size: 11, font, color: rgb(0.09, 0.13, 0.19) });
      y -= 17;
    }
  }

  return pdf.save();
}

function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractSlideText(xml: string): string {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => xmlDecode(match[1])).join('\n');
}

function sortSlidePaths(paths: string[]): string[] {
  return paths.sort((left, right) => Number(left.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(right.match(/slide(\d+)\.xml/)?.[1] || 0));
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] || char);
}

function chunkText(text: string, chunks: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return Array.from({ length: chunks }, () => '');
  const chunkSize = Math.max(1, Math.ceil(normalized.length / chunks));
  return Array.from({ length: chunks }, (_, index) => normalized.slice(index * chunkSize, (index + 1) * chunkSize));
}

async function getPdfPageCount(inputPath: string): Promise<number> {
  const pdf = await PDFDocument.load(await readFileBuffer(inputPath), { ignoreEncryption: true });
  return pdf.getPageCount();
}

server.registerTool(
  'pdf_info',
  {
    description: 'Read basic information about a PDF file, including page count.',
    inputSchema: z.object({ inputPath: z.string().describe('Path to a PDF file') })
  },
  async ({ inputPath }) => {
    const pageCount = await getPdfPageCount(inputPath);
    return { content: [{ type: 'text', text: JSON.stringify({ inputPath: resolvePath(inputPath), pageCount }, null, 2) }] };
  }
);

server.registerTool(
  'pdf_merge',
  {
    description: 'Merge multiple PDF files into one PDF in the provided order.',
    inputSchema: z.object({
      inputPaths: z.array(z.string()).min(2).describe('PDF file paths in merge order'),
      outputPath: z.string().describe('Output PDF path')
    })
  },
  async ({ inputPaths, outputPath }) => {
    const output = await PDFDocument.create();
    for (const inputPath of inputPaths) {
      const source = await PDFDocument.load(await readFileBuffer(inputPath), { ignoreEncryption: true });
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
    }
    const written = await writeBytes(outputPath, await output.save());
    return { content: [{ type: 'text', text: `Merged ${inputPaths.length} PDFs into ${written}` }] };
  }
);

server.registerTool(
  'pdf_split',
  {
    description: 'Extract selected pages from a PDF using page ranges like "1-3, 5, 8-10".',
    inputSchema: z.object({
      inputPath: z.string().describe('Path to a PDF file'),
      ranges: z.string().describe('One-based page ranges, e.g. 1-3, 5'),
      outputPath: z.string().describe('Output PDF path')
    })
  },
  async ({ inputPath, ranges, outputPath }) => {
    const source = await PDFDocument.load(await readFileBuffer(inputPath), { ignoreEncryption: true });
    const selected = parseRanges(ranges, source.getPageCount());
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, selected);
    pages.forEach((page) => output.addPage(page));
    const written = await writeBytes(outputPath, await output.save());
    return { content: [{ type: 'text', text: `Extracted ${selected.length} pages into ${written}` }] };
  }
);

server.registerTool(
  'pdf_reorder',
  {
    description: 'Create a reordered PDF. Use either a single inputPath with pages, or items across multiple PDFs.',
    inputSchema: z.object({
      inputPath: z.string().optional().describe('Single PDF path when using pages'),
      pages: z.array(z.number().int().positive()).optional().describe('One-based page order for inputPath'),
      items: z.array(z.object({ inputPath: z.string(), page: z.number().int().positive() })).optional().describe('Cross-file ordered pages'),
      outputPath: z.string().describe('Output PDF path')
    })
  },
  async ({ inputPath, pages, items, outputPath }) => {
    const output = await PDFDocument.create();
    const orderedItems = items?.length ? items : pages?.map((page) => ({ inputPath: inputPath || '', page }));
    if (!orderedItems?.length) throw new Error('Provide either items or pages');

    for (const item of orderedItems) {
      if (!item.inputPath) throw new Error('inputPath is required for each reordered page');
      const source = await PDFDocument.load(await readFileBuffer(item.inputPath), { ignoreEncryption: true });
      if (item.page < 1 || item.page > source.getPageCount()) throw new Error(`Page ${item.page} is out of bounds for ${item.inputPath}`);
      const [copiedPage] = await output.copyPages(source, [item.page - 1]);
      output.addPage(copiedPage);
    }

    const written = await writeBytes(outputPath, await output.save());
    return { content: [{ type: 'text', text: `Created reordered PDF at ${written}` }] };
  }
);

server.registerTool(
  'pdf_crop',
  {
    description: 'Crop one page of a PDF using PDF point coordinates. x/y start at the bottom-left of the page.',
    inputSchema: z.object({
      inputPath: z.string(),
      page: z.number().int().positive().describe('One-based page number'),
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive(),
      outputPath: z.string()
    })
  },
  async ({ inputPath, page, x, y, width, height, outputPath }) => {
    const source = await PDFDocument.load(await readFileBuffer(inputPath), { ignoreEncryption: true });
    if (page > source.getPageCount()) throw new Error(`Page ${page} is out of bounds`);
    const output = await PDFDocument.create();
    const [copiedPage] = await output.copyPages(source, [page - 1]);
    copiedPage.setCropBox(x, y, width, height);
    copiedPage.setMediaBox(x, y, width, height);
    output.addPage(copiedPage);
    const written = await writeBytes(outputPath, await output.save());
    return { content: [{ type: 'text', text: `Cropped page ${page} into ${written}` }] };
  }
);

server.registerTool(
  'office_to_pdf',
  {
    description: 'Convert a DOCX or PPTX file to a text-based PDF locally. Older DOC/PPT files should be saved as DOCX/PPTX first.',
    inputSchema: z.object({
      inputPath: z.string().describe('Path to a .docx or .pptx file'),
      outputPath: z.string().optional().describe('Optional output PDF path')
    })
  },
  async ({ inputPath, outputPath }) => {
    const resolvedInput = resolvePath(inputPath);
    const ext = path.extname(resolvedInput).toLowerCase();
    const buffer = await readFileBuffer(resolvedInput);
    let bytes: Uint8Array;

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer });
      bytes = await createTextPdf([{ title: path.basename(resolvedInput), text: result.value || path.basename(resolvedInput) }]);
    } else if (ext === '.pptx') {
      const zip = await JSZip.loadAsync(buffer);
      const slidePaths = sortSlidePaths(Object.keys(zip.files).filter((filePath) => /^ppt\/slides\/slide\d+\.xml$/.test(filePath)));
      const pages = await Promise.all(slidePaths.map(async (slidePath, index) => ({
        title: `${path.basename(resolvedInput)} - slide ${index + 1}`,
        text: extractSlideText(await zip.file(slidePath)!.async('text')) || path.basename(resolvedInput)
      })));
      bytes = await createTextPdf(pages.length ? pages : [{ title: path.basename(resolvedInput), text: path.basename(resolvedInput) }], true);
    } else {
      throw new Error('Only .docx and .pptx files are supported');
    }

    const written = await writeBytes(outputPath || outputPathFor(resolvedInput, '', '.pdf'), bytes);
    return { content: [{ type: 'text', text: `Converted ${resolvedInput} to ${written}` }] };
  }
);

server.registerTool(
  'pdf_to_word',
  {
    description: 'Export a PDF to a text-focused DOCX file using extractable PDF text.',
    inputSchema: z.object({ inputPath: z.string(), outputPath: z.string().optional() })
  },
  async ({ inputPath, outputPath }) => {
    const resolvedInput = resolvePath(inputPath);
    const buffer = await readFileBuffer(resolvedInput);
    const parsed = await pdfParse(buffer);
    const pageCount = parsed.numpages || await getPdfPageCount(resolvedInput);
    const chunks = chunkText(parsed.text || '', pageCount);

    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    zip.folder('_rels')!.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.folder('docProps')!.file('core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>PDF Modify Export</dc:title><dc:creator>PDF Modify MCP</dc:creator></cp:coreProperties>');
    zip.folder('docProps')!.file('app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PDF Modify MCP</Application></Properties>');

    const body = chunks.map((chunk, index) => {
      const title = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Page ${index + 1}</w:t></w:r></w:p>`;
      const paragraphs = wrapText(chunk, 95).map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('');
      return `${title}${paragraphs}<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    }).join('');
    zip.folder('word')!.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);

    const docx = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const written = await writeBytes(outputPath || outputPathFor(resolvedInput, '-export', '.docx'), docx);
    return { content: [{ type: 'text', text: `Exported PDF text to ${written}` }] };
  }
);

server.registerTool(
  'pdf_to_ppt',
  {
    description: 'Export a PDF to a text-focused PPTX. Each PDF page becomes one slide with extractable text.',
    inputSchema: z.object({ inputPath: z.string(), outputPath: z.string().optional() })
  },
  async ({ inputPath, outputPath }) => {
    const resolvedInput = resolvePath(inputPath);
    const buffer = await readFileBuffer(resolvedInput);
    const parsed = await pdfParse(buffer);
    const pageCount = parsed.numpages || await getPdfPageCount(resolvedInput);
    const chunks = chunkText(parsed.text || '', pageCount);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'PDF Modify MCP';

    chunks.forEach((chunk, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      slide.addText(`Page ${index + 1}`, { x: 0.5, y: 0.35, w: 12.2, h: 0.4, fontFace: 'Aptos', fontSize: 20, bold: true, color: '182230' });
      slide.addText(wrapText(chunk || `Page ${index + 1}`, 90).join('\n'), { x: 0.7, y: 1.0, w: 11.9, h: 5.8, fontFace: 'Aptos', fontSize: 14, color: '344054', breakLine: false, fit: 'shrink' });
    });

    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    const written = await writeBytes(outputPath || outputPathFor(resolvedInput, '-export', '.pptx'), pptxBuffer);
    return { content: [{ type: 'text', text: `Exported PDF text slides to ${written}` }] };
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
