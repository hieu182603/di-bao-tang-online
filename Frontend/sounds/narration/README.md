# Thuyết minh tiếng Việt dự phòng

Các tệp MP3 trong thư mục này được phát khi thiết bị không có giọng tiếng Việt hoặc giọng trên máy gặp lỗi. Tệp được đặt tên theo nội dung đầy đủ của hiện vật, gồm tiêu đề, thời gian, mô tả và liên hệ bài học.

Âm thanh được tổng hợp cục bộ bằng [Piper 2023.11.14-2](https://github.com/rhasspy/piper/releases/tag/2023.11.14-2) với mô hình [vi_VN-vais1000-medium](https://huggingface.co/rhasspy/piper-voices/tree/main/vi/vi_VN/vais1000/medium). Mô hình sử dụng bộ dữ liệu VAIS-1000 Vietnamese Speech Synthesis Corpus, giấy phép [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Giọng tổng hợp được dùng làm bản thu dự phòng cho bảo tàng.

Khi sửa nội dung trong `content.js`, các hiện vật khai báo trong `app.js`, `images/hien_vat/credits.json` hoặc `images/tu_kinh/artifacts.json`, tải Piper và mô hình trên, cài FFmpeg rồi chạy từ thư mục gốc dự án:

```text
node scripts/generate_narration_audio.js --piper <duong-dan-piper> --model <duong-dan-vi_VN-vais1000-medium.onnx>
node --test scripts/test_narration.js
```

Đặt tệp cấu hình `.onnx.json` bên cạnh mô hình `.onnx`. Công cụ chỉ tạo các bản thu còn thiếu; công cụ và mô hình không cần triển khai cùng website. Quá trình tạo âm thanh chạy trên máy và không gửi nội dung hiện vật tới dịch vụ bên ngoài.
