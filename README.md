# 🏛️ Bảo tàng số Lịch sử Đảng Cộng sản Việt Nam (3D Online)

## 📖 Giới thiệu dự án

**Bảo tàng số 3D Lịch sử Đảng** là một không gian bảo tàng ảo tương tác trực tiếp trên trình duyệt web (không cần cài đặt), được xây dựng nhằm đổi mới phương pháp học tập và tìm hiểu lịch sử, mang lại trải nghiệm trực quan, sinh động cho người xem.

Người tham quan có thể tự do điều khiển nhân vật 3D dạo bước qua khuôn viên và các phòng trưng bày, tương tác với các hiện vật để xem hình ảnh tư liệu, đọc ý nghĩa lịch sử, nghe thuyết minh tự động và cùng tham quan với bạn bè trong thời gian thực.

---

## ✨ Các điểm nổi bật

* **🏛️ Không gian tham quan đa dạng:**
  * **Khuôn viên ngoài trời:** Trưng bày 12 hiện vật lịch sử tiêu biểu, có dây đèn màu, băng rôn, bồn hoa và biển chỉ đường.
  * **Khu vui chơi (cổng bên trái khi nhìn từ tòa nhà ra sân):** đu quay ngựa gỗ, xích đu, bập bênh, cầu trượt leo được, đài phun nước và sân bóng đá mini với quả bóng đá/đẩy được.
  * **Khu parkour (cổng bên đối diện):** đường chạy 19 bệ nhảy có bấm giờ (Space để nhảy), lưu kỷ lục ngay trên máy bạn.
  * **Tầng 2 mở rộng:** 4 Phòng ảnh tư liệu (VI – IX) lên bằng thang máy kính rồi đi qua hai đầu hành lang; các khung ảnh được khai báo trong `Frontend/content.js` (mục `upperRooms`, mã khung U1-01 … U4-08).
  * **Tòa nhà bảo tàng:** Gồm **1 Sảnh chính** (giai đoạn 1930 – 1945) cùng **5 Phòng trưng bày chuyên đề** tái hiện các chặng đường lịch sử từ năm 1930 đến nay.
* **🎙️ Tư liệu & Thuyết minh sinh động:** Bấm vào từng hiện vật để xem hình ảnh tư liệu, thông tin bối cảnh, bài học lịch sử và nghe giọng đọc thuyết minh.
  * Nút **Thuyết minh** luôn dùng tiếng Việt. Nếu thiết bị chưa có giọng Việt, trình phát dùng bản thuyết minh tiếng Việt có sẵn trong website. Bấm **Dừng đọc** hoặc đóng thông tin hiện vật để dừng. Khi sửa nội dung, tạo lại bản thu theo hướng dẫn trong `Frontend/sounds/narration/README.md`.
* **🚁 Drone Show (phím F9):** 150 giây, 1.800 drone (760 trên điện thoại, 2.800 trên máy mạnh) tạo thành 7 đội hình: vua Lý Thái Tổ ban Chiếu dời đô, Rồng thời Lý, lá cờ Quyết chiến Quyết thắng ở Điện Biên Phủ, xe tăng 390 húc cổng Dinh Độc Lập, chân dung Chủ tịch Hồ Chí Minh, trống đồng và chim Lạc, Quốc kỳ kết bằng pháo hoa. Nhấn C để xem ở góc điện ảnh. Cả phòng xem cùng lúc. Chi tiết trong `docs/drone-show/README.md`.
* **👥 Trải nghiệm nhiều người cùng lúc (Realtime):** Nhiều người có thể cùng vào bảo tàng, nhìn thấy nhân vật của nhau di chuyển, thực hiện cử chỉ (vẫy tay, vỗ tay) và nhắn tin trò chuyện trực tiếp.
* **📱 Dễ dàng tiếp cận:** Chạy mượt mà trên cả máy tính (chuột, bàn phím) và điện thoại di động (cần gạt cảm ứng), vào nhanh qua liên kết hoặc quét mã QR.


