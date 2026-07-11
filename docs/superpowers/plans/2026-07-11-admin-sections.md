# Chia tab Quản trị thành 4 mục sub-tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab Quản trị (admin) đổi từ trang cuộn dài thành 4 mục điều hướng bằng pill sub-tab: 👥 Người dùng (mặc định) • 💰 Doanh thu (kèm Giao dịch lạc) • 🛡️ Allowlist • 📇 Leads.

**Architecture:** Thuần frontend trong `src/App.tsx`. Thêm 1 state `adminSection`, thêm thanh pill dưới banner, bọc các khối JSX hiện có bằng render điều kiện `{adminSection === '...' && (...)}`. Duy nhất khối GIAO DỊCH LẠC phải di chuyển vật lý (đang lồng trong panel bảng người dùng → chuyển sang sau khối Doanh thu). Không đổi backend, không đổi fetch, không đổi logic.

**Tech Stack:** React 19 + TypeScript (file `src/App.tsx` ~7400 dòng), Tailwind class inline, Vite, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-11-admin-sections-design.md`.
- State đúng chữ ký: `const [adminSection, setAdminSection] = useState<'users' | 'revenue' | 'allowlist' | 'leads'>('users');` — mặc định `'users'`, KHÔNG lưu URL/localStorage.
- 4 nhãn pill đúng nguyên văn: `👥 Người dùng`, `💰 Doanh thu`, `🛡️ Allowlist`, `📇 Leads`.
- Pill active: `bg-indigo-600 text-white shadow-md`; inactive: `text-slate-500 hover:text-slate-800 hover:bg-slate-50` (theo pattern schedTab, đổi teal → indigo).
- Chấm cảnh báo: đỏ `bg-rose-500` trên pill Doanh thu khi `unmatchedPayments.length > 0`; xanh `bg-indigo-500` trên pill Leads khi `leadsList.length > 0`. Chấm chỉ hiện khi pill KHÔNG active (đang xem thì không cần nhắc, và chấm indigo chìm trên nền active indigo).
- Nội dung các khối GIỮ NGUYÊN — chỉ bọc điều kiện / di chuyển, không viết lại markup bên trong.
- Banner header luôn hiện trên mọi mục.
- Sau mỗi task: `npm run lint` (tsc --noEmit) pass; cuối cùng `npm test` 165/165 pass + `npx vite build` pass.
- File `src/App.tsx` rất lớn — mọi edit dùng chuỗi anchor duy nhất ghi trong task (KHÔNG dùng số dòng, số dòng sẽ trôi sau mỗi edit).

---

### Task 1: State `adminSection` + thanh pill sub-nav

**Files:**
- Modify: `src/App.tsx` (2 edit theo anchor)
- Test: không có unit test UI — gate là `npm run lint`

**Interfaces:**
- Consumes: state có sẵn `unmatchedPayments` (mảng), `leadsList` (mảng) trong cùng component.
- Produces: state `adminSection: 'users' | 'revenue' | 'allowlist' | 'leads'` + `setAdminSection` — Task 2/3 bọc các khối bằng state này.

- [ ] **Step 1: Thêm state**

Trong `src/App.tsx`, Edit với old_string:

```tsx
  // Admin: giao dịch SePay báo tiền vào nhưng không khớp nội dung đơn nào.
  const [unmatchedPayments, setUnmatchedPayments] = useState<Array<{ id: string; amount: number; content: string; received_at: string }>>([]);
```

new_string:

```tsx
  // Admin: giao dịch SePay báo tiền vào nhưng không khớp nội dung đơn nào.
  const [unmatchedPayments, setUnmatchedPayments] = useState<Array<{ id: string; amount: number; content: string; received_at: string }>>([]);
  // Admin: mục đang mở trong tab Quản trị (pill sub-tab). Không lưu URL — mở lại luôn về 'users'.
  const [adminSection, setAdminSection] = useState<'users' | 'revenue' | 'allowlist' | 'leads'>('users');
```

- [ ] **Step 2: Chèn thanh pill ngay dưới banner admin**

Edit với old_string (2 dòng cuối banner + comment khối doanh thu — duy nhất trong file):

```tsx
              </div>

              {/* 💰 DOANH THU — từ đơn thanh toán SePay đã trả */}
