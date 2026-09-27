import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and embedded newlines", () => {
    const rows = parseCsv('name,notes\r\n"Chen, Sarah","Said ""yes""\nthen left"\r\nRaj,ok\r\n');
    expect(rows).toEqual([
      ["name", "notes"],
      ["Chen, Sarah", 'Said "yes"\nthen left'],
      ["Raj", "ok"],
    ]);
  });

  it("skips blank lines and strips a UTF-8 BOM", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvObjects", () => {
  it("normalizes header names", () => {
    const [row] = parseCsvObjects("First Name,E-mail Address\nLena , lena@example.com\n");
    expect(row).toEqual({ first_name: "Lena", e_mail_address: "lena@example.com" });
  });

  it("returns [] for empty input", () => {
    expect(parseCsvObjects("")).toEqual([]);
  });
});

describe("toCsv", () => {
  it("escapes delimiters and neutralizes formula injection", () => {
    const csv = toCsv([{ name: 'Acme, "Inc"', formula: "=HYPERLINK(evil)", tags: ["a", "b"] }], [
      { key: "name", label: "Name" },
      { key: "formula", label: "Formula" },
      { key: "tags", label: "Tags" },
    ]);
    expect(csv).toBe('Name,Formula,Tags\r\n"Acme, ""Inc""",\'=HYPERLINK(evil),a; b\r\n');
  });

  it("round-trips through the parser", () => {
    const rows = [{ a: "x\ny", b: "plain" }];
    const parsed = parseCsvObjects(toCsv(rows, [{ key: "a", label: "a" }, { key: "b", label: "b" }]));
    expect(parsed).toEqual([{ a: "x\ny", b: "plain" }]);
  });
});
