declare module "pdf-parse/lib/pdf-parse.js" {
  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    text: string;
    version: string;
  }
  function pdf(buffer: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PDFInfo>;
  export default pdf;
}
