# Drone Show (F9) — "Non sông một dải"

Màn drone ánh sáng dài 150 giây gồm 7 đội hình lịch sử và văn hoá Việt Nam, diễn trên bầu trời phía sau Bảo tàng Lịch sử Đảng 3D. Đoạn kết dùng chính hệ thống pháo hoa F8 sẵn có. Mỗi máy tự mô phỏng show trên GPU; khi chơi nhiều người, các máy chỉ trao đổi `seed` và `startTime`.

- Nghiên cứu tư liệu: [RESEARCH.md](RESEARCH.md)
- Thiết kế vector: [`scripts/drone-show/designs/`](../../scripts/drone-show/designs/)
- Ảnh xem trước của từng đội hình (dựng offline): [`previews/`](previews/)
- Ảnh chụp từ ứng dụng thật, báo cáo kiểm thử và benchmark: [`screenshots/`](screenshots/)

## 1. Sử dụng

| Thao tác | Tác dụng |
|---|---|
| **F9** | Bắt đầu Drone Show. Show được đồng bộ sang mọi người trong phòng. |
| **F9 hai lần** (trong 2,5 giây) | Dừng show cho cả phòng. Phải bấm hai lần để tránh dừng do lỡ tay. |
| **C** (khi show đang chạy) | Bật hoặc tắt góc nhìn điện ảnh. Chỉ đổi camera trên máy của mình, nhân vật vẫn đứng yên tại chỗ. |
| Esc hoặc di chuyển | Thoát góc nhìn điện ảnh |
| Chat `/f9`, `/drone`, `/droneshow` | Giống F9 (dùng được trên điện thoại) |
| F8 khi show đang chạy | Bị chặn và có thông báo, vì pháo hoa sẽ tự bắn ở màn kết |
| F9 khi màn pháo hoa F8 đang chạy | Bị chặn: chờ pháo hoa kết thúc hoặc nhấn F8 để dừng pháo hoa trước |

Tham số URL dùng cho kiểm thử:

- `?autostart=1&f9=1`: tự vào bảo tàng và phát show.
- `&droneAt=95`: tua tới giây 95.
- `&drones=low|balanced|high`: chọn mức chất lượng.
- `&cine=1`: bật góc nhìn điện ảnh.
- `?droneDebug=1`: hiện bảng công cụ debug (mục 10).

## 2. Kiến trúc và tệp

```
Frontend/
  drone-show.js                 Engine runtime (render, animator, chuyển cảnh, timeline, cue pháo hoa, camera, debug)
  drone-show/formations-*.json  Dữ liệu đội hình đã dựng offline: low 228 KB · balanced 526 KB · high 813 KB
  app.js        (sửa)           F9, phím C, lệnh chat, chặn F8 khi đang diễn, đồng bộ mạng, gọi update và camera mỗi khung
  net.js        (sửa)           Kênh đồng bộ __ds__:action:seed:startTime (+ Firebase /droneshow)
  fireworks.js  (sửa 1 dòng)    runEvents chỉ chạy biên đạo F8 khi show F8 đang chạy (sửa lỗi xả cue cũ)
  index.html, style.css (sửa)   Nạp drone-show.js, phụ đề cảnh #ds-caption
scripts/drone-show/
  designs/*.svg                 7 thiết kế vector gốc (+ hình chiếu cạnh xe tăng 390)
  svgflat.py                    Đọc SVG (path/arc/transform), làm mượt Catmull-Rom, font nét đơn có dấu tiếng Việt
  dronekit.py                   Lấy mẫu, lọc blue-noise, giải đúng N drone, ảnh xem trước
  portrait.py                   Chân dung: nét can tay, bản đồ mật độ, LED theo độ sáng
  scenes.py                     7 cảnh, rồng theo spline, xe tăng 3D, trống và chim, ghép Hungarian
  gen_designs.py                Sinh SVG có chi tiết lặp (Dinh Độc Lập, trống đồng, chim Lạc)
  build_formations.py           Chạy toàn bộ pipeline, xuất JSON và previews
  test_drone_show.js            Kiểm thử trực quan trên ứng dụng thật (Chrome headless, CDP)
  test_multiplayer_drone.js     Kiểm thử 3 người chơi với backend SignalR chạy cục bộ
  bench_drone_show.js           Benchmark FPS và CPU theo từng mức chất lượng
```

