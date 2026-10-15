/** React Router basename from Vite's base ("/inharmonia/" → "/inharmonia"). Set in config/site.ts. */
export const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
