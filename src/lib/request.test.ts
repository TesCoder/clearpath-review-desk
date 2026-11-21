import { describe, expect, it } from "vitest";
import { isSameOrigin, readJsonObject } from "./request";

const post = (headers: Record<string, string>, body = "{}") => new Request("https://desk.example/api", { method: "POST", headers, body });

describe("same-origin check", () => {
  it("accepts the site's own https origin", () => {
    expect(isSameOrigin(post({ origin: "https://desk.example", host: "desk.example" }))).toBe(true);
  });

  it("refuses another host, a missing origin, and an origin that cannot be parsed", () => {
    expect(isSameOrigin(post({ origin: "https://evil.example", host: "desk.example" }))).toBe(false);
    expect(isSameOrigin(post({ host: "desk.example" }))).toBe(false);
    expect(isSameOrigin(post({ origin: "null", host: "desk.example" }))).toBe(false);
  });

  it("refuses the same host over plain http, except on this machine", () => {
    expect(isSameOrigin(post({ origin: "http://desk.example", host: "desk.example" }))).toBe(false);
    expect(isSameOrigin(post({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(isSameOrigin(post({ origin: "http://127.0.0.1:3411", host: "127.0.0.1:3411" }))).toBe(true);
  });
});

describe("reading a JSON body with a byte limit", () => {
  it("returns the object when it fits", async () => {
    expect(await readJsonObject(post({}, JSON.stringify({ ref: "AD-1041" })), 1000)).toEqual({ ref: "AD-1041" });
  });

  it("refuses a body over the limit, whatever its declared length says", async () => {
    const big = JSON.stringify({ ref: "x".repeat(5000) });
    expect(await readJsonObject(post({}, big), 1000)).toBeNull();
    expect(await readJsonObject(post({ "content-length": "10" }, big), 1000)).toBeNull();
  });

  it("counts bytes, not characters", async () => {
    const body = JSON.stringify({ body: "\u{1F600}".repeat(300) }); // 300 characters pairs, 1,200 bytes
    expect(await readJsonObject(post({}, body), 1000)).toBeNull();
  });

  it("refuses what is not a JSON object", async () => {
    for (const body of ["", "not json", "[1,2]", "null", '"text"']) {
      expect(await readJsonObject(post({}, body), 1000), body).toBeNull();
    }
  });
});