Dựng lại dữ liệu sau khi sửa thiết kế (cần Python 3 với numpy, scipy, Pillow):

```
python scripts/drone-show/gen_designs.py        # chỉ khi sửa Dinh Độc Lập, trống đồng hoặc chim Lạc
python scripts/drone-show/build_formations.py   # khoảng 1,5 phút cho cả 3 mức
```

Engine không cần sửa khi chỉ thay đổi dữ liệu đội hình.

## 3. Pipeline: tư liệu → SVG → lấy mẫu → toạ độ 3D → quỹ đạo → render

1. **Thiết kế SVG gốc** (đơn vị mét, gốc ở tâm đội hình). Mỗi phần tử mang thuộc tính ngữ nghĩa:
   - `data-group`: nhóm chuyển động.
   - `data-color`, `data-bright`: màu và độ sáng LED.
   - `data-z`: lớp chiều sâu 2.5D.
   - `data-sp`, `data-fsp`: mật độ của nét và của phần tô.
   - `data-prio`: thứ tự hiện ra khi hình thành.
   - `data-smooth`: làm mượt nét can tay.
   - `<text data-font="stroke">`: chữ dựng bằng font nét đơn tự vẽ, có dấu Ế, Ắ.
2. **Lấy mẫu** (`dronekit.py`):
   - *Contour sampling*: chia đều theo chiều dài cung. Đường kín được chia đều cả vòng.
   - *Area sampling*: lưới lục giác rung nhẹ cho nền lớn (lá cờ, đẹp khi gợn sóng). Poisson-disk kiểu "dart throwing" với bán kính thay đổi theo vị trí cho chân dung.
   - *Lọc blue-noise toàn cục*: nhận lần lượt nét chính (theo `prio`) trước, phần tô sau (thứ tự ngẫu nhiên cố định). Mỗi điểm phải cách các điểm đã nhận ít nhất ½(rᵢ+rⱼ)·0,9. Nhờ vậy drone không dồn cụm ở góc nhọn hay chỗ các nét giao nhau. Đội hình 3D (xe tăng, rồng) cộng thêm chênh lệch độ sâu khi tính khoảng cách.
   - *Đúng N drone*: số điểm tỉ lệ khoảng 1/s², nên khoảng cách cơ sở `s` được cập nhật theo s ← s·√(n/N), thường hội tụ trong 3–6 vòng. Phần dư bị cắt ở chỗ phần tô dày nhất.
3. **Chân dung** (`portrait.py`): không vẽ một khuôn mặt ngẫu nhiên.
   - 53 nét can tay theo toạ độ pixel của ảnh tư liệu năm 1946 (`05_chan_dung.svg`): đường bao đầu, tai, vai; mắt, mày, mũi, ria, miệng, nếp má; chòm râu và sợi râu; lọn tóc; cổ áo. Độ khớp được kiểm bằng cách vẽ chồng lên ảnh gốc.
   - Bản đồ mật độ = nền + độ lớn gradient (phát hiện cạnh) + vùng đặc trưng. Mắt và miệng dày khoảng gấp 2–3 lần vùng áo.
   - LED phần tô sáng theo độ sáng ảnh (gamma 1,15, tối đa 0,75), luôn thấp hơn nét nhận diện (0,8–1,0).
   - Màu nội suy hổ phách → trắng ấm cho da; tóc bạc dùng trắng lạnh.
   - Độ nổi 2.5D tối đa 2,2 m theo độ sáng.
