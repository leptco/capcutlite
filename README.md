# CapCut Lite

Ứng dụng web dựng phim multi-track, chạy hoàn toàn trong trình duyệt (không cần server xử lý video — mọi thứ chạy bằng ffmpeg.wasm ngay trên máy bạn).

**Tính năng hiện có:**
- **Timeline nhiều track**: thêm/xoá track, mỗi track là 1 lớp video độc lập
- **Clip dạng block** với thumbnail + waveform hiển thị ngay trên timeline
- **Playhead** chạy xuyên toàn bộ timeline, tua bằng cách bấm/kéo trên thước thời gian
- **Zoom timeline** (phóng to/thu nhỏ theo pixel/giây)
- **Cuộn ngang & dọc** khi timeline dài hoặc nhiều track
- **Kéo-thả clip** để đổi vị trí thời gian, và đổi qua track khác
- **Trim đầu/cuối clip** bằng cách kéo 2 mép block
- **Snap** vào playhead và vào mép các clip khác khi kéo/trim
- **Ghép lớp (layer compositing)** khi xem trước lẫn khi xuất: track thêm sau (nằm dưới trong danh sách track) sẽ đè lên track thêm trước, giống nguyên lý track trong Premiere/CapCut
- **Ảo hoá render**: chỉ vẽ những clip đang nằm trong vùng nhìn thấy trên timeline, để kéo/cuộn mượt kể cả khi có rất nhiều clip
- **Chữ overlay** + **phụ đề tự động** (nhận diện giọng nói ngay trong trình duyệt) trên từng clip
- Xuất ra 1 file video mp4 duy nhất, đã ghép đúng lớp/đúng thời điểm

**Giới hạn đã biết (MVP):**
- Chưa có transition (crossfade) giữa các clip — phần này tạm bỏ để đổi lấy kiến trúc multi-track; sẽ làm lại sau nếu cần
- Xem trước lúc **phát (Play)** dùng nhiều thẻ `<video>` đồng bộ bằng 1 đồng hồ ảo — có thể lệch nhẹ vài chục mili-giây giữa các track khi phát liên tục (khi **tua/kéo playhead thì luôn chính xác tuyệt đối**, vì lúc đó video được set thẳng vào đúng thời điểm)
- Không giới hạn cứng số track/clip, nhưng nhiều track + video dài sẽ khiến bước xuất video (ghép lớp bằng ffmpeg) chạy chậm hơn

---

## Cài đặt

### Bước 1: Cài Node.js (nếu chưa có)
Tải tại https://nodejs.org (bản LTS). Kiểm tra: `node --version`

### Bước 2: Cài thư viện
```
cd capcut-lite
npm install
```
Nếu gặp lỗi `externally-managed-environment` khi cài (thường trên macOS) — lỗi đó là của pip/Python, không liên quan tới `npm`, có thể bỏ qua ở đây.

### Bước 3: Chạy ứng dụng
```
npm run dev
```
Mở link hiện ra (thường `http://localhost:5173`) bằng Chrome/Edge.

## Cách dùng

1. **Thêm video**: bấm "+ Thêm video" hoặc để trống nút này chọn nhiều file cùng lúc — video sẽ tự nối tiếp vào cuối track hiện tại
2. **Chọn clip**: bấm vào 1 block trên timeline — clip được chọn sẽ có viền sáng, panel chữ overlay bên phải sẽ hiện thông tin của clip đó
3. **Di chuyển clip**: kéo vào giữa block để đổi vị trí thời gian; kéo lên/xuống để chuyển sang track khác — sẽ tự "hít" (snap) vào playhead hoặc mép clip khác khi đến gần
4. **Trim clip**: kéo mép trái/phải của block để cắt bớt đầu/cuối
5. **Zoom & cuộn**: dùng nút "− Zoom" / "+ Zoom" ở góc trên timeline; cuộn chuột ngang/dọc như bình thường để duyệt timeline dài hoặc nhiều track
6. **Thêm/xoá track**: "+ Thêm track" ở góc trên; nút "×" cạnh tên track để xoá (xoá track sẽ xoá luôn các clip trên track đó)
7. **Tua/scrub**: bấm hoặc kéo trên thước thời gian (ruler) phía trên các track để di chuyển playhead — khung xem trước cập nhật ngay lập tức, chính xác theo từng track
8. **Phát thử**: bấm "▶ Phát" ở dưới khung xem trước để xem thử toàn bộ timeline (có ghép lớp các track)
9. **Chữ overlay / phụ đề tự động**: chọn 1 clip, dùng panel bên phải — giống bản trước
10. **Xuất video**: bấm "Xuất video" ở thanh dưới cùng — lần đầu sẽ nạp ffmpeg.wasm + font (từ file cục bộ trong `public/ffmpeg`, **không phụ thuộc CDN**, được sao chép tự động bởi `npm install`) + (nếu dùng phụ đề tự động) model nhận diện giọng nói

## Ghi chú kỹ thuật

