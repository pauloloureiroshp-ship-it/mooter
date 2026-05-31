// Wave 6 D1 — hardware-classification lib. node-env vitest; pure logic only.

import { describe, it, expect } from "vitest";
import { osFromUserAgent, gpuVendor, suggestHardware, ramClass } from "./hardware";

describe("osFromUserAgent", () => {
  it("classifies the major OS families", () => {
    expect(osFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("mac");
    expect(osFromUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe("windows");
    expect(osFromUserAgent("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(osFromUserAgent("weird-bot")).toBe("other");
    expect(osFromUserAgent("")).toBe("other");
  });
});

describe("gpuVendor (best-effort from WebGL renderer string)", () => {
  it("detects nvidia from name or GeForce/RTX markers", () => {
    expect(gpuVendor("NVIDIA GeForce RTX 4090")).toBe("nvidia");
    expect(gpuVendor("ANGLE (NVIDIA, GeForce GTX 1660)")).toBe("nvidia");
  });
  it("detects amd / radeon", () => {
    expect(gpuVendor("AMD Radeon RX 7900")).toBe("amd");
    expect(gpuVendor("Radeon Pro 560")).toBe("amd");
  });
  it("detects apple silicon", () => {
    expect(gpuVendor("Apple M3 Max")).toBe("apple");
  });
  it("detects intel integrated", () => {
    expect(gpuVendor("Intel(R) Iris(R) Xe Graphics")).toBe("intel");
  });
  it("unknown / empty → unknown", () => {
    expect(gpuVendor("")).toBe("unknown");
    expect(gpuVendor(null)).toBe("unknown");
    expect(gpuVendor("some mystery gpu")).toBe("unknown");
  });
});

describe("suggestHardware", () => {
  it("mac → mac_m_series regardless of gpu", () => {
    expect(suggestHardware("mac", null)).toBe("mac_m_series");
    expect(suggestHardware("mac", "Apple M2")).toBe("mac_m_series");
  });
  it("windows nvidia / unknown → windows_nvidia (best guess); amd → windows_amd", () => {
    expect(suggestHardware("windows", "NVIDIA GeForce RTX 3080")).toBe("windows_nvidia");
    expect(suggestHardware("windows", null)).toBe("windows_nvidia");
    expect(suggestHardware("windows", "AMD Radeon RX 6800")).toBe("windows_amd");
  });
  it("linux nvidia / unknown → linux_nvidia; amd → linux_amd", () => {
    expect(suggestHardware("linux", "NVIDIA")).toBe("linux_nvidia");
    expect(suggestHardware("linux", null)).toBe("linux_nvidia");
    expect(suggestHardware("linux", "AMD Radeon")).toBe("linux_amd");
  });
  it("unknown OS → null (wizard asks user to pick)", () => {
    expect(suggestHardware("other", "NVIDIA RTX 4090")).toBe(null);
  });
});

describe("ramClass", () => {
  it("buckets device memory, null when unavailable", () => {
    expect(ramClass(4)).toBe("low");
    expect(ramClass(16)).toBe("mid");
    expect(ramClass(64)).toBe("high");
    expect(ramClass(null)).toBe(null);
    expect(ramClass(undefined)).toBe(null);
    expect(ramClass(0)).toBe(null);
  });
});
