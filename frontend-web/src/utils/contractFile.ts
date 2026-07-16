// Mở file hợp đồng tải từ BE (GET /tenant-contracts/{id}/document/download).
// BE đã chuyển sang render PDF (xem FE-draft-contract-pdf.md) nhưng HĐ cũ có thể
// còn file DOCX trên Cloudinary — MIME phải đọc từ Content-Type response (axios
// gán vào blob.type), KHÔNG hard-code.

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Đóng File từ blob POST .../draft-document để upload Cloudinary. Spec mới là PDF,
 * nhưng nhận diện magic bytes thay vì tin header — nếu BE chưa deploy bản PDF thì
 * blob vẫn là DOCX (zip, mở đầu "PK"), đặt nhầm đuôi .pdf sẽ hỏng file lưu về sau.
 */
export async function draftBlobToFile(blob: Blob, contractCode: string): Promise<File> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK" — DOCX là file zip
  return new File([blob], `DRAFT-${contractCode}.${isZip ? 'docx' : 'pdf'}`, {
    type: isZip ? WORD_MIME : 'application/pdf',
  });
}

/**
 * PDF → mở preview tab mới (browser render được); DOCX cũ → tải về với tên file
 * đọc được thay vì hash blob. `contractCode` chỉ dùng làm tên file fallback.
 */
export function openContractBlob(blob: Blob, contractCode?: string | null): void {
  // Một số server/proxy trả octet-stream — file mới mặc định là PDF theo spec BE.
  const mime = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'application/pdf';
  const isPdf = mime.includes('pdf');
  const typed = blob.type === mime ? blob : new Blob([blob], { type: mime });
  const url = URL.createObjectURL(typed);

  if (isPdf) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contractCode || 'contract'}.${mime === WORD_MIME ? 'docx' : 'bin'}`;
    a.click();
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
