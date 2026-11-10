import type { Attachment } from "./types";

const TEXT_EXT = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|rb|php|html|css|sql|sh|yml|yaml|xml|log)$/i;

export function acceptAttr(allowPdf: boolean) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif", allowPdf ? "application/pdf" : "", ".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.sql,.sh,.yml,.yaml,.xml,.log"].filter(Boolean).join(",");
}

export async function readAttachment(file: File, maxMb: number, allowPdf: boolean): Promise<Attachment> {
  if (file.size > maxMb * 1024 * 1024) throw new Error(`${file.name} is larger than ${maxMb} MB.`);
  if (file.type.startsWith("image/") && /^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
    return { name: file.name, mime: file.type, data: await toBase64(file) };
  }
  if (file.type === "application/pdf") {
    if (!allowPdf) throw new Error("PDF analysis needs the Gemini provider.");
    return { name: file.name, mime: file.type, data: await toBase64(file) };
  }
  if (file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(file.name)) {
    const text = (await file.text()).slice(0, 120_000);
    return { name: file.name, mime: "text/plain", text };
  }
  throw new Error(`${file.name}: unsupported file type.`);
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}
