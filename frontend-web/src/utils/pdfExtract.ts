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

// =============================================================================
// Bóc tách HỢP ĐỒNG KHÁCH THUÊ (tenant contract) — dùng cho luồng tạo draft v2.
// Khác extractContractData ở trên (vốn cho HĐ master-lease / chủ nhà): ở đây lấy
// thông tin BÊN THUÊ (Bên B): họ tên, CCCD, SĐT + giá thuê, cọc, thời hạn, địa chỉ.
// Regex bám theo mẫu HĐ chuẩn; admin LUÔN review/chỉnh lại sau khi auto-điền.
// =============================================================================

export interface TenantContractExtracted {
  tenantName: string;
  tenantCccd: string;
  tenantPhone: string;
  rentAmount: number;
  deposit: number;
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
  address: string;
}

/** "01/08/2026" hoặc "01-08-2026" → "2026-08-01" */
function parseSlashDate(src: string): string {
  const m = src.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseTenantContractText(text: string): TenantContractExtracted {
  // Cô lập khối "Bên Thuê / Bên B" để không nhầm sang thông tin Bên A (chủ nhà).
  const startMatch = text.match(/B[êe]n\s*Thu[êe]|B[êe]n\s*B\b/i);
  const startIdx = startMatch && startMatch.index != null ? startMatch.index : 0;
  const rest = text.slice(startIdx + 5);
  const stopMatch = rest.match(/Ng[uư][ờo]i\s*[ởo]\s*c[uù]ng|Sau khi b[àa]n b[ạa]c|Đi[ềe]u\s*1/i);
  const endIdx = stopMatch && stopMatch.index != null ? startIdx + 5 + stopMatch.index : text.length;
  const block = text.slice(startIdx, endIdx);

  const nameMatch = block.match(/[ÔO]ng\s*\/?\s*b[àa]\s*[:.]?\s*([^\n]+)/i);
  const tenantName = nameMatch
    ? nameMatch[1].replace(/\.{2,}.*$/, '').replace(/\s{2,}.*$/, '').trim()
    : '';

  const cccdMatch = block.match(/S[ốo]\s*CCCD\s*[:.]?\s*([0-9]{6,})/i);
  const tenantCccd = cccdMatch ? cccdMatch[1].trim() : '';

  const phoneMatch = block.match(/[ĐD]i[ệe]n\s*tho[ạa]i\s*[:.]?\s*([0-9][0-9\s.]{7,})/i);
  const tenantPhone = phoneMatch ? phoneMatch[1].replace(/[\s.]/g, '').trim() : '';

  const rentMatch =
    text.match(/[Tt]i[eề]n\s*thu[êe][^\n]*?th[áa]ng[^\n]*?([\d.,]+)\s*VN?[ĐD]/i) ||
    text.match(/[Gg]i[áa]\s*thu[êe][^\n]*?([\d.,]+)\s*VN?[ĐD]/i);
  const rentAmount = rentMatch ? parseAmount(rentMatch[1]) : 0;

  const depositMatch =
    text.match(/[đĐ]ặt\s*c[ọo]c[^\n]*?kho[ảa]n\s*ti[eề]n\s*l[àa]\s*[:.]?\s*([\d.,]+)\s*VN?[ĐD]/i) ||
    text.match(/[đĐ]ặt\s*c[ọo]c[^\n]*?([\d.,]+)\s*VN?[ĐD]/i);
  const deposit = depositMatch ? parseAmount(depositMatch[1]) : 0;

  const rangeMatch = text.match(
    /t[íi]nh\s*t[ừu]\s*ng[àa]y\s*[:.]?\s*([\d/\-.]+)[^\d]*?đ[ếe]n\s*ng[àa]y\s*[:.]?\s*([\d/\-.]+)/i,
  );
  const startDate = rangeMatch ? parseSlashDate(rangeMatch[1]) : '';
  const endDate = rangeMatch ? parseSlashDate(rangeMatch[2]) : '';

  const addrMatch =
    text.match(/nh[àa]\s*t[ạa]i\s*(?:đ[ịi]a\s*ch[ỉi])?\s*[:.]?\s*([^\n]+)/i) ||
    text.match(/c[ăa]n\s*h[ộo][^\n:]*s[ốo]\s*[:.]?\s*([^\n]+)/i);
  const address = addrMatch ? addrMatch[1].split(/[,;]/)[0].replace(/\.{2,}.*$/, '').trim() : '';

  return { tenantName, tenantCccd, tenantPhone, rentAmount, deposit, startDate, endDate, address };
}

export async function extractTenantContractData(file: File): Promise<TenantContractExtracted> {
  const isDocx =
    file.name.toLowerCase().endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const text = isDocx
    ? await extractTextFromDocx(file)
    : await extractTextFromPdf(file);

  return parseTenantContractText(text);
}
