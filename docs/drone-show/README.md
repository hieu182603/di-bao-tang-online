# F9 — Blender v2, 14.000 ID và nhạc

Runtime hiện dùng revision `box-launch-landing-v3-2026-11-12`, schema `vn-source-guided-drone/1.1`. Các ảnh, benchmark và báo cáo trong `screenshots/` là của runtime procedural cũ; không dùng làm bằng chứng cho bản Blender. Kết quả mới nằm ở `blender-qa-v2/`, `blender-parity.json` và `blender-import.json`.

## Điều khiển

F9 bắt đầu màn diễn 150 giây và bài **Thịnh Vượng Việt Nam Sáng Ngời – buitruonglinh** do người dùng cung cấp. Trong show hoặc lúc đang tải, nhấn F9 hai lần trong 2,5 giây để dừng. Giữ phím không lặp lệnh. Giữ các lệnh chat `/f9`, `/drone`, `/drones`, `/droneshow`.

**F10** chạy Drone Show rồi tự nối màn pháo hoa F8 (60 giây) ngay khi pháo hoa của cảnh cờ kết thúc (marker `FIREWORKS_END`, giây 150); nhạc chạy tiếp đến ~214 giây. Lá cờ giữ nguyên timeline Blender (hết ở 150 s rồi mờ dần), không bị cắt. Nhấn F10 hai lần để dừng cả drone, pháo hoa và nhạc.

**F8 khi đang F9**: bị bỏ qua trước cảnh cờ (124 s). Từ cảnh cờ trở đi, F8 chuyển show thành như F10 — pháo hoa F8 chờ đến giây 150 mới bắn; nếu bấm sau 150 s (cờ đang mờ, nhạc đã dừng) thì F8 bắn ngay và nhạc phát tiếp từ thời điểm đó. Lệnh được đồng bộ cho cả phòng (trường thứ 6 của gói `__ds__`: `0` = F9, `1` = combo nối ở 150 s, số giây = combo nối tại giây đó).

**Tải trước**: 15 giây sau khi vào bảo tàng, máy tự tải ~60 MB dữ liệu drone lúc rảnh để F9/F10 chạy ngay (đo được ~130 ms thay vì ~27 s). Bỏ qua trên thiết bị cảm ứng, Save-Data hoặc 2G; thêm `?nopreload=1` để tắt. Shader drone + pháo hoa được biên dịch sẵn khi tải để tránh khựng ở viên pháo hoa đầu tiên.

Không có camera C, caption, toast hoặc phím H. Người chơi tự điều khiển góc nhìn. Nút âm thanh có sẵn cũng tắt/bật nhạc. Nhạc giảm âm trong hai giây cuối và dừng ở giây 150; LED tắt dần đến 154,5 giây, sau đó giữ thời gian tàn pháo 8 giây rồi hoàn trả trạng thái trời. Bài gốc dài 234,96 giây; show sử dụng 150 giây đầu.

## Dữ liệu và timeline

`Frontend/drone-show/blender-v3/` chứa manifest, timeline và 64 binary (thêm `landing_00/01` — tách đội hình và hạ cánh 150–168 s). Mặc định `DroneShowConfig.landing = false`: show dừng ở lá cờ tại `FIREWORKS_END` (150 s) rồi mờ dần như V2; đặt `true` để chạy cảnh hạ cánh. `.gitattributes` giữ nguyên byte (CRLF) của thư mục này vì manifest được ghim SHA-256. Không tải ZIP, blend, PC2 hoặc video ở runtime. Nhạc dùng URL tương đối `audio/thinh-vuong-viet-nam-sang-ngoi.mp3` (9.398.537 byte).

| Cảnh | Giữ hình (s) | LED sáng |
|---|---|---|
| Đông Sơn – Chim Lạc | 12–20 | 9.967 |
| Lý Thái Tổ | 28–38 | 11.436 |
| Rồng thời Lý | 46–58 | 8.519 |
| Bác Hồ trên hoa sen | 66–78 | 7.589 |
| Điện Biên Phủ | 86–98 | 6.626 |
| Xe tăng 390 và Dinh Độc Lập | 106–116 | 11.932 |
| Quốc kỳ | 124–150 | 5.000 |

