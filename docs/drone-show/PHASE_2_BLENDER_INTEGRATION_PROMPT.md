# MASTER PROMPT — GIAI ĐOẠN 2: NÂNG CẤP DRONE SHOW F9 HIỆN CÓ BẰNG DỮ LIỆU BLENDER ĐÃ DUYỆT

## 1. Nhiệm vụ thực thi

Bạn là kỹ sư Three.js/WebGL, animation pipeline và QA. Hãy trực tiếp sửa Drone Show trong dự án **E:/game-bao-tang-lich-su-online**, sử dụng bộ tài nguyên Blender đã hoàn tất tại **E:/Blender/DroneShow_Vietnam**.

Mục tiêu là thay nguồn đội hình và bộ phát chuyển động cũ của F9 bằng dữ liệu Blender đã duyệt, giữ chất lượng hình ảnh, đúng màu, đúng ID và đủ LED. Tích hợp vào scene, renderer, animation loop, input và multiplayer của bảo tàng đang có; chạy ứng dụng thật và kiểm chứng bằng ảnh chụp. Không dừng ở kế hoạch hoặc một demo độc lập.

Đây là nâng cấp một chức năng F9 có sẵn. Không làm lại bảy đội hình bằng hàm hình học JavaScript; không thay dữ liệu bằng điểm ngẫu nhiên, ảnh phẳng, video hay GLB chứa hàng nghìn drone riêng lẻ. Không chuyển dự án sang React/R3F chỉ vì tên vai trò. Không sửa các chức năng không liên quan.

Các số liệu, thứ tự và yêu cầu dưới đây thay thế những phần đã lỗi thời của prompt giai đoạn 2 cũ: khoảng 2.000 drone, trình tự vua→rồng→Điện Biên→xe tăng→chân dung→trống đồng→cờ, mặc định show chỉ chạy một máy, và yêu cầu xe tăng chạy/húc cổng.

## 2. Trạng thái dự án phải tiếp quản

Tại thời điểm biên soạn, HEAD là **9c3683f**, tiêu đề “Thêm Drone Show F9: 7 đội hình lịch sử, kết bằng pháo hoa F8”. Phải kiểm tra lại HEAD và working tree khi bắt đầu, không giả định repo vẫn giữ nguyên.

Chức năng trong commit này:

- F9 bắt đầu show 150 giây; khi đang chạy, nhấn F9 hai lần trong 2,5 giây để dừng.
- Có F8/F9 chặn show độc lập chạy trùng nhau; Finale gọi lại hệ thống pháo hoa hiện có.
- Show được đồng bộ tới người chơi trong phòng bằng dữ liệu điều khiển nhỏ; không truyền vị trí từng drone.
- Render lõi và quầng bằng hai `THREE.Points` dùng chung geometry; cập nhật qua loop hiện có.
- Dữ liệu cũ là `formations-low/balanced/high.json`, khoảng 760/1.800/2.800 drone; animator procedural và transition Bézier bậc hai.
- Commit có camera C và thoát bằng di chuyển/ESC. Tuy nhiên, **working tree hiện tại đã loại bỏ phần camera này**.
- Tài liệu lưu báo cáo multiplayer 18/18 PASS và benchmark của bản cũ. Đó không phải kết quả kiểm thử bản tích hợp Blender; phải chạy lại và ghi kết quả mới.

### Bảo toàn thay đổi chưa commit

Đã quan sát các thay đổi ở:

```text
 M Frontend/app.js
 M Frontend/drone-show.js
 M Frontend/index.html
 M Frontend/style.css
?? scripts/verify_portrait_flags.js
```

Các diff hiện có bao gồm gỡ camera điện ảnh C, caption/thông báo Drone Show và sửa sprite nhãn bằng `depthWrite: false`, `alphaTest: 0.01` để phần trong suốt không che LED/pháo hoa. Không hoàn nguyên, không checkout lại nguyên file từ commit, không ghi đè các sửa đổi này. Đọc diff thực tế trước khi sửa; duy trì chủ đích của working tree.