4. **Rồng** (`scenes.py: dragon`): đội hình 3D chạy theo spline.
   - Spline thân gồm 257 mẫu, có dao động z. Bán kính thân r(u) = 0,4 + 2,5(1−u)^0,8, nở ở đầu và nhọn về đuôi.
   - Mỗi drone lưu toạ độ cục bộ (u, lệch tiếp tuyến, lệch pháp tuyến lưng, z): viền lưng và bụng, mặt vảy là lưới so le trên mặt ống 3D (θ từ −60° đến 60°), vây lưng.
   - Chân và đuôi gắn theo khung toạ độ của spline. Đầu, bờm, râu và ngọc gắn theo khung đầu.
   - Engine dựng lại spline mỗi khung, nên thân uốn lượn thật, không phải xoay cả hình như một tấm bảng.
5. **Xe tăng 390** (`scenes.py: tank_parts`): khung 3D theo kích thước Type 59, phóng ×4,8.
   - Gồm thân, giáp trước nghiêng, chắn bùn, thùng dầu phụ, tháp pháo vòm, tháp chỉ huy, nòng 100 mm có bộ hút khói và loa nòng, 5 bánh có nan, 2 vòng xích, số hiệu 390 (chỉ ở BALANCED và HIGH).
   - Drone thuộc xích lưu tham số vòng xích, drone thuộc bánh lưu chỉ số bánh, để engine cho xích chạy và bánh quay.
6. **Trống → chim Lạc**: keyframe `drum_bird` được dựng theo đúng thứ tự drone của trống.
   - 60% drone đứng nguyên chỗ, tiếp tục quay cùng mặt trống.
   - 40% drone (vành 18 chim bay và các vành ngoài cùng) được ghép Hungarian sang hình chim Lạc lớn. Chim "tách ra" từ chính những con chim trên trống.

## 4. Ghép đội hình (formation matching) và chuyển cảnh

**Ghép offline** (`scenes.assign_chain`):

- Thuật toán **Hungarian** (`scipy.optimize.linear_sum_assignment`, dạng LAPJV) trên ma trận N×N giữa hai keyframe liên tiếp.
- Chi phí = bình phương khoảng cách 3D + phạt theo quy tắc nhóm. Ví dụ, các nhóm cuộn chiếu được ưu tiên sang thân và vảy rồng ("chiếu kéo dài thành thân rồng"), thân rồng sang các sống núi.
- Bình phương khoảng cách cho nghiệm tối ưu kiểu vận chuyển tối ưu: các đoạn bay thẳng không cắt nhau. Nhờ đó tránh được đường bay giao nhau hỗn loạn.
- Không có phép tối ưu O(N³) nào chạy lúc diễn.
- Keyframe sau được sắp lại theo kết quả ghép, nên **phần tử i luôn là cùng một drone (ID ổn định)**.
- Quãng bay trung bình của BALANCED: 0→1 khoảng 109 m (cất cánh), 1→2 khoảng 21 m, 2→3 khoảng 20 m, 3→4 khoảng 27 m, 4→5 khoảng 27 m, 5→6 khoảng 9 m, 7→8 khoảng 16 m.

**Quỹ đạo lúc diễn** (`drone-show.js: computeFrame`):

- Mỗi drone bay theo **Bézier bậc 2**: điểm đầu là pose của cảnh trước tại lúc bắt đầu chuyển (được cache), điểm giữa đặt theo phong cách của từng chuyển cảnh, điểm cuối là pose **đang chuyển động** của cảnh sau. Nhờ vậy drone "đáp" khớp vào hình đang uốn lượn.
- Easing smootherstep: tăng tốc và hãm mềm.
- Độ trễ xuất phát của từng drone theo kịch bản riêng.
- Giữa đường bay, màu ngả sang sắc "dải sáng", sáng tối thiểu 0,45 để đường bay luôn dễ theo dõi bằng mắt.

