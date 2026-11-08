import { describe, expect, it } from "vitest";
import { refuseUpload, sniffUploadType, uploadFileName } from "@/lib/document-upload";

const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(8)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(16)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const pdf = Buffer.from("%PDF-1.7 fictitious bytes");

describe("upload type sniffing", () => {
  it.each([
    [jpeg, "jpg"], [png, "png"], [pdf, "pdf"], [heic, "heic"],
    [Buffer.from("GIF89a fictitious"), null], [Buffer.from([0xff, 0xd8]), null], [Buffer.alloc(0), null],
  ])("reads the first bytes, never the name", (bytes, type) => {
    expect(sniffUploadType(new Uint8Array(bytes))).toBe(type);
  });

  it("takes a HEIC photo of an iPhone saved under a .jpg name for what it is", () => {
    expect(refuseUpload("photo", new Uint8Array(heic))).toEqual({ kind: "photo", type: "heic" });
  });

  it("refuses by kind: images only for the photo, PDF only for the return ticket", () => {
    expect(refuseUpload("passport", new Uint8Array(pdf))).toEqual({ kind: "passport", type: "pdf" });
    expect(refuseUpload("photo", new Uint8Array(pdf))).toEqual({ error: "Send a JPEG, PNG or HEIC photo.", status: 415 });
    expect(refuseUpload("return_ticket", new Uint8Array(png))).toEqual({ error: "Send a PDF.", status: 415 });
    expect(refuseUpload("return_ticket", new Uint8Array(pdf))).toEqual({ kind: "return_ticket", type: "pdf" });
    expect(refuseUpload(null, new Uint8Array(jpeg))).toEqual({ error: "Unsupported document kind.", status: 400 });
    expect(refuseUpload("passport", new Uint8Array(10 * 1024 * 1024 + 1))).toEqual({ error: "File too large (10 MB max).", status: 413 });
  });
});

describe("upload file names", () => {
  it("are safe, prefixed by the kind and dated", () => {
    const name = uploadFileName("return_ticket", "pdf", new Date("2026-11-08T02:15:30.123Z"));
    expect(name).toBe("uploaded-return-ticket-2026-11-08T02-15-30-123.pdf");
    expect(name).toMatch(/^[a-z0-9.-]+$/i);
    expect(uploadFileName("photo", "jpg", new Date("2026-11-08T02:15:30.123Z"))).toBe("uploaded-photo-2026-11-08T02-15-30-123.jpg");
  });
});