**Không tự khôi phục camera C, caption hay toast đã bị gỡ.** Phần camera trong nhiệm vụ này là kiểm tra vùng xem, đặt sân khấu và camera tham chiếu cho QA/debug. Nếu người dùng sau này yêu cầu bật lại C thì mới tích hợp lại như một thay đổi riêng, chỉ tác động client đang xem. Không suy diễn mô tả commit cũ thành yêu cầu phục hồi UI.

### Các điểm tích hợp đã xác định

- `E:/game-bao-tang-lich-su-online/Frontend/drone-show.js`: `DroneShowConfig`, `load`, `buildGpu`, `makeAnimators`, `makeTransitions`, `computeFrame`, `buildFireworkCues`, vòng đời và debug.
- `Frontend/app.js`: `startDroneShow`, `stopDroneShow`, `toggleDroneShow`, handler F9/F8, chat commands, `Net.onDroneShow`, `DroneShow.init` và `DroneShow.update` trong loop.
- `Frontend/net.js`: `broadcastDroneShow`, `onDroneShow`, payload `__ds__`, Firebase `/droneshow` và đường đi qua mạng đang có.
- `Frontend/fireworks.js` và API `window.spawnEffect` đang được Drone Show sử dụng: đọc implementation và vòng đời trước khi nối cue.
- `Frontend/index.html`: đang tải Three.js **r128 / 0.128.0** bằng script global. Dùng API tương thích phiên bản thực tế; không tự nâng engine toàn dự án.
- `Frontend/dev-server.js`: server cục bộ hiện có, cổng mặc định 5173; có thể chạy `node Frontend/dev-server.js` từ repo root nếu phù hợp môi trường.
- `scripts/drone-show/test_drone_show.js`, `test_multiplayer_drone.js`, `bench_drone_show.js`: tái sử dụng và cập nhật kiểm thử liên quan.
- `docs/drone-show/README.md`: tài liệu cần cập nhật theo runtime mới.

Giữ F9, double-F9 2,5 giây, các lệnh chat `/f9`, `/drone`, `/droneshow`, player controls và chức năng F8. Không tạo thêm listener hoặc animation loop song song.

## 3. Bộ tài nguyên Blender chính thức

Chỉ dùng revision **launch-assembly-v2-2026-11-12**, schema **vn-source-guided-drone/1.1**.

```text
E:/Blender/DroneShow_Vietnam/
  blender/Vietnam_DroneShow_SourceGuided.blend
  blender/cache/launch_v2_positions.pc2
  blender/cache/launch_v2_colors.pc2

  exports/release/Vietnam_DroneShow_WebData_v2.zip
  exports/release/release_manifest.json

  exports/source_guided/export_manifest.json
  exports/source_guided/show_timeline.json
  exports/source_guided/*.f32
  exports/source_guided/*.i16
  exports/source_guided/*.u8
  exports/source_guided/*.u32
  exports/source_guided/validation.json
  exports/source_guided/final_playback_audit.json
  exports/source_guided/rendered_led_audit.json
  exports/source_guided/blend_cache_validation.json
  exports/source_guided/static_tank_validation.json
  exports/source_guided/launch_intro_validation.json

  docs/FINAL_WEB_HANDOFF_REVIEW.md
  docs/SOURCE_GUIDED_EXPORT_FORMAT.md
  docs/SOURCE_GUIDED_README.md
  docs/SOURCE_GUIDED_VALIDATION.md

  scripts/source_show.py
  scripts/prepare_source_show.py
  scripts/build_source_show.py
  scripts/export_validate_source_show.py
  scripts/audit_export_playback.py
  scripts/audit_rendered_leds.py
  scripts/verify_source_blend.py
  scripts/package_final_review.py

  previews/source_guided/01_dong_son.png
  previews/source_guided/02_ly_thai_to.png
  previews/source_guided/03_ly_dragon.png
  previews/source_guided/04_ho_chi_minh_lotus.png
  previews/source_guided/05_dien_bien.png
  previews/source_guided/06_reunification.png
  previews/source_guided/07_vietnam_flag.png
  previews/source_guided/morph_01.png ... morph_06.png
  previews/source_guided/dragon_rest.png
  previews/source_guided/dragon_lift.png
  previews/source_guided/dragon_wave.png
  previews/source_guided/dragon_angle.png
  previews/source_guided/dragon_morph.png
  previews/source_guided/launch_and_assembly_v2.mp4
  previews/source_guided/launch_video_validation.json
  previews/source_guided/launch_rising.png
  previews/source_guided/launch_assembling.png
```

