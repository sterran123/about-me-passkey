// ===== API 주소 설정 =====
// Deno Deploy에 올린 서버 주소. 배포 후 실제 주소로 채운다.
window.API_BASE = 'https://pds-passkey.sterran123.deno.net';
// 로컬 개발(Deno)에서는 같은 출처를 쓴다
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  window.API_BASE = 'http://localhost:8000';
