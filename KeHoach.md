# KẾ HOẠCH THIẾT KẾ LẠI UI/UX — English Vocabulary Master (EV Master)

> Ngày lập: 12/11/2026 · Phạm vi: toàn bộ web app (Login, Dashboard, Từ vựng, Buổi học, Luyện tập, Kết quả, Xếp hạng, Tài khoản)
> Mục tiêu: tăng **động lực quay lại học mỗi ngày**, giảm **số bước thao tác**, và làm giao diện **nhất quán – dễ truy cập – mượt trên mobile**.

---

## 1. Khảo sát hiện trạng

### 1.1 Công nghệ & cấu trúc
| Hạng mục | Hiện trạng |
|---|---|
| Stack | HTML + Vanilla JS (ES Modules), Bootstrap 5.3.3 (CDN), Lucide icons (`unpkg @latest`), Firebase Auth + Firestore, Gemini (AI Quiz) |
| Kiến trúc | SPA hash-router: `app.js` + `js/core/{router,ui-utils,data-utils}.js` + `js/modules/*-page.js` |
| Trang | dashboard, vocabulary, sessions, practice, results, leaderboard (+ `login.html` riêng, `404.html`) |
| CSS | `styles/{variables,animations,layout,components,bootstrap-theme}.css` + `style.css` (1154 dòng) + ~883 dòng CSS inline trong `login.html` |
| Layout | Sidebar (desktop) + Navbar + Tab-bar dưới (mobile) |
| Theme | Light/Dark, lưu `localStorage`, có streak badge, rank tiers |
| Kích thước file lớn | `practice-page.js` ≈ 63 KB / 1471 dòng; 6 ảnh logo (tổng ≈ 3,4 MB, 1 ảnh PNG 1,3 MB) |

### 1.2 Điểm mạnh (giữ lại)
- Gamification rõ ràng: streak đổi màu theo mốc, rank tiers, bảng xếp hạng.
- Design tokens đã có (`variables.css`): màu, spacing 8px, radius, shadow, dark mode.
- Có toast + dialog thay `alert()` gốc, có `aria-live` cho status, có `prefers-reduced-motion` trong `animations.css`.
- 4 chế độ luyện tập (Quiz, Listening, Match Pairs, AI Quiz) + "từ hay sai" (weak words) — nền tảng tốt cho học thích ứng.

### 1.3 Vấn đề UI/UX phát hiện được

#### 🔴 Lỗi/chức năng "chết" (ưu tiên cao)
| # | Vấn đề | Bằng chứng |
|---|---|---|
| B1 | **Thanh tìm kiếm toàn cục không tồn tại trong UI** nhưng code vẫn xử lý | `app.js` tham chiếu `#globalSearch`, `index.html` không có phần tử này |
| B2 | **Dashboard thiếu nút hành động** (Tạo buổi học / Thêm từ / Bắt đầu Quiz) — `page-actions` rỗng, listener gắn vào ID không tồn tại | `dashboard-page.js` dòng 16–18, 109–120 |
| B3 | **Tiêu đề trang không đồng nhất ngôn ngữ**: sidebar "Trang chủ" nhưng mount set `'Dashboard'` | `dashboard-page.js` dòng 128 |
| B4 | **Nút đăng nhập Facebook / Twitter không có logic** (chỉ trang trí) → gây hiểu lầm | `login.html` dòng ~902–910, không có handler trong `auth.js` |
| B5 | **Dashboard chặn render** bằng `await getStats()` → màn hình trống đến khi tải xong 3 collection; `unsubscribers` của `getStats` chỉ resolve lần đầu | `dashboard-page.js` |
| B6 | Có nguy cơ **XSS** vì chèn `${data.english}`, `${w.meaning}`, `${s.name}` thẳng vào `innerHTML` không escape | dashboard / practice / vocabulary |

