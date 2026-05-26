# EV Master — English Vocabulary Master 🎓🔥

**EV Master** là một ứng dụng web học từ vựng Tiếng Anh cao cấp, tích hợp các cơ chế trò chơi hóa (gamification) tiên tiến giúp nâng cao trải nghiệm học tập, kích thích động lực tự học liên tục thông qua hệ thống **Xếp Hạng (Rank Tiers)** và **Chuỗi Học Tập (Daily Streak)**.

---

## 🌟 Tính Năng Cốt Lõi

### 1. Tổng Quan Học Tập (Dashboard)
- Thống kê chi tiết số từ vựng đang có, số từ đã thuộc thành thạo (mastered), tổng số buổi học và số bài Quiz đã hoàn thành.
- Nhật ký hoạt động gần đây hiển thị các từ vựng mới thêm cùng bộ mẹo học tập thông minh.

### 2. Quản Lý Từ Vựng (Vocabulary)
- Thêm mới, chỉnh sửa, xóa từ vựng kèm theo nghĩa Tiếng Việt, loại từ (danh từ, động từ, tính từ...), và thuộc buổi học cụ thể.
- Tích hợp phát âm chuẩn giọng đọc Tiếng Anh.
- Theo dõi cấp độ thành thạo của từ vựng (từ "Đang học" đến "Đã thuộc" dựa trên số câu trả lời đúng).

### 3. Tổ Chức Buổi Học (Sessions)
- Phân nhóm từ vựng theo chủ đề hoặc từng buổi học (ví dụ: Buổi 1 - Động vật, Buổi 2 - Công việc...).
- Xem nhanh danh sách từ vựng của từng buổi học hoặc kích hoạt luyện tập nhanh riêng cho buổi đó.

### 4. Các Chế Độ Luyện Tập (Practice Modes)
Ứng dụng cung cấp 3 chế độ học tập đa dạng, bổ trợ đầy đủ các kỹ năng:
- **Trắc Nghiệm (Text Quiz)**: Luyện phản xạ nhận diện nghĩa của từ. Hệ thống sử dụng thời gian đếm ngược thông minh:
  $$\text{Thời gian} = 10s + (\text{Số lượng từ} \times 2.5s)$$
  Trả lời đúng được cộng thời gian ($+0.3s$), trả lời sai bị trừ thời gian ($-0.7s$).
- **Nghe Viết (Listening)**: Luyện khả năng nghe chính tả. Nghe phát âm và gõ lại từ vựng chính xác bằng bàn phím ảo hoặc bàn phím vật lý dưới áp lực thời gian tương tự Trắc nghiệm.
- **Ghép Cặp (Match Pairs)**: Trò chơi ghép cặp từ tiếng Anh với nghĩa tiếng Việt tương ứng. Đếm ngược bắt đầu từ:
  $$\text{Thời gian} = 5s + (\text{Số lượng từ} \times 2.5s)$$
  Ghép cặp đúng được cộng thêm thời gian ($+0.3s$), ghép sai bị phạt trừ thời gian ($-0.7s$).

---

## 🏆 Hệ Thống Trò Chơi Hóa (Gamification)

### 🥇 Xếp Hạng Cá Nhân (Leaderboard Dashboard)
Hệ thống tính điểm từ tất cả các chế độ chơi và thăng cấp người dùng qua **7 cấp bậc Rank** chuyên nghiệp:
- **Iron** (0 - 99 điểm): Icon `shield` (màu Xám `#8e8e93`)
- **Titanium** (100 - 199 điểm): Icon `award` (màu Tím `#bf5af2`)
- **Tantalum** (200 - 299 điểm): Icon `shield-alert` (màu Xanh lá `#30d158`)
- **Osmium** (300 - 499 điểm): Icon `gem` (màu Xanh dương `#0a84ff`)
- **Vanadium** (500 - 699 điểm): Icon `swords` (màu Vàng cát `#ffd60a`)
- **Tungsten** (700 - 999 điểm): Icon `flame` (màu Cam `#ff9f0a`)
- **Chromium** (1000+ điểm): Icon `crown` (màu Đỏ `#ff453a` - Rank Tối Thượng)

**Cơ chế Reset Tuần Mới (Self-Healing Reset):**
- Chu kỳ Rank diễn ra trong vòng 7 ngày. Sau 1 tuần, hệ thống chạy cơ chế tự động reset ở phía Client:
  1. Tổng số điểm tích lũy trong tuần được chia cho 3 (làm tròn) để làm điểm chuyển tiếp kế thừa (`carryOverPoints`).
  2. Mốc thời gian bắt đầu tuần mới (`rankPeriodStartAt`) cập nhật về thời điểm hiện tại.
  3. Người dùng tiếp tục tích lũy điểm số mới cộng dồn trên điểm kế thừa.