Không dùng `Vietnam_Historical_DroneShow.blend`, các export đời cũ, bản backup hoặc `archive_before_chronological` làm nguồn tích hợp.

Gói ZIP hiện có **17,323,626 byte**, chứa 70 entries đã kiểm tra, SHA256:

```text
d7224c25ee706e2d4cf5f642fb23db915a03f6e78ec358595725046de05ca6c6
```

Tổng binary giải nén: **59,549,298 byte**. Đọc lại `release_manifest.json` và `export_manifest.json`, xác minh hash thực tế; nếu khác thì tìm nguyên nhân/version, không bỏ qua im lặng.

Ảnh đội hình chính là render Full HD. Video v2 là trích đoạn 22 s, 1280×720, 10 FPS, ghép hai đoạn thời gian show 0–14 s và 20–28 s; scene/cache Blender vẫn đủ 150 s, 30 FPS. Các MP4 cũ trong archive_before_launch_v2 không dùng để đối chiếu timeline hiện tại. Không suy ra sampling runtime từ FPS của MP4. Không đưa `.blend`, `.pc2`, ảnh tham khảo hay video vào đường tải runtime của website.

## 4. Đội hình và timeline đã duyệt — nguồn chân lý

Đọc thứ tự và thời gian từ `show_timeline.json`. Bảng sau mô tả bản hiện tại:

| Thứ tự | Formation ID | Nội dung | LED sáng | Giữ hình | Frame ảnh Blender / thời gian |
|---|---|---|---:|---|---|
| 1 | dong_son | Trống đồng Đông Sơn – Chim Lạc | 9.967 | 12–20 s | 435 / 14,5 s |
| 2 | ly_thai_to | Lý Thái Tổ – Chiếu dời đô | 11.436 | 28–38 s | 915 / 30,5 s |
| 3 | ly_dragon | Rồng thời Lý | 8.519 | 46–58 s | 1455 / 48,5 s |
| 4 | ho_chi_minh_lotus | Bác Hồ – hoa sen | 7.589 | 66–78 s | 2055 / 68,5 s |
| 5 | dien_bien | Điện Biên Phủ 1954 | 6.626 | 86–98 s | 2655 / 88,5 s |
| 6 | reunification | Xe tăng 390 – Dinh Độc Lập | 11.932 | 106–116 s | 3255 / 108,5 s |
| 7 | vietnam_flag | Quốc kỳ Việt Nam, dùng lại cờ đã duyệt | 5.000 | 124–150 s | 3795 / 126,5 s |

Mở màn **0–6 s: 14.000 drone bay lên thành tám luồng; 6–12 s: ghép dần thành trống đồng/Chim Lạc**. Sáu transition tiếp theo đều dài 8 giây: **20–28, 38–46, 58–66, 78–86, 98–106, 116–124 s**. Không ép lại thành các đoạn 20 giây hoặc tiếp tục dùng mốc transition của engine cũ. Các khoảng giữ hình không phải toàn bộ thời gian của cảnh: còn có morph vào/ra.

**Xe tăng, xích, cổng, cờ và mọi LED trong cảnh reunification đứng yên cả vị trí, RGB và brightness từ 106 đến 116 giây.** Chỉ giữ morph vào và ra. Không chạy lại animator xe tăng/cổng của phiên bản web cũ.

