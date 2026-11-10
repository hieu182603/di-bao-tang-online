# Game Bảo tàng Lịch sử Online – Bảo tàng số Lịch sử Đảng Cộng sản Việt Nam

Sản phẩm sáng tạo môn Lịch sử Đảng (VNR) – Nhóm 2. Bảo tàng 3D chạy ngay trên trình duyệt (máy tính và điện thoại), không cần cài đặt.

- Sân trước với 12 hiện vật ngoài trời xếp theo lộ trình thời gian (1954 → 30/4/1975), hồ cá, vườn hoa hồng – tulip, lũy tre ngà.
- Tòa nhà bảo tàng: sảnh chính 1930–1945 (ảnh Chủ tịch Hồ Chí Minh, cờ Tổ quốc, cờ Đảng) và 5 phòng trưng bày 1945 → nay.
- 15 hiện vật thật trong tủ kính, ảnh tư liệu có nguồn và giấy phép rõ ràng.
- Thang máy kính lên tầng 2 và ban công ngắm cảnh.
- Mỗi người là một người que có tên trên đầu; nhiều người vào cùng lúc thấy nhau, chat, vẫy tay, nhảy, đi theo người thuyết minh.

## Chơi ngay

👉 **https://hieu182603.github.io/di-bao-tang-online/** (bản chạy sẵn trên GitHub Pages, chế độ một người cho tới khi bật Firebase)

## Deploy 1 cú bấm

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhieu182603%2Fdi-bao-tang-online&project-name=di-bao-tang-online)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/hieu182603/di-bao-tang-online)

Bấm một trong hai nút, đăng nhập (miễn phí), bấm **Deploy**. Không cần cấu hình gì: đây là web tĩnh, không có bước build.
Xong sẽ có link dạng `https://ten-du-an.vercel.app` để gửi cho mọi người.

Cách khác: tải code về (**Code → Download ZIP**), rồi kéo cả thư mục vào https://app.netlify.com/drop.

## Điều khiển

| Phím | Tác dụng |
| --- | --- |
| W A S D / mũi tên | Đi lại (giữ Shift để chạy) |
| Kéo chuột | Nhìn xung quanh |
| Bấm vào hiện vật / E | Xem thông tin; trong thang máy: lên/xuống tầng |
| Space | Nhảy |
| V | Đổi góc nhìn người thứ nhất / thứ ba |
| T | Mở ô chat |
| Điện thoại | Cần gạt bên trái để đi, vuốt màn hình để nhìn |


## Cấu trúc thư mục

```
.
├── Frontend/              # Giao diện web tĩnh (HTML/JS/Three.js)
│   ├── index.html         # Trang chính
│   ├── style.css          # Giao diện (màn hình chào, nút, chat)
│   ├── app.js             # Dựng không gian 3D, người que, di chuyển
│   ├── net.js             # Kết nối nhiều người (SignalR / Firebase)
│   ├── content.js         # Toàn bộ chữ trưng bày – sửa nội dung ở đây
│   ├── config.js          # Cấu hình Backend URL và Firebase
│   ├── images/            # Ảnh tư liệu (hien_vat, sanh, tu_kinh...)
│   ├── models/            # Mô hình 3D (.glb) và ảnh nhân vật
│   ├── dev-server.js      # Máy chủ tĩnh chạy thử trên máy
│   └── artifact.html, make-artifact.js  # Bản cho link claude.ai (tùy chọn)
├── Backend/               # ASP.NET Core 8 + SignalR (nhiều người chơi, chat)
└── database.rules.json    # Quy tắc bảo mật Firebase
```

## Chạy thử trên máy

Frontend:
```bash
cd Frontend
node dev-server.js
```
Mở http://localhost:5173. (Không mở thẳng file `index.html`, vì trình duyệt sẽ chặn ảnh 3D.)