```

new_string:

```tsx
              </div>

              {/* SUB-NAV 4 MỤC QUẢN TRỊ */}
              <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-xs">
                {([['users', '👥 Người dùng'], ['revenue', '💰 Doanh thu'], ['allowlist', '🛡️ Allowlist'], ['leads', '📇 Leads']] as ['users' | 'revenue' | 'allowlist' | 'leads', string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setAdminSection(key)}
                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${adminSection === key ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                    {label}
                    {key === 'revenue' && adminSection !== 'revenue' && unmatchedPayments.length > 0 && (
                      <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-rose-500" title="Có giao dịch lạc chưa xử lý"></span>
                    )}
                    {key === 'leads' && adminSection !== 'leads' && leadsList.length > 0 && (
                      <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-indigo-500" title="Có khách để lại liên hệ"></span>
                    )}
                  </button>
                ))}
              </div>

              {/* 💰 DOANH THU — từ đơn thanh toán SePay đã trả */}
```

- [ ] **Step 3: Kiểm tra biên dịch**

Run: `npm run lint`
Expected: exit 0, không lỗi TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(admin): state adminSection + thanh pill 4 muc"
```

---

### Task 2: Chuyển GIAO DỊCH LẠC sang mục Doanh thu + bọc khối Doanh thu

**Files:**
- Modify: `src/App.tsx` (2 edit theo anchor)

**Interfaces:**
- Consumes: `adminSection` từ Task 1; state có sẵn `unmatchedPayments`, `revenueData`.
- Produces: khối GIAO DỊCH LẠC là con trực tiếp của container admin (`space-y-6`), nằm ngay sau khối Doanh thu, cả hai chỉ render khi `adminSection === 'revenue'`.

- [ ] **Step 1: Xóa khối GIAO DỊCH LẠC khỏi MAIN COLUMN (panel bảng người dùng)**

Edit với old_string (từ comment GIAO DỊCH LẠC tới hết khối + thẻ đóng MAIN COLUMN — nguyên văn hiện tại, indent 18 spaces):

```tsx
                  {/* GIAO DỊCH LẠC — tiền SePay báo vào nhưng không khớp nội dung đơn nào */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                      ⚠️ Giao dịch lạc (tiền vào không khớp đơn)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-550 font-sans font-bold text-[10.5px] uppercase tracking-wider">
                            <th className="p-3 pl-4">Mã GD</th>
                            <th className="p-3">Số tiền</th>
                            <th className="p-3">Nội dung CK</th>
                            <th className="p-3">Lúc nhận</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unmatchedPayments.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-slate-400">Không có giao dịch lạc 🎉</td>
                            </tr>
                          ) : unmatchedPayments.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 pl-4 font-mono text-slate-700">{p.id}</td>
                              <td className="p-3 font-bold text-slate-800">{Number(p.amount).toLocaleString('vi-VN')}đ</td>
                              <td className="p-3 text-slate-600">{p.content}</td>
                              <td className="p-3 text-slate-500">{new Date(p.received_at).toLocaleString('vi-VN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
```

new_string (chỉ giữ thẻ đóng MAIN COLUMN):

```tsx
                </div>
```

- [ ] **Step 2: Bọc khối Doanh thu + chèn lại GIAO DỊCH LẠC sau nó**

Edit với old_string (mở khối doanh thu):

```tsx
              {/* 💰 DOANH THU — từ đơn thanh toán SePay đã trả */}
              {revenueData && (
```

new_string:

```tsx
              {/* 💰 DOANH THU — từ đơn thanh toán SePay đã trả */}
              {adminSection === 'revenue' && revenueData && (
```

Rồi Edit với old_string (đóng khối doanh thu + comment allowlist — duy nhất):

```tsx
              )}

              {/* ALLOWLIST GÓI FREE — cộng đồng Peace Solution */}
```

new_string (chèn GIAO DỊCH LẠC re-indent về 14 spaces, bọc điều kiện):

