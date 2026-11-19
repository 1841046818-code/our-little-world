import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import {
  AudioLines, CalendarDays, Camera, Check, ChevronRight, Search,
  ChevronDown, Copy, Gift, Heart, House, LockKeyhole, LogOut, Mail, MapPin, Pencil,
  Menu, Music2, Pause, Play, Plus, Settings2, Sparkles, StickyNote,
  Trash2, UserRoundPlus, X
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { gpsToAmap, loadAmap } from './lib/amap';
import { getCareSuggestion } from './lib/care-suggestions';
import { toLocalDateInput, formatDate, lunarMonthNames, lunarDayNames, getAnnualCalendarDates, getLunarDateInYear, getQixiDate, getCountdownOccurrence, getCalendarEventLabel, getCalendarDateCaption } from './lib/calendar';
import './styles.css';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const gameSymbols = ['♡', '☆', '☼', '♫', '♡', '✿', '✿', '♫', '☆', '☼', '☁', '☁'];
const startNotes = [
  { id: 1, date: '今天 · 14:20', title: '午后的一小块甜', body: '路过那家面包店，还是给你带了最喜欢的草莓小蛋糕。', mood: '想你' },
  { id: 2, date: '昨天 · 22:08', title: '睡前记得抱抱', body: '今天虽然有点累，但和你说完晚安，心里就软软的。', mood: '晚安' },
];
const startMemories = [
  { id: 1, date: '2025.10.18', title: '第一次一起看海', text: '风有一点大，你把围巾分给我一半。那天的海和你，都很温柔。', kind: '旅行' },
  { id: 2, date: '2025.08.02', title: '雨天也要去散步', text: '没有带伞的计划，最后变成了最开心的一场雨。', kind: '日常' },
  { id: 3, date: '2025.05.20', title: '把喜欢说给你听', text: '从这一天开始，我们有了一个共同的故事。', kind: '纪念日' },
];
const startTodos = [
  { id: 1, text: '去海边看一次日出', done: true },
  { id: 2, text: '一起做一顿晚餐', done: true },
  { id: 3, text: '找一家有猫咪的咖啡店', done: false },
  { id: 4, text: '在山顶等一场日落', done: false },
];
const startPlaces = [
  { id: 1, name: '第一次约会的咖啡店', date: '2025.05.20', note: '靠窗的那张桌子，我们聊了好久。' },
  { id: 2, name: '海风刚刚好的地方', date: '2025.10.18', note: '一起看海，把围巾分给我一半。' },
];
const readDemoValue = (key, fallback) => {
  try { const value = localStorage.getItem(`little-world-${key}`); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
};
const getSharedEntriesSignature = entries => JSON.stringify(
  (entries || []).map(({ id, kind, created_at, deleted_at, done, title, body, entry_date, metadata }) => ({ id, kind, created_at, deleted_at, done, title, body, entry_date, metadata })),
);
const getAlbumsSignature = albums => JSON.stringify((albums || []).map(album => album.name));
const getMembersSignature = members => JSON.stringify((members || []).map(({ user_id, nickname, joined_at }) => ({ user_id, nickname, joined_at })));
const explainAlbumSyncError = error => {
  const message = error?.message || '';
  if (/memory_albums|PGRST205|schema cache/i.test(message)) {
    return '自定义相册分类表尚未创建。请在 Supabase SQL Editor 执行 supabase/migrations/202611180001_memory_albums.sql；其他共同记录仍会继续同步。';
  }
  return `相册分类同步失败：${message || '请稍后重试。'}`;
};
const formatUpdatedAt = (value, now = Date.now()) => {
  if (!value) return '';
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  return minutes < 1 ? '刚刚更新' : minutes < 60 ? `${minutes} 分钟前更新` : `今天 ${new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新`;
};
const fileAsDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('无法读取这张照片。'));
  reader.readAsDataURL(file);
});
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_ORIGINAL_PHOTO_SIZE = 50 * 1024 * 1024;
const compressPhoto = async file => {
  if (file.type === 'image/gif') {
    if (file.size > MAX_PHOTO_SIZE) throw new Error('GIF 动图不能超过 10 MB，请选择较小的动图。');
    return file;
  }
  if (file.size > MAX_ORIGINAL_PHOTO_SIZE) throw new Error('原始照片不能超过 50 MB。');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.72, 0.6, 0.48]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob && blob.size <= MAX_PHOTO_SIZE) {
        const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
        return new File([blob], `${name}.webp`, { type: 'image/webp', lastModified: Date.now() });
      }
    }
    throw new Error('照片压缩后仍超过 10 MB，请换一张较小的照片。');
  } catch (error) {
    if (error instanceof Error && error.message.includes('超过')) throw error;
    throw new Error('无法处理这张照片，请尝试另存为 JPG 或 PNG 后重试。');
  } finally {
    bitmap?.close();
  }
};
const navItems = [
  { id: 'home', label: '小宇宙', icon: House },
  { id: 'memories', label: '时光相册', icon: Camera },
  { id: 'diary', label: '日常碎碎念', icon: StickyNote },
  { id: 'plans', label: '日历与计划', icon: CalendarDays },
  { id: 'map', label: '我们的地图', icon: MapPin },
  { id: 'care', label: '贴心日历', icon: Heart },
  { id: 'games', label: '心动小游戏', icon: Sparkles },
  { id: 'trash', label: '回收站', icon: Trash2 },
];

function Modal({ title, subtitle, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal" onMouseDown={e => e.stopPropagation()}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
      <p className="eyebrow">A LITTLE NOTE FOR YOU</p>
      <h2>{title}</h2>
      {subtitle && <p className="modal-subtitle">{subtitle}</p>}
      {children}
    </section>
  </div>;
}

function PhotoAttachment({ preview, saving, error, onSelect, onRemove }) {
  return <div className="photo-attachment">
    <label className="photo-select"><Camera size={16} /><span>{preview ? '更换照片' : '添加一张照片'}<small>普通照片会自动压缩，原图最大 50 MB；GIF 最大 10 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={saving} onChange={onSelect} /></label>
    {preview && <div className="photo-attachment-preview"><img src={preview} alt="照片预览" /><button type="button" className="outline-button" onClick={onRemove} disabled={saving}>移除照片</button></div>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}

function HeartParticles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles = [];
    let frame = 0;
    let previous = 0;
    let width = 1;
    let height = 1;
    let scale = 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      scale = Math.min(width / 480, height / 420);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    const pointOnHeart = angle => ({
      x: 160 * Math.sin(angle) ** 3,
      y: 130 * Math.cos(angle) - 50 * Math.cos(2 * angle) - 20 * Math.cos(3 * angle) - 10 * Math.cos(4 * angle) + 25,
    });
    const draw = now => {
      frame = requestAnimationFrame(draw);
      if (document.hidden) return;
      const delta = Math.min((now - (previous || now)) / 1000, 0.04);
      previous = now;
      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      if (reducedMotion) {
        context.beginPath();
        for (let angle = -Math.PI; angle <= Math.PI; angle += 0.04) {
          const point = pointOnHeart(angle);
          const x = centerX + point.x * scale * 0.58;
          const y = centerY - point.y * scale * 0.58;
          if (angle === -Math.PI) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.closePath();
        context.fillStyle = 'rgba(200, 111, 141, 0.16)';
        context.fill();
        context.strokeStyle = 'rgba(200, 111, 141, 0.6)';
        context.lineWidth = 1.5;
        context.stroke();
      }
      const emission = reducedMotion ? 0 : Math.min(18, Math.ceil(210 * delta));
      for (let index = 0; index < emission; index += 1) {
        const point = pointOnHeart(Math.PI - Math.random() * Math.PI * 2);
        const magnitude = Math.hypot(point.x, point.y) || 1;
        const speed = (48 + Math.random() * 25) * scale;
        particles.push({
          x: centerX + point.x * scale,
          y: centerY - point.y * scale,
          vx: point.x / magnitude * speed,
          vy: -point.y / magnitude * speed,
          age: 0,
          size: 1.2 + Math.random() * 1.5,
        });
      }
      context.fillStyle = '#c86f8d';
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += delta;
        if (particle.age > 2 || particles.length > 520) { particles.splice(index, 1); continue; }
        particle.vx *= Math.max(0, 1 - delta * 0.5);
        particle.vy *= Math.max(0, 1 - delta * 0.5);
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        context.globalAlpha = (1 - particle.age / 2) * 0.78;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className="heart-particles" aria-hidden="true" />;
}

function LoginScreen({ onComplete, onDemo }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="auth-screen">
    <div className="auth-topline"><a className="brand" href="#"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>我们的小宇宙<small>JUST US, ALWAYS</small></span></a><span>属于两个人的日常空间</span></div>
    <section className="auth-card">
      <div className="auth-heart-backdrop" aria-hidden="true"><HeartParticles /></div>
      <div className="auth-art auth-dog-art"><img src="/assets/dog-couple.png" alt="依偎在一起的线条小狗" /><span className="auth-tape" /><span className="auth-heart">♡</span><span className="photo-caption">每一颗心，都朝着你。</span></div>
      <p className="eyebrow">A LITTLE WORLD FOR TWO</p>
      <h1>{mode === 'login' ? '回来啦，想你们了。' : '从这里，开始一起记录。'}</h1>
      <p className="auth-copy">登录后，和喜欢的人一起收藏生活里的小事。</p>
      <div className="auth-switch"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>登录</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>创建账号</button></div>
      <form className="auth-form" onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = e.currentTarget;
        let timeoutId;
        const timeout = new Promise(resolve => { timeoutId = setTimeout(() => resolve({ error: '连接认证服务超时，请检查网络后重试。' }), 20000); });
        try {
          const result = await Promise.race([onComplete({ email: form.elements.email.value, password: form.elements.password.value, mode, nickname: form.elements.nickname?.value }), timeout]);
          setError(result?.error || '');
        } catch (error) {
          setError(error?.message || '连接失败，请检查网络后重试。');
        } finally {
          clearTimeout(timeoutId);
          setBusy(false);
        }
      }}>
        <label><span>邮箱</span><div className="auth-input"><Mail size={15} /><input name="email" type="email" required placeholder="you@example.com" /></div></label>
        <label><span>密码</span><div className="auth-input"><LockKeyhole size={15} /><input name="password" type="password" minLength="6" required placeholder="至少 6 位密码" /></div></label>
        {mode === 'register' && <label><span>昵称</span><div className="auth-input"><UserRoundPlus size={15} /><input name="nickname" required placeholder="TA 会怎么称呼你" /></div></label>}
        <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? '正在连接…' : mode === 'login' ? '登录小宇宙' : '创建账号'} <ChevronRight size={15} /></button>
      </form>
      {error && <p className="form-error auth-error">{error}</p>}
      {!hasSupabaseConfig && <p className="auth-config-note">{import.meta.env.DEV ? '还没有配置 Supabase。可先进入演示空间，或按项目里的 .env.example 配置云端服务。' : '云端服务尚未配置，请联系网站管理员。'}</p>}
      {import.meta.env.DEV && <><button className="demo-entry" onClick={onDemo}>先看看演示空间 <ChevronRight size={13} /></button><p className="auth-demo-note">演示空间仅保存在当前浏览器</p></>}
    </section>
    <p className="auth-footer">把喜欢，写进每一天。 <Heart size={12} fill="currentColor" /></p>
  </main>;
}

function PairingScreen({ code, onCreate, onJoin, onContinue, onLogout, isDemo = false }) {
  const [mode, setMode] = useState('choose');
  const [invite, setInvite] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shownCode, setShownCode] = useState('');
  const createSpace = async () => {
    setBusy(true); setError('');
    const result = await onCreate();
    setBusy(false);
    if (result?.error) { setError(result.error); return; }
    setShownCode(result?.code || code);
    setMode('create');
  };
  return <main className="pair-screen">
    <header className="pair-header"><a className="brand" href="#"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>我们的小宇宙<small>JUST US, ALWAYS</small></span></a><button className="subtle-link" onClick={onLogout}><LogOut size={14} /> 退出</button></header>
    <section className="pair-card">
      <div className="pair-art"><img src="/assets/dog-couple.png" alt="线条小狗情侣插画" /><span>♡</span></div>
      {mode === 'choose' && <><p className="eyebrow">YOUR SHARED SPACE</p><h1>把你们的小宇宙，<br />连在一起。</h1><p className="pair-copy">创建一个只属于你们的空间，或输入对方分享的配对码加入。</p><div className="pair-options"><button className="pair-option" onClick={createSpace}><span><Heart size={18} /></span><strong>创建情侣空间</strong><small>生成配对码，邀请 TA 加入</small><ChevronRight size={16} /></button><button className="pair-option" onClick={() => setMode('join')}><span><UserRoundPlus size={18} /></span><strong>加入 TA 的空间</strong><small>输入对方发来的配对码</small><ChevronRight size={16} /></button></div>{busy && <p className="pair-demo-note">正在创建你们的空间…</p>}</>}
      {mode === 'create' && <><p className="eyebrow">INVITE YOUR PERSON</p><h1>把这串小小暗号，<br />分享给 TA。</h1><p className="pair-copy">TA 输入配对码后，你们就能一起写日记、收藏回忆。</p><div className="invite-code">{(shownCode || code).split('').map((digit, i) => <span key={i}>{digit}</span>)}</div><button className="outline-button copy-code" onClick={async () => { try { await navigator.clipboard.writeText(shownCode || code); setCopied(true); } catch { setCopied(false); } }}><Copy size={14} /> {copied ? '已复制配对码' : '复制配对码'}</button><p className="pair-code-note">配对码 7 天内有效，只能加入一个人。</p><button className="primary-button pair-submit" onClick={onContinue}>进入我们的小宇宙 <ChevronRight size={14} /></button></>}
      {mode === 'join' && <><p className="eyebrow">JOIN YOUR PERSON</p><h1>输入 TA 分享的<br />配对码。</h1><p className="pair-copy">配对成功后，你们会进入同一个情侣空间。</p><form onSubmit={async e => { e.preventDefault(); if (invite.trim().length < 6) { setError('请输入完整的 6 位配对码'); return; } setBusy(true); setError(''); const result = await onJoin(invite); setBusy(false); if (result?.error) setError(result.error); }}><label className="invite-label">6 位配对码<input value={invite} onChange={e => { setInvite(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="请输入配对码" inputMode="numeric" maxLength="6" /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button pair-submit" type="submit" disabled={busy}>{busy ? '正在加入…' : '加入你们的空间'} <ChevronRight size={14} /></button></form><button className="back-link" onClick={() => setMode('choose')}>返回上一步</button></>}
      {error && mode !== 'join' && <p className="form-error">{error}</p>}
      <p className="pair-demo-note">{isDemo ? '演示空间仅保存在当前浏览器' : '邀请码由服务端验证，仅限两位成员加入'}</p>
    </section>
  </main>;
}

function LiveLocationMap({ active, ownLocation, partnerLocation, ownLabel, partnerLabel, focusRequest }) {
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const centeredRef = useRef(false);
  const lastFocusRequestRef = useRef(0);
  const lastFitCountRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    const host = document.querySelector('.live-map');
    if (!active || !host || mapRef.current) return;
    const element = document.createElement('div');
    element.className = 'location-map-canvas';
    host.prepend(element);
    let disposed = false;
    let map;
    const error = document.createElement('div');
    error.className = 'map-load-error';
    loadAmap().then(AMap => {
      if (disposed) return;
      map = new AMap.Map(element, { zoom: 4, center: [105, 35], viewMode: '2D', resizeEnable: true });
      map.on('error', event => {
        error.textContent = `高德地图加载异常${event?.info ? `：${event.info}` : ''}（${location.hostname}）`;
        if (!error.isConnected) host.append(error);
      });
      mapRef.current = map;
      setMapReady(true);
      requestAnimationFrame(() => map?.resize());
    }).catch(reason => {
      if (!disposed) { error.textContent = reason.message; host.append(error); }
    });
    return () => {
      disposed = true;
      error.remove();
      map?.destroy();
      element.remove();
      mapRef.current = null;
      setMapReady(false);
      markersRef.current = {};
      centeredRef.current = false;
      lastFocusRequestRef.current = 0;
      lastFitCountRef.current = 0;
    };
  }, [active]);
  useEffect(() => {
    const map = mapRef.current;
    if (!active || !mapReady || !map) return;
    let disposed = false;
    const points = [
      ['self', ownLocation, ownLabel || '我的位置', '#b45f7f'],
      ['partner', partnerLocation, partnerLabel || 'TA 的位置', '#6d9276'],
    ];
    const valid = points.filter(([, location]) => location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)));
    Promise.all(valid.map(async ([key, location, label, color]) => {
      const [lng, lat] = await gpsToAmap(window.AMap, location.latitude, location.longitude);
      if (disposed) return null;
      const markerLabel = document.createElement('span');
      markerLabel.className = `live-location-marker-label ${key}`;
      markerLabel.style.setProperty('--marker-color', color);
      const dot = document.createElement('i');
      const text = document.createElement('b');
      text.textContent = label;
      markerLabel.append(dot, text);
      if (!markersRef.current[key]) {
        markersRef.current[key] = new window.AMap.Marker({
          position: [lng, lat], content: markerLabel, offset: new window.AMap.Pixel(-10, -14), title: label,
        });
        map.add(markersRef.current[key]);
      } else {
        markersRef.current[key].setPosition([lng, lat]);
        markersRef.current[key].setContent(markerLabel);
      }
      return [lng, lat];
    })).then(positions => {
      if (disposed) return;
      const visible = positions.filter(Boolean);
      const shouldFocus = !centeredRef.current || focusRequest !== lastFocusRequestRef.current || visible.length !== lastFitCountRef.current;
      if (shouldFocus && visible.length > 1) map.setFitView(Object.values(markersRef.current), false, [42, 42, 42, 42], 14);
      else if (shouldFocus && visible.length === 1) map.setZoomAndCenter(14, visible[0]);
      if (shouldFocus) {
        centeredRef.current = true;
        lastFocusRequestRef.current = focusRequest;
        lastFitCountRef.current = visible.length;
      }
    });
    points.forEach(([key, location]) => {
      if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
        if (markersRef.current[key]) { map.remove(markersRef.current[key]); delete markersRef.current[key]; }
      }
    });
    return () => { disposed = true; };
  }, [active, ownLocation, partnerLocation, ownLabel, partnerLabel, focusRequest]);
  return null;
}