Mở màn từ Blender: tám luồng cất cánh 0–6 giây, ghép trống đồng 6–12 giây. Các morph: 20–28, 38–46, 58–66, 78–86, 98–106 và 116–124. Không chèn thêm intro procedural hoặc tăng thời lượng show. Chọn cue theo khoảng nửa mở [start,end), riêng 150 dùng endpoint cờ. Cảnh xe tăng giữ nguyên vị trí, RGB và brightness, không còn chuyển động xe/cổng cũ.

## Runtime

- `drone-blender.js`: decoder thuần dùng được trong Node/browser, giải mã typed array theo manifest. Nội suy sample vị trí/brightness 4 hoặc 10 Hz, màu sao 30 Hz. Morph dùng smootherstep và arc đúng công thức export. Không rematch, random hoặc cắt ID.
- `drone-show.js`: một group, hai Points chung geometry, vị trí và RGBA cấp phát một lần. LOW tắt glow, mọi mức vẫn giữ 14.000 ID và cùng LED sáng. Không dùng JSON đội hình/procedural cũ.
- Vị trí export đã Y-up. Pivot (0,85,0), stage (0,120,-100), scale 1,15. Camera tham chiếu dùng cùng transform; horizontal FOV được đổi sang vertical theo aspect. `referenceCamera` chỉ là API QA, không chạy trong F9 thông thường.
- Shader nhận linear RGB, brightness nhân một lần, emission và bán kính lấy từ manifest. Lõi không pha trắng, không flicker, không ACES/exposure của scene; chuyển linear sang output encoding một lần. Cull theo max(RGB×brightness)<0,004. Depth test vẫn bật, depth write tắt. Giữ sửa depthWrite/alphaTest của sprite bảng tên.
- Loader dùng bốn kết nối, kiểm HTTP/byte length/dtype/shape/finite/ID. SHA256 manifest và binary được kiểm khi Web Crypto sẵn có (HTTPS/localhost). Dữ liệu đã xác minh toàn bộ hash khi import. Cache promise và dữ liệu cho replay; token generation chặn load cũ tự chạy sau stop. Lỗi chỉ báo console, không fallback sang hình cũ.
- Clock dùng thời gian tuyệt đối, không tích phân dt. Pause/seek/resume cập nhật nhạc và không phát lệnh cho cả phòng. Ngừng nhạc/queue đúng vòng đời. Autoplay ở client chưa từng tương tác có thể bị trình duyệt chặn; lỗi ghi console, không bật lại UI đã gỡ.

## Multiplayer và pháo hoa

Gửi `__ds__:action:seed:startTime:assetTag` (dưới giới hạn chat 80 ký tự), cùng revision tag `b3-4fc20580bd46`. Tag là prefix SHA256 manifest. Sender/parser/consumer và Firebase giữ cùng định dạng. Client khác revision hoặc client cũ thiếu tag bị từ chối, không phát lẫn đội hình. Cần tải lại trang trên tất cả máy sau khi nâng phiên bản.

Máy khởi động đặt clock sau khi tải xong để không mất cảnh cất cánh, rồi gửi start cho phòng; stop khi pending vẫn được xử lý và truyền. Client tải chậm bắt kịp master clock; stop vô hiệu hóa kết quả đang chờ. Khi có peer mới, client đang phát gửi lại clock để chat không làm mất trạng thái show và để người khởi động có thể rời phòng. Không truyền vị trí drone. Đồng bộ vẫn dựa vào Date.now(): sai lệch đồng hồ giữa máy thật là giới hạn chưa có server-time correction.

