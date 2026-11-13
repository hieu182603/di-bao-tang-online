# Drone Show Blender v5 — 11 cảnh đã duyệt

Bản web cục bộ dùng đúng bản Blender được người dùng duyệt ngày 14/11/2026, gồm phần bổ sung 938 LED nền quanh chữ Lăng Bác. Tổng đội 21.000 ID; 7 cảnh cũ giữ nguyên hình và chuyển động. Xe tăng giữ hình tĩnh như bản gốc.

Revision: `eleven-scenes-v5-2026-11-14`. Asset tag: `b5-91a95ac1db40`.
SHA-256 manifest: `91a95ac1db40ab70f16ce2381092f5df148c3a100eab70efcc6c2adcf5c427b8`.

## Chạy trên máy

```powershell
$env:PORT='5191'
node Frontend/dev-server.js
```

Mở http://localhost:5191/?autostart=1. F9 phát Drone Show, F10 nối tiếp pháo hoa F8. Nhấn hai lần F9/F10 trong 2,5 giây để dừng. Các lệnh chat `/f9`, `/drone`, `/drones`, `/droneshow` được giữ nguyên.

F9 kết thúc nội dung ở giây 210, nhạc dừng ở 210, LED mờ dần 4,5 giây rồi chờ tàn pháo 8 giây. F10 nối màn F8 60 giây từ giây 210; F8 chạy không nhạc. F8 khi đang F9 chỉ được nhận từ cảnh cờ (187 giây); nếu thêm sau 210 giây thì pháo hoa bắt đầu ngay và nhạc vẫn dừng.

## Timeline đã duyệt

| # | Cảnh | Giữ hình (s) | LED sáng |
|---|---|---|---|
| 1 | Trống đồng và đôi chim hạc | 10–15 | 9,967 |
| 2 | Vua Lý Thái Tổ và Chiếu dời đô | 22–33 | 11,433 |
| 3 | Rồng thời Lý | 40–53 | 8,519 |
| 4 | Hoàng thành Thăng Long | 60–70 | 20,154 |
| 5 | Chùa Một Cột | 77–87 | 19,146 |
| 6 | Cầu Long Biên và con thuyền | 94–103 | 17,391 |
| 7 | Chủ tịch Hồ Chí Minh | 110–121 | 7,589 |
| 8 | Chiến thắng Điện Biên Phủ | 128–141 | 6,626 |
| 9 | Xe tăng 390 và Dinh Độc Lập | 148–163 | 11,932 |
| 10 | Lăng Chủ tịch Hồ Chí Minh | 170–180 | 18,834 |
| 11 | Quốc kỳ Việt Nam | 187–210 | 5,067 |

Cất cánh theo tám khối hộp: 0–5 giây; ghép cảnh đầu: 5–10 giây. Morph giữa các cảnh dài 7 giây. Marker pháo hoa: 197 / 201 / 205 / 210. Gain cờ ×2 tăng 180–187 giây; nhánh hạ cánh giảm 210–213 giây.

`landing:false` mặc định dừng nội dung ở 210 giây. Dữ liệu vẫn có tách đội hình 210–216 và hạ cánh 216–228; bật `DroneShowConfig.landing=true` trước khi nạp dữ liệu để xem đầy đủ.

Bốn cảnh mới: Hoàng thành có cờ bay; Chùa Một Cột có sen và sóng sáng; Cầu Long Biên có thuyền và mái chèo, bỏ phản chiếu vàng; Lăng có ánh sáng theo lớp và chữ `CHỦ TỊCH / HỒ-CHÍ-MINH` với LED nền xám xanh.

## Dữ liệu và hiển thị

`Frontend/drone-show/blender-v5/`: manifest, timeline và 96 binary (117.49 MB). Chỉ các file được liệt kê trong manifest được nạp; runtime không tải ZIP, blend, PC2 hoặc video. `.gitattributes` giữ nguyên byte cho toàn bộ dữ liệu drone.

Loader kiểm revision, hash, dtype, shape, số ID và giá trị hữu hạn. Tải tối đa bốn file song song, giữ dữ liệu cho replay. Desktop dùng đủ 21.000 ID. Chế độ thiết bị di động giữ cơ chế lấy mẫu 1/3 (1/6 trên thiết bị RAM thấp) hiện có; thêm `?droneStride=1` để kiểm tra đủ chi tiết. LOW chỉ tắt glow; tier không đổi số ID.

Xuất trục Blender `(x,y,z)` thành web `(x,z,-y)`; pivot `(0,85,0)`, stage `(0,120,-100)`, scale 1,15. Bounding sphere tính từ bounds toàn timeline và cộng biên cho glow. Vị trí, brightness nội suy 4 Hz; cờ 10 Hz và màu sao 30 Hz. Shader giữ linear RGB, nhân brightness một lần và emission gain theo timeline.

Các client multiplayer chỉ nhận cùng asset tag; cần tải lại trang sau khi nâng bản. Kiểm thử dùng `DroneShow.start()` hoặc API local không broadcast; không phát lệnh sang phòng production.

## Kiểm chứng

```powershell
python scripts/drone-show/test_blender_parity.py
$env:APP_URL='http://localhost:5191/?autostart=1'
node scripts/drone-show/test_blender_web.js
$env:APP_URL='http://localhost:5191'
node scripts/drone-show/test_combo_f10.js
```

Báo cáo hiện tại: `blender-import.json`, `blender-parity.json`, ảnh và báo cáo trong `blender-qa-v5/`. Kết quả cũ trong `blender-qa-v2/` là lịch sử, không dùng để xác nhận v5. Báo cáo JSON ghi kết quả thực tế từng lần chạy.

Nguồn đã duyệt: `E:/Blender/DroneShow_Vietnam/blender/Vietnam_DroneShow_11Scenes_Review.blend`. Quét toàn timeline Blender: 6.841 frame, tốc độ và gia tốc đạt ngưỡng đồ họa, các mối nối liên tục. Đây là dữ liệu mô phỏng đồ họa; không phải kế hoạch bay thiết bị thật.

Bản cập nhật này dành cho web cục bộ theo yêu cầu người dùng; chưa triển khai website công khai, chưa commit/push.

## Kết quả kiểm thử bản này

- Parity: 163 thời điểm, đủ 21.000 ID và số LED của 11 cảnh; xe tăng tĩnh như bản gốc.
- Trình duyệt: 23/23 PASS, không lỗi JavaScript/shader; 55 ảnh QA.
- F10: 26/26 PASS, nối pháo hoa và dừng nhạc ở 210 giây.
- Góc nhìn sân bảo tàng có đèn dây phía trước có thể che một phần chữ; người chơi có thể di chuyển góc nhìn. Ảnh camera tham chiếu và crop xác nhận chữ và LED nền đầy đủ.