function PlaceCoordinatePicker({ latitude, longitude, onPick }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  const [mapReady, setMapReady] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => { onPickRef.current = onPick; }, [onPick]);
  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const hasPoint = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && latitude !== '' && longitude !== '';
    let disposed = false;
    const mapError = document.createElement('div');
    mapError.className = 'map-load-error';
    loadAmap().then(AMap => {
      if (disposed) return;
      const map = new AMap.Map(elementRef.current, {
        zoom: hasPoint ? 13 : 4,
        center: hasPoint ? [Number(longitude), Number(latitude)] : [105, 35],
        viewMode: '2D',
      });
      mapRef.current = map;
      setMapReady(true);
      map.on('click', event => onPickRef.current(event.lnglat.getLat(), event.lnglat.getLng()));
      if (hasPoint) {
        markerRef.current = new AMap.Marker({ position: [Number(longitude), Number(latitude)] });
        map.add(markerRef.current);
      }
      requestAnimationFrame(() => map.resize());
    }).catch(reason => {
      if (!disposed) { mapError.textContent = reason.message; elementRef.current?.append(mapError); }
    });
    return () => { disposed = true; mapRef.current?.destroy(); mapRef.current = null; markerRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (latitude === '' || longitude === '') {
      if (markerRef.current) map.remove(markerRef.current);
      markerRef.current = null;
      return;
    }
    const point = [Number(longitude), Number(latitude)];
    if (!markerRef.current) { markerRef.current = new window.AMap.Marker({ position: point }); map.add(markerRef.current); }
    else markerRef.current.setPosition(point);
    map.setZoomAndCenter(Math.max(map.getZoom(), 13), point);
  }, [latitude, longitude, mapReady]);
  const searchPlaces = event => {
    event.preventDefault();
    if (!searchText.trim() || !mapRef.current || !window.AMap) return;
    setSearching(true);
    const search = new window.AMap.PlaceSearch({ city: '全国', pageSize: 6, autoFitView: true });
    search.search(searchText.trim(), (status, result) => {
      setSearching(false);
      if (status !== 'complete' || !result?.poiList?.pois) { setSearchResults([]); return; }
      setSearchResults(result.poiList.pois.filter(place => place.location).map(place => ({ id: place.id, name: place.name, longitude: place.location.getLng(), latitude: place.location.getLat() })));
    });
  };
  const selectSearchPlace = place => {
    onPickRef.current(place.latitude, place.longitude);
    const point = [place.longitude, place.latitude];
    if (!markerRef.current) { markerRef.current = new window.AMap.Marker({ position: point }); mapRef.current.add(markerRef.current); }
    else markerRef.current.setPosition(point);
    mapRef.current.setZoomAndCenter(15, point);
    setSearchResults([]);
  };
  return <div className="place-picker-wrap"><form className="place-search" onSubmit={searchPlaces}><label className="search-field"><Search size={14} /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="搜索城市、地址或约会地点" /></label><button className="outline-button" type="submit" disabled={!mapReady || searching}>{searching ? '搜索中…' : '搜索'}</button></form>{searchResults.length > 0 && <div className="place-search-results">{searchResults.map(place => <button type="button" key={place.id} onClick={() => selectSearchPlace(place)}><MapPin size={14} /><span>{place.name}</span></button>)}</div>}<div className="place-coordinate-map" ref={elementRef} aria-label="点击地图选择地点" /></div>;
}

function PlacesLocationMap({ active, places }) {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    const host = document.querySelector('.map-page .map-canvas');
    if (!active || !host || mapRef.current) return;
    const element = document.createElement('div');
    element.className = 'places-map-canvas';
    host.prepend(element);
    let disposed = false;
    const error = document.createElement('div');
    error.className = 'map-load-error';
    loadAmap().then(AMap => {
      if (disposed) return;
      mapRef.current = new AMap.Map(element, { zoom: 4, center: [105, 35], viewMode: '2D', resizeEnable: true });
      mapRef.current.on('error', event => {
        error.textContent = `高德地图加载异常${event?.info ? `：${event.info}` : ''}（${location.hostname}）`;
        if (!error.isConnected) host.append(error);
      });
      setMapReady(true);
      requestAnimationFrame(() => mapRef.current?.resize());
    }).catch(reason => {
      if (!disposed) { error.textContent = reason.message; host.append(error); }
    });
    return () => { disposed = true; error.remove(); mapRef.current?.destroy(); element.remove(); mapRef.current = null; markersRef.current = []; setMapReady(false); };
  }, [active]);
  useEffect(() => {
    const map = mapRef.current;
    if (!active || !mapReady || !map) return;
    let disposed = false;
    markersRef.current.forEach(marker => map.remove(marker));
    markersRef.current = [];
    Promise.all(places.filter(place => Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)))
      .map(async (place, index) => {
        const [lng, lat] = place.coordinate_system === 'gcj02'
          ? [Number(place.longitude), Number(place.latitude)]
          : await gpsToAmap(window.AMap, place.latitude, place.longitude);
        if (disposed) return null;
        const label = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = place.name;
        label.append(title);
        if (place.date) {
          const date = document.createElement('small');
          date.textContent = place.date;
          label.append(date);
        }
        if (place.photo_url) {
          const image = document.createElement('img');
          image.src = place.photo_url;
          image.alt = place.name;
          image.className = 'place-popup-photo';
          label.append(image);
        }
        const marker = new window.AMap.Marker({ position: [lng, lat], title: place.name });
        marker.on('click', () => {
          new window.AMap.InfoWindow({ content: label, offset: new window.AMap.Pixel(0, -28) }).open(map, [lng, lat]);
        });
        map.add(marker);
        return marker;
      })).then(markers => {
        if (disposed) return;
        markersRef.current = markers.filter(Boolean);
        if (markersRef.current.length === 1) map.setZoomAndCenter(13, markersRef.current[0].getPosition());
        if (markersRef.current.length > 1) map.setFitView(markersRef.current, false, [36, 36, 36, 36]);
      });
    return () => { disposed = true; };
  }, [active, places, mapReady]);
  return null;
}

