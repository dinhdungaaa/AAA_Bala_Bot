// Build request gọi Botcake Public API send_flow — đẩy câu trả lời của bot lại cho
// khách theo PSID (bất đồng bộ, không phụ thuộc timeout của Dynamic Block).
// Tách khỏi server.ts để unit-test; server.ts dùng để fetch thật.
export function buildSendFlowRequest(opts: {
  pageId: string;
  accessToken: string;
  replyFlowId: string;
  psid: string;
  text: string;
}): { url: string; headers: Record<string, string>; body: string } {
  const url = `https://botcake.io/api/public_api/v1/pages/${encodeURIComponent(opts.pageId)}/flows/send_flow`;
  const headers = {
    "access-token": opts.accessToken,
    "Content-Type": "application/json",
  };
  // Botcake yêu cầu flow_id là SỐ NGUYÊN (không phải chuỗi) → parse sang number.
  // psid GIỮ NGUYÊN chuỗi: nó dài ~17 chữ số, vượt Number.MAX_SAFE_INTEGER nên
  // ép sang number sẽ mất độ chính xác.
  const flowIdNum = Number.parseInt(String(opts.replyFlowId).trim(), 10);
  const body = JSON.stringify({
    psid: opts.psid,
    flow_id: Number.isNaN(flowIdNum) ? opts.replyFlowId : flowIdNum,
    payload: { bot_reply: opts.text },
  });
  return { url, headers, body };
}