| Chuyển | Bắt đầu | Phong cách điểm giữa | Xuất phát lệch |
|---|---|---|---|
| Mặt đất → Vua | 0,0 s | `launch`: bay thẳng lên rồi lượn về đích; 4 bãi tạo 4 dải sáng | đường nét chính trước, phần tô sau |
| Vua → Rồng | 15,0 s | `unfurl`: kéo ngang (cuộn chiếu dài ra) rồi uốn vào thân | từ đầu rồng tới đuôi |
| Rồng → Điện Biên | 37,6 s | `ribbons`: võng xuống như dải lụa | núi (trái → phải) → cột cờ, hầm → chiến sĩ → lá cờ từ dưới lên |
| Điện Biên → Dinh | 57,4 s | `split`: địa hình tách đôi sang hai bên | dựng kiến trúc từ dưới lên; xe tăng tới sau cùng |
| Dinh → Chân dung | 77,2 s | `converge`: xoáy nhẹ vào tâm | theo độ ưu tiên: đường bao, mắt, mũi, miệng trước |
| Chân dung → Trống | 98,4 s | `spiral`: xoáy ốc quanh tâm | từ tâm ra ngoài |
| Trống → Chim Lạc | 108,2 s | `detach`: rời mặt trống, vồng về phía khán giả | chỉ các drone tách ra mới bay |
| Chim → Quốc kỳ | 116,6 s | `sweep`: vồng lên rồi trải xuống | quét trái → phải; ngôi sao hình thành sau cùng |

## 5. Timeline 150 giây

| Thời gian | Cảnh | Hình thành → trình diện → hoạt cảnh → chuyển |
|---|---|---|
| 0–20 s | **Vua Lý Thái Tổ ban Chiếu dời đô** | 0–8,5: bốn dải sáng vàng bay lên từ 4 bãi sau bảo tàng, đường nét hội tụ trước · 8,5–10: giữ hình · 10–15: cuộn chiếu mở từ 27 m tới 92 m, trục cuộn chạy ra hai bên, chữ hiện dần, ấn son, năm **1010** sáng lên (12–14) · 15–23,5: chiếu kéo dài thành thân rồng |
| 20–40 s | **Rồng thời Lý** | rồng hình thành từ đầu tới đuôi · 26–34: sóng uốn truyền từ đầu tới đuôi (đuôi trễ pha), đầu ngước lên (27,5–33), bờm và râu phấp phới, vảy trượt dọc thân, sóng sáng chạy dọc thân · 34–38,5: bay sang phải, thân giãn dài thành dải sáng |
| 40–60 s | **Lá cờ Quyết chiến Quyết thắng, Điện Biên Phủ 1954** | 3 lớp núi (z −22/−11/0) · cột cờ, nóc hầm, chiến sĩ · 46,6–52: khối tay + cột + cờ quay quanh tay chiến sĩ (giương cờ), cờ gợn sóng 3D · **1954** sáng lên (50–52) · 53–57: sóng mạnh hơn, luồng sáng vàng chạy từ chân cột lên đỉnh · 57,4: địa hình tách thành đường nét kiến trúc |
| 60–82 s | **Xe tăng 390 húc cổng chính Dinh Độc Lập** | mặt tiền dựng từ dưới lên · xe tăng xuất hiện (khoảng 66 s) · 71,4–77: xe chạy ngang trước hàng rào (lộ hình cạnh và số 390), xích chạy, bánh quay, ôm cua 90°, **cổng hai cánh bật mở trong 3D** khi mũi xe chạm cổng, xe vào sân · 76,4–78: cờ Mặt trận sáng trên nóc Dinh · 77,2: các đường nét hội tụ |
| 82–102 s | **Chân dung Chủ tịch Hồ Chí Minh** | đường bao, mắt, mũi, miệng, râu hiện trước, phần tô sau · giữ hình và "thở" sáng nhẹ · 97,6: phát sáng · 98,4: tách thành các vòng hoa văn |
| 102–122 s | **Trống đồng Đông Sơn và chim Lạc** | sao 14 cánh, vòng tròn tiếp tuyến, vành người hoá trang lông chim, vành 18 chim bay, răng cưa · trống quay chậm ngược chiều kim đồng hồ và nghiêng 3D · 108,2: vành chim tách ra thành chim Lạc lớn · cánh vỗ 3D quanh trục thân, đầu cánh trễ pha · 114,8–122: chim bay qua, trống mờ dần và lan rộng · 116,6: trải thành quốc kỳ |
| 122–150 s | **Quốc kỳ và pháo hoa** | 122–127: hình thành (đỏ quét trái → phải, sao vàng sau cùng) · 128,6–131,5: sóng 3D trái → phải tăng dần (biến dạng z, phủ bóng theo pha, sao vàng giữ độ sáng) · 137–143: pháo tầm cao vàng kim hai bên, cúc lớn, liễu vàng rủ, cúc trắng rất cao ngay trên cờ · 143–150: grand finale nhiều tầng: quạt sao chổi, hai cột liên hoàn (0,38 s/quả), tầng rất cao, sao vàng pháo hoa, bức tường cúc 6 quả, liễu kết |
| 150–154,5 s | Kết | LED tắt dần · không phát cue mới · 154,5–162,5: chờ hạt pháo hoa tàn tự nhiên rồi khôi phục bầu trời ban ngày nếu trước show đang là ngày |