- **Timeline model + store**: `src/timeline/model.js` chứa các quy tắc thuần (độ dài clip/timeline, clamp zoom và chuẩn hoá trim); `src/timeline/timelineStore.js` là nguồn state tập trung cho track, clip, selection, playhead, playback và zoom. Nhờ vậy UI/export không còn tự tính lại luật dữ liệu ở nhiều nơi.
- **Playhead / scrub**: có thể kéo liên tục trên thước hoặc vùng track để tua chính xác; mọi lần seek tự dừng phát để preview luôn đồng bộ.
- **Zoom theo ngữ cảnh**: scale được lưu ở store và khi zoom, điểm giữa vùng timeline đang nhìn được giữ nguyên thay vì nhảy về đầu timeline.
- **Kiến trúc dữ liệu**: mỗi clip có `trackId` (thuộc track nào), `sourceStart`/`sourceEnd` (đoạn cắt trong file gốc), và `timelineStart` (vị trí trên timeline chung). Trim chỉ đổi `sourceStart`/`sourceEnd`; kéo-thả chỉ đổi `timelineStart`/`trackId`.
- **Ghép lớp khi export**: mỗi track được dựng thành 1 lớp trong suốt (kênh alpha) trải dài toàn bộ timeline bằng kỹ thuật `setpts` (dịch thời điểm clip) + `overlay=enable=between(t,...)` (chỉ hiện trong đúng khoảng thời gian của clip). Sau đó các lớp track được chồng lên nhau từ dưới lên trên (`tracks[0]` là track dưới cùng) lên 1 nền đen. Audio của mọi clip được trễ đúng thời điểm (`adelay`) rồi trộn lại (`amix`).
- **Waveform**: được tính 1 lần cho mỗi file gốc (giải mã audio bằng Web Audio API, lấy mẫu biên độ thưa ~8 mẫu/giây) rồi cache lại — nhiều clip cắt từ cùng 1 file sẽ dùng chung dữ liệu waveform, chỉ hiển thị đúng đoạn tương ứng.
- **Thumbnail**: chụp 1 khung hình ở giây thứ 0.1 của mỗi file gốc, cache lại tương tự waveform.
- **Ảo hoá (virtualization)**: `Timeline.jsx` chỉ render các clip có phần giao với vùng đang cuộn tới (`scrollLeft` → `scrollLeft + clientWidth`, cộng thêm buffer) — clip ngoài vùng nhìn thấy không được tạo DOM node, giúp kéo/cuộn mượt dù timeline có hàng trăm clip.
  - **Font chữ overlay**: font Noto Sans Regular được bundle cục bộ tại `public/fonts/NotoSans-Regular.ttf` (tải tĩnh lúc build, không bao giờ fetch từ CDN/GitHub tại runtime) và phục vụ từ `/fonts/NotoSans-Regular.ttf` — trao cho `FFmpeg` qua hằng số `FONT_URL` trong `src/ffmpegEngine.js`. Nếu font tải lỗi và có overlay chữ, export sẽ dừng và báo lỗi rõ ràng (giai đoạn "Tải font chữ overlay") thay vì bỏ qua chữ overlay im lặng.
- **Model phụ đề tự động**: xem `src/whisperEngine.js`, hằng số `WHISPER_MODEL` (mặc định `Xenova/whisper-tiny`, có thể đổi sang `base`/`small` để chính xác hơn).
- Cấu hình trong `vite.config.js` bật sẵn header COOP/COEP — bắt buộc để ffmpeg.wasm hoạt động.
- **ffmpeg.wasm cục bộ (không CDN)**: `npm install` tự động chạy `scripts/copy-ffmpeg-assets.mjs` để sao chép `ffmpeg-core.js`/`.wasm` + worker của `@ffmpeg/ffmpeg` từ `node_modules` vào `public/ffmpeg`. Engine (`src/ffmpegEngine.js`) load 3 file này bằng đường dẫn cùng-origin — nên không bao giờ "treo 120s vì CDN chặn". `npm run build`/`dev` cũng chạy bước sao chép này trước khi build để luôn đủ asset.
- **Lỗi không còn im lặng**: mọi bước ffmpeg (khởi tạo, render clip, ghép lớp, đọc kết quả) đều có timeout; nếu thất bại, thông báo lỗi kèm coreURL/wasmURL/workerURL + thời gian chờ + dòng log lỗi ffmpeg gần nhất. Nếu khởi tạo bị lỗi (ví dụ file core bị hỏng), bản thân ffmpeg được terminate và lần gọi sau sẽ khởi tạo lại từ đầu — không còn "kẹt" ở trạng thái loading chết chóc.

## Ý tưởng mở rộng tiếp theo

- Transition (crossfade) giữa các clip liền kề trên cùng track
- Nhạc nền riêng / chỉnh âm lượng từng clip, từng track (mute/solo)
- Track ẩn/khoá (lock/hide) để không bị chỉnh nhầm khi làm việc trên track khác
- Kéo-thả nhiều clip cùng lúc (multi-select)
- Xuất bản xem trước độ phân giải thấp để duyệt nhanh hơn, rồi mới xuất bản full khi ưng ý

Cứ quay lại nhờ mình khi muốn làm tiếp phần nào.