#### 🟠 Thiết kế thị giác & hệ thống
| # | Vấn đề |
|---|---|
| V1 | **Hai bộ design token chồng nhau**: `style.css` định nghĩa lại `:root` (radius 22px / shadow khác) với `variables.css` (radius 24px) → giá trị thực tế khó đoán. |
| V2 | **Quá nhiều inline `style="..."`** trong template JS (mode-card, bảng weak-words, modal) → khó đổi theme, khó bảo trì, dark mode dễ lỗi tương phản. |
| V3 | **Màu chế độ luyện tập hard-code** (`#7c3aed`, `#e11d48`, `#0ea5e9`) bên ngoài token. |
| V4 | `login.html` dùng bộ style riêng (883 dòng, chữ **tiếng Anh** "Sign in / Get Started") trong khi app **tiếng Việt** → trải nghiệm đứt gãy; không dùng chung token / dark mode. |
| V5 | Trộn Việt–Anh trong nhãn: "Quiz Văn bản", "Listening", "Match Pairs", "Dashboard", "Chủ đề"… |
| V6 | Font `Fira Code` khai báo nhưng không tải; chỉ tải Inter (cần thêm subset `vietnamese`). |
| V7 | Card + hover-lift + shadow dày cho mọi khối → thiếu phân cấp thị giác (không rõ đâu là hành động chính). |
| V8 | Logo: 6 file ảnh nặng (≈3,4 MB), thẻ logo trong sidebar đang **trống** (`index.html` dòng 22–25). |

#### 🟡 Trải nghiệm người dùng
| # | Vấn đề |
|---|---|
| U1 | **Onboarding không có**: người dùng mới vào Dashboard toàn số 0, không biết bước đầu (tạo buổi → thêm từ → luyện). |
| U2 | **Dashboard "tĩnh"**: chỉ 4 con số + 5 từ gần nhất + mẹo cố định. Thiếu: mục tiêu ngày, tiến độ streak, "tiếp tục học", biểu đồ 7 ngày, từ cần ôn hôm nay. |
| U3 | **Thêm từ nhiều bước**: phải tạo buổi học trước → mới chọn được buổi khi thêm từ; không có thêm nhanh/nhập hàng loạt/import CSV. |
| U4 | **Danh sách từ vựng**: không phân trang/ảo hóa, thiếu sắp xếp, lọc theo mức thuộc, chọn nhiều để xóa/chuyển buổi. |
| U5 | **Luyện tập**: không có Flashcard / lặp lại ngắt quãng (SRS) — thiếu chế độ nhẹ nhàng cho người mới; cấu hình ẩn rồi mới hiện (2 bước click) khó phát hiện. |
| U6 | **Trong lúc làm bài**: đồng hồ đếm ngược dạng số, chưa có thanh tiến trình câu hỏi, không có nút thoát/tạm dừng rõ ràng, không có phím tắt (1–4 chọn đáp án, Enter, Space nghe lại). |
| U7 | **Phản hồi đúng/sai** chưa đủ giàu: thiếu âm thanh/haptic (tùy chọn), thiếu giải thích, thiếu ví dụ câu. |
| U8 | **Màn kết quả**: chưa nhấn mạnh thành tựu (điểm, XP, rank up, streak) và chưa có CTA "Ôn lại từ sai ngay". |
| U9 | **Loading/Empty/Error state không đồng bộ** (một số chỗ chỉ spinner, một số `showAlert` chặn modal cho lỗi nhỏ như "Vui lòng nhập tên"). Validation dùng modal thay vì lỗi inline. |
| U10 | **Điều hướng**: Mục "Chủ đề" trong sidebar thực chất là nút bật/tắt dark mode (gây nhầm là một trang); tab-bar mobile thiếu "Xếp hạng" và "Tài khoản". |
| U11 | **Không có chế độ theo hệ thống** (`prefers-color-scheme`); theme chỉ light/dark thủ công. |