## 6. Rendering, shader LED và bloom

- **1 `THREE.Points` + `ShaderMaterial`** cho lõi LED và **1 `Points` dùng chung geometry** cho lớp quầng. Tổng 2 draw call. Không tạo mesh riêng cho từng drone.
- Vị trí (N×3) và màu kèm độ sáng (N×4) là typed array cấp phát một lần (`DynamicDrawUsage`), mỗi khung upload một lần. Không cấp phát geometry, material hay object nào trong vòng lặp.
- **Lõi LED**: đĩa sắc (smoothstep) cộng quầng nhỏ exp(−6r²). Tâm ngả trắng 38% để có cảm giác LED rực nhưng **không cháy trắng**; màu vẫn rõ.
- Kích thước điểm theo mét thật (1,15–1,6 m tuỳ mức) chia khoảng cách, kẹp trong 2,6–26 px. Khi điểm nhỏ dưới ngưỡng, độ sáng được bù theo diện tích để drone ở xa không biến mất.
- Mỗi LED nhấp nháy ±3% với pha riêng.
- **Bloom chọn lọc**: dự án không có pipeline postprocessing (renderer ACES, sRGB, đổ bóng thủ công). Thêm `EffectComposer`/`UnrealBloomPass` sẽ đổi tone mapping và tốn thêm một pass toàn màn hình cho cả bảo tàng. Vì vậy bloom được làm bằng **lớp quầng gaussian rất mềm (alpha 0,13) chỉ trên drone**: quầng cộng dồn ở chỗ drone dày giống bloom của máy quay, còn lõi vẫn tách bạch nên các drone sát nhau vẫn phân biệt được. Lớp này tắt ở mức LOW và có thể bật/tắt trong debug.
- Additive blending, `depthTest` bật để công trình che drone đúng, `depthWrite` tắt, `fog: false`.

## 7. Không gian biểu diễn (đo trên bản đồ thật)

| Đại lượng | Giá trị |
|---|---|
| Mắt nhân vật / camera | 1,65 m (`EYE`). FOV dọc 70°, near 0,05, far 1200 |
| Mặt tiền bảo tàng | z = 0, cao 9 m. Đỉnh mái 13,6 m tại z = −12. Phía sau tới z = −34 |
| Cổng sân | z = 30, xà cổng cao 4,85 m. Điểm xuất hiện của người chơi z = 37 |
| Sân trong lũy tre | x ±29, z 0,6 → 61 |
| **Gốc sân khấu drone** | (0, **120**, −100), tỉ lệ ×1,15. Đội hình khoảng 138 × 110 m |
| Góc ngẩng từ z = 37 | đáy đội hình ≈ 24,6° (vượt xà cổng 24,5° và mái), tâm ≈ 41°, đỉnh ≈ 52° |
| Bãi cất cánh | 4 bãi trên mặt đất, sau bảo tàng (z ≈ −118), x ≈ ±30 và ±90 |
| Pháo hoa F8 | z −105 → −200, độ cao 45–268 m |

