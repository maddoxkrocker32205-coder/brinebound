// A stand-in for the artifact room capability, for tests. Presence only (the game uses nothing else).
// Messages leave through window.__mockOut (a Playwright binding) and arrive through window.__mockIn.
(() => {
  const PEER = 'p' + Math.random().toString(36).slice(2, 12);
  const enc = new TextEncoder();
  const rooms = new Map();
  const send = (m) => { try { window.__mockOut(JSON.stringify(m)); } catch (e) { /* binding not ready */ } };
  window.__mockPeer = PEER;
  window.__mockStats = { sent: 0, maxBytes: 0, rejected: 0 };
  window.__mockIn = (s) => { const m = JSON.parse(s); const r = rooms.get(m.room); if (r) r.recv(m); };

  class RoomImpl {
    constructor(name) {
      this.name = name; this.mine = {}; this.others = new Map(); this.lis = new Set();
      this.dirty = { joined: [], left: [], updated: [] }; this.sched = false;
      this.myPeer = this.makePeer(PEER, {}, true);
      this.rebuild();
    }
    makePeer(peer, presence, me) {
      return Object.freeze({ peer, by: null, isMe: me, sameTab: me, kind: 'viewer', guest: false, presence: Object.freeze(presence), updatedAt: Date.now() });
    }
    rebuild() { this.snap = Object.freeze([this.myPeer, ...this.others.values()]); }
    schedule() {
      if (this.sched) return;
      this.sched = true;
      setTimeout(() => {
        this.sched = false;
        const ch = { peers: this.snap, joined: this.dirty.joined, left: this.dirty.left, updated: this.dirty.updated };
        this.dirty = { joined: [], left: [], updated: [] };
        for (const f of this.lis) { try { f(ch); } catch (e) { console.error(e); } }
      }, 16);
    }
    recv(m) {
      if (m.peer === PEER) return;
      if (m.kind === 'pres') {
        const had = this.others.has(m.peer);
        const p = this.makePeer(m.peer, m.presence, false);
        this.others.set(m.peer, p); this.rebuild();
        (had ? this.dirty.updated : this.dirty.joined).push(p);
        this.schedule();
      } else if (m.kind === 'hello') {
        send({ kind: 'pres', room: this.name, peer: PEER, presence: this.mine });
      } else if (m.kind === 'bye') {
        const p = this.others.get(m.peer);
        if (p) { this.others.delete(m.peer); this.rebuild(); this.dirty.left.push(p); this.schedule(); }
      }
    }
    api(lobby) {
      const self = this;
      const o = {
        name: this.name,
        presence(patch) {
          const merged = { ...self.mine };
          for (const [k, v] of Object.entries(patch)) { if (v === null) delete merged[k]; else merged[k] = v; }
          const bytes = enc.encode(JSON.stringify(merged)).length;
          if (bytes > 4096) { window.__mockStats.rejected++; return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB: ' + bytes }); }
          self.mine = JSON.parse(JSON.stringify(merged));
          self.myPeer = self.makePeer(PEER, self.mine, true); self.rebuild();
          self.dirty.updated.push(self.myPeer); self.schedule();
          send({ kind: 'pres', room: self.name, peer: PEER, presence: self.mine });
          window.__mockStats.sent++; window.__mockStats.maxBytes = Math.max(window.__mockStats.maxBytes, bytes);
          return Promise.resolve();
        },
        peers() { return self.snap; },
        onPeers(fn) { self.lis.add(fn); setTimeout(() => fn({ peers: self.snap, joined: self.snap, left: [], updated: [] }), 0); return () => self.lis.delete(fn); },
        connected() { return true; },
        onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
        emit() { return Promise.resolve(); },
        on() { return () => {}; },
        leave() { send({ kind: 'bye', room: self.name, peer: PEER }); rooms.delete(self.name); return Promise.resolve(); },
      };
      if (lobby) {
        o.join = (name) => {
          if (window.__mockNoRooms) return Promise.reject({ code: 'not_permitted', message: 'no named rooms' });
          if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) return Promise.reject({ code: 'invalid_argument', message: 'bad name' });
          let r = rooms.get(name);
          if (!r) { r = new RoomImpl(name); rooms.set(name, r); send({ kind: 'hello', room: name, peer: PEER }); }
          return Promise.resolve(Object.freeze(r.api(false)));
        };
      }
      return o;
    }
  }
  // like the platform, the latest presence always gets through in the end, even when single updates drop
  setInterval(() => { for (const r of rooms.values()) if (Object.keys(r.mine).length) send({ kind: 'pres', room: r.name, peer: PEER, presence: r.mine }); }, 1500);
  const lobby = new RoomImpl('');
  rooms.set('', lobby);
  const lobbyApi = Object.freeze(lobby.api(true));
  setTimeout(() => send({ kind: 'hello', room: '', peer: PEER }), 0);
  window.claude = { use: async (name) => (name === 'room' ? lobbyApi : null) };
  addEventListener('pagehide', () => { for (const r of rooms.values()) send({ kind: 'bye', room: r.name, peer: PEER }); });
})();
