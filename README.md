# Bảo tàng số Lịch sử Đảng Cộng sản Việt Nam (3D Online)

Sản phẩm sáng tạo môn Lịch sử Đảng (VNR) – Nhóm 2. Bảo tàng 3D chạy trên trình duyệt: sân trước 12 hiện vật ngoài trời, tòa nhà 5 phòng trưng bày, người chơi là người que, nhiều người vào cùng lúc thấy nhau và chat được.

## Cấu trúc

```
Frontend/   Web tĩnh (HTML/JS/Three.js): index.html, app.js, net.js, content.js, config.js, images/, models/
Backend/    ASP.NET Core 8 + SignalR (nhiều người chơi, chat)
database.rules.json   Quy tắc bảo mật Firebase (phương án dự phòng)
```

## Chạy thử

```bash
cd Frontend
node dev-server.js    # http://localhost:5173
```

Chế độ nhiều người (tùy chọn):

```bash
cd Backend
dotnet run            # http://localhost:5089, khớp BACKEND_URL trong Frontend/config.js
```

Không có Backend thì web tự chuyển sang Firebase, hoặc chế độ một người.

## Điều khiển

WASD/phím mũi tên: đi · Chuột: nhìn · E/bấm hiện vật: xem thông tin · Space: nhảy · V: đổi góc nhìn · T: chat

## Deploy

Frontend là web tĩnh, deploy thư mục `Frontend/` lên GitHub Pages, Vercel hoặc Netlify. Backend deploy riêng, rồi đổi `BACKEND_URL` trong `Frontend/config.js`.

Sửa nội dung trưng bày tại `Frontend/content.js`.