Phiên bản đầu đặt tâm sân khấu ở 88 m. Ảnh chụp thật cho thấy xà cổng che nửa dưới đội hình khi đứng ở điểm xuất phát, nên đã nâng lên 120 m và phóng ×1,15. Trong debug có thanh trượt scale và độ cao để chỉnh trực tiếp.

**Góc nhìn điện ảnh** (phím C): camera bay chậm ở khoảng (±14, 72, −1…9), nhìn vào tâm sân khấu. Đội hình chiếm khoảng 70% chiều cao khung hình. Camera chuyển mượt vào và ra (1,6/s) và chỉ đổi camera của máy hiện tại.

## 8. Tích hợp pháo hoa F8 (không làm hệ thống thứ hai)

- Drone Show gọi API sẵn có `window.spawnEffect(fx, {x, z}, {h, size, c, core, …})`. Hàm này tự tính thời gian bay, phóng từ mặt đất, nổ ở độ cao `h` và có âm thanh. Các hiệu ứng dùng: `chrys`, `palm`, `willow`, `ring`, `crackle`, `peony`, `star`, `fan`. Có 49 cue trong khoảng 137–149,5 s.
- **Bố trí tránh che ngôi sao**:
  - Nhìn từ sân, ngôi sao chiếm phương vị ±9°.
  - Pháo hai bên đặt ở |x| ≥ 98 m.
  - Pháo đặt xa hơn sẽ hiện **thấp hơn** trên màn hình, nên pháo "trên đầu lá cờ" được đặt sát sau cờ (z −122) và cao ≥ 262 m.
  - Pháo góc trên phía sau đặt ở |x| ≈ 84, z ≈ −200.
  - Kiểm tra trên ảnh chụp ở cả góc nhìn chính lẫn góc điện ảnh: sao vàng luôn sạch.
- **Quy tắc xung đột**:
  - Khi Drone Show đang chạy, `startFireworksShow` bị chặn (cả F8 trên máy mình lẫn lệnh từ mạng), còn cue thuộc màn kết vẫn bắn.
  - Khi màn F8 đang chạy, F9 bị chặn.
  - Dừng Drone Show giữa chừng sẽ dọn các cue còn chờ, trừ khi show F8 đang chạy.
- **Sửa lỗi trong `fireworks.js`** (1 điều kiện): `runEvents` vẫn được gọi khi show F8 không chạy, để xử lý sự kiện phụ. Trước khi sửa, nếu màn F8 bị dừng giữa chừng rồi có cue bên ngoài, toàn bộ cue F8 còn lại sẽ nổ cùng lúc. Giờ hàng đợi biên đạo chỉ chạy khi `isRunning`. Hành vi F8 không đổi (đã kiểm tra F8 vẫn chạy và đồng bộ).
- Ánh sáng: show bật trời đêm và ghi nhớ trạng thái trước đó. Nếu trong lúc diễn có người bấm F2 sang ngày, show giữ trời đêm. Khi kết thúc, bầu trời được khôi phục về trạng thái ban đầu. Show không đổi renderer hay đèn toàn cục.

## 9. Multiplayer

- **Không gửi toạ độ drone.** Chỉ gửi gói `__ds__:start|stop:seed:startTime` qua kênh `say` có sẵn của SignalR (giống pháo hoa F8, **không cần sửa backend**), cộng với nút Firebase `/droneshow` nếu bật Firebase. Mỗi show chỉ có vài gói tin.
- Mỗi máy tự mô phỏng một cách tất định, nên tua tới bất kỳ giây nào cũng đúng. Người vào muộn nhận `startTime` từ trạng thái phòng và tua tới đúng giây đang diễn.
- Show không teleport, không đổi model hay camera của người khác. Góc điện ảnh chỉ áp dụng trên máy bật nó.

## 10. Chất lượng và hiệu năng

