import { Capacitor } from '@capacitor/core';

let amapPromise;

export function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapPromise) return amapPromise;

  const key = import.meta.env.VITE_AMAP_KEY;
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE;
  if (!key || !securityJsCode) {
    return Promise.reject(new Error('请先在 .env.local 配置高德地图 Key 和安全密钥。'));
  }

  window._AMapSecurityConfig = { securityJsCode };
  if (Capacitor.isNativePlatform()) {
    window.forbidenWebGL = true;
  }
  amapPromise = import('@amap/amap-jsapi-loader').then(({ default: AMapLoader }) => AMapLoader.load({ key, version: '2.0', plugins: ['AMap.PlaceSearch'] })).catch(error => {
    amapPromise = null;
    throw new Error(error?.message || '高德地图 SDK 加载失败，请检查网络和 Key 配置。');
  });
  return amapPromise;
}

export function gpsToAmap(AMap, latitude, longitude) {
  return new Promise(resolve => {
    AMap.convertFrom([Number(longitude), Number(latitude)], 'gps', (status, result) => {
      if (status === 'complete' && result?.info === 'ok' && result.locations?.[0]) {
        const point = result.locations[0];
        resolve([point.getLng(), point.getLat()]);
      } else resolve([Number(longitude), Number(latitude)]);
    });
  });
}
