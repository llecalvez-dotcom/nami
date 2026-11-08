import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/documents/upload/route";
import { API_LIMITS, resetGuards } from "@/lib/api-guard";
import { UPLOAD_FOLDER } from "@/lib/document-upload";
import { findDocuments, resolveDocumentPath } from "@/lib/documents";
import { proxy } from "@/proxy";

// Fictitious bytes only: the first bytes of each format, then filler.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fictitious jpeg body")]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fictitious png body")]);
const PDF = Buffer.from("%PDF-1.4 fictitious ticket body");
const TEXT = Buffer.from("this is not a document at all");
let base: string;
let root: string;

async function call(fields: { kind?: string; file?: { bytes: Buffer; name: string; type?: string } }, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (fields.kind !== undefined) form.set("kind", fields.kind);
  if (fields.file) form.set("file", new Blob([new Uint8Array(fields.file.bytes)], { type: fields.file.type ?? "" }), fields.file.name);
  const encoded = new Request("http://localhost/api/documents/upload", { method: "POST", body: form });
  const body = await encoded.arrayBuffer();
  return POST(new Request("http://localhost/api/documents/upload", {
    method: "POST",
    headers: { "Content-Type": encoded.headers.get("Content-Type")!, "Content-Length": String(body.byteLength), ...headers },
    body,
  }));
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "nami-fictitious-upload-")));
  root = join(base, "documents");
  await (await import("node:fs/promises")).mkdir(root);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NAMI_DOCUMENTS_DIR", root);
  vi.stubEnv("NAMI_ACCESS_CODE", "");
  resetGuards();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(base, { recursive: true, force: true });
});

describe("POST /api/documents/upload", () => {
  it("saves a passport scan under a name of its own and answers like the search does", async () => {
    const response = await call({ kind: "passport", file: { bytes: JPEG, name: "../../evil name.jpg", type: "image/jpeg" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const document = await response.json();
    expect(document).toEqual({
      id: expect.stringMatching(/^[a-f0-9]{48}$/),
      name: expect.stringMatching(/^uploaded-passport-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}-[0-9a-f]{4}\.jpg$/),
      folder: UPLOAD_FOLDER,
      size_bytes: JPEG.byteLength,
      modified_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      score: 100,
    });
    // The folder holds the one file, named by Nami: the client's name never reaches the disk.
    expect(await readdir(root)).toEqual([UPLOAD_FOLDER]);
    expect(await readdir(join(root, UPLOAD_FOLDER))).toEqual([document.name]);
    // Usable right away by the routes that take a token, and found by the next search like any other file.
    expect(await resolveDocumentPath(document.id, "passport")).toBe(join(root, UPLOAD_FOLDER, document.name));
    expect(await resolveDocumentPath(document.id, "photo")).toBeNull();
    const found = await findDocuments("passport");
    expect(found).toEqual([expect.objectContaining({ name: document.name, folder: UPLOAD_FOLDER, score: 100 })]);
  });

  it("saves an ID photo and a PDF return ticket with their own prefixes", async () => {
    const photo = await (await call({ kind: "photo", file: { bytes: PNG, name: "me.png" } })).json();
    expect(photo.name).toMatch(/^uploaded-photo-.*\.png$/);
    expect(photo.score).toBe(100);
    const ticket = await (await call({ kind: "return_ticket", file: { bytes: PDF, name: "ticket.pdf" } })).json();
    expect(ticket.name).toMatch(/^uploaded-return-ticket-.*\.pdf$/);
    expect(ticket.score).toBe(100);
    expect((await findDocuments("photo")).map((d) => d.name)).toEqual([photo.name]);
    expect((await findDocuments("return_ticket")).map((d) => d.name)).toEqual([ticket.name]);
  });

  it.each([
    ["a text file as passport", { kind: "passport", file: { bytes: TEXT, name: "passport.jpg", type: "image/jpeg" } }, 415, "Send a JPEG, PNG or HEIC photo of your passport."],
    ["a PDF as passport, which the reader cannot read", { kind: "passport", file: { bytes: PDF, name: "passport.pdf" } }, 415, "Send a JPEG, PNG or HEIC photo of your passport."],
    ["a PDF as ID photo", { kind: "photo", file: { bytes: PDF, name: "photo.pdf" } }, 415, "Send a JPEG, PNG or HEIC photo."],
    ["a JPEG as return ticket", { kind: "return_ticket", file: { bytes: JPEG, name: "ticket.jpg" } }, 415, "Send a PDF."],
    ["an unknown kind", { kind: "visa", file: { bytes: JPEG, name: "x.jpg" } }, 400, "Unsupported document kind."],
    ["no kind", { file: { bytes: JPEG, name: "x.jpg" } }, 400, "Expected a multipart form with a file."],
    ["no file", { kind: "passport" }, 400, "Expected a multipart form with a file."],
    ["an empty file", { kind: "passport", file: { bytes: Buffer.alloc(0), name: "x.jpg" } }, 400, "No file received."],
  ])("refuses %s and writes nothing", async (_label, fields, status, error) => {
    const response = await call(fields);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(await readdir(root)).toEqual([]);
  });

  it("keeps the newest upload in the five files the search shows", async () => {
    const names: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      names.push((await (await call({ kind: "photo", file: { bytes: PNG, name: "me.png" } })).json()).name);
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    const found = (await findDocuments("photo")).map((d) => d.name);
    expect(found).toHaveLength(5);
    expect(found[0]).toBe(names[5]);
    expect(found).not.toContain(names[0]);
  });

  it("refuses a file over the limit before reading it, and a body without a length", async () => {
    const big = await call({ kind: "passport", file: { bytes: JPEG, name: "x.jpg" } }, { "Content-Length": String(API_LIMITS.upload + 1) });
    expect(big.status).toBe(413);
    const noLength = await POST(new Request("http://localhost/api/documents/upload", { method: "POST", body: new Uint8Array(JPEG), duplex: "half" } as RequestInit));
    expect(noLength.status).toBe(411);
    expect(await readdir(root)).toEqual([]);
  });

  it("refuses a body that is not a multipart form", async () => {
    const text = JSON.stringify({ kind: "passport" });
    const response = await POST(new Request("http://localhost/api/documents/upload", {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": String(text.length) }, body: text,
    }));
    expect(response.status).toBe(400);
  });

  it.each([
    ["no folder", { NAMI_DOCUMENTS_DIR: "" }],
    ["a relative folder", { NAMI_DOCUMENTS_DIR: "documents" }],
    ["production", { NODE_ENV: "production" }],
  ])("is 404 in the route and the proxy with %s", async (_label, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = await call({ kind: "passport", file: { bytes: JPEG, name: "x.jpg" } });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await proxy(new NextRequest("http://localhost/api/documents/upload", { method: "POST" }))).status).toBe(404);
  });

  it("fails cleanly when the configured folder does not exist", async () => {
    vi.stubEnv("NAMI_DOCUMENTS_DIR", join(base, "missing"));
    const response = await call({ kind: "passport", file: { bytes: JPEG, name: "x.jpg" } });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "The file could not be saved. Try again." });
  });

  it("requires the access code when one is set", async () => {
    vi.stubEnv("NAMI_ACCESS_CODE", "fictitious code");
    expect((await proxy(new NextRequest("http://localhost/api/documents/upload", { method: "POST" }))).status).toBe(401);
  });
});