| Mức | Drone | Lớp bloom | Khi dùng |
|---|---|---|---|
| LOW | 760 | tắt | thiết bị cảm ứng |
| BALANCED | 1.800 | bật | máy bàn mặc định |
| HIGH | 2.800 | bật, quầng lớn hơn | máy bàn đang chạy mượt (khung trung bình < 22 ms), hoặc `?drones=high` |

**Benchmark** (`bench_drone_show.js`, Chrome headless, GPU Intel UHD (D3D11), 1280×720, không giới hạn vsync; xem `screenshots/benchmark.json`):

| Tình huống | FPS | p95 (ms) | CPU drone/khung | Draw call |
|---|---|---|---|---|
| Bảo tàng ban đêm, không show | 23,9 | 59,3 | — | 1.743 |
| LOW: rồng / quốc kỳ / màn kết | 23,4 / 23,3 / 21,7 | 58,7–60,9 | 0,10–0,18 ms | +1 (+4 khi có pháo) |
| BALANCED: rồng / quốc kỳ / màn kết | 21,8 / 22,2 / 21,0 | 59,7–61,9 | 0,20–0,28 ms | +2 (+5) |
| HIGH: rồng / quốc kỳ / màn kết | 24,3 / 25,6 / 23,8 | 52,4–57,5 | 0,26–0,32 ms | +2 (+5) |

Chênh lệch giữa các mức nằm trong biên nhiễu (±2 FPS). Nút cổ chai là cảnh bảo tàng (khoảng 1.743 draw call), không phải Drone Show. Đây là máy dùng GPU tích hợp. Chưa đo trên GPU rời hay điện thoại thật.

## 11. Công cụ debug (`?droneDebug=1`, chỉ hiện khi có tham số)

Bảng debug gồm:

- Điều khiển phát: Phát/Dừng, Tạm dừng, Restart, chọn mức, thanh tua 0–154 s, nhảy cảnh 1–7.
- Bật/tắt: Bloom, **quỹ đạo** (đoạn nối từ vị trí hiện tại tới đích của các drone đang bay), **điểm đích**, góc điện ảnh.
- Thanh trượt scale và độ cao sân khấu.
- **Kiểm tra chồng lấn**: đếm cặp drone sáng gần nhau trong lưới băm 3D.
- Nút **góc nhìn chính**.
- Thông tin: số drone, số đang bay, FPS, draw calls, triangles, points, CPU ms/khung.

Ảnh minh hoạ: `screenshots/debug_panel_t18.jpg`.

## 12. Kết quả kiểm thử (đã chạy thật)

**Trực quan** (`test_drone_show.js`): mở bảo tàng thật, tua tới 26 mốc và chụp ở 2 góc nhìn, sau đó chạy màn kết theo thời gian thực. Ảnh nằm trong `screenshots/`: `main_t*.jpg` (đứng ở sân), `cine_t*.jpg` (góc điện ảnh), `finale_*.jpg`, `overview_*.jpg` (bảng ghép). Không có lỗi console hay shader.

| Cảnh | Đánh giá trên ảnh chụp |
|---|---|
| 1 | Nhận ra nhà vua: mũ miện có chuỗi hạt, râu, long bào cổ tròn, bổ tử, đai ngọc. Cuộn chiếu mở ra hai bên, có cột chữ, ấn son, năm 1010. |
| 2 | Rồng có 3 khúc uốn đều, đầu lớn với bờm, mắt, mõm vòi, lưỡi đỡ ngọc, 4 chân 3 móng, vây lưng, vảy 3D. Thân uốn theo sóng truyền chứ không xoay cứng. |
| 3 | Chiến sĩ đội mũ có lá ngụy trang, đeo ba lô, khoác súng, giương cờ. Chữ "QUYẾT CHIẾN / QUYẾT THẮNG" đọc được. Cờ gợn sóng. Có 3 lớp núi và năm 1954. |
| 4 | Mặt tiền đọc rõ (mái đua, rèm hoa đá, khoang kính, hồ sen, cột cờ). Xe tăng chạy ngang, ôm cua, cổng bật mở, xe vào sân, cờ sáng trên nóc. |
| 5 | Nhận ra chân dung: tóc bạc chải ngược, trán cao, tai, ria và chòm râu dài, cổ áo. |
| 6 | Sao 14 cánh, các vành hoa văn, 18 chim bay. Trống nghiêng 3D. Chim Lạc tách ra, vỗ cánh, bay qua. |
| 7 | Quốc kỳ đúng tỉ lệ, sao sắc nét, sóng 3D. Pháo hoa ở hai bên và phía trên, sao không bị che. |
| Chuyển cảnh | Không thấy teleport, mất drone hay khung trống. Các chuyển cảnh chồng lên đoạn cuối và đầu của cảnh kề nhau. |

