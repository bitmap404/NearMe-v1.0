/* NearMe website login: Telegram OIDC authorization code + PKCE.
 * Client secret and Telegram token NEVER exist in this GitHub Pages file.
 * Server verifies Telegram ID token signature before issuing an opaque session.
 */
(() => {
  'use strict';
  const SESSION_KEY = 'nearme-telegram-web-session-v1';
  const ATTEMPT_KEY = 'nearme-telegram-oidc-pkce-v1';
  const AUTH_ENDPOINT = 'https://oauth.telegram.org/auth';
  const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const random = size => encode(crypto.getRandomValues(new Uint8Array(size)));
  const getToken = () => { try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } };
  const clearToken = () => { try { localStorage.removeItem(SESSION_KEY); } catch {} };
  const storeToken = token => { localStorage.setItem(SESSION_KEY, token); };

  async function beginLogin(apiBase) {
    if (!apiBase || !apiBase.startsWith('https://')) throw Error('Backend HTTPS URL is missing from config.js');
    if (!crypto?.subtle) throw Error('Secure browser required to log in');
    const response = await fetch(`${apiBase}/api/auth/config`, {cache:'no-store'});
    if (!response.ok) throw Error('Could not contact the NearMe login service');
    const cfg = await response.json();
    if (!cfg.enabled || !/^\d+$/.test(String(cfg.client_id))) {
      throw Error('Telegram Login is not configured. Ask the NearMe administrator to set the BotFather Login Widget credentials.');
    }
    const redirect = new URL(cfg.redirect_uri);
    if (redirect.protocol !== 'https:' || redirect.origin !== location.origin || redirect.pathname !== location.pathname) {
      throw Error('This website does not match the login URL configured by the NearMe administrator');
    }
    const verifier = random(32); // 43-character RFC 7636 verifier
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = encode(new Uint8Array(digest));
    const state = random(32);
    const nonce = random(32);
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({state, verifier, nonce, created:Date.now()}));
    const url = new URL(AUTH_ENDPOINT);
    url.search = new URLSearchParams({client_id:String(cfg.client_id), redirect_uri:cfg.redirect_uri,
      response_type:'code', scope:'openid profile', state,
      code_challenge:challenge, code_challenge_method:'S256', nonce}).toString();
    location.assign(url.toString());
  }

  async function finishRedirect(apiBase) {
    const params = new URLSearchParams(location.search);
    if (!params.has('code') && !params.has('error')) return {handled:false};
    // Remove authorization code and state from the address/history immediately.
    const clean = new URL(location.href);
    for (const key of ['code', 'state', 'error', 'error_description']) clean.searchParams.delete(key);
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    let attempt;
    try { attempt = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null'); }
    catch { attempt = null; }
    sessionStorage.removeItem(ATTEMPT_KEY);
    if (params.has('error')) throw Error('Telegram authorization was cancelled or denied');
    if (!attempt || !attempt.state || attempt.state !== params.get('state') ||
        !Number.isFinite(attempt.created) || Date.now() - attempt.created > 10 * 60 * 1000) {
      throw Error('The Telegram login attempt expired. Please try again.');
    }
    const response = await fetch(`${apiBase}/api/auth/exchange`, {
      method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
      body:JSON.stringify({code:params.get('code'), code_verifier:attempt.verifier, nonce:attempt.nonce})
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw Error(typeof data.detail === 'string' ? data.detail : 'Telegram login could not be verified');
    }
    const result = await response.json();
    if (!result.session_token || !result.user || !result.user.id) throw Error('NearMe login response was invalid');
    storeToken(result.session_token);
    return {handled:true, user:result.user};
  }

  window.NearMeWebLogin = {beginLogin, finishRedirect, getToken, clearToken};
})();