### 🔥 Chuỗi Học Tập Hằng Ngày (Daily Streak)
Giao diện Streak ngọn lửa rực rỡ và phát sáng mạch đập (pulsing glow animation) hiển thị ở góc Navbar:
- **Kích hoạt Streak**: Tự động cộng **+1 ngày Streak** khi người dùng thực hiện hoạt động học tập đầu tiên trong ngày (tạo buổi học hoặc hoàn thành luyện tập bất kỳ chế độ nào).
- **Trạng thái chưa kích hoạt (Chưa học)**: Ngọn lửa chuyển sang màu xám tối mờ nhạt (`inactive`) để nhắc nhở người dùng học tập giữ chuỗi.
- **Trạng thái đã kích hoạt (Đã học)**: Ngọn lửa bừng sáng rực rỡ và tỏa ánh hào quang (`active`).
- **Màu sắc ngọn lửa tiến hóa theo số ngày Streak:**
  - `1 - 2` ngày: Lửa Vàng ấm áp (`#ffcc00`)
  - `3 - 6` ngày: Lửa Cam nhiệt huyết (`#ff9500`)
  - `7 - 14` ngày: Lửa Đỏ rực cháy (`#ff3b30`)
  - `15 - 29` ngày: Lửa Tím huyền bí (`#af52de`)
  - `30+` ngày: Lửa Xanh Dương tối thượng (`#007aff`)

---

## 🛠️ Công Nghệ Sử Dụng

1. **Frontend**: HTML5, Vanilla Javascript (ES6 Modules), CSS3 (Custom Variables, Flexbox/Grid, Animations).
2. **UI Framework**: Bootstrap 5.3.3 (Định dạng Layout, Modal, Forms).
3. **Icons**: Lucide Icons (Hỗ trợ hiển thị vector sắc nét).
4. **Database & Auth**: Google Firebase (Firebase Auth, Firestore NoSQL Database).
5. **Hosting**: Firebase Hosting.

---

## 💻 Cài Đặt và Khởi Chạy Local

### 1. Chuẩn bị biến môi trường
- Sao chép file `env-config.example.js` thành `env-config.js` ở thư mục gốc:
  ```javascript
  window.__APP_CONFIG__ = {
    FIREBASE_API_KEY: "YOUR_API_KEY",
    FIREBASE_AUTH_DOMAIN: "YOUR_AUTH_DOMAIN",
    FIREBASE_PROJECT_ID: "YOUR_PROJECT_ID",
    FIREBASE_STORAGE_BUCKET: "YOUR_STORAGE_BUCKET",
    FIREBASE_MESSAGING_SENDER_ID: "YOUR_MESSAGING_SENDER_ID",
    FIREBASE_APP_ID: "YOUR_APP_ID",
    FIREBASE_MEASUREMENT_ID: "YOUR_MEASUREMENT_ID"
  };
  ```
- Thay thế các giá trị trên bằng thông tin dự án Firebase của bạn từ bảng điều khiển Firebase Console.

### 2. Chạy ứng dụng trên máy local
- Sử dụng bất kỳ trình máy chủ web tĩnh nào để chạy dự án. Bạn có thể sử dụng Node.js `http-server` hoặc tính năng Live Server trong VS Code:
  ```bash
  # Cài đặt http-server toàn cục nếu chưa có
  npm install -g http-server
  
  # Khởi chạy server tại thư mục gốc của dự án
  http-server -p 3000
  ```
- Mở trình duyệt và truy cập: `http://localhost:3000` hoặc `http://localhost:3000/login.html`.

---

## 🔒 Bảo Mật & Cấu Trúc Firestore

Cơ sở dữ liệu được tổ chức dưới dạng cấu trúc phân cấp bảo mật cho từng người dùng:
- `/users/{userId}`: Tài liệu cấu hình chính (Tên, Email, `totalPoints`, `carryOverPoints`, `rankPeriodStartAt`, `streakCount`, `lastStreakDate`).
- `/users/{userId}/profile/main`: Thông tin chi tiết hồ sơ cá nhân.
- `/users/{userId}/vocabulary/{wordId}`: Tập hợp từ vựng cá nhân và thống kê học tập từ đó.
- `/users/{userId}/sessions/{sessionId}`: Danh sách các buổi học được phân nhóm.
- `/users/{userId}/quizAttempts/{attemptId}`: Lịch sử và điểm số của từng bài luyện tập đã thực hiện.
