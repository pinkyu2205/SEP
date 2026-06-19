import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export interface ContractExtracted {
  contractCode: string;
  ownerName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  totalRentAmount: number;
  address: string;
  areaSize: number;
}

/** Chuyển "Ngày 14 tháng 06 năm 2026" → "2026-06-14" */
function parseViDate(src: string): string {
  const m = src.match(/Ng[àa]y\s+(\d{1,2})\s+th[áa]ng\s+(\d{1,2})\s+n[ăa]m\s+(\d{4})/i);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "20.000.000" hoặc "20000000" → 20000000 */
function parseAmount(src: string): number {
  return Number(src.replace(/[.\s]/g, '').replace(/,/g, '')) || 0;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str).join(' '));
  }
  return pages.join('\n');
}

async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

function parseContractText(text: string): ContractExtracted {
  const contractCodeMatch =
    text.match(/S[ốo]\s*([\w\/\-\.]+(?:\/\w+)+)/i) ||
    text.match(/HỢP ĐỒNG[^\n]*?[Ss]ố[:\s]*([\w\/\-]+)/i);
  const contractCode = contractCodeMatch ? contractCodeMatch[1].trim() : '';

  const ownerMatch = text.match(/T[êe]n t[ổo] ch[ứu]c.*?:\s*([^\n,;–\-]+)/i);
  const ownerName = ownerMatch
    ? ownerMatch[1].replace(/[–\-].*$/, '').replace(/[Đđ][iị]a\s+ch[iị].*$/i, '').trim()
    : '';

  const addressMatch = text.match(/[Vv][ịi] tr[íi].*?nh[àa] [ởo]:\s*([^\n]+)/i);
  const address = addressMatch ? addressMatch[1].split(',')[0].trim() : '';

  const startMatch = text.match(/[Tt]h[ờo]i [Đđ]i[ểe]m b[ắa]t [đd][ầa]u[:\s]*([^\n]+)/i);
  const startDate = startMatch ? parseViDate(startMatch[1]) : '';

  const endMatch = text.match(/[Tt]h[ờo]i [Đđ]i[ểe]m k[ếe]t th[úu]c[:\s]*([^\n]+)/i);
  const endDate = endMatch ? parseViDate(endMatch[1]) : '';

  // Lấy tổng số tiền thuê trong suốt hợp đồng
  const rentMatch = text.match(/[Tt][ổo]ng[^\n]*?thu[êe][^\n]*?([\d\.\,]+)\s*VN[ĐD]/i)
    || text.match(/[Tt][ổo]ng[^\n]*?ti[eề]n[^\n]*?([\d\.\,]+)\s*VN[ĐD]/i)
    || text.match(/[Gg]i[áa] thu[êe][^\n]*?([\d\.\,]+)\s*VN[ĐD]/i);
  const totalRentAmount = rentMatch ? parseAmount(rentMatch[1]) : 0;

  const areaMatch =
    text.match(/[Tt][ổo]ng di[ệe]n t[íi]ch[^:]*:\s*(\d+)/i) ||
    text.match(/[Dd]i[ệe]n t[íi]ch[^:]*nh[àa] [ởo][^:]*:\s*(\d+)/i);
  const areaSize = areaMatch ? Number(areaMatch[1]) : 0;

  return { contractCode, ownerName, startDate, endDate, totalRentAmount, address, areaSize };
}

export async function extractContractData(file: File): Promise<ContractExtracted> {
  const isDocx =
    file.name.toLowerCase().endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const text = isDocx
    ? await extractTextFromDocx(file)
    : await extractTextFromPdf(file);

  return parseContractText(text);
}