function App() {
  const [authStage, setAuthStage] = useState('loading');
  const [isDemo, setIsDemo] = useState(false);
  const demoHydratedRef = useRef(false);
  const [session, setSession] = useState(null);
  const [couple, setCouple] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentInvite, setCurrentInvite] = useState('');
  const [partnerLocation, setPartnerLocation] = useState(null);
  const [inviteCode] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [page, setPage] = useState('home');
  const [mapTab, setMapTab] = useState('places');
  const [notes, setNotes] = useState(import.meta.env.DEV ? startNotes : []);
  const [memories, setMemories] = useState(import.meta.env.DEV ? startMemories : []);
  const [customMemoryAlbums, setCustomMemoryAlbums] = useState([]);
  const [todos, setTodos] = useState(import.meta.env.DEV ? startTodos : []);
  const [places, setPlaces] = useState(import.meta.env.DEV ? startPlaces : []);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [editingCalendarEvent, setEditingCalendarEvent] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toLocalDateInput(new Date()));
  const [calendarEventDate, setCalendarEventDate] = useState(() => toLocalDateInput(new Date()));
  const [birthdayCalendar, setBirthdayCalendar] = useState('solar');
  const [lunarBirthdayMonth, setLunarBirthdayMonth] = useState('1');
  const [lunarBirthdayDay, setLunarBirthdayDay] = useState('1');
  const [lunarBirthdayLeap, setLunarBirthdayLeap] = useState(false);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [careSuggestionCopied, setCareSuggestionCopied] = useState(false);
  const [careAiMessage, setCareAiMessage] = useState('');
  const [careAiError, setCareAiError] = useState('');
  const [careAiLoading, setCareAiLoading] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryAlbumFilter, setMemoryAlbumFilter] = useState('全部');
  const [memoryAlbumDraft, setMemoryAlbumDraft] = useState('未分类');
  const [newMemoryAlbum, setNewMemoryAlbum] = useState('');
  const [memoryAlbumError, setMemoryAlbumError] = useState('');
  const [memoryAlbumSaving, setMemoryAlbumSaving] = useState(false);
  const [diaryQuery, setDiaryQuery] = useState('');
  const [cycles, setCycles] = useState(() => JSON.parse(localStorage.getItem('little-world-cycles') || '[]'));
  const [trashEntries, setTrashEntries] = useState([]);
  const [quizEntries, setQuizEntries] = useState([]);
  const [guessEntries, setGuessEntries] = useState([]);
  const [gameResults, setGameResults] = useState([]);
  const [gameMoves, setGameMoves] = useState(0);
  const [gameSaving, setGameSaving] = useState(false);
  const [gameError, setGameError] = useState('');
  const gameResultSavedRef = useRef(false);
  const [deletingEntryId, setDeletingEntryId] = useState(null);
  const lastTrashPurgeRef = useRef(0);
  const [quizChoice, setQuizChoice] = useState('');
  const [quizError, setQuizError] = useState('');
  const [quizSaving, setQuizSaving] = useState(false);
  const [guessClue, setGuessClue] = useState('');
  const [guessAnswer, setGuessAnswer] = useState('');
  const [guessDraft, setGuessDraft] = useState('');
  const [guessError, setGuessError] = useState('');
  const [guessSaving, setGuessSaving] = useState(false);
  const [cycleMonth, setCycleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationRequestState, setLocationRequestState] = useState('idle');
  const locationWatchRef = useRef(null);
  const locationSentAtRef = useRef(0);
  const [locationCoords, setLocationCoords] = useState('');
  const [ownLocationUpdatedAt, setOwnLocationUpdatedAt] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [ownLocation, setOwnLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [sharedSyncError, setSharedSyncError] = useState('');
  const [modal, setModal] = useState('');
  const [playing, setPlaying] = useState(false);
  const [songUrl, setSongUrl] = useState('');
  const [songName, setSongName] = useState('我们的歌');
  const [musicMessage, setMusicMessage] = useState('');
  const [musicSaving, setMusicSaving] = useState(false);
  const audioRef = useRef(null);
  const [newText, setNewText] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [placeLatitude, setPlaceLatitude] = useState('');
  const [placeLongitude, setPlaceLongitude] = useState('');
  const [placeLocationMessage, setPlaceLocationMessage] = useState('');
  const [calendarEventKind, setCalendarEventKind] = useState('date');
  const [dayZero, setDayZero] = useState('2025-05-20');
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const sharedLoadRef = useRef(0);
  const sharedEntriesSignatureRef = useRef('');
  const sharedAlbumsSignatureRef = useRef('');
  const coupleSignatureRef = useRef('');
  const membersSignatureRef = useRef('');
  const sharedSyncInFlightRef = useRef(false);
  const authUserIdRef = useRef(null);

  useEffect(() => {
    if (!hasSupabaseConfig) { setAuthStage('login'); return; }
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authUserIdRef.current = nextSession?.user?.id || null;
      setSession(nextSession);
      if (!nextSession) { setCouple(null); setAuthStage('login'); }
      else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') loadMembership(nextSession.user.id);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !supabase) return;
    let disposed = false;
    let appUrlListener;
    NativeApp.addListener('appUrlOpen', async ({ url }) => {
      let code = '';
      try { code = new URL(url).searchParams.get('code') || ''; } catch { return; }
      if (!code) return;
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) setSharedSyncError(`登录确认失败：${explainError(error)}`);
    }).then(listener => {
      if (disposed) listener.remove();
      else appUrlListener = listener;
    });
    return () => { disposed = true; appUrlListener?.remove(); };
  }, []);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = event => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);
  useEffect(() => {
    if (!isDemo && !couple?.id) return;
    if (isDemo) {
      return;
    }
    loadSharedData(couple.id);
    if (session?.user?.id) refreshPartnerLocation(couple.id, session.user.id);
    const locationTimer = session?.user?.id ? setInterval(() => refreshPartnerLocation(couple.id, session.user.id), 20000) : null;
    const syncSharedState = async () => {
      if (sharedSyncInFlightRef.current) return;
      sharedSyncInFlightRef.current = true;
      try {
        const [entriesResult, albumsResult, coupleResult, membersResult] = await Promise.all([
          supabase.from('shared_entries').select('id,kind,created_at,deleted_at,done,title,body,entry_date,metadata')
            .eq('couple_id', couple.id).order('created_at', { ascending: false }),
          supabase.from('memory_albums').select('name').eq('couple_id', couple.id).order('name'),
          supabase.from('couples').select('*').eq('id', couple.id).maybeSingle(),
          supabase.from('couple_members').select('user_id,nickname,joined_at').eq('couple_id', couple.id).order('joined_at', { ascending: true }),
        ]);
        if (entriesResult.error) setSharedSyncError(`共同内容同步失败：${explainError(entriesResult.error)}`);
        else if (albumsResult.error) setSharedSyncError(explainAlbumSyncError(albumsResult.error));
        else if (coupleResult.error || membersResult.error) setSharedSyncError(`情侣空间设置同步失败：${explainError(coupleResult.error || membersResult.error)}`);
        else setSharedSyncError('');

        const entriesChanged = !entriesResult.error && getSharedEntriesSignature(entriesResult.data) !== sharedEntriesSignatureRef.current;
        const albumsChanged = !albumsResult.error && getAlbumsSignature(albumsResult.data) !== sharedAlbumsSignatureRef.current;
        if (entriesChanged || albumsChanged) await loadSharedData(couple.id);

        if (!coupleResult.error && coupleResult.data && JSON.stringify(coupleResult.data) !== coupleSignatureRef.current) {
          await applyCoupleData(coupleResult.data);
        }
        if (!membersResult.error) {
          const signature = getMembersSignature(membersResult.data);
          if (signature !== membersSignatureRef.current) {
            membersSignatureRef.current = signature;
            setMembers(membersResult.data || []);
          }
        }
      } catch (error) {
        setSharedSyncError(`共同空间同步失败：${explainError(error)}`);
      } finally {
        sharedSyncInFlightRef.current = false;
      }
    };
    syncSharedState();
    const sharedDataTimer = setInterval(syncSharedState, 5000);
    const syncOnForeground = () => { if (document.visibilityState === 'visible') syncSharedState(); };
    window.addEventListener('focus', syncOnForeground);
    document.addEventListener('visibilitychange', syncOnForeground);
    purgeExpiredTrash(couple.id);
    const trashTimer = setInterval(() => purgeExpiredTrash(couple.id), 60 * 60 * 1000);
    const channel = supabase.channel(`couple-${couple.id}-entries`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_entries', filter: `couple_id=eq.${couple.id}` }, () => loadSharedData(couple.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_albums', filter: `couple_id=eq.${couple.id}` }, () => loadSharedData(couple.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations', filter: `couple_id=eq.${couple.id}` }, payload => {
        if (payload.new?.user_id && payload.new.user_id !== session?.user?.id) {
          setPartnerLocation(payload.new);
        }
        if (payload.eventType === 'DELETE' && payload.old?.user_id !== session?.user?.id) { setPartnerLocation(null); setLocationError('TA 的位置共享已停止。'); }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${couple.id}` }, async payload => {
        applyCoupleData(payload.new);
      }).subscribe(status => {
        if (status === 'SUBSCRIBED') { setSharedSyncError(''); loadSharedData(couple.id); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSharedSyncError('实时推送暂不可用，正在每 5 秒自动同步共同空间。');
      });
    return () => {
      clearInterval(trashTimer);
      clearInterval(sharedDataTimer);
      window.removeEventListener('focus', syncOnForeground);
      document.removeEventListener('visibilitychange', syncOnForeground);
      if (locationTimer) clearInterval(locationTimer);
      supabase.removeChannel(channel);
    };
  }, [isDemo, couple?.id, session?.user?.id]);
  useEffect(() => { if (isDemo) localStorage.setItem('little-world-notes', JSON.stringify(notes)); }, [notes, isDemo]);
  useEffect(() => { if (isDemo) localStorage.setItem('little-world-start', dayZero); }, [dayZero, isDemo]);
  useEffect(() => { if (isDemo) localStorage.setItem('little-world-cycles', JSON.stringify(cycles)); }, [cycles, isDemo]);
  useEffect(() => {
    if (!isDemo || !demoHydratedRef.current) return;
    const values = { memories, 'memory-albums': customMemoryAlbums, todos, places, 'calendar-events': calendarEvents, trash: trashEntries, 'quiz-entries': quizEntries, 'guess-entries': guessEntries, 'game-results': gameResults };
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(`little-world-${key}`, JSON.stringify(value)));
  }, [isDemo, memories, customMemoryAlbums, todos, places, calendarEvents, trashEntries, quizEntries, guessEntries, gameResults]);
  useEffect(() => {
    if (!selectedPhoto) { setPhotoPreview(''); return; }
    const url = URL.createObjectURL(selectedPhoto);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedPhoto]);
  useEffect(() => {
    if (modal !== 'memory' && modal !== 'place') { setSelectedPhoto(null); setPhotoError(''); }
    if (modal !== 'place') { setPlaceLatitude(''); setPlaceLongitude(''); setPlaceLocationMessage(''); }
  }, [modal]);
  useEffect(() => {
    const timer = setInterval(() => setPartnerLocation(current => current && Date.now() - new Date(current.updated_at).getTime() > 120000 ? null : current), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { const timer = setInterval(() => setClockNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (isDemo || authStage !== 'app' || !couple?.id || !session?.user?.id || locationWatchRef.current !== null) return;
    requestLocationSharing();
  }, [isDemo, authStage, couple?.id, session?.user?.id]);
  useEffect(() => {
    if (modal !== 'quiz') return;
    const userId = session?.user?.id || 'demo';
    const response = quizEntries.find(entry => entry.question_id === toLocalDateInput(new Date()) && entry.created_by === userId);
    setQuizChoice(response?.answer || '');
    setQuizError('');
  }, [modal, quizEntries, session?.user?.id]);
  useEffect(() => {
    if (modal !== 'guess') return;
    setGuessClue('');
    setGuessAnswer('');
    setGuessDraft('');
    setGuessError('');
  }, [modal]);
  useEffect(() => {
    if (!audioRef.current || !songUrl) return;
    if (playing) audioRef.current.play().catch(() => setPlaying(false));
    else audioRef.current.pause();
  }, [playing, songUrl]);
  useEffect(() => () => { if (songUrl.startsWith('blob:')) URL.revokeObjectURL(songUrl); }, [songUrl]);
  useEffect(() => () => {
    const watcher = locationWatchRef.current;
    if (watcher?.type === 'native') BackgroundGeolocation.removeWatcher({ id: watcher.id });
    else if (watcher?.type === 'capacitor') Geolocation.clearWatch({ id: watcher.id });
    else if (watcher?.type === 'web') navigator.geolocation?.clearWatch(watcher.id);
    else if (watcher !== null) navigator.geolocation?.clearWatch(watcher);
  }, []);

  const daysTogether = Math.max(1, Math.floor((Date.now() - new Date(`${dayZero}T00:00:00`).getTime()) / 86400000) + 1);
  const nextAnniversary = useMemo(() => {
    const start = new Date(`${dayZero}T00:00:00`);
    const next = new Date(); next.setHours(0, 0, 0, 0); next.setMonth(start.getMonth(), start.getDate());
    if (next <= new Date()) next.setFullYear(next.getFullYear() + 1);
    return Math.ceil((next - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
  }, [dayZero]);
  const selectedPage = navItems.find(item => item.id === page) || navItems[0];
  const todayInput = toLocalDateInput(new Date(clockNow));
  const todayWeekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const localHour = new Date(clockNow).getHours();
  const timeGreeting = localHour < 5 ? '夜深啦，今天也想你。' : localHour < 11 ? '早上好，今天也想你。' : localHour < 14 ? '中午好，今天也想你。' : localHour < 18 ? '下午好，今天也想你。' : localHour < 22 ? '晚上好，今天也想你。' : '夜深啦，今天也想你。';
  const latestPeriodStart = [...cycles].filter(record => record.status === 'period' && record.date <= todayInput).sort((a, b) => b.date.localeCompare(a.date))[0];
  const cycleDay = latestPeriodStart
    ? Math.max(1, Math.floor((new Date(`${todayInput}T00:00:00`) - new Date(`${latestPeriodStart.date}T00:00:00`)) / 86400000) + 1)
    : null;
  const careSuggestion = useMemo(() => getCareSuggestion(cycles, todayInput, localHour), [cycles, todayInput, localHour]);
  const cycleMonthTitle = cycleMonth.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
  const cycleDays = useMemo(() => {
    const year = cycleMonth.getFullYear();
    const month = cycleMonth.getMonth();
    const firstOffset = new Date(year, month, 1).getDay();
    const dayCount = new Date(year, month + 1, 0).getDate();
    const todayKey = toLocalDateInput(new Date());
    const periodDates = new Set(cycles.filter(record => record.status === 'period').map(record => record.date));
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - firstOffset + 1;
      if (day < 1 || day > dayCount) return { key: `blank-${index}`, label: '', currentMonth: false };
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { key: date, date, label: day, currentMonth: true, today: date === todayKey, periodStart: periodDates.has(date) };
    });
  }, [cycleMonth, cycles]);
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOffset = new Date(year, month, 1).getDay();
    const dayCount = new Date(year, month + 1, 0).getDate();
    const visibleDayCount = Math.ceil((firstOffset + dayCount) / 7) * 7;
    const today = toLocalDateInput(new Date());
    const monthEvents = calendarEvents.flatMap(event => {
      return getAnnualCalendarDates(event, year).filter(date => date?.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`);
    });
    const eventDates = new Set(monthEvents);
    return Array.from({ length: visibleDayCount }, (_, index) => {
      const day = index - firstOffset + 1;
      if (day < 1 || day > dayCount) return { key: `blank-${index}`, label: '', currentMonth: false };
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { key: date, date, label: day, currentMonth: true, today: date === today, hasEvent: eventDates.has(date) };
    });
  }, [calendarMonth, calendarEvents, todayInput]);
  const selectedYear = Number(selectedCalendarDate.slice(0, 4));
  const filteredCalendarEvents = calendarEvents.flatMap(event => {
    return getAnnualCalendarDates(event, selectedYear).includes(selectedCalendarDate) ? [{ ...event, occurrenceDate: selectedCalendarDate }] : [];
  }).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  const countdownEvents = calendarEvents.map(event => getCountdownOccurrence(event, todayInput)).filter(Boolean).sort((a, b) => {
    const aUpcoming = a.days >= 0;
    const bUpcoming = b.days >= 0;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? a.days - b.days : b.days - a.days;
  });
  const featuredCountdown = countdownEvents[0] || null;
  const remainingCountdowns = featuredCountdown ? countdownEvents.filter(event => event.id !== featuredCountdown.id) : [];
  const memoryAlbums = [...new Set([...customMemoryAlbums, ...memories.map(memory => memory.album || '未分类')])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const filteredMemories = memories.filter(memory => (memoryAlbumFilter === '全部' || (memory.album || '未分类') === memoryAlbumFilter)
    && `${memory.title} ${memory.text || ''} ${memory.album || '未分类'}`.toLowerCase().includes(memoryQuery.trim().toLowerCase()));
  const filteredNotes = notes.filter(note => `${note.title} ${note.body || ''} ${note.mood || ''}`.toLowerCase().includes(diaryQuery.trim().toLowerCase()));
  const todayGuessEntries = guessEntries.filter(entry => entry.question_id === todayInput);
  const guessChallenge = todayGuessEntries.find(entry => entry.stage === 'challenge');
  const guessResponse = guessChallenge && todayGuessEntries.find(entry => entry.stage === 'guess' && entry.challenge_id === guessChallenge.challenge_id);
  const currentUserId = session?.user?.id || 'demo';
  const viewerQuizAnswer = quizEntries.find(entry => entry.question_id === todayInput && entry.created_by === currentUserId);
  const isGuessAuthor = guessChallenge?.created_by === currentUserId;
  const normalizeGuess = value => (value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const isCorrectGuess = Boolean(guessResponse && normalizeGuess(guessResponse.guess) === normalizeGuess(guessChallenge?.answer));
  const currentMember = isDemo ? members[0] : members.find(member => member.user_id === session?.user?.id);
  const partnerMember = isDemo ? members[1] : members.find(member => member.user_id && member.user_id !== session?.user?.id);
  const accountName = member => member?.nickname?.trim() || (member?.user_id === session?.user?.id ? session?.user?.email?.split('@')[0] : '') || (member?.user_id ? `账号 ${member.user_id.slice(0, 6)}` : '未设置昵称');
  const currentAccountName = isDemo ? '你' : accountName(currentMember);
  const partnerAccountName = isDemo ? '她' : accountName(partnerMember);
  const currentAccountInitial = Array.from(currentAccountName)[0] || '你';
  const partnerAccountInitial = Array.from(partnerAccountName)[0] || '伴';

  const explainError = error => error?.message || '操作没有成功，请稍后重试。';
  const selectPhoto = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    if (!allowedTypes.includes(file.type)) { setPhotoError('请选择 JPG、PNG、WebP、GIF 或 AVIF 格式的照片。'); return; }
    setPhotoError('');
    setPhotoSaving(true);
    try {
      setSelectedPhoto(await compressPhoto(file));
    } catch (error) {
      setPhotoError(error.message || '无法处理这张照片，请重试。');
    } finally {
      setPhotoSaving(false);
    }
  };
  const chooseCurrentPlace = async () => {
    if (!navigator.geolocation) { setPlaceLocationMessage('当前浏览器无法提供定位服务。'); return; }
    setPlaceLocationMessage('正在获取当前位置…');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const AMap = await loadAmap();
        const [longitude, latitude] = await gpsToAmap(AMap, coords.latitude, coords.longitude);
        setPlaceLatitude(latitude.toFixed(6));
        setPlaceLongitude(longitude.toFixed(6));
        setPlaceLocationMessage('已选中你现在的位置。');
      } catch (error) {
        setPlaceLocationMessage(error.message);
      }
    }, () => setPlaceLocationMessage('无法获取定位，请允许浏览器访问位置，或直接点击地图选点。'), { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 });
  };
  const removePhoto = () => { setSelectedPhoto(null); setPhotoError(''); };
  const copyCareSuggestion = async () => {
    try {
      await navigator.clipboard.writeText(careAiMessage || careSuggestion.message);
      setCareSuggestionCopied(true);
      setTimeout(() => setCareSuggestionCopied(false), 2200);
    } catch {
      setLocationError('复制失败，请检查浏览器的剪贴板权限。');
    }
  };
  async function loadMembership(userId) {
    const { data, error } = await supabase.from('couple_members').select('couple_id,nickname').eq('user_id', userId).maybeSingle();
    if (authUserIdRef.current !== userId) return;
    if (error) { setAuthStage('login'); return; }
    if (!data) { setCouple(null); setAuthStage('pair'); return; }
    const [{ data: coupleData }, { data: memberData }] = await Promise.all([
      supabase.from('couples').select('*').eq('id', data.couple_id).single(),
      supabase.from('couple_members').select('user_id,nickname,joined_at').eq('couple_id', data.couple_id).order('joined_at', { ascending: true }),
    ]);
    if (authUserIdRef.current !== userId) return;
    if (!coupleData) { setAuthStage('pair'); return; }
    coupleSignatureRef.current = JSON.stringify(coupleData);
    membersSignatureRef.current = getMembersSignature(memberData);
    setCouple(coupleData); setMembers(memberData || []);
    if (coupleData?.relationship_date) setDayZero(coupleData.relationship_date);
    setSongName(coupleData?.music_title || '我们的歌');
    setAuthStage('app');
    supabase.from('couple_invites').select('code').eq('couple_id', data.couple_id).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data: inviteData }) => setCurrentInvite(inviteData?.code || ''));
    if (coupleData?.music_path) {
      supabase.storage.from('couple-music').createSignedUrl(coupleData.music_path, 86400).then(({ data: signed }) => {
        if (signed?.signedUrl) {
          setSongUrl(signed.signedUrl);
          setPlaying(true);
        }
      });
    } else {
      setSongUrl('');
      setPlaying(false);
    }
  }
  async function applyCoupleData(nextCouple) {
    if (!nextCouple) return;
    const musicChanged = couple?.music_path !== nextCouple.music_path;
    const signature = JSON.stringify(nextCouple);
    coupleSignatureRef.current = signature;
    setCouple(nextCouple);
    if (nextCouple.relationship_date) setDayZero(nextCouple.relationship_date);
    setSongName(nextCouple.music_title || '我们的歌');
    if (nextCouple.music_path) {
      const { data: signed } = await supabase.storage.from('couple-music').createSignedUrl(nextCouple.music_path, 86400);
      if (coupleSignatureRef.current === signature) {
        setSongUrl(signed?.signedUrl || '');
        if (musicChanged && signed?.signedUrl) setPlaying(true);
      }
    } else {
      setSongUrl('');
      setPlaying(false);
    }
  }
  async function loadSharedData(coupleId) {
    const loadId = ++sharedLoadRef.current;
    const [{ data, error }, { data: albumRows, error: albumsError }, { data: locations, error: locationsError }] = await Promise.all([
      supabase.from('shared_entries').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
      supabase.from('memory_albums').select('name').eq('couple_id', coupleId).order('name'),
      supabase.from('member_locations').select('*').eq('couple_id', coupleId).neq('user_id', session?.user?.id || ''),
    ]);
    if (loadId !== sharedLoadRef.current) return;
    if (error || !data) { setSharedSyncError(`共同内容读取失败：${explainError(error)}`); return; }
    if (albumsError) setSharedSyncError(explainAlbumSyncError(albumsError));
    else setSharedSyncError('');
    if (locationsError) setLocationError(`读取 TA 的位置失败：${explainError(locationsError)}`);
    sharedEntriesSignatureRef.current = getSharedEntriesSignature(data);
    if (!albumsError) sharedAlbumsSignatureRef.current = getAlbumsSignature(albumRows);
    setCustomMemoryAlbums((albumRows || []).map(album => album.name));
    const mapEntry = (row, photoUrls = {}) => ({ id: row.id, type: row.kind, deleted_at: row.deleted_at, date: row.entry_date?.replaceAll('-', '.'), title: row.title, body: row.body, mood: row.kind === 'whisper' ? '悄悄话' : '日常', text: row.body, kind: row.metadata?.kind || '日常', album: row.metadata?.album || '未分类', name: row.title, note: row.body, done: row.done, ...row.metadata, photo_url: photoUrls[row.metadata?.photo_path] || '' });
    const active = data.filter(row => !row.deleted_at);
    setTrashEntries(data.filter(row => row.deleted_at).map(mapEntry));
    setNotes(active.filter(x => ['note','whisper'].includes(x.kind)).map(mapEntry));
    setMemories(active.filter(x => x.kind === 'memory').map(mapEntry));
    setTodos(active.filter(x => x.kind === 'todo').map(row => ({ ...mapEntry(row), text: row.title || row.body || '' })));
    setPlaces(active.filter(x => x.kind === 'place').map(mapEntry));
    setCycles(active.filter(x => x.kind === 'cycle').map(row => ({ ...mapEntry(row), date: row.entry_date, status: row.metadata?.status })));
    setQuizEntries(active.filter(row => row.kind === 'event' && row.metadata?.game === 'quiz').map(row => ({ ...mapEntry(row), created_by: row.created_by, date: row.entry_date, question_id: row.metadata.question_id, answer: row.body })));
    setGuessEntries(active.filter(row => row.kind === 'event' && row.metadata?.game === 'guessing-game').map(row => ({ ...mapEntry(row), created_by: row.created_by, date: row.entry_date, question_id: row.metadata.question_id, stage: row.metadata.stage, challenge_id: row.metadata.challenge_id, clue: row.metadata.clue, answer: row.metadata.stage === 'challenge' ? row.body : '', guess: row.metadata.stage === 'guess' ? row.body : '' })));
    setGameResults(active.filter(row => row.kind === 'event' && row.metadata?.game === 'memory-match').map(row => ({ ...mapEntry(row), created_by: row.created_by, moves: row.metadata.moves, completed_at: row.created_at })));
    setCalendarEvents(active.filter(row => row.kind === 'anniversary').map(row => ({ ...mapEntry(row), date: row.entry_date, eventKind: row.metadata?.event_kind || 'date', repeatYearly: row.metadata?.repeat_yearly ?? row.metadata?.event_kind === 'anniversary', calendarSystem: row.metadata?.calendar_system || 'solar', lunarMonth: row.metadata?.lunar_month, lunarDay: row.metadata?.lunar_day, lunarLeap: !!row.metadata?.lunar_leap })));
    const recentLocation = locations?.filter(location => Date.now() - new Date(location.updated_at).getTime() <= 120000)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0] || null;
    setPartnerLocation(recentLocation);

    const photoPaths = [...new Set(data.map(row => row.metadata?.photo_path).filter(Boolean))];
    if (photoPaths.length) {
      const photoResults = await Promise.all(Array.from({ length: Math.ceil(photoPaths.length / 50) }, (_, index) =>
        supabase.storage.from('couple-photos').createSignedUrls(photoPaths.slice(index * 50, (index + 1) * 50), 60 * 60 * 24 * 7)));
      if (loadId !== sharedLoadRef.current) return;
      const photoUrls = Object.fromEntries(photoResults.flatMap(({ data: signedPhotos }) =>
        (signedPhotos || []).filter(photo => photo.signedUrl).map(photo => [photo.path, photo.signedUrl])));
      setMemories(active.filter(row => row.kind === 'memory').map(row => mapEntry(row, photoUrls)));
      setPlaces(active.filter(row => row.kind === 'place').map(row => mapEntry(row, photoUrls)));
      setTrashEntries(data.filter(row => row.deleted_at).map(row => mapEntry(row, photoUrls)));
    }
  }
  const refreshPartnerLocation = async (coupleId, userId) => {
    const { data, error } = await supabase.from('member_locations').select('*')
      .eq('couple_id', coupleId).neq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) { setLocationError(`读取 TA 的位置失败：${explainError(error)}`); return; }
    const recentLocation = data && Date.now() - new Date(data.updated_at).getTime() <= 120000 ? data : null;
    setPartnerLocation(recentLocation);
  };
  async function saveEntry(kind, title, body, metadata = {}, done = false, entryDate) {
    if (isDemo) return { data: { id: Date.now(), title, body, metadata, done, kind, entry_date: entryDate } };
    if (!couple?.id || !session?.user?.id) return { error: { message: '请先登录并加入情侣空间。' } };
    return supabase.from('shared_entries').insert({ couple_id: couple.id, created_by: session.user.id, kind, title, body, metadata, done, ...(entryDate ? { entry_date: entryDate } : {}) }).select().single();
  }
  const uploadSharedPhoto = async (file, folder = 'places') => {
    if (!file) return {};
    if (isDemo) {
      try { return { photo_url: await fileAsDataUrl(file) }; }
      catch (error) { return { error }; }
    }
    if (!couple?.id || !session?.user?.id) return { error: '请先登录并加入情侣空间。' };
    const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const safeFolder = folder.split('/').map(part => part.normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'folder').join('/') || 'media';
    const path = `${couple.id}/${session.user.id}/${safeFolder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('couple-photos').upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (error) return { error };
    const { data: signed, error: signedError } = await supabase.storage.from('couple-photos').createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signedError || !signed?.signedUrl) {
      await supabase.storage.from('couple-photos').remove([path]);
      return { error: signedError || new Error('照片上传成功，但预览链接暂时无法生成。') };
    }
    return { photo_path: path, photo_url: signed.signedUrl };
  };
  const completeLogin = async ({ email, password, mode, nickname }) => {
    if (!hasSupabaseConfig) return { error: import.meta.env.DEV ? '云端服务尚未配置，请先进入演示空间。' : '云端服务尚未配置，请联系网站管理员。' };
    try {
      const result = mode === 'register'
        ? await supabase.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: Capacitor.isNativePlatform() ? 'com.littleworld.couple://auth-callback' : window.location.origin } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) return { error: result.error.message };
      if (mode === 'register' && !result.data.session) return { error: '账号已创建，请先到邮箱完成验证，再回来登录。' };
      return {};
    } catch (error) {
      return { error: error?.message || '连接认证服务失败，请检查网络后重试。' };
    }
  };
  const enterDemo = () => {
    demoHydratedRef.current = true;
    setNotes(readDemoValue('notes', startNotes));
    setDayZero(localStorage.getItem('little-world-start') || '2025-05-20');
    setMemories(readDemoValue('memories', startMemories));
    setCustomMemoryAlbums(readDemoValue('memory-albums', []));
    setTodos(readDemoValue('todos', startTodos));
    setPlaces(readDemoValue('places', startPlaces));
    setCalendarEvents(readDemoValue('calendar-events', []));
    setTrashEntries(readDemoValue('trash', []));
    setQuizEntries(readDemoValue('quiz-entries', []));
    setGuessEntries(readDemoValue('guess-entries', []));
    setGameResults(readDemoValue('game-results', []));
    setCycles(readDemoValue('cycles', []));
    setIsDemo(true); setSession(null); setCouple(null); setMembers([{ nickname: '你' }, { nickname: '她' }]); setAuthStage('app');
  };
  const createCouple = async () => {
    if (isDemo) { setCouple({ id: 'demo', relationship_date: dayZero }); setAuthStage('app'); return { code: inviteCode }; }
    const { data, error } = await supabase.rpc('create_couple_space', { p_relationship_date: dayZero });
    if (error) return { error: explainError(error) };
    const row = Array.isArray(data) ? data[0] : data;
    setCurrentInvite(row.invite_code);
    const { data: coupleData } = await supabase.from('couples').select('*').eq('id', row.couple_id).single();
    const { data: memberData } = await supabase.from('couple_members').select('user_id,nickname,joined_at').eq('couple_id', row.couple_id).order('joined_at', { ascending: true });
    setCouple(coupleData); setMembers(memberData || []);
    return { code: row.invite_code };
  };
  const joinCouple = async code => {
    if (isDemo) { setAuthStage('app'); return {}; }
    const { data, error } = await supabase.rpc('join_couple_space', { p_code: code });
    if (error) return { error: explainError(error) };
    await loadMembership(session.user.id); return { data };
  };
  const toggleTodo = async todo => {
    const done = !todo.done;
    if (isDemo) { setTodos(todos.map(item => item.id === todo.id ? { ...item, done } : item)); return; }
    const { error } = await supabase.from('shared_entries').update({ done }).eq('id', todo.id).eq('couple_id', couple.id);
    if (error) { setLocationError(explainError(error)); return; }
    setTodos(todos.map(item => item.id === todo.id ? { ...item, done } : item));
  };
  const purgeExpiredTrash = async coupleId => {
    if (isDemo || !coupleId || Date.now() - lastTrashPurgeRef.current < 60 * 60 * 1000) return;
    lastTrashPurgeRef.current = Date.now();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expired, error } = await supabase.from('shared_entries').select('id,metadata').eq('couple_id', coupleId).not('deleted_at', 'is', null).lte('deleted_at', cutoff);
    if (error || !expired?.length) return;
    const photoPaths = expired.map(row => row.metadata?.photo_path).filter(Boolean);
    if (photoPaths.length) {
      const { error: photoError } = await supabase.storage.from('couple-photos').remove(photoPaths);
      if (photoError) { setLocationError(`回收站清理暂停：照片文件删除失败。${explainError(photoError)}`); return; }
    }
    const { error: deleteError } = await supabase.from('shared_entries').delete().eq('couple_id', coupleId).in('id', expired.map(row => row.id));
    if (deleteError) setLocationError(`回收站自动清理失败：${explainError(deleteError)}`);
  };
  const deleteEntry = async (entry, label, type = entry.type || (notes.includes(entry) ? (entry.mood === '悄悄话' ? 'whisper' : 'note') : memories.includes(entry) ? 'memory' : todos.includes(entry) ? 'todo' : places.includes(entry) ? 'place' : cycles.includes(entry) ? 'cycle' : calendarEvents.includes(entry) ? 'anniversary' : quizEntries.includes(entry) ? 'event' : 'note')) => {
    if (!window.confirm(`把「${label}」移到回收站吗？7 天内可以恢复。`)) return;
    setDeletingEntryId(entry.id);
    if (!isDemo) {
      const { error } = await supabase.from('shared_entries').update({ deleted_at: new Date().toISOString() }).eq('id', entry.id).eq('couple_id', couple.id);
      if (error) { setDeletingEntryId(null); window.alert(`删除失败：${explainError(error)}`); return; }
    }
    const moved = { ...entry, type, deleted_at: new Date().toISOString() };
    setTrashEntries(items => [moved, ...items]);
    if (['note', 'whisper'].includes(type)) setNotes(items => items.filter(item => item.id !== entry.id));
    if (type === 'memory') setMemories(items => items.filter(item => item.id !== entry.id));
    if (type === 'todo') setTodos(items => items.filter(item => item.id !== entry.id));
    if (type === 'place') setPlaces(items => items.filter(item => item.id !== entry.id));
    if (type === 'cycle') setCycles(items => items.filter(item => item.id !== entry.id));
    if (type === 'anniversary') setCalendarEvents(items => items.filter(item => item.id !== entry.id));
    if (type === 'event') {
      setQuizEntries(items => items.filter(item => item.id !== entry.id));
      setGuessEntries(items => items.filter(item => item.id !== entry.id));
      setGameResults(items => items.filter(item => item.id !== entry.id));
    }
    setDeletingEntryId(null);
  };
  const restoreEntry = async entry => {
    if (!isDemo) {
      const { error } = await supabase.from('shared_entries').update({ deleted_at: null }).eq('id', entry.id).eq('couple_id', couple.id);
      if (error) { window.alert(`恢复失败：${explainError(error)}`); return; }
      setTrashEntries(items => items.filter(item => item.id !== entry.id));
      await loadSharedData(couple.id);
      return;
    }
    if (['note', 'whisper'].includes(entry.type)) setNotes(items => [entry, ...items]);
    if (entry.type === 'memory') setMemories(items => [entry, ...items]);
    if (entry.type === 'todo') setTodos(items => [entry, ...items]);
    if (entry.type === 'place') setPlaces(items => [entry, ...items]);
    if (entry.type === 'cycle') setCycles(items => [entry, ...items]);
    if (entry.type === 'anniversary') setCalendarEvents(items => [entry, ...items]);
    if (entry.type === 'event') {
      if (entry.game === 'memory-match') setGameResults(items => [entry, ...items]);
      else if (entry.game === 'guessing-game') setGuessEntries(items => [entry, ...items]);
      else setQuizEntries(items => [entry, ...items]);
    }
    setTrashEntries(items => items.filter(item => item.id !== entry.id));
  };
  const permanentlyDeleteEntry = async entry => {
    if (!window.confirm(`彻底删除「${entry.title || entry.name}」和相关照片？此操作无法恢复。`)) return;
    setDeletingEntryId(entry.id);
    if (!isDemo) {
      if (entry.photo_path) {
        const { error: photoError } = await supabase.storage.from('couple-photos').remove([entry.photo_path]);
        if (photoError) { setDeletingEntryId(null); window.alert(`照片删除失败：${explainError(photoError)}`); return; }
      }
      const { error } = await supabase.from('shared_entries').delete().eq('id', entry.id).eq('couple_id', couple.id);
      if (error) { setDeletingEntryId(null); window.alert(`彻底删除失败：${explainError(error)}`); return; }
    }
    setTrashEntries(items => items.filter(item => item.id !== entry.id));
    setDeletingEntryId(null);
  };
  const logout = async () => {
    if (locationWatchRef.current !== null) {
      const watcher = locationWatchRef.current;
      locationWatchRef.current = null;
      if (watcher?.type === 'native') await BackgroundGeolocation.removeWatcher({ id: watcher.id });
      else if (watcher?.type === 'capacitor') await Geolocation.clearWatch({ id: watcher.id });
      else if (watcher?.type === 'web') navigator.geolocation?.clearWatch(watcher.id);
      else navigator.geolocation?.clearWatch(watcher);
      setLocationSharing(false); setLocationRequestState('idle'); setOwnLocation(null); setOwnLocationUpdatedAt(null);
      if (!isDemo && couple?.id && session?.user?.id) await supabase.from('member_locations').delete().eq('couple_id', couple.id).eq('user_id', session.user.id);
    }
    if (isDemo) { demoHydratedRef.current = false; setIsDemo(false); setCouple(null); setAuthStage('login'); return; }
    await supabase?.auth.signOut();
  };
  const selectMusic = async file => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) { setMusicMessage('请选择音频文件。'); return; }
    if (file.size > 20 * 1024 * 1024) { setMusicMessage('音频文件不能超过 20 MB。'); return; }
    const title = file.name.replace(/\.[^.]+$/, '');
    if (isDemo) { setSongUrl(URL.createObjectURL(file)); setSongName(title); setPlaying(true); setModal(''); return; }
    if (!couple?.id || !session?.user?.id) { setMusicMessage('请先登录并加入情侣空间。'); return; }
    setMusicSaving(true); setMusicMessage('正在上传到你们的空间…');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const path = `${couple.id}/${session.user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('couple-music').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { setMusicSaving(false); setMusicMessage(explainError(uploadError)); return; }
    const { error: updateError } = await supabase.from('couples').update({ music_path: path, music_title: title }).eq('id', couple.id);
    if (updateError) {
      await supabase.storage.from('couple-music').remove([path]);
      setMusicSaving(false); setMusicMessage(explainError(updateError)); return;
    }
    if (couple.music_path) await supabase.storage.from('couple-music').remove([couple.music_path]);
    const { data: signed } = await supabase.storage.from('couple-music').createSignedUrl(path, 86400);
    if (signed?.signedUrl) setSongUrl(signed.signedUrl);
    setSongName(title); setCouple({ ...couple, music_path: path, music_title: title });
    setMusicSaving(false); setMusicMessage('已放进你们的小宇宙，点右上角播放。');
  };
  const removeMusic = async () => {
    if (!songUrl || !window.confirm('移除现在播放的歌曲吗？歌曲不会进入回收站。')) return;
    if (!isDemo && couple?.id) {
      const oldPath = couple.music_path;
      const { error } = await supabase.from('couples').update({ music_path: null, music_title: null }).eq('id', couple.id);
      if (error) { window.alert(`移除歌曲失败：${explainError(error)}`); return; }
      if (oldPath) {
        const { error: fileError } = await supabase.storage.from('couple-music').remove([oldPath]);
        if (fileError) window.alert(`歌曲已从空间移除，但文件清理失败：${explainError(fileError)}`);
      }
      setCouple(current => ({ ...current, music_path: null, music_title: null }));
    } else if (songUrl.startsWith('blob:')) URL.revokeObjectURL(songUrl);
    audioRef.current?.pause();
    setPlaying(false); setSongUrl(''); setSongName('我们的歌'); setMusicMessage('');
  };
  const requestLocationSharing = async () => {
    if (locationWatchRef.current !== null) return;
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setLocationRequestState('error'); setLocationError('定位需要通过 HTTPS 打开网站。'); return;
    }
    if (!isDemo && (!couple?.id || !session?.user?.id)) { setLocationRequestState('error'); setLocationError('请先登录并加入情侣空间，才能共享位置。'); return; }
    setLocationRequestState('requesting');
    setLocationError('正在请求此设备的定位权限…');
    let firstFixReceived = false;
    let locationTimeout;
    const syncPosition = position => {
      if (!position) return;
      firstFixReceived = true;
      clearTimeout(locationTimeout);
      const coords = { latitude: position.latitude, longitude: position.longitude };
      const timestamp = position.time || Date.now();
      setOwnLocation(coords);
      setOwnLocationUpdatedAt(new Date(timestamp).toISOString());
      setLocationCoords(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
      setLocationError(isDemo ? '演示空间不会上传或共享真实位置。' : `你的位置已同步 · ${formatUpdatedAt(timestamp)}`);
      setLocationSharing(true);
      setLocationRequestState('active');
      if (!isDemo && Date.now() - locationSentAtRef.current >= 10000) {
        locationSentAtRef.current = Date.now();
        supabase.from('member_locations').upsert({ couple_id: couple.id, user_id: session.user.id, latitude: coords.latitude, longitude: coords.longitude, accuracy_m: position.accuracy, updated_at: new Date(timestamp).toISOString() }, { onConflict: 'couple_id,user_id' }).then(({ error }) => {
          if (error) setLocationError(`同步我的位置失败：${explainError(error)}`);
        });
      }
    };
    if (Capacitor.isNativePlatform() && !isDemo) {
      let watcherId;
      let watcherFailed = false;
      const startNativeFallback = message => {
        setLocationError(message);
        Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 30000, timeout: 60000, enableLocationFallback: true }, (position, error) => {
          if (error) {
            clearTimeout(locationTimeout);
            const watcher = locationWatchRef.current;
            if (watcher?.type === 'capacitor') {
              locationWatchRef.current = null;
              Geolocation.clearWatch({ id: watcher.id }).catch(() => {});
            }
            setLocationSharing(false);
            setLocationRequestState('error');
            setLocationError(error.message || '手机定位服务没有返回坐标，请检查系统定位服务后重试。');
            return;
          }
          if (position) syncPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, time: position.timestamp });
        }).then(id => {
          locationWatchRef.current = { type: 'capacitor', id };
        }).catch(error => {
          clearTimeout(locationTimeout);
          setLocationSharing(false);
          setLocationRequestState('error');
          setLocationError(error?.message || 'App 系统定位不可用，请检查定位权限后重试。');
        });
      };
      locationTimeout = window.setTimeout(() => {
        if (firstFixReceived) return;
        watcherFailed = true;
        const watcher = locationWatchRef.current;
        if (watcher?.type === 'native') {
          locationWatchRef.current = null;
          BackgroundGeolocation.removeWatcher({ id: watcher.id }).catch(() => {});
        }
        startNativeFallback('原生后台定位没有返回坐标，正在切换 Android 系统定位…');
      }, 20000);
      try {
        watcherId = await BackgroundGeolocation.addWatcher({
          backgroundTitle: '我们的小宇宙正在共享位置',
          backgroundMessage: '位置仅同步给已关联的另一位成员。退出登录即可停止。',
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
        }, (position, error) => {
          if (error) {
            clearTimeout(locationTimeout);
            watcherFailed = true;
            if (locationWatchRef.current?.id === watcherId) locationWatchRef.current = null;
            if (watcherId) BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
            if (error.code === 'NOT_AUTHORIZED') {
              setLocationSharing(false);
              setLocationRequestState('error');
              setLocationError('系统未授予此应用定位权限。打开应用权限设置，允许定位后返回重试。');
            } else startNativeFallback(`${error.message || '原生后台定位服务暂不可用。'} 正在切换 Android 系统定位…`);
            return;
          }
          syncPosition(position);
        });
        if (watcherFailed) {
          clearTimeout(locationTimeout);
          await BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
        }
        else locationWatchRef.current = { type: 'native', id: watcherId };
      } catch (error) {
        clearTimeout(locationTimeout);
        if (error?.code === 'NOT_AUTHORIZED') {
          locationWatchRef.current = null;
          setLocationRequestState('error');
          setLocationError('系统未授予此应用定位权限。打开应用权限设置，允许定位后返回重试。');
        } else startNativeFallback(`${error?.message || '原生后台定位服务暂不可用。'} 正在切换 Android 系统定位…`);
      }
      return;
    }
    if (!navigator.geolocation) { setLocationRequestState('error'); setLocationError('当前浏览器无法提供定位服务。'); return; }
    locationTimeout = window.setTimeout(() => {
      if (firstFixReceived) return;
      const watcher = locationWatchRef.current;
      if (typeof watcher === 'number') navigator.geolocation.clearWatch(watcher);
      locationWatchRef.current = null;
      setLocationSharing(false);
      setLocationRequestState('error');
      setLocationError('20 秒内没有收到设备定位。请确认浏览器定位权限和手机系统定位已开启后重试。');
    }, 20000);
    let id;
    id = navigator.geolocation.watchPosition(position => {
      syncPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, time: position.timestamp });
    }, error => {
      clearTimeout(locationTimeout);
    if (id !== undefined) navigator.geolocation.clearWatch(id);
      locationWatchRef.current = null;
      setLocationSharing(false);
      setLocationRequestState('error');
      setLocationError(error.code === 1 ? '定位权限未开启，请在浏览器设置中允许访问后重试。' : error.code === 2 ? '暂时无法确定设备位置，请检查系统定位服务后重试。' : '获取位置超时，请检查网络或系统定位服务后重试。');
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 });
    locationWatchRef.current = id;
  };

  const go = id => { setPage(id); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const startMemory = () => {
    setNewTitle(''); setNewText('');
    setMemoryAlbumDraft(memoryAlbumFilter === '全部' ? '未分类' : memoryAlbumFilter);
    setModal('memory');
  };
  const addMemoryAlbum = async event => {
    event.preventDefault();
    const name = newMemoryAlbum.trim().slice(0, 48);
    if (!name) { setMemoryAlbumError('请填写分类名称。'); return; }
    if (memoryAlbums.some(album => album.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
      setMemoryAlbumError('这个分类已经存在。');
      return;
    }
    setMemoryAlbumSaving(true);
    setMemoryAlbumError('');
    let error;
    if (isDemo) {
      setCustomMemoryAlbums(current => [...current, name]);
    } else {
      const result = await supabase.from('memory_albums').insert({ couple_id: couple.id, created_by: session.user.id, name }).select('name').single();
      error = result.error;
    }
    setMemoryAlbumSaving(false);
    if (error) { setMemoryAlbumError(explainError(error)); return; }
    setCustomMemoryAlbums(current => current.includes(name) ? current : [...current, name]);
    setMemoryAlbumFilter(name);
    setNewMemoryAlbum('');
    setModal('');
  };
  const generateCareAiMessage = async () => {
    if (!hasSupabaseConfig || isDemo || !couple?.id) {
      setCareAiError('AI 建议需要登录并连接情侣空间。');
      return;
    }
    setCareAiLoading(true); setCareAiError(''); setCareAiMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('care-ai', { body: { coupleId: couple.id, today: todayInput, hour: localHour } });
      if (error || !data?.message) {
        let detail = data?.error || error?.message || 'AI 服务暂时不可用，请检查服务端配置。';
        if (error?.context instanceof Response) {
          try { detail = (await error.context.clone().json()).error || detail; } catch {}
        }
        setCareAiError(detail);
        return;
      }
      setCareAiMessage(data.message);
    } catch {
      setCareAiError('AI 服务暂时不可用，请检查网络和服务端配置。');
    } finally {
      setCareAiLoading(false);
    }
  };
  const addNote = async kind => {
    if (!newText.trim()) return;
    const title = newTitle.trim() || (kind === 'whisper' ? '一条悄悄话' : '今天的小事');
    const result = await saveEntry(kind === 'whisper' ? 'whisper' : 'note', title, newText.trim());
    if (result.error) { setLocationError(explainError(result.error)); return; }
    if (isDemo) setNotes([{ id: Date.now(), date: `刚刚 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, title, body: newText.trim(), mood: kind === 'whisper' ? '悄悄话' : '日常' }, ...notes]);
    setNewText(''); setNewTitle(''); setModal('');
  };
  const addMemory = async () => {
    if (!newText.trim() && !newTitle.trim() && !selectedPhoto) return;
    const title = newTitle.trim() || '新的一页回忆'; const date = new Date().toLocaleDateString('zh-CN').replaceAll('/', '.');
    const album = memoryAlbumDraft.trim().slice(0, 48) || '未分类';
    setPhotoSaving(true); setPhotoError('');
    const photo = await uploadSharedPhoto(selectedPhoto, `memories/${album}`);
    if (photo.error) { setPhotoSaving(false); setPhotoError(explainError(photo.error)); return; }
    const result = await saveEntry('memory', title, newText.trim(), { kind: '日常', album, ...(photo.photo_path ? { photo_path: photo.photo_path } : {}) });
    if (result.error) {
      if (photo.photo_path) await supabase.storage.from('couple-photos').remove([photo.photo_path]);
      setPhotoSaving(false); setPhotoError(explainError(result.error)); return;
    }
    setMemories(current => [{ id: result.data?.id || Date.now(), date, title, text: newText.trim(), kind: '日常', album, photo_path: photo.photo_path, photo_url: photo.photo_url || '' }, ...current]);
    setMemoryAlbumFilter(album);
    setPhotoSaving(false); setSelectedPhoto(null); setPhotoError('');
    setNewText(''); setNewTitle(''); setMemoryAlbumDraft('未分类'); setModal('');
  };
  const addTodo = async () => {
    if (!newText.trim()) return;
    const text = newText.trim();
    const result = await saveEntry('todo', text, '');
    if (result.error) { setLocationError(explainError(result.error)); return; }
    const todo = { id: result.data?.id || Date.now(), text: result.data?.title || text, done: result.data?.done || false };
    setTodos(current => current.some(item => item.id === todo.id) ? current : [...current, todo]);
    setNewText(''); setModal('');
  };
  const addPlace = async () => {
    if (!newTitle.trim()) return;
    const title = newTitle.trim(); const note = newText.trim() || '一个想和你一起记住的地方。';
    const hasCoordinates = placeLatitude !== '' && placeLongitude !== '';
    const metadata = hasCoordinates ? { latitude: Number(placeLatitude), longitude: Number(placeLongitude), coordinate_system: 'gcj02' } : {};
    if (hasCoordinates && (!Number.isFinite(metadata.latitude) || Math.abs(metadata.latitude) > 90 || !Number.isFinite(metadata.longitude) || Math.abs(metadata.longitude) > 180)) { setLocationError('请检查经纬度范围。'); return; }
    setPhotoSaving(true); setPhotoError('');
    const photo = await uploadSharedPhoto(selectedPhoto, 'places');
    if (photo.error) { setPhotoSaving(false); setPhotoError(explainError(photo.error)); return; }
    const result = await saveEntry('place', title, note, { ...metadata, ...(photo.photo_path ? { photo_path: photo.photo_path } : {}) });
    if (result.error) {
      if (photo.photo_path) await supabase.storage.from('couple-photos').remove([photo.photo_path]);
      setPhotoSaving(false); setPhotoError(explainError(result.error)); return;
    }
    setPlaces(current => [{ id: result.data?.id || Date.now(), name: title, date: new Date().toLocaleDateString('zh-CN').replaceAll('/', '.'), note, ...metadata, photo_path: photo.photo_path, photo_url: photo.photo_url || '' }, ...current]);
    setPhotoSaving(false); setSelectedPhoto(null); setPhotoError('');
    setNewText(''); setNewTitle(''); setPlaceLatitude(''); setPlaceLongitude(''); setModal('');
  };
  const addCycle = async (date, status) => {
    const labels = { period: '经期开始', symptom: '身体状态', note: '备注' };
    const result = await saveEntry('cycle', labels[status], '', { status }, false, date);
    if (result.error) { setLocationError(explainError(result.error)); return; }
    if (isDemo) setCycles([{ id: Date.now(), date, status, title: labels[status] }, ...cycles]);
    setModal('');
  };
  const addCalendarEvent = async form => {
    if (calendarSaving) return;
    setCalendarError('');
    const title = newTitle.trim();
    const selectedDate = calendarEventDate || form.elements.eventDate?.value;
    if (!title || !selectedDate) return;
    const kind = calendarEventKind;
    const body = newText.trim();
    const repeatYearly = kind !== 'date';
    const calendarSystem = kind === 'birthday' ? birthdayCalendar : 'solar';
    if (calendarSystem === 'lunar' && (!lunarMonthNames[Number(lunarBirthdayMonth) - 1] || Number(lunarBirthdayDay) < 1 || Number(lunarBirthdayDay) > 30)) {
      setCalendarError('请填写有效的农历生日。');
      return;
    }
    const year = Number(todayInput.slice(0, 4));
    const lunarDate = calendarSystem === 'lunar' ? getLunarDateInYear(year, lunarBirthdayMonth, lunarBirthdayDay, lunarBirthdayLeap) : null;
    if (calendarSystem === 'lunar' && !lunarDate) {
      setCalendarError('当前设备无法换算农历日期，请更新浏览器后重试。');
      return;
    }
    const date = lunarDate || selectedDate;
    const metadata = {
      event_kind: kind,
      repeat_yearly: repeatYearly,
      calendar_system: calendarSystem,
      ...(calendarSystem === 'lunar' ? { lunar_month: Number(lunarBirthdayMonth), lunar_day: Number(lunarBirthdayDay), lunar_leap: lunarBirthdayLeap } : {}),
    };
    setCalendarSaving(true);
    try {
    const result = editingCalendarEvent
      ? isDemo
        ? { data: { ...editingCalendarEvent, title, body, entry_date: date, metadata } }
        : await supabase.from('shared_entries').update({ title, body, metadata, entry_date: date }).eq('id', editingCalendarEvent.id).eq('couple_id', couple.id).select().single()
      : await saveEntry('anniversary', title, body, metadata, false, date);
    if (result.error) { setCalendarError(explainError(result.error)); return; }
    const event = { ...editingCalendarEvent, id: result.data?.id || editingCalendarEvent?.id || Date.now(), type: 'anniversary', title, body, date, eventKind: kind, repeatYearly, calendarSystem, lunarMonth: calendarSystem === 'lunar' ? Number(lunarBirthdayMonth) : undefined, lunarDay: calendarSystem === 'lunar' ? Number(lunarBirthdayDay) : undefined, lunarLeap: calendarSystem === 'lunar' && lunarBirthdayLeap, sourceDate: undefined, note: body };
    setCalendarEvents(current => editingCalendarEvent ? current.map(item => item.id === event.id ? event : item) : [event, ...current]);
    setSelectedCalendarDate(date);
    setCalendarEventDate(date);
    setEditingCalendarEvent(null); setNewTitle(''); setNewText(''); setModal('');
    setCalendarMonth(new Date(`${date.slice(0, 7)}-01T00:00:00`));
    } catch (error) {
      setCalendarError(explainError(error));
    } finally {
      setCalendarSaving(false);
    }
  };
  const changeCalendarEventKind = kind => {
    const defaults = { anniversary: '恋爱纪念日', valentines: '情人节', qixi: '七夕', birthday: 'TA 的生日' };
    const previousDefault = { anniversary: '恋爱纪念日', valentines: '情人节', qixi: '七夕', birthday: 'TA 的生日' }[calendarEventKind];
    setCalendarEventKind(kind);
    if (kind === 'birthday') setBirthdayCalendar('solar');
    if (!newTitle.trim() || newTitle === previousDefault) setNewTitle(defaults[kind] || '');
    const year = Number(selectedCalendarDate.slice(0, 4));
    if (kind === 'valentines') setCalendarEventDate(`${year}-02-14`);
    if (kind === 'qixi') setCalendarEventDate(getQixiDate(year) || selectedCalendarDate);
  };
  const editCalendarEvent = event => {
    setEditingCalendarEvent(event);
    setSelectedCalendarDate(event.occurrenceDate || event.date);
    setCalendarEventDate(event.sourceDate || event.date);
    setNewTitle(event.title || '');
    setNewText(event.body || '');
    setCalendarEventKind(event.eventKind || 'date');
    setBirthdayCalendar(event.calendarSystem || 'solar');
    setLunarBirthdayMonth(String(event.lunarMonth || 1));
    setLunarBirthdayDay(String(event.lunarDay || 1));
    setLunarBirthdayLeap(!!event.lunarLeap);
    setCalendarError('');
    setModal('calendar-event');
  };
  const startCalendarEvent = (date, kind = 'date') => {
    setEditingCalendarEvent(null);
    setSelectedCalendarDate(date);
    setCalendarEventDate(date);
    setNewTitle(({ anniversary: '恋爱纪念日', valentines: '情人节', qixi: '七夕', birthday: 'TA 的生日' })[kind] || '');
    setNewText('');
    setCalendarEventKind(kind);
    setBirthdayCalendar('solar');
    setLunarBirthdayMonth('1');
    setLunarBirthdayDay('1');
    setLunarBirthdayLeap(false);
    setCalendarError('');
    const year = Number(date.slice(0, 4));
    if (kind === 'valentines') setCalendarEventDate(`${year}-02-14`);
    if (kind === 'qixi') setCalendarEventDate(getQixiDate(year) || date);
    setModal('calendar-event');
  };
  const playGame = () => { gameResultSavedRef.current = false; setFlipped([]); setMatched([]); setGameMoves(0); setGameError(''); setModal('game'); };
  const recordGameResult = async moves => {
    if (gameResultSavedRef.current || gameSaving) return;
    setGameSaving(true);
    const completedAt = new Date().toISOString();
    const result = await saveEntry('event', '默契翻牌完成', `用 ${moves} 次翻牌配齐 6 对。`, { game: 'memory-match', moves }, false, toLocalDateInput(new Date()));
    setGameSaving(false);
    if (result.error) { setGameError(explainError(result.error)); return; }
    gameResultSavedRef.current = true;
    setGameResults(entries => [{ id: result.data?.id || Date.now(), created_by: session?.user?.id || 'demo', moves, completed_at: completedAt, title: '默契翻牌完成', body: `用 ${moves} 次翻牌配齐 6 对。` }, ...entries]);
  };
  const submitQuizChoice = async () => {
    if (!quizChoice || quizSaving) { if (!quizChoice) setQuizError('先选一个最像 TA 的答案吧。'); return; }
    const questionId = toLocalDateInput(new Date());
    const userId = session?.user?.id || 'demo';
    const previous = quizEntries.find(entry => entry.question_id === questionId && entry.created_by === userId);
    setQuizSaving(true);
    const result = previous
      ? isDemo
        ? { data: { ...previous, body: quizChoice } }
        : await supabase.from('shared_entries').update({ title: '今天的心动问答', body: quizChoice, metadata: { game: 'quiz', question_id: questionId }, entry_date: questionId }).eq('id', previous.id).eq('couple_id', couple.id).select().single()
      : await saveEntry('event', '今天的心动问答', quizChoice, { game: 'quiz', question_id: questionId }, false, questionId);
    setQuizSaving(false);
    if (result.error) { setQuizError(explainError(result.error)); return; }
    const response = { ...previous, id: result.data?.id || previous?.id || Date.now(), created_by: userId, date: questionId, question_id: questionId, answer: quizChoice };
    setQuizEntries(entries => previous ? entries.map(entry => entry.id === previous.id ? response : entry) : [response, ...entries]);
    setQuizError('');
  };
  const submitGuessChallenge = async () => {
    const clue = guessClue.trim();
    const answer = guessAnswer.trim();
    if (!clue || !answer || guessSaving) { setGuessError('写下提示和答案后再发布。'); return; }
    if (guessChallenge) { setGuessError('今天已经有一道题了，先让 TA 来猜猜看。'); return; }
    setGuessSaving(true);
    const questionId = todayInput;
    const challengeId = crypto.randomUUID();
    const metadata = { game: 'guessing-game', stage: 'challenge', question_id: questionId, challenge_id: challengeId, clue };
    const result = await saveEntry('event', '猜猜我在想什么', answer, metadata, false, questionId);
    setGuessSaving(false);
    if (result.error) { setGuessError(explainError(result.error)); return; }
    setGuessEntries(entries => [{ id: result.data?.id || Date.now(), ...metadata, game: 'guessing-game', stage: 'challenge', question_id: questionId, challenge_id: challengeId, clue, answer, created_by: currentUserId, date: questionId }, ...entries]);
    setGuessError('');
  };
  const submitGuessResponse = async () => {
    const guess = guessDraft.trim();
    if (!guess || !guessChallenge || guessSaving) { if (!guess) setGuessError('先写下你的猜测。'); return; }
    if (guessChallenge.created_by === currentUserId) { setGuessError('这道题是你出的，让 TA 来猜吧。'); return; }
    setGuessSaving(true);
    const metadata = { game: 'guessing-game', stage: 'guess', question_id: todayInput, challenge_id: guessChallenge.challenge_id };
    const result = await saveEntry('event', '猜猜我在想什么', guess, metadata, false, todayInput);
    setGuessSaving(false);
    if (result.error) { setGuessError(explainError(result.error)); return; }
    setGuessEntries(entries => [{ id: result.data?.id || Date.now(), ...metadata, game: 'guessing-game', stage: 'guess', question_id: todayInput, challenge_id: guessChallenge.challenge_id, guess, created_by: currentUserId, date: todayInput }, ...entries]);
    setGuessError('');
  };
  const tapCard = index => {
    if (flipped.includes(index) || matched.includes(index) || flipped.length === 2) return;
    const next = [...flipped, index]; setFlipped(next);
    if (next.length === 2) {
      const nextMoves = gameMoves + 1;
      setGameMoves(nextMoves);
      if (gameSymbols[next[0]] === gameSymbols[next[1]]) setTimeout(() => {
        const nextMatched = [...matched, ...next];
        setMatched(nextMatched);
        setFlipped([]);
        if (nextMatched.length === gameSymbols.length) recordGameResult(nextMoves);
      }, 450);
      else setTimeout(() => setFlipped([]), 850);
    }
  };

  if (authStage === 'loading') return <main className="auth-screen"><p className="auth-footer">正在打开你们的小宇宙…</p></main>;
  if (authStage === 'login') return <LoginScreen onComplete={completeLogin} onDemo={enterDemo} />;
  if (authStage === 'pair') return <PairingScreen code={inviteCode} onCreate={createCouple} onJoin={joinCouple} onContinue={() => setAuthStage('app')} onLogout={logout} isDemo={isDemo} />;

  return <div className="app-frame">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#home" onClick={e => { e.preventDefault(); go('home'); }}><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>我们的小宇宙<small>JUST US, ALWAYS</small></span></a>
      <div className="space-label">OUR SHARED SPACE</div>
      <div className="couple-identity"><span className="avatar avatar-you" title={`当前账号：${currentAccountName}`}>{currentAccountInitial}</span><span className="avatar avatar-her" title={`伴侣账号：${partnerAccountName}`}>{partnerAccountInitial}</span><div><strong>{currentAccountName} 和 {partnerAccountName}</strong><small>你正在使用：{currentAccountName}</small></div><span className="online-dot" /></div>
      <div className="nav-label">一起生活</div>
      <nav className="side-nav">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'selected' : ''} onClick={() => go(item.id)}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{page === item.id && <span className="nav-dot" />}</button>; })}</nav>
      <div className="sidebar-note"><span className="note-sticker">♡</span><p>喜欢你这件事，<br />每天都在继续。</p><small>— 写给我们</small></div>
    </aside>

    <div className="main-area">
      <header className="topbar">
        <button className="icon-button mobile-menu-button" aria-label="打开导航" onClick={() => setMobileNav(!mobileNav)}><Menu size={20} /></button>
        <div className="breadcrumb"><span>我们的小宇宙</span><ChevronRight size={14} /><strong>{selectedPage.label}</strong></div>
        {page === 'plans' && <button className="topbar-calendar-add" type="button" aria-label="新增生日或纪念日" title="新增生日或纪念日" onClick={() => startCalendarEvent(todayInput, 'anniversary')}><Plus size={14} /><span>新增纪念日</span></button>}
        <div className="topbar-actions"><span className="today-date">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span><button className="music-button" onClick={() => songUrl ? setPlaying(!playing) : setModal('music')}>{playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}<span>{playing ? '正在播放' : songName}</span><AudioLines size={15} className={playing ? 'sound-wave playing' : 'sound-wave'} /></button><div className="account-menu-wrap" ref={accountMenuRef}><button className="account-menu-trigger" aria-label="打开账号菜单" aria-expanded={accountMenuOpen} title={`当前账号：${currentAccountName}`} onClick={() => setAccountMenuOpen(open => !open)}><span className="avatar avatar-small">{currentAccountInitial}</span><ChevronDown size={14} /></button>{accountMenuOpen && <div className="account-menu" role="menu"><div className="account-menu-heading"><span className="avatar avatar-small">{currentAccountInitial}</span><span><strong>{currentAccountName}</strong><small>当前账号</small></span></div><button role="menuitem" onClick={() => { setModal('settings'); setAccountMenuOpen(false); }}><Settings2 size={15} /> 小宇宙设置</button><button role="menuitem" onClick={() => { setModal('pairing-settings'); setAccountMenuOpen(false); }}><Heart size={15} /> 关系与配对</button><button role="menuitem" onClick={() => { setAccountMenuOpen(false); logout(); }}><LogOut size={15} /> 退出登录</button></div>}</div></div>
      </header>
      {sharedSyncError && <div className="shared-sync-banner" role="status">{sharedSyncError}</div>}
      <audio ref={audioRef} src={songUrl || undefined} loop />

      <main className="page-content">
        {page === 'home' && <>
          <div className="welcome-row"><div><p className="eyebrow">{todayWeekday}, OUR FAVORITE DAY <span>♡</span></p><h1>{timeGreeting}</h1><p className="subheading">愿今天有一点点甜，刚好和你分享。</p></div></div>
          <section className="anniversary-banner paper-card"><div className="banner-copy"><span className="banner-stamp">OUR DAYS</span><p>和你一起走过</p><div className="days-number">{daysTogether.toLocaleString()}<small>天</small></div><span className="banner-line">每一天都想和你，再多一点点。</span></div><div className="banner-photo"><img src="/assets/dog-couple.png" alt="依偎在一起的线条小狗" /><span className="photo-caption">想和你，一直这样靠在一起。</span><span className="photo-tape" /></div><span className="banner-doodle doodle-one">✳</span><span className="banner-doodle doodle-two">♡</span></section>

          <div className="dashboard-grid">
            <section className="dashboard-panel date-panel">
              <div className="panel-heading"><span className="panel-icon blush-icon"><CalendarDays size={17} /></span><span className="eyebrow">NEXT LITTLE CELEBRATION</span></div>
              <h2>下一个纪念日</h2><p className="date-big">还有 <strong>{nextAnniversary}</strong> 天</p><div className="date-divider" /><div className="date-meta"><span>相遇的日子</span></div>
            </section>

            {featuredCountdown && <section className="dashboard-panel date-panel countdown-home-panel">
              <div className="panel-heading"><span className="panel-icon yellow-icon"><CalendarDays size={17} /></span><span className="eyebrow">NEXT LITTLE COUNTDOWN</span></div>
              <h2>{featuredCountdown.title}</h2><p className="date-big">还有 <strong>{featuredCountdown.days}</strong> 天</p><div className="date-divider" /><div className="date-meta"><span>{getCalendarDateCaption(featuredCountdown)}</span><button className="subtle-link" onClick={() => go('plans')}>全部倒数日 <ChevronRight size={13} /></button></div>
            </section>}

            <section className="dashboard-panel today-note-panel">
              <div className="panel-heading"><span className="panel-icon yellow-icon"><StickyNote size={17} /></span><span className="eyebrow">A LITTLE NOTE</span><button className="more-link" onClick={() => go('diary')}>全部日记 <ChevronRight size={13} /></button></div>
              {notes.slice(0, 1).map(note => <div key={note.id}><span className="note-meta">{note.date} · {note.mood}</span><h2>{note.title}</h2><p className="note-excerpt">{note.body}</p></div>)}{!notes.length && <p className="empty-state">你们的第一篇日记，等一个平常又特别的日子来写。</p>}
            </section>

            <section className="dashboard-panel wishlist-panel">
              <div className="panel-heading"><span className="panel-icon green-icon"><Gift size={17} /></span><span className="eyebrow">LITTLE PLANS, TOGETHER</span></div><h2>一起完成的事</h2><div className="todo-meter"><span style={{ width: `${todos.length ? todos.filter(t => t.done).length / todos.length * 100 : 0}%` }} /></div><div className="todo-meter-label"><span>{todos.filter(t => t.done).length} 件已完成</span><button className="subtle-link" onClick={() => go('plans')}>看看清单 <ChevronRight size={13} /></button></div><div className="tiny-todo-list">{todos.slice(0, 2).map(todo => <span key={todo.id}><i className={todo.done ? 'checked' : ''}>{todo.done && <Check size={10} />}</i>{todo.text}</span>)}</div>
            </section>

            <section className="dashboard-panel memory-preview">
              <div className="panel-heading"><span className="panel-icon blue-icon"><Camera size={17} /></span><span className="eyebrow">RECENT MEMORY</span><button className="more-link" onClick={() => go('memories')}>时光相册 <ChevronRight size={13} /></button></div><div className="memory-preview-body"><img src={memories[0]?.photo_url || "/assets/dog-couple.png"} alt={memories[0]?.photo_url ? memories[0]?.title : "依偎在一起的线条小狗"} /><div><span className="memory-date">{memories[0]?.date || "等你们收藏第一段回忆"}</span><h2>{memories[0]?.title || "把喜欢的瞬间留住"}</h2><p>{memories[0]?.text || "上传一张照片，写下只有你们懂的小故事。"}</p></div></div>
            </section>
          </div>

          <div className="bottom-widgets">
            <button className="widget-link map-widget" onClick={() => go('map')}><span className="widget-illustration map-mini"><MapPin size={20} /></span><span><small>ALWAYS CLOSE</small><strong>打开我们的地图</strong><i>看看此刻的我们 ♡</i></span><ChevronRight size={17} /></button>
            <button className="widget-link game-widget" onClick={() => go('games')}><span className="widget-illustration game-mini">♡</span><span><small>A LITTLE GAME</small><strong>来玩一局默契翻牌</strong><i>看看我们有多合拍</i></span><ChevronRight size={17} /></button>
            <button className="widget-link care-widget" onClick={() => go('care')}><span className="widget-illustration care-mini"><Heart size={19} /></span><span><small>A LITTLE CARE</small><strong>贴心日历</strong><i>好好照顾自己呀</i></span><ChevronRight size={17} /></button>
          </div>
          <div className="home-footer-note"><span>—</span> 想把普通日子，慢慢过成我们的纪念日 <Heart size={12} fill="currentColor" /></div>
        </>}

        {page === 'memories' && <PageHeader eyebrow="OUR TIME CAPSULE" title="时光相册" subtitle="把那些看起来平常的瞬间，收进我们的故事里。" action={<button className="primary-button" onClick={startMemory}><Plus size={16} /> 收藏一段回忆</button>}>
          <div className="content-tools"><label className="search-field"><Search size={15} /><input value={memoryQuery} onChange={event => setMemoryQuery(event.target.value)} placeholder="搜索回忆标题或内容" /></label><div className="album-filter-controls"><select aria-label="按分类筛选并查看回忆" value={memoryAlbumFilter} onChange={event => setMemoryAlbumFilter(event.target.value)}><option value="全部">全部 ({memories.length})</option>{memoryAlbums.map(album => <option key={album} value={album}>{album} ({memories.filter(memory => (memory.album || '未分类') === album).length})</option>)}</select><button className="outline-button" onClick={() => { setNewMemoryAlbum(''); setMemoryAlbumError(''); setModal('memory-album'); }}><Plus size={14} /> 新增分类</button></div></div>
          {memoryAlbumFilter !== '全部' && <p className="memory-category-summary">{memoryAlbumFilter} · {filteredMemories.length} 条回忆</p>}
          <div className="memory-gallery">{filteredMemories.map((memory, i) => <article className="memory-card" key={memory.id}><button className="delete-entry-button memory-delete" aria-label={`移入回收站：${memory.title}`} title="移入回收站" disabled={deletingEntryId === memory.id} onClick={() => deleteEntry(memory, memory.title, 'memory')}><Trash2 size={15} /></button><div className={`memory-card-image memory-tone-${i % 3}`}><img src={memory.photo_url || "/assets/dog-couple.png"} alt={memory.photo_url ? memory.title : "线条小狗插画"} /><span className="memory-tag">{memory.album || '未分类'}</span><span className="memory-pin">♡</span></div><time>{memory.date}</time><h2>{memory.title}</h2><p>{memory.text}</p></article>)}{!filteredMemories.length && <p className="empty-state">{memoryAlbumFilter !== '全部' ? '这个分类里还没有回忆。' : memories.length ? '没有找到相关回忆。' : '上传一张照片，收藏你们的第一段回忆。'}</p>}<button className="add-memory-tile" onClick={startMemory}><span><Plus size={19} /></span><strong>把新回忆放进来</strong><small>每一次心动，都值得被记住。</small></button></div>
        </PageHeader>}

        {page === 'diary' && <PageHeader eyebrow="LITTLE THINGS, BIG LOVE" title="日常碎碎念" subtitle="晴天雨天，每个普通的日子都值得一页。" action={<button className="primary-button" onClick={() => setModal('diary')}><Plus size={16} /> 写一篇日记</button>}><div className="content-tools"><label className="search-field"><Search size={15} /><input value={diaryQuery} onChange={event => setDiaryQuery(event.target.value)} placeholder="搜索日记和悄悄话" /></label></div><div className="diary-layout"><section className="diary-list">{!filteredNotes.length && <p className="empty-state">{notes.length ? '没有找到相关内容。' : '这页还空着，写下今天想和 TA 分享的小事吧。'}</p>}{filteredNotes.map(note => <article className="diary-entry" key={note.id}><button className="delete-entry-button" aria-label={`删除记录：${note.title}`} title="删除记录" disabled={deletingEntryId === note.id} onClick={() => deleteEntry(note, note.title)}><Trash2 size={15} /></button><div className="diary-date"><span>{note.date}</span><span className="mood-pill">{note.mood}</span></div><h2>{note.title}</h2><p>{note.body}</p><div className="diary-entry-foot"><span>写给我们的小日子</span><Heart size={13} /></div></article>)}</section><aside className="whisper-prompt lined-note"><span className="whisper-seal"><Heart size={17} fill="currentColor" /></span><p className="eyebrow">A NOTE JUST FOR YOU</p><h3>有些话，<br />只想说给你听。</h3><p>把今天藏在心里的话，<br />轻轻放在这里。</p><button className="primary-button" onClick={() => setModal('whisper')}>写一条悄悄话 <ChevronRight size={15} /></button><span className="whisper-stamp">♡</span></aside></div></PageHeader>}

        {page === 'plans' && <PageHeader eyebrow="MADE OF LITTLE PROMISES" title="一起计划" subtitle="把生日、纪念日和期待的日子，都放进倒数里。" action={<button className="primary-button" onClick={() => setModal('todo')}><Plus size={16} /> 新增一个愿望</button>}>
          <div className="plans-grid">
            <section className="countdown-panel">
              <div className="countdown-panel-heading"><div><span className="eyebrow">OUR DAYS, ONE BY ONE</span><h2>值得期待的日子</h2></div><button className="outline-button" onClick={() => startCalendarEvent(todayInput, 'anniversary')}><Plus size={14} /> 添加倒数日</button></div>
              {featuredCountdown ? <div className="countdown-board">
                <article className="countdown-feature">
                  <div className="countdown-feature-copy"><span className="mood-pill">{getCalendarEventLabel(featuredCountdown.eventKind)}</span><h3>{featuredCountdown.title}</h3><p>{getCalendarDateCaption(featuredCountdown)}</p></div>
                  <div className="countdown-number"><strong>{Math.abs(featuredCountdown.days)}</strong><span>{featuredCountdown.days < 0 ? '天前' : featuredCountdown.days === 0 ? '就是今天' : '天后'}</span></div>
                  <div className="countdown-feature-actions"><button className="icon-button" aria-label={`编辑倒数日：${featuredCountdown.title}`} title="编辑倒数日" onClick={() => editCalendarEvent(featuredCountdown)}><Pencil size={14} /></button><button className="delete-entry-button" aria-label={`删除倒数日：${featuredCountdown.title}`} title="移入回收站" disabled={deletingEntryId === featuredCountdown.id} onClick={() => deleteEntry(featuredCountdown, featuredCountdown.title, 'anniversary')}><Trash2 size={14} /></button></div>
                </article>
                {remainingCountdowns.length > 0 && <div className="countdown-list">{remainingCountdowns.map(event => <article className={`countdown-row ${event.days < 0 ? 'countdown-past' : ''}`} key={event.id}><span className="countdown-row-icon"><CalendarDays size={17} /></span><div className="countdown-row-copy"><span className="mood-pill">{getCalendarEventLabel(event.eventKind)}</span><strong>{event.title}</strong><small>{getCalendarDateCaption(event)}</small></div><div className="countdown-row-value"><strong>{Math.abs(event.days)}</strong><span>{event.days < 0 ? '天前' : event.days === 0 ? '今天' : '天后'}</span></div><button className="icon-button" aria-label={`编辑倒数日：${event.title}`} title="编辑倒数日" onClick={() => editCalendarEvent(event)}><Pencil size={13} /></button><button className="delete-entry-button" aria-label={`删除倒数日：${event.title}`} title="移入回收站" disabled={deletingEntryId === event.id} onClick={() => deleteEntry(event, event.title, 'anniversary')}><Trash2 size={14} /></button></article>)}</div>}
              </div> : <div className="countdown-empty"><CalendarDays size={22} /><p>还没有倒数日，先记下一个想一起庆祝的日子吧。</p><button className="quiet-add" onClick={() => startCalendarEvent(todayInput, 'anniversary')}><Plus size={14} /> 添加第一个纪念日</button></div>}
            </section>
            <section className="calendar-preview"><div className="subpanel-head"><div><span className="eyebrow">OUR LITTLE CALENDAR</span><h2>{calendarMonth.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</h2></div><div className="month-arrows"><button aria-label="上个月" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronRight className="previous" size={16} /></button><button aria-label="下个月" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight size={16} /></button><button className="subtle-link" onClick={() => startCalendarEvent(todayInput)}><Plus size={13} /> 添加日子</button></div></div><div className="calendar-week">{['日','一','二','三','四','五','六'].map(x => <span key={x}>{x}</span>)}</div><div className="calendar-days event-calendar">{calendarDays.map(day => <button type="button" key={day.key} disabled={!day.currentMonth} className={`${day.today ? 'today' : ''} ${day.date === selectedCalendarDate ? 'selected-day' : ''} ${day.hasEvent ? 'has-event' : ''}`} onClick={() => setSelectedCalendarDate(day.date)}>{day.label}{day.hasEvent && <i />}</button>)}</div><div className="selected-day-events"><div className="subpanel-head"><strong>{formatDate(selectedCalendarDate)}</strong><button className="quiet-add" onClick={() => startCalendarEvent(selectedCalendarDate)}><Plus size={13} /> 添加安排</button></div>{filteredCalendarEvents.length ? filteredCalendarEvents.map(event => <article key={event.id}><span className="mood-pill">{getCalendarEventLabel(event.eventKind)}</span><div><strong>{event.title}</strong>{event.body && <small>{event.body}</small>}</div><button className="icon-button" aria-label={`编辑安排：${event.title}`} title="编辑安排" onClick={() => editCalendarEvent(event)}><Pencil size={13} /></button><button className="delete-entry-button" aria-label={`删除安排：${event.title}`} title="移入回收站" onClick={() => deleteEntry(event, event.title, 'anniversary')}><Trash2 size={14} /></button></article>) : <p className="empty-state">这一天还没有安排，留个位置给期待吧。</p>}</div></section>
            <section className="plan-list-panel"><div className="subpanel-head"><div><span className="eyebrow">OUR BUCKET LIST</span><h2>以后要一起做的事</h2></div><span className="completion-count">{todos.filter(todo => todo.done).length}/{todos.length}</span></div><div className="large-todo-list">{!todos.length && <p className="empty-state">还没有共同愿望，先写下一件想一起做的小事吧。</p>}{todos.map(todo => <div className={`large-todo-row ${todo.done ? 'done' : ''}`} key={todo.id}><label className="large-todo"><input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo)} /><span className="check-mark"><Check size={12} /></span><span>{todo.text}</span></label><button className="delete-entry-button" aria-label={`删除愿望：${todo.text}`} title="删除愿望" disabled={deletingEntryId === todo.id} onClick={() => deleteEntry(todo, todo.text)}><Trash2 size={15} /></button></div>)}</div></section>
          </div>
        </PageHeader>}

    {page === 'map' && <PageHeader eyebrow="OUR LITTLE ATLAS" title="我们的地图" subtitle="把一起走过的路，和此刻的彼此，都放进地图里。"><div className="map-tabs-row"><div className="segmented-control"><button className={mapTab === 'places' ? 'active' : ''} onClick={() => setMapTab('places')}><Heart size={14} /> 一起去过的地方 <span>{places.length}</span></button><button className={mapTab === 'realtime' ? 'active' : ''} onClick={() => setMapTab('realtime')}><MapPin size={14} /> 实时位置</button></div>{mapTab === 'places' && <button className="outline-button" onClick={() => setModal('place')}><Plus size={14} /> 添加地点</button>}</div>{mapTab === 'places' ? <section className="map-page"><div className="map-canvas"><div className="map-park park-a" /><div className="map-park park-b" /><svg viewBox="0 0 850 510" preserveAspectRatio="none" aria-hidden="true"><path d="M-20 100 C120 58 163 190 300 154 S470 72 556 150 706 193 880 74"/><path d="M-10 355 C110 292 203 270 322 320 S512 400 632 320 762 302 874 383"/><path d="M190 -15 C228 107 165 183 254 289 S292 421 272 525"/><path d="M660 -20 C572 119 638 202 552 292 S602 417 563 528"/><path d="M-10 235 C134 263 289 215 426 247 S679 273 862 223" className="map-river" /></svg><span className="map-street-label street-a">樱花小路</span><span className="map-street-label street-b">慢慢咖啡</span><span className="map-street-label street-c">回家的路</span><span className="map-person person-a"><MapPin size={18} /><i>01</i></span><span className="map-person person-b"><Heart size={14} fill="currentColor" /><i>02</i></span><span className="map-heart-trail">♡</span><div className="map-info"><Heart size={14} fill="currentColor" /><div><strong>这些地方，我们一起去过</strong><small>每个地点，都藏着一段小小回忆。</small></div><span>{places.length} 个地点</span></div></div><div className="map-saved-places"><span className="eyebrow">PLACES WE KEEP</span><h2>一起去过的地方</h2><p>记得那天的天气，也记得身边的你。</p><div>{places.map((place, index) => <article className="saved-place" key={place.id}>{place.photo_url && <img src={place.photo_url} alt={place.name} />}<i>{String(index + 1).padStart(2, '0')}</i><b>{place.name}</b><small>{place.date}</small><p>{place.note}</p></article>)}</div><button className="quiet-add" onClick={() => setModal('place')}><Plus size={14} /> 再记一个地方</button></div></section> : <section className="realtime-layout"><div className="map-canvas live-map"><div className="map-park park-a" /><div className="map-park park-b" /><svg viewBox="0 0 850 510" preserveAspectRatio="none" aria-hidden="true"><path d="M-20 100 C120 58 163 190 300 154 S470 72 556 150 706 193 880 74"/><path d="M-10 355 C110 292 203 270 322 320 S512 400 632 320 762 302 874 383"/><path d="M190 -15 C228 107 165 183 254 289 S292 421 272 525"/><path d="M660 -20 C572 119 638 202 552 292 S602 417 563 528"/><path d="M-10 235 C134 263 289 215 426 247 S679 273 862 223" className="map-river" /></svg><span className="map-street-label street-a">此刻的日常</span><span className="map-street-label street-b">回家的路</span>{locationSharing && <span className="map-person person-a"><MapPin size={18} /><i>你</i></span>}<div className="live-map-center"><span className="live-pulse"><Heart size={17} fill="currentColor" /></span><strong>{locationSharing ? '你的位置已在本机更新' : locationRequestState === 'requesting' ? '正在请求定位权限' : '等待设备位置'}</strong><small>{isDemo ? '演示空间不会上传或同步真实位置。' : locationSharing ? partnerLocation ? 'TA 的位置也已在地图上显示。' : '正在等待 TA 的设备允许定位。' : '开启后，地图会显示双方的实时位置。'}</small></div><div className="map-info"><span className={locationSharing ? 'online-dot' : 'offline-dot'} /><div><strong>{locationSharing ? '本机定位已开启' : locationRequestState === 'requesting' ? '正在等待授权' : '本机位置暂不可用'}</strong><small>{locationSharing ? locationCoords : locationRequestState === 'requesting' ? '允许浏览器访问位置后会自动同步。' : '登录后会自动请求浏览器定位权限。'}</small></div></div></div><aside className="location-panel"><span className="eyebrow">LIVE LOCATION</span><h2>此刻的我们</h2><p>位置由每个人的设备实时提供。</p><div className="location-member"><span className="avatar avatar-you">你</span><div><strong>我的位置</strong><small>{locationSharing ? <>{locationCoords} · {formatUpdatedAt(ownLocationUpdatedAt, clockNow)}</> : locationRequestState === 'requesting' ? '等待允许浏览器定位…' : locationRequestState === 'error' ? '定位暂不可用' : '正在申请定位'}</small></div><span className={locationSharing ? 'online-dot' : 'offline-dot'} /></div><div className="location-member"><span className="avatar avatar-her">她</span><div><strong>她的位置</strong><small>{partnerLocation ? <>{Number(partnerLocation.latitude).toFixed(4)}, {Number(partnerLocation.longitude).toFixed(4)} · {formatUpdatedAt(partnerLocation.updated_at, clockNow)}</> : '等待 TA 的设备允许定位'}</small></div><span className={partnerLocation ? "online-dot" : "offline-dot"} /></div>{!isDemo && locationRequestState === 'error' && <div className="location-error-actions"><button className="outline-button" onClick={requestLocationSharing}>重新请求定位 <MapPin size={14} /></button>{Capacitor.isNativePlatform() && <button className="outline-button" onClick={() => BackgroundGeolocation.openSettings().catch(error => setLocationError(error?.message || '无法打开应用设置，请在系统设置中找到本应用的定位权限。'))}>打开应用定位设置 <Settings2 size={14} /></button>}</div>}{locationError && <p className="location-message">{locationError}</p>}<p className="location-footnote">{isDemo ? "演示空间不会上传位置。" : "登录后会自动请求定位权限；双方各自在自己的设备允许后，地图会显示彼此位置。"}</p></aside></section>}</PageHeader>}

        {page === 'map' && mapTab === 'places' && places.length > 0 && <section className="place-delete-list"><span className="eyebrow">PLACE RECORDS</span><h2>管理地点记录</h2>{places.map(place => <div key={place.id}><span>{place.name}</span><button className="delete-entry-button" aria-label={`删除地点：${place.name}`} title="删除地点" disabled={deletingEntryId === place.id} onClick={() => deleteEntry(place, place.name)}><Trash2 size={15} /></button></div>)}</section>}

        {page === 'care' && <PageHeader eyebrow="TAKE IT SOFTLY" title="贴心日历" subtitle="温柔记下身体的节奏，也记得给自己多一点照顾。" action={<button className="outline-button" onClick={() => setModal('cycle')}><CalendarDays size={15} /> 记录状态</button>}>
          <div className="care-grid">
            <section className="cycle-summary">
              <div className="cycle-sun">♡</div><span className="eyebrow">A LITTLE CARE</span>
              <h2>今天也要好好照顾自己。</h2>
              <p>这里展示你们主动记录的日期；参考提醒会说明它的依据和不确定性。</p>
              <div className="cycle-count"><strong>{cycleDay ?? '—'}</strong><span>{cycleDay ? <>周期第<br />{cycleDay} 天</> : <>还没有经期<br />开始记录</>}</span></div>
              <div className="cycle-caption"><span>经期开始 · {latestPeriodStart?.date || '未记录'}</span><span>共记录 {cycles.length} 次</span></div>
              <button className="primary-button" onClick={() => setModal('cycle')}>记录今天的状态 <Heart size={14} /></button>
            </section>
            <section className="cycle-calendar-card">
              <div className="subpanel-head"><div><span className="eyebrow">{cycleMonth.getFullYear()}</span><h2>{cycleMonthTitle}</h2></div>
                <div className="month-arrows"><button aria-label="上个月" onClick={() => setCycleMonth(new Date(cycleMonth.getFullYear(), cycleMonth.getMonth() - 1, 1))}><ChevronRight className="previous" size={16} /></button><button aria-label="下个月" onClick={() => setCycleMonth(new Date(cycleMonth.getFullYear(), cycleMonth.getMonth() + 1, 1))}><ChevronRight size={16} /></button></div>
              </div>
              <div className="calendar-week">{['日','一','二','三','四','五','六'].map(x => <span key={x}>{x}</span>)}</div>
              <div className="calendar-days cycle-days">{cycleDays.map(day => <span key={day.key} className={`${day.today ? 'today' : ''} ${day.periodStart ? 'period-day' : ''} ${!day.currentMonth ? 'outside-month' : ''}`}>{day.label}{day.periodStart && <i />}</span>)}</div>
              <div className="cycle-legend"><span><i className="legend-period" />经期开始记录</span><span><i className="legend-today" />今天</span></div>
            </section>
          </div>
          <section className="care-suggestion-panel" aria-live="polite">
            <div className="care-suggestion-heading"><span className="care-suggestion-mark"><Sparkles size={17} /></span><div><span className="eyebrow">A LITTLE THOUGHT FOR TODAY</span><h2>{careSuggestion.title}</h2></div></div>
            <p className="care-suggestion-detail">{careSuggestion.detail}</p>
            <div className="care-suggestion-message"><p>{careAiMessage ? 'AI 为你写的一句话' : '可以发给她'}</p><strong>{careAiMessage || careSuggestion.message}</strong><div className="care-suggestion-actions"><button className="outline-button" onClick={generateCareAiMessage} disabled={careAiLoading}><Sparkles size={14} />{careAiLoading ? '正在想一句…' : 'AI 帮我写一句'}</button><button className="outline-button" onClick={copyCareSuggestion}><Copy size={14} />{careSuggestionCopied ? '已复制' : '复制这句话'}</button></div></div>
            {careAiError && <p className="care-ai-error" role="status">{careAiError}</p>}
            <small className="care-suggestion-note">本机建议不会发送到 AI。点击「AI 帮我写一句」后，会发送最近 8 次经期开始日期、今天日期和当前时段到你配置的模型服务；不发送姓名、位置或照片。</small>
            <small className="care-suggestion-note">日期参考不用于健康判断或避孕。</small>
          </section>
          {cycles.length > 0 && <section className="cycle-saved-list"><span className="eyebrow">RECENT NOTES</span><h2>最近的贴心记录</h2>{[...cycles].sort((a, b) => b.date.localeCompare(a.date)).map(record => <div key={record.id}><time>{record.date}</time><strong>{record.title}</strong><button className="delete-entry-button" aria-label={`删除记录：${record.title} ${record.date}`} title="删除记录" disabled={deletingEntryId === record.id} onClick={() => deleteEntry(record, `${record.title} · ${record.date}`)}><Trash2 size={15} /></button></div>)}</section>}
        </PageHeader>}

        {page === 'games' && <PageHeader eyebrow="A LITTLE SPARK BETWEEN US" title="心动小游戏" subtitle="不管第几次心动，都想再和你玩一次。"><div className="games-page"><section className="game-feature"><div><span className="eyebrow">JUST FOR TWO</span><h2>把心动翻成一对</h2><p>翻开小卡片，看看我们有多合拍。<br />每找到一对，就多收藏一个小小开心。</p><button className="primary-button" onClick={playGame}>开始默契翻牌 <ChevronRight size={15} /></button></div><div className="game-tile-art"><span>♡</span><span>✿</span><span>☆</span><span>♫</span></div></section><div className="game-secondary"><div className="game-small-card"><span className="eyebrow">QUESTION FOR TWO</span><h3>今天的心动问答</h3><p>今天最想和 TA 一起做什么？看看彼此的答案。</p><button className="subtle-link" onClick={() => setModal('quiz')}>开始回答 <ChevronRight size={13} /></button></div><div className="game-small-card quiz-doodle"><span className="eyebrow">A TINY CHALLENGE</span><h3>猜猜我在想什么</h3><p>{!guessChallenge ? '给对方一个小提示，看看 TA 能不能猜中。' : guessResponse ? `${isGuessAuthor ? 'TA 的猜测' : '你的猜测'}：${guessResponse.guess}` : isGuessAuthor ? '题目已发出，等 TA 来猜。' : guessChallenge.clue}</p><button className="subtle-link" onClick={() => setModal('guess')}>{!guessChallenge ? '出一道题' : guessResponse ? '查看结果' : isGuessAuthor ? '查看题目' : '开始猜测'} <ChevronRight size={13} /></button><span className="quiz-heart">♡</span></div></div></div></PageHeader>}
        {page === 'trash' && <PageHeader eyebrow="A LITTLE TIME TO CHANGE YOUR MIND" title="回收站" subtitle="移入回收站的内容会保留 7 天，期间你们都可以恢复。"><div className="trash-list">{!trashEntries.length && <p className="empty-state">回收站还是空的，重要的回忆都安安稳稳地在原处。</p>}{trashEntries.map(entry => { const title = entry.title || entry.name || '未命名记录'; const expiresAt = new Date(new Date(entry.deleted_at).getTime() + 7 * 24 * 60 * 60 * 1000); const typeLabel = entry.game === 'memory-match' ? '小游戏成绩' : ({ note: '日常', whisper: '悄悄话', memory: '回忆', todo: '共同愿望', place: '地点', cycle: '贴心记录', event: '问答', anniversary: '约会 / 纪念日' })[entry.type] || '记录'; return <article className="trash-item" key={entry.id}>{entry.photo_url && <img src={entry.photo_url} alt="" />}<div className="trash-copy"><span className="mood-pill">{typeLabel}</span><h2>{title}</h2>{(entry.body || entry.text || entry.note || entry.answer) && <p>{entry.body || entry.text || entry.note || entry.answer}</p>}<small>预计清空：{expiresAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><div className="trash-actions"><button className="outline-button" disabled={deletingEntryId === entry.id} onClick={() => restoreEntry(entry)}>恢复</button><button className="delete-entry-button" aria-label={`彻底删除：${title}`} title="彻底删除" disabled={deletingEntryId === entry.id} onClick={() => permanentlyDeleteEntry(entry)}><Trash2 size={15} /></button></div></article>; })}</div></PageHeader>}
      </main>
      <LiveLocationMap active={page === 'map' && mapTab === 'realtime'} ownLocation={ownLocation} partnerLocation={partnerLocation} ownLabel={`${currentAccountName}（当前账号）`} partnerLabel={partnerAccountName} focusRequest={mapFocusRequest} />
      {page === 'map' && mapTab === 'realtime' && <div className="location-status-strip"><span><i className={ownLocationUpdatedAt ? 'online-dot' : 'offline-dot'} /> 我的定位：{ownLocationUpdatedAt ? formatUpdatedAt(ownLocationUpdatedAt, clockNow) : '尚未分享'}</span><span><i className={partnerLocation?.updated_at ? 'online-dot' : 'offline-dot'} /> TA 的定位：{partnerLocation?.updated_at ? formatUpdatedAt(partnerLocation.updated_at, clockNow) : '尚未分享'}</span><button className="outline-button" onClick={() => setMapFocusRequest(value => value + 1)}><MapPin size={14} /> 定位到双方</button></div>}
      <PlacesLocationMap active={page === 'map' && mapTab === 'places'} places={places} />
      <footer className="page-footer"><span>我们的小宇宙 <Heart size={12} fill="currentColor" /> 只属于你和我</span><span>把喜欢，写进每一天。</span></footer>
    </div>

    <nav className="mobile-tabs">{[...navItems.slice(0, 5), navItems.find(item => item.id === 'trash')].map(item => { const Icon = item.icon; return <button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => go(item.id)}><Icon size={18} /><small>{item.label}</small></button>; })}</nav>

    {modal === 'calendar-event' && <Modal title={editingCalendarEvent ? '修改这个日子' : '记住一个重要的日子'} subtitle="把期待写下来，等它一天一天靠近。" onClose={() => { if (!calendarSaving) { setModal(''); setEditingCalendarEvent(null); } }}>
      <form className="countdown-form" onSubmit={event => { event.preventDefault(); addCalendarEvent(event.currentTarget); }}>
        <fieldset disabled={calendarSaving}>
          <label>这一天的名字<input autoFocus required maxLength={80} value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="比如：然然的生日" /></label>
          <label>类型<select value={calendarEventKind} onChange={event => changeCalendarEventKind(event.target.value)}>
            <option value="date">特别的日子（单次）</option><option value="anniversary">纪念日（每年）</option><option value="valentines">情人节（每年 2 月 14 日）</option><option value="qixi">七夕（农历七月初七）</option><option value="birthday">生日（每年）</option>
          </select></label>
          {calendarEventKind === 'birthday' && <label>生日历法<select value={birthdayCalendar} onChange={event => setBirthdayCalendar(event.target.value)}><option value="solar">阳历生日</option><option value="lunar">农历生日</option></select></label>}
          {calendarEventKind === 'birthday' && birthdayCalendar === 'lunar' ? <>
            <div className="lunar-birthday-fields">
              <label>农历月份<select value={lunarBirthdayMonth} onChange={event => setLunarBirthdayMonth(event.target.value)}>{lunarMonthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
              <label>农历日期<select value={lunarBirthdayDay} onChange={event => setLunarBirthdayDay(event.target.value)}>{lunarDayNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
            </div>
            <label>月份类型<select value={lunarBirthdayLeap ? 'leap' : 'regular'} onChange={event => setLunarBirthdayLeap(event.target.value === 'leap')}><option value="regular">普通月份</option><option value="leap">闰月生日</option></select></label>
            <p className="form-note">每年自动换算公历日期；三十日遇小月按廿九计算。{lunarBirthdayLeap && '没有对应闰月的年份，按同名普通月份计算。'}</p>
            {(() => { const next = getCountdownOccurrence({ eventKind: 'birthday', calendarSystem: 'lunar', date: calendarEventDate, lunarMonth: lunarBirthdayMonth, lunarDay: lunarBirthdayDay, lunarLeap: lunarBirthdayLeap }, todayInput); return next && <p className="birthday-date-preview" aria-live="polite">下一次生日：{formatDate(next.date)}<strong>{next.days === 0 ? '就是今天' : `还有 ${next.days} 天`}</strong></p>; })()}
          </> : <label>{calendarEventKind === 'birthday' ? '生日日期（阳历）' : '日期'}<input required type="date" name="eventDate" value={calendarEventDate} readOnly={calendarEventKind === 'valentines' || calendarEventKind === 'qixi'} onChange={event => setCalendarEventDate(event.target.value)} /></label>}
          {calendarEventKind === 'birthday' && birthdayCalendar === 'solar' && <p className="form-note">每年按阳历月日计算。2 月 29 日生日遇平年按 2 月 28 日计算。</p>}
          {calendarEventKind === 'qixi' && <p className="form-note">每年按农历七月初七自动换算公历日期。</p>}
          {calendarEventKind === 'valentines' && <p className="form-note">已固定为每年 2 月 14 日。</p>}
          <label>留句话<textarea value={newText} onChange={event => setNewText(event.target.value)} placeholder="记下那天想一起做的事。" rows="3" /></label>
        </fieldset>
        {calendarError && <p className="form-error" role="alert">{calendarError}</p>}
        <button className="primary-button" type="submit" disabled={calendarSaving}>{calendarSaving ? '正在保存…' : editingCalendarEvent ? '保存修改' : '保存这个日子'} <Heart size={15} /></button>
      </form>
    </Modal>}
    {modal === 'diary' && <Modal title="写下今天的小美好" subtitle="晴天雨天，都想和你一起记住。" onClose={() => setModal('')}><form onSubmit={e => { e.preventDefault(); addNote('diary'); }}><label>给今天起个名字<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="比如：和你一起散步的傍晚" /></label><label>写一点今天<textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="今天发生了什么？有什么想和对方分享的小事……" rows="5" /></label><button className="primary-button" type="submit">保存这篇日记 <Heart size={15} /></button></form></Modal>}
    {modal === 'whisper' && <Modal title="有些话，只想说给你听" subtitle="留一小句话，给此刻的我们。" onClose={() => setModal('')}><form onSubmit={e => { e.preventDefault(); addNote('whisper'); }}><label>你的悄悄话<textarea autoFocus value={newText} onChange={e => setNewText(e.target.value)} placeholder="今天，有什么想对 TA 说的？" rows="5" /></label><button className="primary-button" type="submit">把心意送给 TA <Heart size={15} /></button></form></Modal>}
    {modal === 'memory' && <Modal title="收藏一个闪闪发光的瞬间" subtitle="以后回头看，一定还会觉得很甜。" onClose={() => { if (!photoSaving) { setModal(''); setMemoryAlbumDraft('未分类'); } }}><form onSubmit={e => { e.preventDefault(); addMemory(); }}><label>这段回忆的名字<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="比如：第一次一起看海" /></label><label>相册文件夹（输入新名称即可创建）<input list="memory-albums" maxLength={48} value={memoryAlbumDraft} onChange={e => setMemoryAlbumDraft(e.target.value)} placeholder="比如：一起旅行" /><datalist id="memory-albums">{memoryAlbums.map(album => <option key={album} value={album} />)}</datalist></label><label>记下这个瞬间<textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="那天的天气、你说的话，还有我偷偷记住的小细节……" rows="4" /></label><PhotoAttachment preview={photoPreview} saving={photoSaving} error={photoError} onSelect={selectPhoto} onRemove={removePhoto} /><button className="primary-button" type="submit" disabled={photoSaving}>{photoSaving ? "正在处理照片…" : "收藏这段回忆"} <Heart size={15} /></button></form></Modal>}
    {modal === 'memory-album' && <Modal title="新增回忆分类" subtitle="先建好分类，再把喜欢的瞬间放进去。" onClose={() => { if (!memoryAlbumSaving) setModal(''); }}><form onSubmit={addMemoryAlbum}><label>分类名称<input autoFocus maxLength={48} value={newMemoryAlbum} onChange={event => { setNewMemoryAlbum(event.target.value); setMemoryAlbumError(''); }} placeholder="比如：一起旅行" /></label>{memoryAlbumError && <p className="form-error">{memoryAlbumError}</p>}<button className="primary-button" type="submit" disabled={memoryAlbumSaving}>{memoryAlbumSaving ? '正在保存…' : '新增分类'} <Plus size={15} /></button></form></Modal>}
    {modal === 'place' && <Modal title="记下我们去过的地方" subtitle="下次路过这里，再一起想起那一天。" onClose={() => setModal('')}><form onSubmit={e => { e.preventDefault(); addPlace(); }}><label>地点名字<input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="比如：第一次约会的咖啡店" /></label><label>经纬度（选填）<div className="coordinate-fields"><input aria-label="纬度" type="number" min="-90" max="90" step="any" value={placeLatitude} onChange={e => setPlaceLatitude(e.target.value)} placeholder="纬度" /><input aria-label="经度" type="number" min="-180" max="180" step="any" value={placeLongitude} onChange={e => setPlaceLongitude(e.target.value)} placeholder="经度" /></div></label><div className="place-picker-tools"><span className="form-note">点击地图放置标记，或自动定位当前地点。</span><button type="button" className="quiet-add" onClick={chooseCurrentPlace}><MapPin size={13} /> 使用当前位置</button></div><PlaceCoordinatePicker latitude={placeLatitude} longitude={placeLongitude} onPick={(lat, lng) => { setPlaceLatitude(lat.toFixed(6)); setPlaceLongitude(lng.toFixed(6)); setPlaceLocationMessage("已在地图上选好位置。"); }} /><p className="form-note">{placeLocationMessage || (placeLatitude && placeLongitude ? `${placeLatitude}, ${placeLongitude}` : "也可以手动调整下方经纬度。")}</p><PhotoAttachment preview={photoPreview} saving={photoSaving} error={photoError} onSelect={selectPhoto} onRemove={removePhoto} /><label>这地方有什么特别<textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="记下当天的小故事……" rows="3" /></label><button className="primary-button" type="submit" disabled={photoSaving}>{photoSaving ? "正在处理照片…" : "收藏这个地点"} <Heart size={15} /></button></form></Modal>}
    {modal === 'todo' && <Modal title="写下以后要一起做的事" subtitle="一个小小愿望，也值得认真期待。" onClose={() => setModal('')}><form onSubmit={e => { e.preventDefault(); addTodo(); }}><label>我们的愿望<input autoFocus value={newText} onChange={e => setNewText(e.target.value)} placeholder="比如：一起去看一次流星雨" /></label><button className="primary-button" type="submit">放进愿望清单 <Plus size={15} /></button></form></Modal>}
    {modal === 'settings' && <Modal title="设置我们的小宇宙" subtitle="把重要的日子，认真放在心上。" onClose={() => setModal('')}><form onSubmit={async e => { e.preventDefault(); const value = e.currentTarget.elements.startDate.value; if (value) { setDayZero(value); if (!isDemo && couple?.id) { const { error } = await supabase.from('couples').update({ relationship_date: value }).eq('id', couple.id); if (error) setLocationError(explainError(error)); else setCouple({ ...couple, relationship_date: value }); } } setModal(''); }}><label>恋爱开始的日子<input type="date" name="startDate" defaultValue={dayZero} /></label><button className="primary-button" type="submit">保存我们的日期 <Heart size={15} /></button></form></Modal>}
    {modal === 'pairing-settings' && <Modal title="你们的小宇宙" subtitle="两个人的账号，连在同一个空间里。" onClose={() => setModal('')}><div className="pair-settings">{members.map((member, index) => { const name = accountName(member); const isCurrent = isDemo ? index === 0 : member.user_id === session?.user?.id; return <div key={member.user_id || index}><span className={`avatar ${isCurrent ? 'avatar-you' : 'avatar-her'}`}>{Array.from(name)[0] || '？'}</span><strong>{name}</strong><span className="member-status">{isCurrent ? '当前账号' : '伴侣账号'}</span></div>; })}{members.length < 2 && <><p>分享配对码，让 TA 加入你们的空间。</p><strong className="pair-settings-code">{currentInvite || inviteCode}</strong><button className="outline-button copy-code" onClick={async () => { try { await navigator.clipboard.writeText(currentInvite || inviteCode); } catch {} }}>复制配对码 <Copy size={14} /></button></>}</div></Modal>}
    {modal === 'music' && <Modal title="放一首属于我们的歌" subtitle="选一首歌，放在你们共同的小宇宙里。" onClose={() => { setModal(''); setMusicMessage(''); }}><label className="file-picker">{musicSaving ? '正在上传…' : '选择音频文件'}<input type="file" accept="audio/*" disabled={musicSaving} onChange={e => selectMusic(e.target.files?.[0])} /></label><p className="form-note"><Music2 size={16} /> {!isDemo ? '音频会私密保存在情侣空间，单个文件最大 20 MB。' : '演示模式下，音频只保存在当前浏览器。'}</p>{songUrl && <button className="delete-music-button" type="button" onClick={removeMusic}><Trash2 size={14} /> 移除这首歌</button>}{musicMessage && <p className="location-message">{musicMessage}</p>}</Modal>}
    {modal === 'location' && <Modal title="开启我们的地图" subtitle="等双方设备授权后，才能在地图上看见彼此。" onClose={() => setModal('')}><div className="location-preview"><MapPin size={25} /><p>把此刻的位置分享给 TA</p><span>双方在自己的设备开启定位后，就能在地图上互相看见。</span></div><button className="primary-button full-button" onClick={() => { setModal(''); setPage('map'); setMapTab('realtime'); }}>去实时位置 <Heart size={15} /></button></Modal>}
    {modal === 'cycle' && <Modal title="记下今天的状态" subtitle="温柔记录身体的节奏，也记得照顾自己。" onClose={() => setModal('')}><form onSubmit={e => { e.preventDefault(); addCycle(e.currentTarget.elements.cycleDate.value, e.currentTarget.elements.cycleStatus.value); }}><label>记录日期<input type="date" name="cycleDate" defaultValue={toLocalDateInput(new Date())} /></label><label>状态<select name="cycleStatus" defaultValue="period"><option value="period">经期开始</option><option value="symptom">身体状态</option><option value="note">备注</option></select></label><button className="primary-button" type="submit">保存记录 <Heart size={15} /></button></form></Modal>}
    {modal === 'game' && <Modal title={matched.length === 12 ? '默契满分！' : '把心动翻成一对'} subtitle={matched.length === 12 ? '每一份喜欢，都刚好成双成对。' : '翻开两张小卡片，看看能不能把心动配成一对。'} onClose={() => setModal('')}><div className="memory-game">{gameSymbols.map((symbol, i) => <button key={i} className={flipped.includes(i) || matched.includes(i) ? 'revealed' : ''} onClick={() => tapCard(i)}>{flipped.includes(i) || matched.includes(i) ? symbol : <Heart size={17} />}</button>)}</div><p className="game-hint">{matched.length / 2} / 6 对已配好 · 翻牌 {gameMoves} 次</p>{matched.length === gameSymbols.length && <p className="game-save-status">{gameSaving ? '正在保存你们的共同成绩…' : gameError ? gameError : '成绩已保存到你们的空间。'}</p>}<button className="outline-button full-button" onClick={playGame}>再玩一次 ↻</button><div className="game-result-history"><span className="eyebrow">共同成绩</span>{gameResults.length ? gameResults.slice(0, 3).map(result => { const player = members.find(member => member.user_id === result.created_by); return <div key={result.id}><strong>{player?.nickname || (result.created_by === 'demo' ? '你' : 'TA')}</strong><span>{result.moves} 次翻牌 · {new Date(result.completed_at || Date.now()).toLocaleDateString('zh-CN')}</span><button className="delete-entry-button" aria-label="删除这条游戏成绩" title="移入回收站" disabled={deletingEntryId === result.id} onClick={() => deleteEntry({ ...result, type: 'event', game: 'memory-match' }, '这条游戏成绩', 'event')}><Trash2 size={13} /></button></div>; }) : <p>完成一局后，成绩会留在这里。</p>}</div></Modal>}
    {modal === 'quiz' && <Modal title="今天的心动问答" subtitle="先保存自己的答案，再一起揭晓彼此的选择。" onClose={() => { setModal(''); setQuizError(''); }}>
      <div className="quiz-answers">{['一起吃顿好吃的', '散步聊聊天', '窝在家里看电影'].map(answer => <button key={answer} className={quizChoice === answer ? 'answer-picked' : ''} onClick={() => { setQuizChoice(answer); setQuizError(''); }}>{answer}</button>)}</div>
      {quizError && <p className="form-error">{quizError}</p>}
      <button className="primary-button full-button" disabled={quizSaving} onClick={submitQuizChoice}>{quizSaving ? '保存中…' : '保存我的答案'} <Heart size={14} /></button>
      <div className="quiz-shared-results"><span className="eyebrow">今天的回答</span>{members.map((member, index) => {
        const playerId = member.user_id || (index ? 'demo-partner' : 'demo');
        const response = quizEntries.find(entry => entry.question_id === todayInput && entry.created_by === playerId);
        const isCurrent = playerId === currentUserId;
        const answer = response ? (isCurrent || viewerQuizAnswer ? response.answer : '回答后揭晓') : '还没回答';
        const memberLabel = isDemo ? (index ? '她' : '你') : `${member.nickname || (isCurrent ? '当前账号' : '伴侣账号')}（${isCurrent ? '我' : 'TA'}）`;
        return <div className="quiz-result-row" key={member.user_id || index}><strong>{memberLabel}</strong><span>{answer}</span>{response && isCurrent && <button className="delete-entry-button" aria-label={`删除回答：${response.answer}`} title="删除回答" disabled={deletingEntryId === response.id} onClick={() => deleteEntry(response, response.answer, 'event')}><Trash2 size={13} />删除</button>}</div>;
      })}</div>
    </Modal>}
    {modal === 'guess' && <Modal title="猜猜我在想什么" subtitle="给 TA 一条提示，看看能不能猜中你的心思。" onClose={() => { setModal(''); setGuessError(''); }}>
      {!guessChallenge && <form onSubmit={event => { event.preventDefault(); submitGuessChallenge(); }}>
        <label>给 TA 的提示<textarea autoFocus maxLength={160} rows="3" value={guessClue} onChange={event => { setGuessClue(event.target.value); setGuessError(''); }} placeholder="比如：我们上次一起吃的那道菜……" /></label>
        <label>正确答案<input maxLength={80} value={guessAnswer} onChange={event => { setGuessAnswer(event.target.value); setGuessError(''); }} placeholder="先保密，猜完再揭晓" /></label>
        {guessError && <p className="form-error" role="alert">{guessError}</p>}
        <button className="primary-button" type="submit" disabled={guessSaving}>{guessSaving ? '正在出题…' : '把题目发给 TA'} <Heart size={14} /></button>
      </form>}
      {guessChallenge && <div className="guess-game-state">
        <p className="eyebrow">{isGuessAuthor ? '你的题目' : `${accountName(members.find(member => member.user_id === guessChallenge.created_by))} 出的题`}</p>
        <blockquote>{guessChallenge.clue}</blockquote>
        {isGuessAuthor && !guessResponse && <p className="game-hint">题目已发出，等 TA 来猜。猜测提交后才能揭晓答案。</p>}
        {!isGuessAuthor && !guessResponse && <form onSubmit={event => { event.preventDefault(); submitGuessResponse(); }}>
          <label>你的猜测<input autoFocus maxLength={80} value={guessDraft} onChange={event => { setGuessDraft(event.target.value); setGuessError(''); }} placeholder="写下你觉得的答案" /></label>
          {guessError && <p className="form-error" role="alert">{guessError}</p>}
          <button className="primary-button" type="submit" disabled={guessSaving}>{guessSaving ? '正在提交…' : '提交猜测'} <ChevronRight size={14} /></button>
        </form>}
        {guessResponse && <div className="guess-result"><p><strong>{isGuessAuthor ? 'TA 的猜测' : '你的猜测'}</strong>：{guessResponse.guess}</p><p><strong>正确答案</strong>：{guessChallenge.answer}</p><span className={isCorrectGuess ? 'guess-result-correct' : 'guess-result-try-again'}>{isCorrectGuess ? '猜对啦，真有默契。' : '差一点点，下次再来。'}</span></div>}
        {isGuessAuthor && !guessResponse && <p className="game-hint">你出的题：{guessChallenge.answer}</p>}
      </div>}
    </Modal>}
  </div>;
}

function PageHeader({ eyebrow, title, subtitle, action, children }) {
  return <><div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>{children}</>;
}

createRoot(document.getElementById('root')).render(<App />);