**Multiplayer** (`test_multiplayer_drone.js`): 3 trình duyệt Chrome, backend SignalR `.NET` chạy cục bộ, phòng `drone-qa-room`. Kết quả **18/18 PASS** (`screenshots/multiplayer_report.json`):

- A thấy B và B thấy A, không có avatar trùng.
- F9 trên A khởi động show trên cả A và B: cùng seed, lệch 0,01 s, cả hai chuyển sang trời đêm.
- Giữ F9 (phím lặp) không khởi động lại show.
- F8 bị chặn trên cả hai máy khi show đang chạy.
- Avatar B di chuyển mượt trên máy A, bước tối đa < 3 m / 0,25 s.
- Vị trí và camera của A không đổi.
- Góc điện ảnh trên A không đổi camera của B.
- C vào muộn ở giây ~54 chạy đúng giây (lệch 0,00 s), không avatar trùng.
- F9 hai lần trên B dừng show trên cả 3 máy và khôi phục trời ngày.
- F8 vẫn hoạt động và đồng bộ sau khi show kết thúc.
- Restart 4 lần: số đối tượng trong scene giữ nguyên (2067 → 2067), sân khấu luôn chỉ có 2 đối tượng.
- Không có lỗi JS hay shader trên 3 client.

**Chồng lấn**: tại t = 28 s (rồng, BALANCED), có 35 cặp drone sáng cách nhau < 0,35 m trên 1.800 drone; gần nhất 0,18 m (vảy trượt dọc thân tại các khúc uốn gắt). Khoảng cách điển hình giữa các drone trong đội hình là 0,7–1,8 m.

## 13. Giới hạn còn tồn tại

- **Mật độ dày hơn show thật.** Để vừa không gian bảo tàng, khoảng cách drone là 0,7–1,8 m, trong khi show thật cần ≥ 1,5–2 m. Đây là mô phỏng đồ hoạ, không có mô hình khí động học. Kiểm tra va chạm chỉ là công cụ debug (đếm cặp gần nhau), không tự né.
- **Độ nhận diện của chân dung** được đánh giá qua ảnh chụp, chưa thử với người xem thật. Ở LOW (760 drone) chân dung chỉ còn nét chính.
- **Lá cờ Quyết chiến Quyết thắng**: nguồn xác nhận "cờ đỏ sao vàng, dưới có dòng chữ", nhưng vị trí sao và màu chữ là lựa chọn cách điệu (xem RESEARCH.md).
- **Hình vua Lý Thái Tổ** là thiết kế ước lệ: không có tư liệu về dung mạo.
- Ở mức LOW, **số 390** trên xe tăng bị lược bỏ vì không đủ drone để đọc rõ.
- **Không có nhạc nền**: không dùng nhạc có bản quyền. Âm thanh chỉ có tiếng pháo hoa của hệ thống F8.
- Đồng bộ nhiều người dựa trên `Date.now()` của từng máy. Nếu đồng hồ máy lệch nhau, thời điểm show cũng lệch tương ứng (giống pháo hoa F8).
- Benchmark mới đo trên GPU tích hợp ở Chrome headless. Chưa đo trên điện thoại thật.
- Từ một số vị trí sát mặt tiền bảo tàng, mái vẫn che phần dưới đội hình. Điều này đúng vật lý; người xem có thể lùi ra sân hoặc dùng góc điện ảnh.
