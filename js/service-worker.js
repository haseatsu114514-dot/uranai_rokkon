// service-worker.js
// 占い処 六根清浄｜予約状況APIキャッシュ用Service Worker

const CACHE_NAME = 'rokkon-availability-cache-v1';
const API_CACHE_DURATION = 60000; // 60秒

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 予約状況APIのみキャッシュ
  if (url.searchParams.get('action') === 'getTodayAvailability') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        
        // キャッシュがあり、60秒以内なら返す
        if (cachedResponse) {
          const cachedTime = cachedResponse.headers.get('sw-cached-time');
          if (cachedTime && (Date.now() - parseInt(cachedTime)) < API_CACHE_DURATION) {
            console.log('Service Worker: キャッシュから返却');
            return cachedResponse;
          }
        }
        
        // キャッシュがないか古い場合は新規取得
        try {
          const response = await fetch(event.request);
          const clonedResponse = response.clone();
          
          // レスポンスにタイムスタンプを追加してキャッシュ
          const headers = new Headers(clonedResponse.headers);
          headers.append('sw-cached-time', Date.now().toString());
          
          const cachedResponseWithTime = new Response(clonedResponse.body, {
            status: clonedResponse.status,
            statusText: clonedResponse.statusText,
            headers: headers
          });
          
          cache.put(event.request, cachedResponseWithTime);
          console.log('Service Worker: 新規取得してキャッシュ');
          
          return response;
        } catch (error) {
          console.error('Service Worker: 取得失敗', error);
          // エラー時は古いキャッシュでも返す
          return cachedResponse || new Response(JSON.stringify({
            date: new Date().toISOString().split('T')[0],
            tag: "【本日】",
            parts: {
              "昼の部": { status: "full", count: 0 },
              "夕の部": { status: "full", count: 0 },
              "夜の部": { status: "full", count: 0 }
            }
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })
    );
  } else {
    // その他のリクエストは通常通り
    event.respondWith(fetch(event.request));
  }
});

// Service Worker インストール時
self.addEventListener('install', (event) => {
  console.log('Service Worker: インストール完了');
  self.skipWaiting();
});

// Service Worker アクティベート時
self.addEventListener('activate', (event) => {
  console.log('Service Worker: アクティベート完了');
  event.waitUntil(clients.claim());
});