Giữ đúng Bác Hồ đứng trên hoa sen theo ảnh mới, không dùng chân dung vector 1946 của website cũ, không thay bằng hoa sen đơn lẻ. Cờ Finale dùng đúng 5.000 điểm đã xuất, không tự làm lại cờ hoặc thay bằng mẫu JSON cũ của web.

Timeline 150 giây; frame Blender hiển thị 0–4499, endpoint kiểm tra là 4500. Cue pháo hoa: START 137, BUILDUP 141, FINALE 145, END 150. Không dùng mốc buildup 143 của kịch bản cũ.

## 5. Số lượng, ID và chất lượng

- Manifest hiện có **14.000 ID, 0–13999**. Phần tử i trong mọi buffer là cùng drone ID i. Đọc N từ manifest để hỗ trợ lần xuất mới; không hardcode N=2.000 hoặc N=2.800.
- Số LED sáng thay đổi theo bảng. ID dự phòng vẫn có vị trí hợp lệ nhưng tắt đèn; không xóa ID hoặc rematch lúc runtime.
- **Không lấy ngẫu nhiên, cắt còn 760/1.800/2.800 điểm, lấy mỗi k điểm hoặc dùng drawRange thấp để giảm tải.** Các cách đó làm mất mắt, râu, vảy, chữ và hoa văn đã duyệt.
- LOW/BALANCED/HIGH mặc định dùng cùng dữ liệu hình và ID. Giảm glow, DPR, hậu kỳ, số pass hoặc chi phí cập nhật hợp lý; giữ clock liên tục. Hiện chưa có bộ LOD đội hình thấp được duyệt.
- Nếu sau tối ưu vẫn cần giảm số điểm trên máy yếu, báo số đo và yêu cầu dữ liệu LOD riêng được kiểm duyệt, không lén quay lại hình cũ.

## 6. Giải mã đúng schema hiện có

Đọc `SOURCE_GUIDED_EXPORT_FORMAT.md`, manifest và decoder tham chiếu `scripts/audit_export_playback.py`. Triển khai decoder JS thuần, seek trực tiếp tại thời gian bất kỳ; có thể tách thành module nhỏ theo kiến trúc hiện tại. Không cần dựng cả bộ lớp quản lý mới nếu `DroneShow` đã đáp ứng.

### Formation/hold

- `.position.f32`: Float32 little-endian [N,3], vị trí đầu hold.
- `.rgb.u8`: Uint8 [N,3], chia 255 thành **linear emission RGB**.
- `.group.u8`, `.active.u8`: Uint8 [N], nhóm và trạng thái tại hold.
- `.motion.i16`: Int16 [samples,N,3], displacement nhân `position_quantum_m` (hiện 0,002 m), cộng vị trí gốc. Nội suy tuyến tính hai sample kề nhau.
- `.brightness.u8`: Uint8 [samples,N], chia 255, nội suy tuyến tính.
- Sampling vị trí/brightness hiện là 4 Hz cho sáu cảnh đầu, 10 Hz cho cờ; luôn đọc `sample_hz`, `sample_count` từ cue.
- Cờ có `color_animation`: danh sách ID Uint32 và RGB Uint8 [samples,color_count,3], hiện 534 ID sao, 30 Hz/781 samples. Nội suy màu rồi ghi vào đúng những ID đó; các ID khác giữ màu gốc.
- Flatten theo thứ tự sample→ID→component. Không nhầm group ID với drone ID; không áp lại permutation sau khi đọc export.

### Transition/mở màn

Schema 1.1 có **8 segments chuyển động**: index 0 `ascent` 0–6 s dùng `launch.*`; index 1 `assembly` 6–12 s dùng `transition_00.*`; index 2–7 `morph` dùng `transition_01.*` đến `transition_06.*`. Chọn segment theo `start/end`, đọc file từ cue. Không giả định số transition bằng số formation hoặc index bằng hậu tố tên file. Tua trực tiếp vào mở màn cũng phải ra đúng trạng thái; không áp mask hold đầu lên 14.000 LED đang bay.