#### 🟣 Accessibility (A11y) & Responsive
| # | Vấn đề |
|---|---|
| A1 | Chỉ ~33 điểm `aria-*` toàn project; nav-item/tab-bar thiếu `aria-current="page"`; icon-only button thiếu nhãn. |
| A2 | Không có `:focus-visible` tùy biến trong CSS riêng (phụ thuộc Bootstrap mặc định); không có "skip to content". |
| A3 | Mode-card trong Practice là `div` có `cursor:pointer` → **không focus/Enter/Space được bằng bàn phím**. |
| A4 | Màu trạng thái (đúng/sai) chỉ dựa vào màu → cần thêm icon/chữ cho người mù màu; kiểm tra tương phản dark mode (`--warning-bg`, `--danger-bg` quá tối). |
| A5 | Router không quản lý focus/`document.title`/thông báo đổi trang cho screen reader. |
| A6 | Breakpoint rải rác (480/600/720/768/980/1024/1180) và **hai bộ khác nhau** trong `layout.css` và `style.css`. |
| A7 | Mục tiêu chạm (touch target) cần ≥ 44px cho nút ở màn Match Pairs/ Listening trên mobile. |

#### ⚡ Hiệu năng cảm nhận
- Tải `lucide@latest` từ unpkg (không khóa phiên bản, chặn render) + gọi `createIcons()` lặp lại sau mỗi `innerHTML`.
- Ảnh logo nặng, chưa dùng WebP/AVIF, chưa có `width/height`.
- `practice-page.js` 1471 dòng, trộn UI + logic + Firestore → khó tối ưu & test.

---

## 2. Định hướng thiết kế

### 2.1 Nguyên tắc
1. **Một hành động chính mỗi màn hình** — luôn rõ "bước tiếp theo".
2. **Học trước, thống kê sau** — Dashboard ưu tiên "Tiếp tục học hôm nay".
3. **Phản hồi tức thì & tích cực** — micro-interaction, XP, streak, nhưng không gây mất tập trung.
4. **Nhất quán** — 1 bộ token, 1 ngôn ngữ (Tiếng Việt, thuật ngữ học tiếng Anh giữ nguyên có chú thích).
5. **Truy cập cho mọi người** — bàn phím, screen reader, tương phản WCAG AA, giảm chuyển động.
6. **Mobile-first** — thao tác một tay, thanh điều hướng dưới.

### 2.2 Design system đề xuất

**Màu (giữ nhận diện xanh dương hiện tại, bổ sung vai trò rõ ràng)**
| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--primary` | `#2563eb` | `#60a5fa` | CTA chính, link |
| `--accent-streak` | `#f97316` | `#fb923c` | Streak, XP |
| `--success / --danger / --warning` | giữ | tăng sáng nền dark | Đúng / sai / cảnh báo |
| `--mode-quiz / listen / match / ai` | token hóa 4 màu hiện có | điều chỉnh | Màu chế độ luyện tập |
| `--surface-1/2/3` | 3 mức nền | | Tạo phân cấp thay vì shadow ở mọi nơi |

**Typography** (Inter, thêm subset `vietnamese`): Display 32/40 · H1 24/32 · H2 20/28 · Body 16/24 · Small 14/20 · Caption 12/16. Từ vựng đang học dùng cỡ lớn (28–40px, đậm) ở màn luyện tập.

**Spacing / Radius / Elevation**: giữ thang 4/8px; giảm radius thẻ từ 24 → 16px, nút 12px, chip full; chỉ dùng 3 mức shadow (`--shadow-1/2/3`), bỏ `--shadow-soft/--shadow/--shadow-hover` trùng lặp.

**Breakpoint chuẩn duy nhất**: `sm 576 · md 768 · lg 1024 · xl 1280` (theo Bootstrap).

**Thành phần cần chuẩn hóa**: Button (primary/secondary/ghost/danger + loading + icon), Input (nhãn nổi, lỗi inline, helper), Card (flat / raised / interactive), Chip/Badge (mức thuộc), ProgressBar & ProgressRing, Stat tile, Empty state, Skeleton, Toast, Dialog, Tabs, Bottom sheet (mobile).

