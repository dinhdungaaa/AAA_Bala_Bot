import { describe, it, expect } from "vitest";
import { buildSendFlowRequest } from "../botcakeAsync.js";

describe("buildSendFlowRequest", () => {
  const base = { pageId: "P1", accessToken: "TOK", replyFlowId: "F9", psid: "u123", text: "Chào bạn" };

  it("URL đúng endpoint public_api theo pageId", () => {
    const r = buildSendFlowRequest(base);
    expect(r.url).toBe("https://botcake.io/api/public_api/v1/pages/P1/flows/send_flow");
  });

  it("header access-token + content-type", () => {
    const r = buildSendFlowRequest(base);
    expect(r.headers["access-token"]).toBe("TOK");
    expect(r.headers["Content-Type"]).toBe("application/json");
  });

  it("body chứa psid, flow_id, payload.bot_reply", () => {
    const r = buildSendFlowRequest(base);
    const parsed = JSON.parse(r.body);
    expect(parsed.psid).toBe("u123");
    expect(parsed.flow_id).toBe("F9");
    expect(parsed.payload.bot_reply).toBe("Chào bạn");
  });

  it("encode pageId vào URL an toàn", () => {
    const r = buildSendFlowRequest({ ...base, pageId: "a/b?c" });
    expect(r.url).toContain("pages/a%2Fb%3Fc/flows/send_flow");
  });
});
