import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, realpath, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { documentsEnabled, findDocuments, resolveDocumentPath } from "@/lib/documents";
import { GET as find } from "@/app/api/documents/find/route";
import { GET as preview } from "@/app/api/documents/preview/route";
import { resetGuards } from "@/lib/api-guard";
import { proxy } from "@/proxy";

let base: string;
let root: string;
const request = (path: string) => new Request(`http://localhost/api/documents/${path}`);

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "nami-fictitious-documents-")));
  root = join(base, "documents");
  await mkdir(root);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NAMI_DOCUMENTS_DIR", root);
  vi.stubEnv("NAMI_ACCESS_CODE", "");
  resetGuards();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(base, { recursive: true, force: true });
});

async function fakeImage(name = "passeport-scan.jpg") {
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#abcdef" },
  }).jpeg().toBuffer();
  await writeFile(join(root, name), bytes);
}

describe("local documents", () => {
  it.each([
    { NAMI_DOCUMENTS_DIR: "", NODE_ENV: "development" },
    { NAMI_DOCUMENTS_DIR: "relative", NODE_ENV: "development" },
    { NAMI_DOCUMENTS_DIR: "/configured", NODE_ENV: "production" },
  ])("is disabled for %j in routes and proxy", async (env) => {
    vi.stubEnv("NAMI_DOCUMENTS_DIR", env.NAMI_DOCUMENTS_DIR);
    vi.stubEnv("NODE_ENV", env.NODE_ENV);
    expect(documentsEnabled(env)).toBe(false);
    for (const [handler, path] of [[find, "find?kind=passport"], [preview, "preview?id=../"]] as const) {
      const response = await handler(request(path));
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect((await proxy(new NextRequest(request(path)))).status).toBe(404);
    }
  });

  it("keeps access-code protection when enabled", async () => {
    vi.stubEnv("NAMI_ACCESS_CODE", "fictitious code");
    expect((await proxy(new NextRequest(request("find?kind=passport")))).status).toBe(401);
  });

  it("discovers availability without scanning or invalidating a selected token", async () => {
    await fakeImage();
    const [file] = await findDocuments();
    const response = await find(request("find"));
    expect(await response.json()).toEqual({ enabled: true });
    expect(await resolveDocumentPath(file.id)).toBe(join(root, file.name));
  });

  it("ranks by file name, ignores oversized and unsupported files, and returns only relative metadata", async () => {
    for (const name of ["photo.jpg", "scan-facture.pdf", "passeport-scan.jpg", "passport.exe", "passport-huge.png"]) {
      await writeFile(join(root, name), "fictitious");
    }
    await truncate(join(root, "passport-huge.png"), 10 * 1024 * 1024 + 1);
    const response = await find(request("find?kind=passport"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain(root);
    expect(text).not.toContain(base);
    const { documents } = JSON.parse(text);
    expect(documents.map((file: { name: string }) => file.name)).toEqual([
      "passeport-scan.jpg", "scan-facture.pdf", "photo.jpg",
    ]);
    expect(documents[0]).toMatchObject({ folder: ".", score: 110, size_bytes: 10 });
    expect(documents[0].id).toMatch(/^[a-f0-9]{48}$/);
  });

  it("includes two subfolder levels, excludes deeper files, and caps results at five", async () => {
    const second = join(root, "one", "two");
    await mkdir(join(second, "three"), { recursive: true });
    await writeFile(join(second, "passport.jpg"), "fake");
    await writeFile(join(second, "three", "passport-deep.jpg"), "fake");
    for (let n = 0; n < 6; n++) await writeFile(join(root, `photo-${n}.png`), "fake");
    const files = await findDocuments();
    expect(files).toHaveLength(5);
    expect(files[0]).toMatchObject({ name: "passport.jpg", folder: join("one", "two") });
    expect(files.some((file) => file.name.includes("deep"))).toBe(false);
  });

  it("shares opaque tokens across module instances and refreshes them on the next search", async () => {
    await fakeImage();
    const [file] = await findDocuments();
    vi.resetModules();
    const otherInstance = await import("@/lib/documents");
    expect(await otherInstance.resolveDocumentPath(file.id)).toBe(join(root, file.name));
    await otherInstance.findDocuments();
    expect(await resolveDocumentPath(file.id)).toBeNull();
  });

  it("returns an empty list for an empty directory and generic errors for missing folders", async () => {
    expect(await (await find(request("find?kind=passport"))).json()).toEqual({ documents: [] });
    expect((await find(request("find?kind=other"))).status).toBe(400);
    vi.stubEnv("NAMI_DOCUMENTS_DIR", join(base, "missing"));
    const response = await find(request("find?kind=passport"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(base);
  });
});

describe("document previews and path resolution", () => {
  it.each(["unknown", "../", "/etc/passwd", "a".repeat(48)])("refuses an unknown or path-like id: %s", async (id) => {
    const response = await preview(request(`preview?id=${encodeURIComponent(id)}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await resolveDocumentPath(id)).toBeNull();
    expect(await response.text()).not.toContain(root);
  });

  it("downscales a fake image without metadata and returns no-store", async () => {
    await fakeImage();
    const [file] = await findDocuments();
    const response = await preview(request(`preview?id=${file.id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    expect(metadata.width).toBe(480);
    expect(metadata.height).toBe(360);
    expect(metadata.exif).toBeUndefined();
    expect(bytes.includes(Buffer.from(root))).toBe(false);
  });

  it.each(["pdf", "heic", "jpg"])("rejects non-previewable or corrupt %s files", async (extension) => {
    await writeFile(join(root, `passport.${extension}`), "fictitious");
    const [file] = await findDocuments();
    const response = await preview(request(`preview?id=${file.id}`));
    expect(response.status).toBe(415);
    expect(await response.text()).not.toContain(root);
  });

  it("ignores escaping file and directory symlinks", async () => {
    const outside = join(base, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "passport.jpg"), "fake");
    await symlink(join(outside, "passport.jpg"), join(root, "passport-link.jpg"));
    await symlink(outside, join(root, "linked-folder"));
    expect(await findDocuments()).toEqual([]);
  });

  it("rechecks realpaths when a previously found file is replaced with an escaping symlink", async () => {
    await fakeImage();
    const [file] = await findDocuments();
    const outside = join(base, "outside.jpg");
    await rename(join(root, file.name), outside);
    await symlink(outside, join(root, file.name));
    expect(await resolveDocumentPath(file.id)).toBeNull();
    expect((await preview(request(`preview?id=${file.id}`))).status).toBe(404);
  });

  it("refuses stale tokens after the configured directory changes or the feature is disabled", async () => {
    await fakeImage();
    const [file] = await findDocuments();
    vi.stubEnv("NAMI_DOCUMENTS_DIR", base);
    expect(await resolveDocumentPath(file.id)).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(await resolveDocumentPath(file.id)).toBeNull();
  });
});