---

## 3. Kế hoạch theo từng màn hình

### 3.1 Điều hướng & Layout (App shell)
- Sidebar: điền logo (1 file SVG/WebP), thêm `aria-current`, gom "Chủ đề" thành **nút icon trong navbar** (Sáng / Tối / Theo hệ thống) thay vì mục menu.
- Navbar: thêm **ô tìm kiếm** thực sự (hoặc Command Palette `Ctrl+K`: tìm từ, nhảy trang, bắt đầu luyện tập) — sửa B1.
- Mobile tab-bar: 5 mục (Trang chủ · Từ vựng · **Luyện tập (nút nổi ở giữa)** · Kết quả · Hồ sơ); Xếp hạng chuyển vào Dashboard/Hồ sơ.
- Breadcrumb ngữ cảnh khi vào chi tiết buổi học.
- Router: cập nhật `document.title`, chuyển focus tới `<h1>`, vùng `aria-live` thông báo "Đã chuyển tới …", hiệu ứng chuyển trang ≤ 200ms.
- Thêm *skip link* "Bỏ qua tới nội dung".

### 3.2 Đăng nhập / Đăng ký (`login.html`)
- Dịch toàn bộ sang Tiếng Việt (có tùy chọn EN/VI sau).
- Dùng chung token & dark mode với app; tách CSS inline ra `styles/auth.css`.
- Bỏ (hoặc ẩn) nút Facebook/Twitter chưa hoạt động — giữ **Google** (sửa B4).
- Form: nút hiện/ẩn mật khẩu, thanh đo độ mạnh mật khẩu, lỗi inline theo từng ô, `autocomplete` đúng, Enter để gửi, trạng thái loading trên nút.
- Minh họa SVG nhẹ, ẩn trên mobile để form lên trước.

### 3.3 Dashboard — "Hôm nay học gì?"
```
┌ Chào buổi sáng, {tên} 👋            🔥 Streak 5 ngày ┐
├ [Mục tiêu hôm nay ◯ 12/20 từ]  [▶ Tiếp tục học]      │
├ Ôn tập hôm nay: 8 từ đến hạn   [Bắt đầu ôn]          │
├ 4 stat tile (từ / đã thuộc % / buổi / quiz) + xu hướng│
├ Biểu đồ 7 ngày (từ đã luyện / độ chính xác)          │
├ Từ hay sai (top 5)  |  Từ mới thêm gần đây            │
└ Hạng hiện tại + tiến độ lên hạng (link Xếp hạng)      ┘
```
- Skeleton loading ngay lập tức; dữ liệu stream về từng khối (sửa B5) và dọn `onSnapshot` đúng chỗ.
- Thêm 3 hành động nhanh: **Thêm từ**, **Tạo buổi học**, **Luyện tập** (sửa B2); sửa tiêu đề thành "Trang chủ" (B3).
- **Onboarding checklist** cho người mới (3 bước: Tạo buổi → Thêm 5 từ → Làm bài đầu tiên) kèm pháo giấy nhẹ khi hoàn thành.
- Mẹo học tập: xoay vòng theo ngày, có thể đóng.
- Cho phép đặt **mục tiêu ngày** (10/20/30 từ) → vòng tiến độ + nhắc streak.

### 3.4 Từ vựng
- Thanh công cụ dính (sticky): tìm kiếm, lọc buổi, lọc mức thuộc (Mới / Đang học / Đã thuộc), sắp xếp (Mới nhất, A–Z, Hay sai).
- Chế độ xem **Bảng** (desktop) ↔ **Thẻ** (mobile) tự chuyển; phân trang hoặc cuộn vô hạn (50/trang).
- **Thêm nhanh**: ô nhập ngay đầu trang (Enter để lưu, auto-tra nghĩa/phiên âm/audio); cho phép tạo buổi học mới ngay trong modal (giải quyết U3); **nhập hàng loạt** (dán nhiều dòng `word - nghĩa`, import CSV).
- Chọn nhiều → xóa / chuyển buổi / luyện riêng nhóm này.
- Hiển thị: phiên âm IPA, loại từ (chip màu), nút loa lớn, ví dụ câu, thanh mức thuộc (ProgressBar nhỏ).
- Xóa kèm **"Hoàn tác" (Undo toast 5s)** thay vì hộp xác nhận chặn.
- Validation **inline**, không dùng modal cho lỗi nhập liệu (U9).

