// File: server.js (PHIÊN BẢN CUỐI CÙNG CHO RENDER)
import express from 'express';
import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors'; // <<<<<<<<<<<<  1. THÊM DÒNG NÀY

// --- CẤU HÌNH ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors()); // <<<<<<<<<<<<  2. THÊM DÒNG NÀY

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

const YT_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const YT_PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
const YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const YT_PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists";

const PUBLIC_DIR = path.join(__dirname, 'public');
const CATALOG_PATH = path.join(PUBLIC_DIR, "catalog.json");
const PLAYLISTS_PATH = path.join(PUBLIC_DIR, "playlists.json");

const chunk = (arr, size) => { const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; };

// --- HÀM CẬP NHẬT DỮ LIỆU ---
async function updateData() {
    try {
        console.log("Bắt đầu cập nhật dữ liệu...");

        // Lấy Uploads Playlist ID
        const channelData = await fetch(`${YT_CHANNELS_URL}?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`).then(res => res.json());
        const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

        // Lấy toàn bộ Video IDs
        let allVideoIds = [];
        let nextPageToken = '';
        do {
            const playlistItemsData = await fetch(`${YT_PLAYLIST_ITEMS_URL}?part=contentDetails&playlistId=${uploadsPlaylistId}&key=${API_KEY}&maxResults=50&pageToken=${nextPageToken}`).then(res => res.json());
            allVideoIds.push(...playlistItemsData.items.map(item => item.contentDetails.videoId));
            nextPageToken = playlistItemsData.nextPageToken;
        } while (nextPageToken);
        console.log(`Tìm thấy ${allVideoIds.length} video ID.`);

        // Lấy chi tiết Videos
        const videoIdChunks = chunk(allVideoIds, 50);
        let allVideos = [];
        for (const idChunk of videoIdChunks) {
            const videoDetailsData = await fetch(`${YT_VIDEOS_URL}?part=snippet,statistics&id=${idChunk.join(',')}&key=${API_KEY}`).then(res => res.json());
            allVideos.push(...videoDetailsData.items);
        }
        allVideos.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));

        // Ghi file catalog.json
        await fs.writeFile(CATALOG_PATH, JSON.stringify(allVideos, null, 2));
        console.log(`✅ Cập nhật và lưu ${allVideos.length} videos vào catalog.json thành công.`);

        // Lấy toàn bộ Playlists
        let allPlaylists = [];
        nextPageToken = '';
        do {
            const playlistsData = await fetch(`${YT_PLAYLISTS_URL}?part=snippet&channelId=${CHANNEL_ID}&key=${API_KEY}&maxResults=50&pageToken=${nextPageToken}`).then(res => res.json());
            allPlaylists.push(...playlistsData.items);
            nextPageToken = playlistsData.nextPageToken;
        } while (nextPageToken);
        
        // Ghi file playlists.json
        await fs.writeFile(PLAYLISTS_PATH, JSON.stringify(allPlaylists, null, 2));
        console.log(`✅ Cập nhật và lưu ${allPlaylists.length} playlists vào playlists.json thành công.`);

        console.log("✅ Cập nhật dữ liệu hoàn tất!");
    } catch (error) {
        console.error("❌ Đã xảy ra lỗi khi cập nhật dữ liệu:", error);
    }
}

// --- LOGIC CHẠY ---
const shouldUpdateOnly = process.argv.includes('--update-only');

if (shouldUpdateOnly) {
  updateData().then(() => process.exit(0));
} else {
  app.use(express.static(PUBLIC_DIR));

  // Chạy cập nhật mỗi giờ
  setInterval(updateData, 60 * 60 * 1000); 
  // Chạy cập nhật lần đầu ngay khi server khởi động
  updateData(); 

  app.listen(PORT, () => {
    console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
  });
}