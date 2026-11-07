import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/documents/extract-found/route";
import { configuredReader } from "@/lib/passport";
import { documentFilePaths, findDocuments } from "@/lib/documents";
import { mrzCheckDigit } from "@/lib/mrz";
import { resetGuards } from "@/lib/api-guard";
import { proxy } from "@/proxy";

vi.mock("@/lib/passport", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/passport")>(),
  configuredReader: vi.fn(),
}));

// Fictitious document and image bytes only.
const numberPart = "24AZ12345" + mrzCheckDigit("24AZ12345");
const birthPart = "900412" + mrzCheckDigit("900412");
const expiryPart = "300202" + mrzCheckDigit("300202");
const optionalPart = "<".repeat(14) + "0";
const SPECIMEN = {
  surname: "DUPONT", given_names: "Camille", nationality: "FR", birth_date: "1990-04-12",
  passport_number: "24AZ12345", issue_date: "2020-02-03", expiry_date: "2030-02-02",
  mrz_line1: "P<FRADUPONT<<CAMILLE".padEnd(44, "<"),
  mrz_line2: numberPart + "FRA" + birthPart + "F" + expiryPart + optionalPart
    + mrzCheckDigit(numberPart + birthPart + expiryPart + optionalPart),
  confidence: { surname: 0.9, passport_number: 0.8 },
};
const read = vi.fn();
let root: string;

async function call(body: unknown, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body);
  return POST(new Request("http://localhost/api/documents/extract-found", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(text)), ...headers },
    body: text,
  }));
}

async function fakeFile(name = "passeport-scan.jpg", bytes = Buffer.from("fictitious image bytes")) {
  await writeFile(join(root, name), bytes);
  const files = await findDocuments();
  return files.find((file) => file.name === name)!;
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "nami-auto-passport-")));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NAMI_DOCUMENTS_DIR", root);
  vi.stubEnv("NAMI_ACCESS_CODE", "");
  read.mockReset().mockResolvedValue(JSON.stringify(SPECIMEN));
  vi.mocked(configuredReader).mockReturnValue({ name: "h", read });
  resetGuards();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("POST /api/documents/extract-found", () => {
  it.each(["", "relative", "production"])("returns 404 when disabled: %s", async (setting) => {
    if (setting === "production") vi.stubEnv("NODE_ENV", "production");
    else vi.stubEnv("NAMI_DOCUMENTS_DIR", setting);
    const response = await call({ id: "unknown", consent_provider: "h" });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const proxied = await proxy(new NextRequest("http://localhost/api/documents/extract-found", { method: "POST" }));
    expect(proxied.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it("requires access authentication when enabled", async () => {
    vi.stubEnv("NAMI_ACCESS_CODE", "fictitious code");
    expect((await proxy(new NextRequest("http://localhost/api/documents/extract-found", { method: "POST" }))).status).toBe(401);
  });

  it.each(["unknown", "../", "/absolute/passport.jpg"])("rejects unknown and path-like ids: %s", async (id) => {
    expect((await call({ id, consent_provider: "h" })).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "anthropic"])("requires matching consent: %s", async (consent_provider) => {
    const file = await fakeFile();
    const response = await call({ id: file.id, consent_provider });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Confirm that the photo may be sent to H Company first." });
    expect(read).not.toHaveBeenCalled();
  });

  it("reads only the selected file and returns the shared MRZ extraction without paths or raw MRZ", async () => {
    await writeFile(join(root, "photo.jpg"), "different fake image");
    const bytes = Buffer.from("selected fictitious image");
    const file = await fakeFile("passeport-scan.png", bytes);
    const response = await call({ id: file.id, consent_provider: "h" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(read).toHaveBeenCalledExactlyOnceWith({ base64: bytes.toString("base64"), mimeType: "image/png" });
    const text = await response.text();
    expect(text).not.toContain(root);
    expect(text).not.toContain(file.name);
    expect(text).not.toContain("mrz_line");
    const result = JSON.parse(text);
    expect(result.fields.passport_number).toBe(SPECIMEN.passport_number);
    expect(result.mrz_verified).toHaveLength(6);
    expect(result.confidence_per_field.passport_number).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("flags an MRZ disagreement without replacing the printed value", async () => {
    const file = await fakeFile();
    read.mockResolvedValue(JSON.stringify({ ...SPECIMEN, passport_number: "24A212345" }));
    const result = await (await call({ id: file.id, consent_provider: "h" })).json();
    expect(result.fields.passport_number).toBe("24A212345");
    expect(result.confidence_per_field.passport_number).toBe(0.3);
    expect(result.warnings).toContainEqual(expect.stringContaining("Passport number:"));
  });

  it.each([
    ["passport.pdf", 16, 415], ["passport.heic", 16, 415],
    ["passport.jpg", 0, 400], ["passport.jpg", 5 * 1024 * 1024 + 1, 413],
  ])("enforces upload image limits for %s (%s bytes)", async (name, size, status) => {
    const file = await fakeFile(name);
    await truncate(join(root, name), size);
    expect((await call({ id: file.id, consent_provider: "h" })).status).toBe(status);
    expect(read).not.toHaveBeenCalled();
  });

  it("returns 503 without calling a reader when automatic reading is off", async () => {
    const file = await fakeFile();
    vi.mocked(configuredReader).mockReturnValue(null);
    expect((await call({ id: file.id, consent_provider: "h" })).status).toBe(503);
    expect(read).not.toHaveBeenCalled();
  });

  it("returns a generic failure without leaking reader errors into logs or responses", async () => {
    const file = await fakeFile();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    read.mockRejectedValue(new Error(`${root}/${file.name}: private fields`));
    const response = await call({ id: file.id, consent_provider: "h" });
    expect(response.status).toBe(502);
    const output = await response.text() + JSON.stringify(log.mock.calls);
    expect(output).not.toContain(root);
    expect(output).not.toContain(file.name);
    expect(output).not.toContain("private fields");
  });

  it("enforces the existing extraction guard and rejects malformed requests", async () => {
    const request = new Request("http://localhost/api/documents/extract-found", { method: "POST", body: "{}" });
    expect((await POST(request)).status).toBe(411);
    expect((await call({})).status).toBe(400);
    expect((await call({ id: "unknown" }, { "Content-Length": String(6 * 1024 * 1024) })).status).toBe(413);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("documentFilePaths", () => {
  it("returns validated paths only on the server, deduplicates ids and accepts an empty selection", async () => {
    const file = await fakeFile();
    expect(await documentFilePaths([file.id, file.id])).toEqual([join(root, file.name)]);
    expect(await documentFilePaths([])).toEqual([]);
    expect(await documentFilePaths([file.id, "unknown"])).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(await documentFilePaths([file.id])).toBeNull();
  });

  it("refuses a file replaced by an escaping symlink", async () => {
    const file = await fakeFile();
    await rm(join(root, file.name));
    await symlink(join(tmpdir(), "outside-fictitious-passport.jpg"), join(root, file.name));
    expect(await documentFilePaths([file.id])).toBeNull();
    expect((await call({ id: file.id, consent_provider: "h" })).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
});