### 3.5 Buổi học (Sessions)
- Thẻ buổi học: tên, số từ, % thuộc (progress ring), lần luyện gần nhất, nút **Luyện tập** (chính) + menu ⋯ (đổi tên, xóa).
- Đổi tên inline, kéo-thả sắp xếp (giai đoạn 3).
- Trang chi tiết buổi: danh sách từ + CTA "Luyện buổi này".
- Empty state có minh họa + nút "Tạo buổi học đầu tiên".

### 3.6 Luyện tập (trọng tâm UX)
**Màn cấu hình**
- Mode-card chuyển thành `<button>`/radio card (focus, Enter/Space, `aria-checked`) — sửa A3; hiển thị ngay **tùy chọn tối giản** (nguồn từ + số câu) và "Tùy chỉnh nâng cao" gập lại thay vì ẩn đến khi chọn.
- Preset nhanh: "5 phút", "10 câu", "Chỉ từ hay sai", "Buổi gần nhất".
- Ghi nhớ lần cấu hình trước (`localStorage`).
- Thêm chế độ mới **Flashcard** (lật thẻ, tự đánh giá: Quên / Khó / Nhớ / Dễ) và nền tảng **SRS** (lịch ôn 1-3-7-14 ngày).

**Màn làm bài**
- Header cố định: ✕ Thoát (hỏi xác nhận), thanh tiến trình `3/10`, đồng hồ dạng **thanh co dần** + số, điểm/combo.
- Từ hỏi cỡ lớn; nút loa luôn thấy; đáp án 2×2 trên desktop, 1 cột trên mobile, cao ≥ 56px.
- **Phím tắt**: `1–4` chọn, `Enter` tiếp, `Space` nghe lại, `Esc` tạm dừng; hiển thị gợi ý nhỏ.
- Phản hồi: đúng = xanh + ✓ + hiệu ứng nhẹ; sai = đỏ + ✗ + hiển thị đáp án đúng + ví dụ câu; combo ×2, ×3 có animation.
- Nút **Tạm dừng** (dừng giờ), tự pause khi chuyển tab.
- Listening: nút phát chậm 0.7×, gợi ý chữ cái đầu, bàn phím không che ô nhập trên mobile.
- Match Pairs: lưới responsive, ô ≥ 44px, ghép sai rung nhẹ, ghép đúng mờ dần.
- AI Quiz: hiển thị trạng thái "AI đang tạo câu hỏi…" bằng skeleton, lỗi thân thiện + nút thử lại / chuyển Quiz thường (thay vì thông báo kỹ thuật về API key).
- Tôn trọng `prefers-reduced-motion`; tùy chọn bật/tắt âm thanh & rung.

### 3.7 Kết quả
- Màn **tổng kết sau bài** (celebration): điểm, độ chính xác (ring), thời gian, XP nhận, streak +1, thông báo **lên hạng** nếu có.
- Danh sách câu sai kèm nút "Luyện lại các từ này" và "Làm lại bài".
- Lịch sử: lọc theo chế độ/buổi, biểu đồ xu hướng, so sánh với lần trước ("+8% so với tuần trước").
- Skeleton + empty state có CTA.

