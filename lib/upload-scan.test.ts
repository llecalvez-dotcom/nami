import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { isHeic, prepareUploadFile } from "@/lib/upload-scan";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nami-upload-scan-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("prepareUploadFile", () => {
  it("shrinks a large scan into a temporary JPEG of at most 2000 px, deleted by cleanup", async () => {
    const big = join(root, "scan.png");
    await sharp({ create: { width: 3000, height: 2200, channels: 3, background: "#ccc" } }).png().toFile(big);
    const prepared = await prepareUploadFile(big);
    expect(prepared.path).not.toBe(big);
    expect(prepared.path.startsWith(tmpdir())).toBe(true);
    expect(prepared.path).not.toContain(root);
    const meta = await sharp(prepared.path).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(1467);
    await prepared.cleanup();
    await expect(access(prepared.path)).rejects.toThrow();
  });

  it("keeps a small image, a PDF and an unreadable file as they are", async () => {
    const small = join(root, "small.jpg");
    await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ccc" } }).jpeg().toFile(small);
    expect((await prepareUploadFile(small)).path).toBe(small);
    const pdf = join(root, "scan.pdf");
    await writeFile(pdf, "%PDF-1.4");
    expect((await prepareUploadFile(pdf)).path).toBe(pdf);
    const broken = join(root, "broken.jpg");
    await writeFile(broken, "not an image");
    expect((await prepareUploadFile(broken)).path).toBe(broken);
  });

  it.runIf(process.platform === "darwin")("converts an iPhone HEIC photo saved under a .jpg name into a real JPEG, deleted by cleanup", async () => {
    const png = join(root, "face.png");
    await sharp({ create: { width: 3024, height: 4032, channels: 3, background: "#d9c3a5" } }).png().toFile(png);
    const disguised = join(root, "photo.jpg");
    execFileSync("/usr/bin/sips", ["-s", "format", "heic", png, "--out", disguised], { stdio: "ignore" });
    expect(await isHeic(disguised)).toBe(true);
    const prepared = await prepareUploadFile(disguised);
    expect(prepared.path).not.toBe(disguised);
    expect(prepared.path.startsWith(tmpdir())).toBe(true);
    const meta = await sharp(prepared.path).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(2000);
    await prepared.cleanup();
    await expect(access(prepared.path)).rejects.toThrow();
  });

  it("does not take a JPEG, a PNG or a PDF for a HEIC", async () => {
    const jpg = join(root, "a.jpg");
    await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ccc" } }).jpeg().toFile(jpg);
    const pdf = join(root, "b.pdf");
    await writeFile(pdf, "%PDF-1.4 hello");
    expect(await isHeic(jpg)).toBe(false);
    expect(await isHeic(pdf)).toBe(false);
    expect(await isHeic(join(root, "missing.jpg"))).toBe(false);
  });
});