```tsx
              )}

              {/* ⚠️ GIAO DỊCH LẠC — tiền SePay vào nhưng không khớp đơn (thuộc mục Doanh thu) */}
              {adminSection === 'revenue' && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  ⚠️ Giao dịch lạc (tiền vào không khớp đơn)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-550 font-sans font-bold text-[10.5px] uppercase tracking-wider">
                        <th className="p-3 pl-4">Mã GD</th>
                        <th className="p-3">Số tiền</th>
                        <th className="p-3">Nội dung CK</th>
                        <th className="p-3">Lúc nhận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {unmatchedPayments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-400">Không có giao dịch lạc 🎉</td>
                        </tr>
                      ) : unmatchedPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 pl-4 font-mono text-slate-700">{p.id}</td>
                          <td className="p-3 font-bold text-slate-800">{Number(p.amount).toLocaleString('vi-VN')}đ</td>
                          <td className="p-3 text-slate-600">{p.content}</td>
                          <td className="p-3 text-slate-500">{new Date(p.received_at).toLocaleString('vi-VN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* ALLOWLIST GÓI FREE — cộng đồng Peace Solution */}
```

Lưu ý: chuỗi `              )}\n\n              {/* ALLOWLIST` phải khớp đúng khối doanh thu vừa bọc — nếu Edit báo không duy nhất, mở rộng old_string thêm dòng `                </div>` phía trên `)}`.

- [ ] **Step 3: Kiểm tra biên dịch**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(admin): chuyen Giao dich lac vao muc Doanh thu, boc dieu kien adminSection"
```

---

### Task 3: Bọc 3 mục còn lại (Allowlist, Leads, Người dùng) + kiểm tra tổng

**Files:**
- Modify: `src/App.tsx` (4 edit theo anchor)

**Interfaces:**
- Consumes: `adminSection` từ Task 1.
- Produces: mỗi mục chỉ render khi pill tương ứng được chọn; mặc định thấy mục Người dùng.

- [ ] **Step 1: Bọc mở khối ALLOWLIST**

Edit với old_string:

```tsx
              {/* ALLOWLIST GÓI FREE — cộng đồng Peace Solution */}
              <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-xs space-y-4">
```

new_string:

```tsx
              {/* ALLOWLIST GÓI FREE — cộng đồng Peace Solution */}
              {adminSection === 'allowlist' && (
              <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-xs space-y-4">
```

- [ ] **Step 2: Đóng ALLOWLIST + bọc mở khối LEADS**

Edit với old_string (thẻ đóng allowlist + comment leads + thẻ mở leads — duy nhất):

```tsx
              </div>

              {/* LEADS — khách để lại liên hệ qua Trợ lý web */}
              <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-xs space-y-3">
```

new_string:

```tsx
              </div>
              )}

              {/* LEADS — khách để lại liên hệ qua Trợ lý web */}
              {adminSection === 'leads' && (
              <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-xs space-y-3">
```

- [ ] **Step 3: Đóng LEADS + bọc mở mục NGƯỜI DÙNG (stats strip + directory panel, dùng fragment)**

Edit với old_string:

```tsx
              </div>

              {/* TOP AGGREGATE STATS STRIP */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

new_string:

```tsx
              </div>
              )}

              {/* 👥 MỤC NGƯỜI DÙNG — stats strip + bảng người dùng */}
              {adminSection === 'users' && (<>
              {/* TOP AGGREGATE STATS STRIP */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

- [ ] **Step 4: Đóng mục NGƯỜI DÙNG ở cuối tab admin**

Edit với old_string (cuối directory panel + đóng tab admin + `</main>` — duy nhất; chạy SAU Task 2 nên khối Giao dịch lạc đã rời khỏi đây):

```tsx
              </div>

            </div>
          )}

        </main>
```

new_string:

```tsx
              </div>
              </>)}

            </div>
          )}

        </main>
```

- [ ] **Step 5: Kiểm tra biên dịch + toàn bộ test + build frontend**

Run: `npm run lint` → exit 0.
Run: `npm test` → Expected: 165 passed (không có test UI, gate chống vỡ import/type).
Run: `npx vite build` → Expected: build thành công.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(admin): chia tab Quan tri thanh 4 muc sub-tab (Nguoi dung/Doanh thu/Allowlist/Leads)"
```

---

## Sau khi hoàn thành (ngoài phạm vi task)

Deploy theo quy trình dự án: `git push origin main` (Railway backend — không đổi gì backend nhưng cùng repo) + `npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true` (frontend). Nhắc user Ctrl+Shift+R.
