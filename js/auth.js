/* Atlas — account and ManageBac connection.
 *
 * Two connection modes:
 *
 *   demo  — a local profile. No network, no credentials. The mock feed in
 *           js/managebac.js supplies assignments. This is what runs today.
 *
 *   live  — a real sign-in against *your own connector*: a small server you
 *           host that holds the ManageBac session and exposes two routes.
 *           ManageBac publishes no public student-facing auth endpoint, so a
 *           browser cannot sign a student in directly — a server-side
 *           connector is the only honest way to do this.
 *
 *             POST {base}/session      { school, email, password }
 *                                   -> { token, displayName? }
 *             GET  {base}/assignments  Authorization: Bearer <token>
 *                                   -> ManageBac-shaped assignment records
 *
 * Credential handling, deliberately:
 *   - The password is never written to localStorage, never logged, and is
 *     cleared from the form the moment the request is issued.
 *   - The returned token goes to sessionStorage, so it dies with the browser
 *     session rather than sitting on disk.
 *   - Password sign-in stays disabled until a connector base URL is set, so
 *     nobody can type a real school password into a field that goes nowhere.
 */
(function (global) {
  'use strict';

  var U = global.Atlas.util;
  var store = global.Atlas.store;

  var KEY_SESSION = 'atlas.session.v1';
  var KEY_TOKEN = 'atlas.token.v1';      // sessionStorage only

  var session = null;

  /* ---------------------------------------------------------- persistence */

  function load() {
    try {
      var raw = localStorage.getItem(KEY_SESSION);
      session = raw ? JSON.parse(raw) : null;
    } catch (e) {
      session = null;
    }
    return session;
  }

  function save() {
    try {
      if (session) localStorage.setItem(KEY_SESSION, JSON.stringify(session));
      else localStorage.removeItem(KEY_SESSION);
    } catch (e) {
      console.warn('[atlas] could not persist the session', e);
    }
  }

  function token() {
    try { return sessionStorage.getItem(KEY_TOKEN); } catch (e) { return null; }
  }

  function setToken(value) {
    try {
      if (value) sessionStorage.setItem(KEY_TOKEN, value);
      else sessionStorage.removeItem(KEY_TOKEN);
    } catch (e) { /* private mode — the session simply will not survive a reload */ }
  }

  /* --------------------------------------------------------------- state */

  function isConnected() { return !!(session && session.connected); }
  function mode() { return session ? session.mode : null; }
  function current() { return session; }

  function connectorBase() {
    return (store.state.settings.connectorBase || '').trim().replace(/\/+$/, '');
  }

  function hasConnector() { return !!connectorBase(); }

  /** Normalise whatever the student typed into a bare ManageBac host. */
  function normaliseSchool(input) {
    var s = String(input || '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (s.indexOf('.') === -1) s += '.managebac.com';
    return s;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  /* ------------------------------------------------------------- connect */

  /** Local profile, mock feed. Resolves with the new session. */
  function connectDemo(profile) {
    var name = String((profile && profile.displayName) || '').trim();
    if (!name) throw new Error('Enter the name you want Atlas to greet you by.');

    session = {
      connected: true,
      mode: 'demo',
      displayName: name.slice(0, 60),
      email: String((profile && profile.email) || '').trim().slice(0, 120),
      school: 'demo.managebac.com',
      connectedAt: new Date().toISOString()
    };
    setToken(null);
    save();
    return Promise.resolve(session);
  }

  /**
   * Sign in through the configured connector.
   * @param {{school:string, email:string, password:string}} creds
   */
  function connectLive(creds) {
    var base = connectorBase();
    if (!base) return Promise.reject(new Error('Set a connector URL first — Atlas will not send a password to a server you have not named.'));

    var school = normaliseSchool(creds.school);
    if (!school) return Promise.reject(new Error('Enter your school’s ManageBac address, e.g. myschool.managebac.com'));
    if (!validEmail(creds.email)) return Promise.reject(new Error('That does not look like an email address.'));
    if (!creds.password) return Promise.reject(new Error('Enter your ManageBac password.'));

    var body = JSON.stringify({ school: school, email: String(creds.email).trim(), password: creds.password });
    creds.password = '';                    // drop our own copy immediately

    return fetch(base + '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      credentials: 'omit'
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error('ManageBac rejected those details.');
      if (!res.ok) throw new Error('The connector answered ' + res.status + '.');
      return res.json();
    }).then(function (data) {
      if (!data || !data.token) throw new Error('The connector did not return a session token.');
      setToken(data.token);
      session = {
        connected: true,
        mode: 'live',
        displayName: String(data.displayName || creds.email.split('@')[0]).slice(0, 60),
        email: String(creds.email).trim().slice(0, 120),
        school: school,
        connectedAt: new Date().toISOString()
      };
      save();
      return session;
    }).catch(function (err) {
      /* A network-level failure is the common case while no connector is
         running; say so plainly instead of leaking a stack trace. */
      if (err instanceof TypeError) throw new Error('Could not reach the connector at ' + base + '.');
      throw err;
    });
  }

  function disconnect(options) {
    session = null;
    setToken(null);
    save();
    /* Assignments stay put by default — losing a term of homework because you
       signed out would be a nasty surprise. */
    if (options && options.forgetAssignments) {
      store.state.assignments = store.all().filter(function (a) { return a.source !== 'managebac'; });
      store.state.lastSyncAt = null;
      store.state.syncCursor = 0;
      store.emit();
    }
  }

  function setConnectorBase(url) {
    store.setSettings({ connectorBase: String(url || '').trim() });
  }

  /** Short label for the sidebar chip. */
  function statusLine() {
    if (!isConnected()) return 'Not connected';
    return (session.mode === 'demo' ? 'Demo · ' : '') + session.school;
  }

  global.Atlas.auth = {
    load: load,
    current: current,
    isConnected: isConnected,
    mode: mode,
    token: token,
    connectorBase: connectorBase,
    hasConnector: hasConnector,
    setConnectorBase: setConnectorBase,
    normaliseSchool: normaliseSchool,
    validEmail: validEmail,
    connectDemo: connectDemo,
    connectLive: connectLive,
    disconnect: disconnect,
    statusLine: statusLine
  };
})(window);