Geometry Float32 [N,10]: **A.xyz, B.xyz, arc.xyz, delay_seconds**.

RGBA Uint8 [N,8]: **startRGB, startBrightness, endRGB, endBrightness**; chia 255 trước khi dùng.

Với `tLocal = showTime - transition.start`, `duration = transition.end - transition.start`:

```text
u = clamp((tLocal - delay) / (duration - delay), 0, 1)
q = 6*u^5 - 15*u^4 + 10*u^3
position = A + (B - A)*q + arc*16*q^2*(1-q)^2
rgb = lerp(startRGB, endRGB, q)
brightness = lerp(startBrightness, endBrightness, q)
```

Đây không phải Bézier bậc hai của runtime cũ. Không tái sử dụng `midPoint`, không hướng đích theo animator đang chạy của bản cũ, không thêm minimum brightness 0,45, màu dải sáng hoặc độ trễ mới. Tham số export đã chứa chuyển cảnh được duyệt.

Ở ranh giới cue, chọn quy tắc nhất quán và kiểm tra endpoint không nhảy vị trí/màu. Seed không được làm thay đổi hình học, màu hoặc quỹ đạo Blender.

## 7. Hệ tọa độ, sân khấu và camera

**Buffer export đã là Three.js Y-up**, sau ánh xạ Blender (X,Y,Z)→(X,Z,−Y). Không chuyển trục lần nữa.

Đơn vị mét. Dùng một `DroneShowStage` để đặt show vào bảo tàng, với transform nhất quán áp dụng cho toàn bộ vị trí và camera tham chiếu. Dữ liệu đã có tâm độ cao khoảng Y=85; stage cũ đang có height riêng. Không cộng hai độ cao vô tình khiến show bay quá cao hoặc bị cắt.

Có thể chọn pivot `(0,85,0)`, chuyển `pLocal = pExport - pivot`, rồi đặt stage trong thế giới; hoặc dùng một ma trận tương đương. Áp cùng pivot/transform cho camera position/target. Arc là vector dịch chuyển: chỉ rotation/scale, không cộng translation. Không sửa từng tọa độ drone để bù lỗi bố trí.

`render_contract` có camera position `(0,1.7,300)`, target `(0,85,0)`, up vector và horizontal FOV khoảng 34,9436°, aspect 16:9. Đọc giá trị thực tế từ manifest. Nếu camera web nhận vertical FOV thì chuyển đúng horizontal→vertical, không đưa thẳng horizontal FOV vào trường vertical.

Kiểm thử từ camera tham chiếu trong công cụ QA/debug và góc nhìn người chơi ở sân. Các hình là **relief 2.5D có chiều sâu**, không phải khối kín đẹp ở mọi góc: tránh orbit lớn hoặc camera đi xuyên đội hình. Không teleport avatar hoặc giành quyền camera của người chơi trong luồng F9 bình thường. Giữ các chỉnh sửa gỡ camera C hiện tại.

## 8. Renderer LED

Ưu tiên tận dụng hai lớp `THREE.Points`, BufferGeometry/ShaderMaterial và loop hiện có. Cấp phát typed array/buffer một lần; không tạo mesh riêng từng drone, không tạo vật thể hoặc array lớn mỗi frame. Tính bounding volume/frustum phù hợp sau stage transform.

Nguồn màu là linear RGB; brightness chỉ nhân **một lần**. Đọc `render_contract`:

- Bán kính LED tham chiếu 0,16 m; emission 1,65; không nhầm bán kính với đường kính/point-size pixel.
- Chỉ cull khi `max(rgb * brightness) < 0.004`.
- Trong morph, dùng brightness nội suy, **không dùng mask active của cảnh đích quá sớm**.
- Loại bỏ flicker ngẫu nhiên, tâm pha trắng cố định, màu mặc định hoặc các gain khiến điểm dự phòng sáng lên.
- Glow nhỏ, lõi rõ, giữ màu vàng/đỏ; không tăng Bloom để che hình thiếu điểm.

Kiểm tra color management của Three.js r128 và renderer đang dùng: tránh giải mã sRGB thêm lần nữa hoặc áp output conversion hai lần. Không đổi tone mapping/ánh sáng toàn bảo tàng để chữa riêng Drone Show. Giữ sửa sprite trong suốt không ghi depth; không tắt depth toàn scene để xuyên mái/công trình.

## 9. Asset loader và bố trí tài nguyên trong web

Tạo thư mục phiên bản dưới `Frontend/drone-show/`, ví dụ `blender-v2/`, chứa đúng manifest, timeline và các binary được liệt kê. Dùng relative HTTP URLs; website không đọc trực tiếp đường dẫn ổ E, `file://` hay workspace Blender. ZIP là gói bàn giao; không giả định `fetch` tự giải nén ZIP. Ưu tiên giải nén lúc chuẩn bị asset và server phục vụ file, có compression/cache phù hợp nếu hạ tầng hỗ trợ.

Loader cần kiểm tra schema/revision, HTTP status, byte length, shape, dtype, finite values và ID convention; kiểm hash khi import/QA, có chính sách runtime hợp lý. Hiển thị lỗi theo cơ chế hiện hành, không tự đưa lại caption/toast vừa bị gỡ. Có thể dùng debug/console cho thông tin kỹ thuật.

Không tải lại toàn bộ binary mỗi lần F9. Chia sẻ promise tải, cache theo revision, hủy/loại bỏ kết quả stale khi stop/restart hoặc đổi version. Stop trong LOADING phải ngăn kết quả tải muộn tự bật show. Không âm thầm fallback sang đội hình cũ khi asset lỗi.

Nếu chia chunk: bảo đảm chunk kế tiếp có trước cue; khi seek/late join thiếu chunk thì tải rồi bắt kịp master clock, không phát lại từ đầu hoặc hiển thị đội hình sai. Không đưa PC2 lớn vào bundle, không tự viết lại dữ liệu thành JSON khổng lồ.

## 10. Clock, input, lifecycle và multiplayer

Giữ F9/double-F9 và các lệnh chat. Chặn key repeat, input/textarea/contenteditable, nhiều lần start trong lúc pending và hai show chạy đồng thời. Tái sử dụng group/buffer khi replay, cleanup listener/GPU resources đúng khi dispose. Giữ day/night và phục hồi trạng thái theo vòng đời hiện có.

Dùng master clock độc lập FPS, sample trực tiếp theo thời gian tuyệt đối; không tích lũy chuyển động bằng delta cho từng drone. Pause/resume/restart/seek dùng trong API/debug phải có ngữ nghĩa rõ; debug seek/pause không được vô tình phát lệnh điều khiển cả phòng.

**Giữ hành vi show toàn phòng hiện có**, không hạ thành F9 chỉ chạy một máy. Mỗi client tự evaluate cùng asset và thời gian. Không gửi N tọa độ mỗi frame; không gửi blob binary qua mạng multiplayer.

Tái sử dụng `broadcastDroneShow`/`onDroneShow`, kiểm tra các backend thực tế. Cần định danh revision/hash của show để tránh hai client phát hai dữ liệu khác nhau; nếu mở rộng payload, sửa đồng bộ sender/parser/consumer và kiểm tra tương thích. Seed có thể dùng cho pháo hoa, không dùng để sinh lại drone.

Late join và client tải asset chậm phải catch up đúng showTime. Dedupe start/stop/cue; stop trong loading không sống lại sau khi promise resolve. Camera và avatar của client khác không bị tác động. Đo lệch đồng hồ; dùng server time/offset nếu hạ tầng có sẵn, hoặc báo rõ giới hạn nếu vẫn dựa vào `Date.now()` — không tuyên bố đồng bộ tuyệt đối khi chưa đo.

