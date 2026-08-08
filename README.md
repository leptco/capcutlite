# CapCut Lite

Ứng dụng web dựng phim multi-track, chạy hoàn toàn trong trình duyệt (không cần server xử lý video — export dùng ffmpeg.wasm ngay trên máy bạn).

**Trạng thái hiện tại: Phase 1.1** — nền tảng timeline + xem trước + overlay + export. Chưa có chỉnh sửa clip tương tác (kéo, trim, split, snap).

---

## Tính năng hiện có

### Timeline & media
- **Timeline nhiều track**: thêm/xoá track; mỗi track là một lớp video độc lập
- **Thêm video**: chọn một hoặc nhiều file — clip tự nối tiếp vào cuối track cuối cùng
- **Clip dạng block** trên timeline (tên file + thời lượng); bấm để chọn (Ctrl/Cmd + bấm để chọn thêm clip khác)
- **Xoá clip** đang chọn bằng nút "🗑 Xoá clip đang chọn"
- **Playhead**: bấm trên thước thời gian (ruler) hoặc vùng track để tua
- **Zoom timeline** (nút "− Zoom" / "+ Zoom"; giữ nguyên điểm giữa vùng đang nhìn)
- **Cuộn ngang & dọc** khi timeline dài hoặc nhiều track
- **Ảo hoá render ngang**: chỉ vẽ clip nằm trong vùng cuộn (cộng buffer) — giúp cuộn mượt khi có nhiều clip

### Xem trước & phát
- **Ghép lớp (layer compositing)**: mỗi track một thẻ `<video>` chồng lên nhau; track có index cao hơn (hàng thấp hơn trong timeline) đè lên track index thấp hơn
- **Phát / tạm dừng** toàn timeline bằng nút "▶ Phát" / "⏸ Tạm dừng"
- **Overlay text** hiển thị trên khung xem trước theo thời điểm playhead

### Overlay & export
- **Chữ overlay thủ công** trên từng clip (nội dung, thời gian, vị trí, cỡ chữ, màu)
- **Phụ đề tự động** bằng Whisper chạy trong trình duyệt (`Xenova/whisper-tiny`, mặc định tiếng Việt)
- **Xuất MP4** (1280×720, 30fps): ghép đúng lớp và đúng thời điểm; trộn audio mọi clip (`adelay` + `amix`)

---

## Chưa có (Phase 1.1)

Các mục sau **chưa implement** — data model đã có sẵn `trimIn`/`trimOut`/`start` nhưng chưa có UI tương tác:

- Kéo-thả clip (đổi vị trí thời gian / chuyển track)
- Trim đầu/cuối clip bằng kéo mép block
- Snap vào playhead hoặc mép clip khác
- Split clip tại playhead
- Thumbnail + waveform trên block clip
- Transition (crossfade) giữa các clip
- Undo/redo, lưu/tải project, phím tắt
- Chỉnh âm lượng / mute / solo từng clip hoặc track
- Track ẩn / khoá (lock/hide)

---

## Giới hạn đã biết

- **Xem trước khi phát (Play)** dùng nhiều thẻ `<video>` đồng bộ bằng `requestAnimationFrame` — có thể lệch nhẹ vài chục ms giữa các track khi phát liên tục. Khi **tua playhead (scrub)** thì preview set thẳng `currentTime` nên chính xác theo từng track
- **Scrub không tự dừng playback** — nếu đang phát mà bấm/kéo playhead, video vẫn tiếp tục ở trạng thái "đang phát"
- Export cố định **720p / preset ultrafast**; nhiều track + clip dài làm bước export chậm (mỗi clip render riêng rồi mới ghép lớp)
- Audio mọi clip trộn cùng mức — chưa có volume per clip/track
- State chỉ trong memory — refresh trang mất toàn bộ project
- Không giới hạn cứng số track/clip, nhưng tài nguyên trình duyệt có giới hạn thực tế

---

## Cài đặt

### Bước 1: Cài Node.js (nếu chưa có)
Tải tại https://nodejs.org (bản LTS). Kiểm tra: `node --version`

### Bước 2: Cài thư viện
```
cd capcut-lite
npm install
```

### Bước 3: Chạy ứng dụng
```
npm run dev
```
Mở link hiện ra (thường `http://localhost:5173`) bằng Chrome/Edge.

---

## Cách dùng

