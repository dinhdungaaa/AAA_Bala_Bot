import { describe, it, expect } from "vitest";
import { buildSendFlowRequest } from "../botcakeAsync.js";

describe("buildSendFlowRequest", () => {
  const base = { pageId: "P1", accessToken: "TOK", replyFlowId: "447646216", psid: "28087514047518474", text: "Chào bạn" };

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
    expect(parsed.psid).toBe("28087514047518474");
    expect(parsed.payload.bot_reply).toBe("Chào bạn");
  });

  it("flow_id gửi dạng SỐ NGUYÊN (Botcake yêu cầu integer, không phải chuỗi)", () => {
    const r = buildSendFlowRequest(base);
    const parsed = JSON.parse(r.body);
    expect(parsed.flow_id).toBe(447646216);
    expect(typeof parsed.flow_id).toBe("number");
    // chuỗi thô "flow_id":"..." không được xuất hiện
    expect(r.body).toContain('"flow_id":447646216');
  });

  it("psid GIỮ chuỗi để không mất độ chính xác (dài > MAX_SAFE_INTEGER)", () => {
    const r = buildSendFlowRequest(base);
    const parsed = JSON.parse(r.body);
    expect(typeof parsed.psid).toBe("string");
    expect(r.body).toContain('"psid":"28087514047518474"');
  });

  it("flow_id không parse được thì giữ nguyên chuỗi (không crash)", () => {
    const r = buildSendFlowRequest({ ...base, replyFlowId: "abc" });
    const parsed = JSON.parse(r.body);
    expect(parsed.flow_id).toBe("abc");
  });

  it("encode pageId vào URL an toàn", () => {
    const r = buildSendFlowRequest({ ...base, pageId: "a/b?c" });
    expect(r.url).toContain("pages/a%2Fb%3Fc/flows/send_flow");
  });
});