## 11. Finale dùng hệ thống F8 hiện có

Đọc `timeline.fireworks`: **137/141/145/150 giây**. Sửa `buildFireworkCues` hoặc bridge tối thiểu để phản ánh đúng các mốc này và vị trí sân khấu mới. Bốn markers là tín hiệu biên đạo, không phải toàn bộ danh sách quả pháo.

Dùng API thật của hệ thống pháo hoa hiện có, như `spawnEffect` sau khi kiểm tra chữ ký/lifecycle. Không giả `KeyboardEvent(F8)`, không dựng một particle engine pháo hoa mới. Giữ chặn F8/F9 khi chạy show độc lập, nhưng cho phép cue Finale do Drone Show sở hữu.

Pháo ở hai bên/phía sau hoặc cao hơn cờ; kiểm tra ảnh để không che sao. Cue không bắn lặp mỗi frame. Seek về sau, late join hoặc resume không xả dồn toàn bộ cue đã qua. Sau 150 s ngừng cue mới; hạt hiện có tàn tự nhiên. Phần fade/tail sau 150 s, nếu giữ lifecycle cũ, phải tách khỏi 150 s nội dung Blender và không làm đổi cue/hold cuối. Dọn tài nguyên/quyền điều khiển F8/day-night đúng khi stop, natural finish và replay.

## 12. Kiểm thử dữ liệu và hình ảnh bắt buộc

Không chỉ kiểm tra compile. Chạy bảo tàng thực tế bằng công cụ và cấu hình của repo.

### Numeric parity

Viết kiểm tra decoder JS dựa trên buffer export và đối chiếu decoder Python tham chiếu. Kiểm tra toàn N ID ở các hold, đầu/giữa/cuối mọi morph, cả endpoint và thời gian bất kỳ không trùng sample. Chạy seek ngược/nhảy cóc; không yêu cầu phát tuần tự.

Phân biệt sai số do định dạng export với lỗi adapter: bản hiện tại đã đo export so với nguồn Blender tối đa khoảng **0.100768 m** về vị trí, **0,014235** linear emission; quantization vị trí khoảng 0,001727 m. JS so với decoder của cùng buffer phải chỉ còn sai số số học nhỏ, không cộng thêm sai số do đổi easing/trục/brightness. Ghi tolerance cụ thể và đo được.

Giữ đủ tập ID sáng theo bảng cho mọi hold. Xác nhận reunification không đổi vị trí/RGB/brightness trong 106–116 s. Kiểm tra group/mask không làm mất mắt, râu, chữ, hoa văn, đầu/đuôi rồng hay sao. Các điểm sát đen có thể khác phía ngưỡng vì lượng tử hóa; báo cáo Blender đã ghi tối đa 50 điểm trong fade, không phải cho phép mất LED sáng rõ.

### So sánh ảnh

Chụp web ở **14,5; 30,5; 48,5; 68,5; 88,5; 108,5; 126,5 giây**, đối chiếu 7 PNG đúng thứ tự. Dùng camera/transform/aspect tương ứng trước khi so hình. Kiểm tra rồng ở 46/51/55 s, góc nghiêng nhẹ và morph 62 s. Sáu midpoint transition: **24/42/62/82/102/120 s**. Kiểm tra thêm mở màn 0/3/6/9/12 s và Finale 137/141/145/149 s.

Kiểm tra tỷ lệ, hướng chữ/sao, độ sâu, kích thước LED, màu, glow, culling, vật thể/sprite che sai, và số LED thực sự trong GPU buffers. Không sửa source hình học để che lỗi renderer. Lưu screenshot ứng dụng thật, ảnh so sánh và log lỗi console/shader/network.

### Functional, multiplayer, performance