### 3.8 Xếp hạng & Streak
- Hiển thị tiến độ tới hạng kế tiếp (progress bar + còn bao nhiêu điểm), giải thích rõ cơ chế reset tuần (tooltip/bottom sheet).
- Bảng hạng: top 3 nổi bật (huy hiệu), hàng của bản thân được ghim.
- Streak: popover lịch 7 ngày gần nhất khi bấm vào badge; cảnh báo "Còn X giờ để giữ chuỗi" (trong app).
- Huy hiệu thành tựu (10 từ đầu, 7 ngày liên tiếp, 100% một bài…).

### 3.9 Tài khoản & Cài đặt
- Chuyển modal thành trang/bottom sheet **Cài đặt**: Hồ sơ, Giao diện (Sáng/Tối/Hệ thống), Mục tiêu ngày, Âm thanh/Rung, Giọng đọc (US/UK, tốc độ), Ngôn ngữ, Xuất dữ liệu.
- Tải/preview ảnh đại diện thay vì chỉ nhập URL.

---

## 4. Phụ trợ kỹ thuật (cần cho UI/UX)

| Nhóm | Việc làm |
|---|---|
| **CSS** | Hợp nhất token vào `variables.css`, xóa `:root` trùng trong `style.css`; tách `login` → `styles/auth.css`; thay inline-style bằng class (BEM/utility); chuẩn hóa breakpoint; `color-scheme` + `prefers-color-scheme`. |
| **JS** | Tạo `js/core/components.js` (Button, Card, EmptyState, Skeleton, ProgressRing…) + `escapeHtml()` dùng cho mọi chuỗi từ Firestore (sửa B6); tách `practice-page.js` thành `practice/{config,quiz,listening,match,ai,results}.js`; helper `renderIcons(root)` gom lời gọi Lucide. |
| **Hiệu năng** | Khóa phiên bản Lucide (hoặc import theo icon dùng); nén logo → SVG/WebP < 50 KB, xóa 5 file logo/ảnh không dùng; `loading="lazy"`; `font-display: swap` + `preload` Inter; Firestore `onSnapshot` có `limit` + unmount sạch. |
| **A11y** | `aria-current`, `aria-live`, focus ring (`:focus-visible`), skip-link, nhãn cho icon button, kiểm tra tương phản bằng axe/Lighthouse, test bàn phím toàn luồng. |
| **PWA (tùy chọn)** | `manifest.json` + service worker cho cài đặt vào màn hình chính & dùng offline cơ bản. |
| **Đo lường** | Sự kiện ẩn danh (Firebase Analytics đã có sẵn config): hoàn thành onboarding, bắt đầu/hoàn thành bài, rời bài giữa chừng, streak retention D1/D7. |

---

## 5. Lộ trình triển khai

| Giai đoạn | Nội dung | Ước lượng | Kết quả kiểm chứng |
|---|---|---|---|
| **0 – Sửa nền tảng** | B1–B6, V1, A1–A3 cơ bản; hợp nhất token; escape HTML | 2–3 ngày | Không còn nút chết; Lighthouse A11y ≥ 90 |
| **1 – Design system** | Token mới, component library, thay inline-style, auth.css, logo mới | 3–4 ngày | Storybook-lite (trang `/styleguide.html`) hiển thị toàn bộ component 2 theme |
| **2 – App shell & Login** | Sidebar/Navbar/Tab-bar mới, tìm kiếm/Command palette, router a11y, Login Việt hóa | 3 ngày | Điều hướng bằng bàn phím hoàn chỉnh; test iPhone SE / 360px |
| **3 – Dashboard & Onboarding** | Layout mới, mục tiêu ngày, skeleton, checklist, biểu đồ 7 ngày | 3–4 ngày | LCP < 2,5s; người mới hoàn thành checklist < 3 phút |
| **4 – Từ vựng & Buổi học** | Thanh công cụ, phân trang, thêm nhanh/hàng loạt, chọn nhiều, Undo | 4–5 ngày | Thêm 1 từ ≤ 2 thao tác; 500 từ cuộn mượt |
| **5 – Luyện tập & Kết quả** | Cấu hình mới, phím tắt, tạm dừng, Flashcard, màn tổng kết, SRS cơ bản | 6–8 ngày | Hoàn thành bài bằng bàn phím 100%; tỉ lệ bỏ bài giảm |
| **6 – Gamification & Cài đặt** | Xếp hạng/streak popover, huy hiệu, trang Cài đặt, âm thanh/rung | 3–4 ngày | Retention D7 tăng (đo bằng analytics) |
| **7 – Hoàn thiện** | QA đa trình duyệt, tối ưu hiệu năng, PWA (tuỳ chọn), tài liệu README | 2–3 ngày | Checklist mục 7 đạt 100% |