Finale đọc markers 137 / 141 / 145 / 150 từ timeline. Mỗi cue được tính thời điểm phóng trước theo FireworksDirector.ascent để nổ đúng thời điểm. Dùng spawnEffect hiện có, F8 độc lập vẫn bị chặn trong F9. Pháo bố trí hai bên hoặc rất cao sau cờ. Không phát dồn cue đã qua khi seek/late join; sau 150 không có quả mới. Không thay đổi engine F8.

## Kiểm thử và chạy lại

```powershell
$env:PORT='5191'; node Frontend/dev-server.js
python scripts/drone-show/test_blender_parity.py
node scripts/drone-show/test_drone_show.js
node scripts/drone-show/test_multiplayer_drone.js
node scripts/drone-show/bench_drone_show.js
```

Multiplayer cần backend cục bộ ở 5089. Các bài test chặn backend production và Firebase; dùng phòng riêng. Máy QA có SDK 8 nhưng csproj hiện target net10: backend được sao chép sang thư mục TEMP và chạy cùng source với target net8 chỉ để kiểm giao thức; không sửa csproj trong repo. Kết quả này không thay thế kiểm tra build/deploy net10.

Parity: toàn bộ 14.000 ID, 64 thời điểm (các hold, đầu/giữa/cuối morph, endpoint, thời gian lẻ và tua đảo thứ tự). Sai số GPU Float32 tối đa 0,000007627 m mỗi thành phần vị trí và 0,00000002981 RGBA so với decoder NumPy độc lập. Tolerance 0,00002 m / 0,000001 RGBA. Các số LED đúng bảng; xe tăng tĩnh tuyệt đối. Đây là so cùng buffer, không gán sai số nguồn Blender làm tolerance adapter.

Web QA chụp bảy hold, sáu midpoint morph, rồng 46/51/55 và góc nghiêng nhẹ, Finale 137/141/145/149. Kiểm F9/repeat, stop lúc loading, nhạc/seek/pause/mute, F8 trước/sau, natural finish và replay không tăng GPU geometry. Xem JSON báo cáo để biết kết quả thực tế và network failures. Favicon 404 của bảo tàng được ghi riêng, không bỏ qua lỗi asset drone/nhạc.

Đo hiệu năng chỉ áp dụng cho GPU/trình duyệt QA tại thời điểm chạy; không cam kết FPS trên điện thoại. `bench_drone_show.js` đo nền và cả ba mức 14.000 ID; không dùng số đo 760/1.800/2.800 drone của bản cũ.

## Cập nhật dữ liệu

Xác minh revision và SHA256 của gói bàn giao mới, sau đó copy đúng các entry trong manifest và timeline vào thư mục phiên bản mới. Cập nhật base/revision/hash pin/assetTag và cache version của script. Chạy lại parity, ảnh, multiplayer và benchmark. Không sửa buffer để bù góc máy hoặc giảm số ID. Nguồn Blender vẫn chỉ là bộ được người dùng duyệt.

Bản V3: manifest SHA256 `4fc20580bd46ce0e0c73e0e967103033b886762fa622c53eb61c980be8702d1c`. Bản V2 (cũ): ZIP SHA256 `d7224c25ee706e2d4cf5f642fb23db915a03f6e78ec358595725046de05ca6c6`; manifest SHA256 `117584ae41fb370364a736193d6a138a06e8a449a8ded5e6dba837b2f6afcb8a`. Kết quả V2 nằm trong `blender-qa-v2/`. Asset V1 cũ không còn được loader sử dụng.

Kết quả V2 mới: web 19/19 PASS; multiplayer QA 21/21 PASS. Đo riêng một Chrome headless 1280×720: nền 101,7 FPS; đoạn rồng 84,9–96,5 FPS, CPU cập nhật khoảng 0,267–0,283 ms/khung; Finale 83,2–96,4 FPS. Chênh lệch giữa tier có nhiễu, không suy ra HIGH nhanh hơn LOW. Sample cờ ở 130 s có thể bao gồm phóng chuẩn bị Finale; xem note trong benchmark.json. Bộ asset V1 đã chuyển sang bản sao lưu TEMP, không đóng gói vào website.