- F9 start, repeat, double-F9 stop, stop khi loading, replay sau finish, nhiều lần restart, lỗi tải/mất chunk.
- F8 chạy độc lập trước/sau F9; Finale dùng đúng bridge, không phát hai show hoặc cue lặp.
- Hai client trở lên; cùng revision/thời gian, late join, client tải chậm, stop khi client khác loading; avatar và camera vẫn bình thường; không traffic vị trí drone mỗi frame.
- Chạy lại kiểm thử cũ nhưng sửa kỳ vọng đã lỗi thời như C/caption, số drone, thứ tự và xe tăng chạy. Không đánh dấu PASS chỉ bằng cách xóa assertion còn liên quan.
- Đo FPS/frame time, CPU update, draw calls, thời gian tải/giải mã, RAM/GPU memory nếu công cụ hỗ trợ, trước và sau nhiều lần replay. Phân biệt số đo thật với mục tiêu. Không gán benchmark 1.800/2.800 drone cho bản 14.000 ID.
- Kiểm tra từng chế độ chất lượng vẫn đủ dữ liệu hình; không dựa vào screenshot đẹp ở HIGH để bỏ qua mất LED ở LOW.

## 13. Trình tự triển khai

1. Đọc AGENTS.md/quy tắc repo nếu có; ghi HEAD, status/diff, bảo toàn working tree.
2. Xác minh gói Blender, schema, revision và hash. Đọc các báo cáo đã có; không gọi chúng là kết quả web mới.
3. Khảo sát loader, animator, renderer, input, net và fireworks hiện tại; xác định patch tối thiểu.
4. Import asset phiên bản vào web; tạo decoder/evaluator thuần và numeric parity tests.
5. Nối evaluator vào runtime/typed arrays hiện có; bỏ đường procedural/JSON cũ khỏi show mới.
6. Đặt stage/camera tham chiếu, sửa shader để giữ màu và đủ LED; giữ xe tăng tĩnh.
7. Đồng bộ lifecycle, F9, mạng, loading/catch-up và cue F8.
8. Chạy website, chụp ảnh so Blender, sửa lỗi thực tế, chạy multiplayer và benchmark lại.
9. Cập nhật tài liệu dự án, đường dẫn dữ liệu, debug timeline, báo cáo và cách nâng revision.

Chỉ sửa/mở rộng exporter Blender nếu có phần dữ liệu thực sự thiếu hoặc sai; giữ snapshot trước khi thay. Không dùng lý do schema khác để dựng lại hình bằng code đơn giản. Nếu có blocker không thể khắc phục trong môi trường, báo chính xác phần chưa kiểm chứng và tiếp tục các phần độc lập có thể làm.

## 14. Bàn giao và tiêu chí hoàn thành

Báo cáo file web đã sửa/thêm, revision/hash asset đã dùng, cấu trúc runtime sau thay đổi, evaluator/transform/color contract, F9/F8/multiplayer, hình chụp web, kết quả parity/functional/hiệu năng, hạn chế còn lại và lệnh chạy lại test/cập nhật asset.

Chỉ coi hoàn thành khi F9 phát đúng bảy thiết kế Blender theo thứ tự mới, đủ ID/LED, có chuyển động nội tại đúng dữ liệu, xe tăng tĩnh, Finale đúng cue, replay/cleanup đúng, multiplayer không bị phá và đã kiểm tra hình ảnh trên website thật. Không chỉ bàn giao video hoặc báo compile thành công.

Không tạo lại chức năng phím H đã bị loại bỏ. Không thay đổi avatar, hiện vật, môi trường hay hệ thống F8 ngoài phần nối cần thiết. Không tự commit/push/deploy khi nhiệm vụ chưa yêu cầu.

**Bắt đầu từ working tree hiện có của E:/game-bao-tang-lich-su-online, xác minh bộ export Blender được chỉ rõ ở trên, rồi trực tiếp triển khai bản nâng cấp F9.**