> Tổng ước lượng: **≈ 4–5 tuần** cho 1 developer. Có thể chạy song song Giai đoạn 3–4 nếu có thêm người.

### Ưu tiên "làm ngay" (Quick wins — < 1 ngày mỗi việc)
1. Thêm 3 nút hành động nhanh vào Dashboard + sửa tiêu đề "Trang chủ".
2. Xóa/thêm ô tìm kiếm toàn cục; ẩn nút Facebook/Twitter.
3. Mode-card → `<button>` + focus ring; `aria-current` cho nav.
4. Escape HTML cho dữ liệu người dùng.
5. Thay `showAlert` cho lỗi nhập liệu bằng lỗi inline + toast.
6. Nén logo, bỏ ảnh dư, khóa phiên bản Lucide.
7. Thêm thanh tiến trình câu hỏi + nút thoát trong lúc làm bài.

---

## 6. Rủi ro & lưu ý
| Rủi ro | Giảm thiểu |
|---|---|
| Sửa CSS lớn gây vỡ giao diện cũ | Làm theo giai đoạn, chụp ảnh so sánh trước/sau từng trang |
| `practice-page.js` quá lớn, tách dễ phát sinh lỗi | Tách từng chế độ một, giữ nguyên API nội bộ, test thủ công mỗi bước |
| Thêm SRS/Flashcard cần đổi schema Firestore (`nextReviewAt`, `interval`) | Thêm trường tùy chọn, tương thích ngược, không migrate bắt buộc |
| Khóa Gemini nằm ở client (`env-config.js`) → lộ khóa | Chuyển gọi AI qua Cloud Function/Firebase proxy (ngoài phạm vi UI nhưng nên làm) |
| Dark mode tương phản kém ở màu trạng thái | Kiểm tra bằng công cụ contrast ở mỗi component |

---

## 7. Tiêu chí nghiệm thu (Definition of Done)
- [ ] Không còn phần tử/nút/handler "chết"; mọi nhãn UI đồng nhất Tiếng Việt.
- [ ] Một bộ design token duy nhất; không còn `style="..."` cho màu/spacing trong template JS.
- [ ] Lighthouse (mobile): Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95.
- [ ] Toàn bộ luồng chính (đăng nhập → thêm từ → luyện tập → xem kết quả) dùng được **chỉ bằng bàn phím** và trên màn 360px.
- [ ] Tương phản chữ đạt WCAG AA ở cả Light/Dark.
- [ ] Mọi trang có Loading (skeleton), Empty và Error state.
- [ ] Thêm từ ≤ 2 thao tác; bắt đầu luyện tập từ Dashboard ≤ 2 click.
- [ ] Hỗ trợ `prefers-reduced-motion` và `prefers-color-scheme`.

---

## 8. Câu hỏi cần bạn xác nhận
1. Có muốn thêm **Flashcard + SRS** (đổi cấu trúc dữ liệu nhẹ) hay chỉ làm lại giao diện hiện có?
2. Giữ **Bootstrap** hay chuyển dần sang CSS thuần/Tailwind? (Đề xuất: giữ Bootstrap, chuẩn hóa token để ít rủi ro.)
3. Có cần **đa ngôn ngữ (VI/EN)** hay chỉ Tiếng Việt?
4. Có muốn làm **PWA/offline** không?
5. Bạn muốn bắt đầu từ **Quick wins + Giai đoạn 0** ngay chứ?