1. **Thêm video**: bấm "+ Thêm video", chọn một hoặc nhiều file — clip nối tiếp vào cuối track cuối cùng (tự tạo "Track 1" nếu timeline trống)
2. **Chọn clip**: bấm block trên timeline — viền sáng; panel "Chữ overlay / Phụ đề" bên phải hiện thông tin clip đó
3. **Zoom & cuộn**: nút "− Zoom" / "+ Zoom" trên timeline; cuộn chuột ngang/dọc để duyệt
4. **Thêm/xoá track**: "+ Thêm track"; nút "×" cạnh tên track để xoá (xoá luôn clip trên track đó)
5. **Tua (scrub)**: bấm trên ruler hoặc vùng track để di chuyển playhead — khung xem trước cập nhật ngay
6. **Phát thử**: bấm "▶ Phát" dưới khung xem trước
7. **Chữ overlay / phụ đề tự động**: chọn clip → panel bên phải → "+ Thêm chữ" hoặc "✨ Tự động tạo phụ đề"
8. **Xoá clip**: chọn clip → "🗑 Xoá clip đang chọn"
9. **Xuất video**: bấm "Xuất video" ở thanh dưới — lần đầu tải ffmpeg.wasm; lần đầu dùng phụ đề tự động tải thêm model Whisper; export có overlay chữ tải thêm font Noto Sans

---

## Ghi chú kỹ thuật

### Kiến trúc
```
src/
├── App.jsx                 # Shell: import media, playback, export
├── components/
│   ├── Timeline.jsx        # Track lanes, ruler, playhead, virtualization
│   ├── TimelineClip.jsx    # Block clip (chỉ hiển thị, chưa drag/trim)
│   ├── Stage.jsx           # Preview multi-track + overlay text
│   ├── OverlayPanel.jsx    # UI overlay + Whisper captions
│   └── ExportBar.jsx
├── timeline/
│   ├── store/timelineStore.js   # Zustand: tracks, clips, playhead, zoom, selection
│   ├── engine/timelineEngine.js # time ↔ pixels, clip geometry
│   ├── hooks/useTimeline.js     # Hook bọc store + helpers
│   ├── utils/time.js            # clamp, getTimelineDuration
│   └── constants.js
├── ffmpegEngine.js         # Export pipeline (ffmpeg.wasm)
└── whisperEngine.js        # ASR phụ đề (Transformers.js)
```

### Data model clip (trong store)
Mỗi clip lưu:
- `trackId` — thuộc track nào
- `start` — vị trí trên timeline (giây)
- `duration` — độ dài hiển thị trên timeline
- `trimIn` / `trimOut` — đoạn cắt trong file gốc (hiện chỉ set lúc import, chưa chỉnh qua UI)
- `overlays` — danh sách chữ overlay

Khi export, `App.jsx` map sang `timelineStart`, `sourceStart`, `sourceEnd` cho `ffmpegEngine.js`.

### Ghép lớp khi export
Mỗi track → một lớp trong suốt (alpha) trải toàn timeline bằng `setpts` + `overlay=enable=between(t,...)`. Các track chồng từ dưới lên: `tracks[0]` dưới cùng, track cuối trên cùng. Audio mọi clip trễ đúng thời điểm (`adelay`) rồi trộn (`amix`).

### Zoom
Scale lưu trong store; khi zoom, điểm giữa viewport timeline được giữ cố định thay vì nhảy về đầu.

### Virtualization
`Timeline.jsx` lọc clip theo `scrollLeft ± buffer` — clip ngoài vùng nhìn không render DOM node.

### Font overlay & Whisper
- Font: `FONT_URL` trong `src/ffmpegEngine.js` — lỗi tải font thì export bỏ qua chữ overlay
- Model ASR: `WHISPER_MODEL` trong `src/whisperEngine.js` (mặc định `Xenova/whisper-tiny`; có thể đổi sang `base`/`small`)

### Vite / ffmpeg.wasm
`vite.config.js` bật header COOP/COEP — bắt buộc cho SharedArrayBuffer khi chạy ffmpeg.wasm.

---

## Roadmap (Phase tiếp theo)

**Phase 1.2 — Editor cơ bản**
- Kéo-thả clip (đổi `start` + `trackId`)
- Trim bằng kéo mép block (cập nhật `trimIn`/`trimOut`/`duration`)
- Snap playhead + mép clip
- Scrub tự dừng playback
- `timeline/model.js` — logic thuần (clamp, snap, collision)

**Sau Phase 1.2**
- Thumbnail + waveform trên clip
- Split clip tại playhead
- Transition (crossfade)
- Volume / mute / solo; track audio riêng
- Track lock/hide; multi-select + kéo nhiều clip
- Export preview độ phân giải thấp; chọn preset/resolution
- Undo/redo; lưu/tải project (JSON + IndexedDB)
