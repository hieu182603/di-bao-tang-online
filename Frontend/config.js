// Cấu hình các mô hình 3D thực tế ngoài trời (.glb).
// Tải hoặc sao chép các file .glb vào thư mục models/ để hiển thị mô hình 3D chân thực.
// Nếu không tìm thấy file, hệ thống sẽ tự động dùng mô hình đồ họa PBR mô phỏng chuẩn.
window.MODELS = {
  tank: "models/tank_390.glb",      // Xe tăng T-54 / T-80 / T-55
  mig21: "models/mig21.glb",        // Máy bay tiêm kích MiG-21 / phản lực
  f5e: "models/f5e.glb",            // Máy bay tiêm kích F-5E Tiger II
  truck: "models/truck.glb",        // Xe tải vận tải quân sự Trường Sơn
};

// Mô hình 3D thật thay cho hiện vật/cây dựng bằng code (tải từ Sketchfab, đã nén cho web).
// size = kích thước ngoài đời (mét): chiều dài nằm ngang lớn nhất, hoặc chiều cao nếu fit: "height".
// rotY = xoay thêm (radian) để mũi xe/nòng pháo hướng đúng chiều trưng bày. Xoá một dòng để quay lại mô hình dựng bằng code.
window.REAL_MODELS = {
  pt76: { url: "models/pt76.glb", size: 7.6, rotY: Math.PI / 2 },
  sam2: { url: "models/sam2.glb", size: 10.6, rotY: 0 },
  luu_phao_105: { url: "models/m101.glb", size: 5.6, rotY: Math.PI / 2 },
  sung_coi_120: { url: "models/mortar120.glb", size: 3.4, rotY: 0 },
  truck: { url: "models/zis150.glb", size: 6.7, rotY: Math.PI }, // xe tải ZIS-150, đầu xe quay ra lối đi
  // Dựng trong Blender theo ảnh Wikimedia Commons (pháo 61-K, pháo M-46, xác B-52 ở hồ Hữu Tiệp)
  phao_cao_xa_37: { url: "models/aa37_61k.glb", size: 5.7, rotY: 0 },
  phao_130: { url: "models/m46_130.glb", size: 11.0, rotY: 0, baseW: 11.8, baseD: 5.6 },
  xac_b52: { url: "models/b52_wreck.glb", size: 7.5, rotY: 0 },
  xe_dap_tho: { url: "models/xe_dap_tho.glb", size: 2.3, rotY: 0 },
  tree: { url: "models/tree_shade.glb", size: 7.5 },
  bench: { url: "models/bench.glb", size: 1.9 },
};

// Cấu hình máy chủ Backend SignalR (.NET 8).
// Kết nối trực tiếp máy chủ Azure SignalR Hub (hoặc đổi sang http://localhost:5089 nếu tự chạy .NET local).
window.BACKEND_URL = "https://baotang-lsd-12222.azurewebsites.net";

// Cấu hình chế độ nhiều người dự phòng bằng Firebase khi chạy tĩnh hoàn toàn.
// Để trống (null) thì bảo tàng dùng BACKEND_URL hoặc chạy chế độ một người.
// Cách lấy cấu hình: xem README.md, mục "Bật chế độ nhiều người".
window.FIREBASE_CONFIG = null;
/* Ví dụ sau khi tạo project Firebase:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "ten-project.firebaseapp.com",
  databaseURL: "https://ten-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ten-project",
  appId: "1:123:web:abc",
};
*/
// Tượng Chủ tịch Hồ Chí Minh trước cửa bảo tàng.
// Bỏ file mô hình 3D (.glb) vào thư mục models/ với tên dưới đây. Chưa có file thì bệ tượng để trống.
// rotationY: xoay tượng (radian) nếu mô hình bị quay lưng lại; thử 3.14 (nửa vòng) hoặc 1.57 (một phần tư vòng).
// Khi chưa có file .glb, dùng ảnh chụp mô hình (image) đã tách nền; cropBottom = phần chiều cao ảnh giữ lại (bỏ bệ trong ảnh).
window.STATUE = { url: "models/tuong_bac_ho.glb", rotationY: 0, height: 3.4, image: "models/tuong_bac_ho_anh.png", cropBottom: 0.868, backImage: "models/tuong_bac_ho_sau.png", backCropBottom: 0.85, backTolerance: 10, tolerance: 6 };

// Ảnh tượng chụp ở nhiều góc (ưu tiên dùng nếu có): mỗi ô là [x, y, rộng, cao] trên ảnh, a = góc nhìn (độ).
window.STATUE.sheet = "models/tuong_bac_ho_9goc.png";
window.STATUE.sheetCrop = 0.84;
window.STATUE.views = [
  { a: 0, r: [0, 0, 256, 510] }, { a: 36, r: [256, 0, 256, 510] }, { a: 72, r: [512, 0, 256, 510] }, { a: 108, r: [768, 0, 256, 510] },
  { a: 180, r: [0, 512, 205, 512] }, { a: 216, r: [205, 512, 205, 512] }, { a: 252, r: [410, 512, 205, 512] },
  { a: 288, r: [615, 512, 205, 512] }, { a: 324, r: [820, 512, 204, 512] },
];

// Tên phòng: đổi tên khác nếu muốn tách riêng từng buổi thuyết trình.
window.MUSEUM_ROOM = "bao-tang-vnr";

// Bật/tắt tượng và bệ tượng trước cửa (true = hiện, false = ẩn).
window.STATUE.enabled = false;
