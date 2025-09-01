// File: server.js (ĐÃ CẬP NHẬT CHO VERCEL)
import express from 'express';
import 'dotenv/config';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { kv } from '@vercel/kv'; // THAY ĐỔI: Import Vercel KV

// --- CẤU HÌNH ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

const YT_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const YT_PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
const YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const YT_PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists";

const PUBLIC_DIR = path.join(__dirname, 'public');

// THAY ĐỔI: Không cần đường dẫn đến file JSON nữa
// const CATALOG_PATH = path.join(PUBLIC_DIR, "catalog.json");
// const PLAYLISTS_PATH = path.join(PUBLIC_DIR, "playlists.json");

const chunk = (arr, size) => { const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; };

// --- HÀM CẬP NHẬT DỮ LIỆU ---
async function updateData() {
    try {
        console.log("Bắt đầu cập nhật dữ liệu...");

        // --- Lấy Uploads Playlist ID ---
        const channelData = await fetch(`${YT_CHANNELS_URL}?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`).then(res => res.json());
        const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

        // --- Lấy toàn bộ Video IDs từ playlist Uploads ---
        let allVideoIds = [];
        let nextPageToken = '';
        do {
            const playlistItemsData = await fetch(`${YT_PLAYLIST_ITEMS_URL}?part=contentDetails&playlistId=${uploadsPlaylistId}&key=${API_KEY}&maxResults=50&pageToken=${nextPageToken}`).then(res => res.json());
            allVideoIds.push(...playlistItemsData.items.map(item => item.contentDetails.videoId));
            nextPageToken = playlistItemsData.nextPageToken;
        } while (nextPageToken);
        console.log(`Tìm thấy ${allVideoIds.length} video ID.`);

        // --- Lấy chi tiết và thống kê cho từng Video (theo chunk 50) ---
        const videoIdChunks = chunk(allVideoIds, 50);
        let allVideos = [];
        for (const idChunk of videoIdChunks) {
            const videoDetailsData = await fetch(`${YT_VIDEOS_URL}?part=snippet,statistics&id=${idChunk.join(',')}&key=${API_KEY}`).then(res => res.json());
            allVideos.push(...videoDetailsData.items);
        }
        // Sắp xếp video theo ngày đăng mới nhất
        allVideos.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));

        // THAY ĐỔI: Lưu dữ liệu vào Vercel KV thay vì ghi file
        console.log(`✅ Cập nhật ${allVideos.length} videos...`);
        await kv.set('catalog', allVideos);
        console.log('Lưu catalog vào Vercel KV thành công.');


        // --- Lấy toàn bộ Playlists của kênh ---
        let allPlaylists = [];
        nextPageToken = '';
        do {
            const playlistsData = await fetch(`${YT_PLAYLISTS_URL}?part=snippet&channelId=${CHANNEL_ID}&key=${API_KEY}&maxResults=50&pageToken=${nextPageToken}`).then(res => res.json());
            allPlaylists.push(...playlistsData.items);
            nextPageToken = playlistsData.nextPageToken;
        } while (nextPageToken);

        // THAY ĐỔI: Lưu dữ liệu vào Vercel KV thay vì ghi file
        console.log(`✅ Cập nhật ${allPlaylists.length} playlists...`);
        await kv.set('playlists', allPlaylists);
        console.log('Lưu playlists vào Vercel KV thành công.');

        console.log("✅ Cập nhật dữ liệu hoàn tất!");
    } catch (error) {
        console.error("❌ Đã xảy ra lỗi khi cập nhật dữ liệu:", error);
    }
}

// --- API ENDPOINTS CHO FRONTEND ---
// THÊM MỚI: API để frontend lấy danh sách video
app.get('/api/catalog', async (req, res) => {
    try {
        const catalog = await kv.get('catalog');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache 1 giờ
        res.json(catalog || []);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch catalog' });
    }
});

// THÊM MỚI: API để frontend lấy danh sách playlist
app.get('/api/playlists', async (req, res) => {
    try {
        const playlists = await kv.get('playlists');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache 1 giờ
        res.json(playlists || []);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

// THÊM MỚI: API để Cron Job kích hoạt việc cập nhật
app.get('/api/update', async (req, res) => {
    // Thêm một lớp bảo mật đơn giản để chỉ Vercel Cron Job có thể gọi
    const cronSecret = process.env.CRON_SECRET;
    if (req.headers['authorization'] !== `Bearer ${cronSecret}`) {
        return res.status(401).send('Unauthorized');
    }
    
    console.log("Nhận yêu cầu cập nhật từ Cron Job...");
    await updateData(); // Không cần đợi hoàn thành
    res.status(200).send('Data update process started.');
});


// --- LOGIC CHẠY ---
const shouldUpdateOnly = process.argv.includes('--update-only');

if (shouldUpdateOnly) {
    updateData().then(() => process.exit(0));
} else {
    app.use(express.static(PUBLIC_DIR)); // Vẫn phục vụ các file tĩnh như index.html, style.css...
    
    // THAY ĐỔI: Bỏ setInterval vì Vercel sẽ dùng Cron Job
    // setInterval(updateData, 60 * 60 * 1000);

    // Chạy cập nhật lần đầu khi server khởi động (đối với môi trường local)
    if (process.env.NODE_ENV !== 'production') {
        updateData();
    }

    app.listen(PORT, () => {
        console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
    });
}