Backend (tùy chọn, cho chế độ nhiều người; mặc định chạy ở http://localhost:5089 như `Frontend/config.js`):
```bash
cd Backend
dotnet run
```

## Đưa lên Vercel bằng dòng lệnh (tùy chọn)

1. Đăng ký tài khoản miễn phí tại https://vercel.com (đăng nhập bằng GitHub hoặc Gmail).
2. Trong thư mục `Frontend/` chạy:
   ```bash
   npx vercel login
   npx vercel --prod
   ```
   Lần đầu Vercel hỏi vài câu, cứ Enter để chọn mặc định. Xong sẽ có link dạng `https://ten-du-an.vercel.app`.

## Bật chế độ nhiều người (cả lớp vào không cần đăng nhập)

Dùng Firebase Realtime Database, gói miễn phí (Spark) cho tối đa 100 người online cùng lúc.

1. Vào https://console.firebase.google.com → **Add project** (tắt Google Analytics cho nhanh).
2. Menu trái **Build → Realtime Database → Create database** → chọn vị trí **Singapore (asia-southeast1)** → chọn **Start in locked mode**.
3. Tab **Rules**, dán nội dung file `database.rules.json` → **Publish**.
4. Bấm biểu tượng bánh răng → **Project settings** → mục *Your apps* bấm **</>** (Web) → đặt tên → **Register app**.
   Firebase hiện một đoạn `const firebaseConfig = {...}`.
5. Mở `config.js`, thay `window.FIREBASE_CONFIG = null;` bằng:
   ```js
   window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", databaseURL: "...", projectId: "...", appId: "..." };
   ```
   (copy đúng các giá trị Firebase đưa, **phải có `databaseURL`**).
6. Đẩy lại lên Vercel: `npx vercel --prod`.

Khi thuyết trình: mở bảo tàng → bấm nút số người ở góc phải → **Mã QR mời cả lớp** → chiếu lên máy chiếu cho cả lớp quét.

> Các khóa trong `config.js` của Firebase là khóa công khai cho web, để trong code là bình thường. Quyền ghi được giới hạn bằng `database.rules.json`.
> Gói miễn phí giới hạn lượng dữ liệu tải mỗi tháng (10 GB) – thừa cho vài buổi thuyết trình, nhưng đừng để cả trăm người treo máy nhiều ngày.

## Sửa nội dung

- Chữ trên các bảng, hiện vật: sửa trong `content.js`.
- Thêm ảnh cho phòng II–V: bỏ ảnh vào `images/`, thêm `img: "ten-file-khong-duoi"` vào mục tương ứng trong `content.js`
  (hiện chỉ Phòng I hiển thị dạng khung ảnh; các phòng khác hiển thị bảng chữ).

## Nguồn ảnh hiện vật ngoài trời

Ảnh lấy từ Wikimedia Commons, dùng theo giấy phép ghi bên cạnh. Ảnh CC BY-SA nếu chỉnh sửa phải giữ cùng giấy phép. Nội dung chữ và nguồn tham khảo nằm trong `images/hien_vat/credits.json`.

| Hiện vật | Tác giả – Giấy phép | Trang gốc |
| --- | --- | --- |
| Xe tăng 390 | Vyacheslav Argenberg – CC BY 2.0 | https://commons.wikimedia.org/wiki/File:T-54A_or_Type_59_main_battle_tank_at_the_Reunification_Palace.jpg |
| Máy bay MiG-21 số hiệu 5121 | Gary Todd – CC0 | https://commons.wikimedia.org/wiki/File:Mikoyan-Gurevich_MiG-21MF-75_%E2%80%985121%E2%80%99_(9735510298).jpg |
| Pháo cao xạ 37 mm | kitmasterbloke – CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Soviet_37mm_61-K_AA_gun_downed_three_French_aircraft_010254_at_Dien_Bein_Phu.jpg |
| Lựu pháo 105 mm | Gary Todd – CC0 | https://commons.wikimedia.org/wiki/File:105mm_Howitzer_Used_at_Dienbienphu,_1954_(9732175909).jpg |
| Súng cối 120 mm | kitmasterbloke – CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Chinese_120mm_K55_Mortar.jpg |
| Xe đạp thồ | Gary Todd – CC0 | https://commons.wikimedia.org/wiki/File:Anti-French_War_for_Vietnamese_Independence,_1950s_(9732184805).jpg |
| Xe tăng PT-76 số hiệu 555 | kitmasterbloke – CC BY 2.0 | https://commons.wikimedia.org/wiki/File:555_PT-76_tank.jpg |
| Xe vận tải Trường Sơn | kitmasterbloke – CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Soviet_ZiL-157_Truck.jpg |
| Tên lửa phòng không SAM-2 | kitmasterbloke – CC BY 2.0 | https://commons.wikimedia.org/wiki/File:SAM-2_Guideline_missile_and_launcher_-_54427819841.jpg |
| Xác B-52 ở hồ Hữu Tiệp | Pdhadam – CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:B52_wreckage,_H%E1%BB%AFu_Ti%E1%BB%87p_Lake,_Hanoi_(landscape).jpg |
| Pháo 130 mm M-46 | kitmasterbloke – CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Soviet_130mm_M46_towed_gun.jpg |
| Máy bay F-5E | BluesyPete – CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Vietnam-0026.jpg |

## Mô hình 3D tự dựng trong Blender

Dựng theo ảnh tư liệu Wikimedia Commons (xem bảng ảnh ở trên) và thông số thật; lớp sơn bạc màu, gỉ sét, bụi bẩn được bake thành texture. File nguồn: `E:\Blender\hien_vat\hien_vat_ngoai_troi.blend`.

| Hiện vật | File |
| --- | --- |
| Pháo cao xạ 37 mm (61-K) | `models/aa37_61k.glb` |
| Pháo 130 mm M-46 | `models/m46_130.glb` |
| Xác B-52 ở hồ Hữu Tiệp (kèm mặt hồ) | `models/b52_wreck.glb` |
| Xe đạp thồ Điện Biên Phủ | `models/xe_dap_tho.glb` |

## Nguồn mô hình 3D ngoài trời (Sketchfab)

Tải từ Sketchfab, đã giảm số đa giác và thu nhỏ texture cho web. Bật/tắt từng mô hình trong `config.js` (`window.REAL_MODELS`).

| Dùng cho | File | Mô hình gốc |
| --- | --- | --- |
| Xe tăng lội nước PT-76 | `models/pt76.glb` | "PT-76" – https://sketchfab.com/3d-models/941b0d0fc4074694879a2a642289282a |
| Tên lửa SAM-2 | `models/sam2.glb` | "SAM S-75 Dvina" – https://sketchfab.com/3d-models/ed7d4831832d499482a6aa9620a858e4 |
| Lựu pháo 105 mm | `models/m101.glb` | "M101 howitzer (WARNO)" – https://sketchfab.com/3d-models/5f83c8e803444073bee48e90628e4d1e |
| Xe vận tải Trường Sơn | `models/zis150.glb` | "Zis 150" – https://sketchfab.com/3d-models/983a0ebdd79b467ea1efffdb43cb8ddf |
| Súng cối 120 mm | `models/mortar120.glb` | "120迫击炮" – https://sketchfab.com/3d-models/91c22766562b467fa3773778df5dde96 |
| Cây bóng mát ở sân | `models/tree_shade.glb` | "Realistic Tree" – https://sketchfab.com/3d-models/d989c0f801d847b9a74992ec4ddcfdfc |
| Ghế công viên | `models/bench.glb` | "Classic Park Bench (Low Poly)" – https://sketchfab.com/3d-models/01a5b64427984632bb44242da3813bb1 |

## Nguồn ảnh hiện vật trong tủ kính

Ảnh từ Wikimedia Commons theo giấy phép ghi bên cạnh; nội dung và nguồn tham khảo trong `images/tu_kinh/artifacts.json`.

| Hiện vật | Tác giả – Giấy phép | Trang gốc |
| --- | --- | --- |
| Báo Thanh Niên | Không rõ tác giả (tư liệu 1925–1930, qua Indomemoires) – Public domain | https://commons.wikimedia.org/wiki/File:Thanh_Niên_(Canton,_1925-1930)_-_Indomemoires.jpg |
| Sách “Đường Kách mệnh” | Hoangkid – CC BY-SA 4.0 (ảnh chụp; bản thân cuốn sách thuộc phạm vi công cộng) | https://commons.wikimedia.org/wiki/File:Duong_Kach_Menh_(Original).jpg |
| Báo Việt Nam Độc lập số 101 | Không rõ tác giả – Public domain | https://commons.wikimedia.org/wiki/File:Newspaper_Việt_Nam_Độc_lập_no.101_(1941-08-01).jpg |
| Bản Tuyên ngôn Độc lập | Chính phủ Việt Nam Dân chủ Cộng hòa (ảnh: Cục Văn thư và Lưu trữ nhà nước) – Public domain | https://commons.wikimedia.org/wiki/File:Bản_Tuyên_ngôn_độc_lập_của_nước_Việt_Nam_Dân_chủ_Cộng_hòa._-_Trung_tâm_Lưu_trữ_quốc_gia_III._Phông_Phủ_Thủ_tướng,_hồ_sơ_586,_tờ_số_1_–_3.jpg |
| Giấy bạc 20 đồng (“giấy bạc Cụ Hồ”) | Chính phủ Việt Nam Dân chủ Cộng hòa (ảnh: Art-Hanoi) – Public domain | https://commons.wikimedia.org/wiki/File:20_Đồng_-_Việt_Minh_(1946)_North_Vietnam_01.jpg |
| Hiến pháp năm 1946 | Chính phủ Việt Nam Dân chủ Cộng hòa (ảnh: Cục Văn thư và Lưu trữ nhà nước) – Public domain | https://commons.wikimedia.org/wiki/File:Hiến_pháp_Việt_Nam_Dân_chủ_Cộng_hòa_năm_1946_-_Cục_Văn_thư_và_Lưu_trữ_nhà_nước.jpg |
| Bản thảo “Lời kêu gọi toàn quốc kháng chiến” | Hồ Chí Minh (ảnh: Cục Văn thư và Lưu trữ nhà nước) – Public domain | https://commons.wikimedia.org/wiki/File:Bản_thảo_gốc_“Lời_kêu_gọi_toàn_quốc_kháng_chiến”_của_Chủ_tịch_Hồ_Chí_Minh_–_Bảo_vật_quốc_gia.jpg |
| Giấy giới thiệu của Chánh ủy Khu VII | Daderot – CC0 | https://commons.wikimedia.org/wiki/File:Mission_letter_from_the_southern_Vietnamese_Communist_Party_to_Ho_Thi_Bi,_who_led_the_economic_affairs_of_a_resistance_group,_Saigon,_1951_-_Vietnamese_Women's_Museum_-_Hanoi,_Vietnam_-_DSC04202.JPG |
| Dép cao su (dép lốp) | Joe Mabel – CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:FLMM_-_Viet_Cong_sandals.jpg |
| Mũ rơm chống mảnh bom | Bảo tàng Phụ nữ Việt Nam – CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Straw_hat,_Vietnamese_Women's_Museum.jpg |
| Mũ tai bèo ngụy trang của bà Trần Thị Sửa | Daderot – CC0 | https://commons.wikimedia.org/wiki/File:Camouflage_hat_belonging_to_Tran_Thi_Sua,_1973-1975_-_Vietnamese_Women's_Museum_-_Hanoi,_Vietnam_-_DSC04222.JPG |
| Phiếu thực phẩm thời bao cấp | Myra Siason – CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Tem_phiếu_thời_bao_cấp.jpg |
| Hiến pháp năm 1980 | Nhà nước CHXHCN Việt Nam (ảnh: Cục Văn thư và Lưu trữ nhà nước) – Public domain | https://commons.wikimedia.org/wiki/File:Hiến_pháp_năm_1980_-_Cục_Văn_thư_và_Lưu_trữ_nhà_nước.jpg |
| Lệnh công bố Hiến pháp năm 1992 | Nhà nước CHXHCN Việt Nam (ảnh: Cục Văn thư và Lưu trữ nhà nước) – Public domain | https://commons.wikimedia.org/wiki/File:Lệnh_số_68-LCT-HĐNN8_ngày_18-04-1992_v-v_công_bố_Hiến_pháp_năm_1992.jpg |
| Hiến pháp năm 2013 | Quốc hội Việt Nam – Public domain | https://commons.wikimedia.org/wiki/File:2013_Constitution_of_the_S.R._Viet_Nam.pdf |

## Ảnh và cờ ở tường cuối sảnh

| Nội dung | Tác giả – Giấy phép | Trang gốc |
| --- | --- | --- |
| Chân dung Chủ tịch Hồ Chí Minh (khoảng 1946) | Không rõ tác giả – Public domain | https://commons.wikimedia.org/wiki/File:Ho_Chi_Minh_-_1946_Portrait_(cropped).jpg |
| Cờ Đảng Cộng sản Việt Nam | Eureka287, Lasse Havelund – CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Flag_of_the_Communist_Party_of_Vietnam.svg |
| Cờ Tổ quốc | Vẽ bằng code theo mẫu quốc kỳ (nền đỏ, sao vàng năm cánh) | — |
