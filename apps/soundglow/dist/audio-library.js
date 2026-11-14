// SPDX-License-Identifier: GPL-3.0-or-later
(function (scope) {
  'use strict';
  const DB_NAME = 'soundglow-audio-library';
  const request = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  class AudioLibraryStore {
    static async open() {
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');
        if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'id' }).createIndex('fileId', 'fileId');
      };
      const db = await request(r);
      db.onversionchange = () => db.close();
      return new AudioLibraryStore(db);
    }
    constructor(db) { this.db = db; }
    async transaction(stores, action, mode = 'readwrite') {
      const tx = this.db.transaction(stores, mode);
      let failure;const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = event => {failure=event.target?.error;}; tx.onabort = () => reject(tx.error || failure || Error('Audio storage was interrupted.')); });
      let result;
      try { result = action(tx); } catch (error) { tx.abort(); await done.catch(() => {}); throw error; }
      await done;
      return result instanceof IDBRequest ? result.result : result;
    }
    list() { return this.transaction(['files'], tx => tx.objectStore('files').getAll(), 'readonly'); }
    // Merge playback snapshots into the live record: queued saves must not undo a
    // rename or recreate a file that was deleted while audio was still playing.
    update(meta) {
      return this.transaction(['files'], tx => {
        const files = tx.objectStore('files'), saved = files.get(meta.id);
        saved.onsuccess = () => { if (saved.result) files.put({...saved.result, position: meta.position, ...(meta.peaks ? {peaks: meta.peaks} : {})}); };
      });
    }
    rename(kind, id, name) {
      const store = kind === 'file' ? 'files' : 'bookmarks';
      return this.transaction([store], tx => {
        const entries = tx.objectStore(store), saved = entries.get(id);
        saved.onsuccess = () => { if (saved.result) entries.put({...saved.result, name}); else tx.abort(); };
      });
    }
    async get(id) {
      const saved=await this.transaction(['blobs'],tx=>tx.objectStore('blobs').get(id),'readonly');
      if(!saved||saved instanceof Blob)return saved; // Legacy local libraries.
      if(saved.kind!=='chunks'||!saved.complete)throw Error('The recording was not completely saved.');
      const parts=[];for(let i=0;i<saved.count;i++){const part=await this.transaction(['blobs'],tx=>tx.objectStore('blobs').get([id,i]),'readonly');if(!(part instanceof ArrayBuffer))throw Error('Part of the saved recording is missing.');parts.push(new Blob([part]));}
      return new Blob(parts,{type:saved.type});
    }
    async add(meta,blob) {
      const size=1024*1024,manifest={kind:'chunks',count:Math.ceil(blob.size/size),type:blob.type,complete:false,createdAt:Date.now()};
      let staged=false;try{
        await this.transaction(['blobs'],tx=>tx.objectStore('blobs').add(manifest,meta.id));staged=true;
        for(let i=0;i<manifest.count;i++){const bytes=await blob.slice(i*size,(i+1)*size).arrayBuffer();await this.transaction(['blobs'],tx=>tx.objectStore('blobs').add(bytes,[meta.id,i]));}
        await this.transaction(['files','blobs'],tx=>{tx.objectStore('files').add(meta);tx.objectStore('blobs').put({...manifest,complete:true},meta.id);});
      }catch(error){if(staged)await this.remove(meta.id).catch(()=>{});throw error;}
    }
    bookmarks() { return this.transaction(['bookmarks'], tx => tx.objectStore('bookmarks').getAll(), 'readonly'); }
    addBookmark(bookmark) {
      return this.transaction(['files', 'bookmarks'], tx => {
        // Check within the same transaction so another tab cannot orphan a bookmark.
        const file = tx.objectStore('files').get(bookmark.fileId);
        file.onsuccess = () => { if (file.result) tx.objectStore('bookmarks').add(bookmark); else tx.abort(); };
      });
    }
    removeBookmark(id) { return this.transaction(['bookmarks'], tx => tx.objectStore('bookmarks').delete(id)); }
    remove(id) {
      return this.transaction(['files', 'blobs', 'bookmarks'], tx => {
        tx.objectStore('files').delete(id);
        const blobs = tx.objectStore('blobs'); blobs.delete(id); blobs.delete(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]));
        const bookmarks = tx.objectStore('bookmarks'), cursor = bookmarks.index('fileId').openKeyCursor(IDBKeyRange.only(id));
        cursor.onsuccess = () => { if (cursor.result) { bookmarks.delete(cursor.result.primaryKey); cursor.result.continue(); } };
      });
    }
    async pruneStaged(){
      const keys=await this.transaction(['blobs'],tx=>tx.objectStore('blobs').getAllKeys(),'readonly');
      for(const key of keys){if(typeof key!=='string')continue;const record=await this.transaction(['blobs'],tx=>tx.objectStore('blobs').get(key),'readonly');if(record?.kind==='chunks'&&!record.complete&&record.createdAt<Date.now()-86400000)await this.remove(key);}
    }
    preference(value) { return this.transaction(['preferences'], tx => value === undefined ? tx.objectStore('preferences').get('selected') : tx.objectStore('preferences').put(value, 'selected'), value === undefined ? 'readonly' : 'readwrite'); }
  }
  const formatTime = value => { const n = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
  const formatPreciseTime = (value,digits=2) => { const scale=10**digits,n=Math.max(0,Math.round(value*scale));return `${Math.floor(n/(60*scale))}:${String(Math.floor(n/scale)%60).padStart(2,'0')}.${String(n%scale).padStart(digits,'0')}`; };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  class AudioLibrary {
    constructor(host) {
      this.desktop = matchMedia('(min-width:761px) and (pointer:fine)'); this.host = host; this.files = []; this.bookmarks = []; this.current = null; this.epoch = 0; this.importing = false; this.loop = null; this.viewStart = 0; this.viewSpan = 0; this.drag = null; this.lastSaved = -1; this.pendingSave = Promise.resolve(); this.url = null; this.connected = false; this.loading = false; this.wantPlay = false; this.playTask = null; this.loadAbort = null;
      this.media = document.createElement('audio'); this.media.preload = 'metadata'; this.media.preservesPitch = true; this.reader=new SoundglowFileAudio.FileAudioReader();this.revision=0;
      this.playback=new SoundglowFileAudio.PassagePlayer(()=>host.context(),this.reader,(position,error)=>{this.wantPlay=false;this.finishedRange=error?null:{fileId:this.current?.id,start:this.playback.start,end:this.playback.end};this.position=position;host.paused(true);if(error)this.message('This passage could not be decoded. Try a different format.');this.draw();this.savePosition(true);});
      const $ = id => document.getElementById(id); this.$ = $;
      $('audioFileInput').onchange = e => { void this.importFiles([...e.target.files]); e.target.value = ''; };
      $('openAudio').onclick = () => { host.openFiles(); $('audioFileInput').click(); };
      $('importAudio').onclick = () => $('audioFileInput').click();
      this.actions = new SoundglowLibraryActions($('filesBody'), {
        find: (kind,id) => this.libraryItem(kind,id),
        open: (kind,id) => { if (kind === 'file') void this.select(id); else void this.openBookmark(id); },
        rename: (kind,id,name) => this.renameItem(kind,id,name),
        remove: (kind,id) => kind === 'file' ? this.remove(id) : this.removeBookmark(id),
      });
      $('bookmarkSelection').onclick = () => this.beginBookmark();
      $('bookmarkForm').onsubmit = e => { e.preventDefault(); void this.saveBookmark(); };
      $('cancelBookmark').onclick = () => this.cancelBookmark();
      $('bookmarkName').oninput = () => $('bookmarkName').setCustomValidity('');
      $('bookmarkForm').onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancelBookmark(); } };
      $('filePlay').onclick = () => void this.toggle();
      $('fileRestart').onclick = () => this.seek(this.loop?.start || 0);
      $('fileBack').onclick = () => this.seek(this.position - 5);
      $('fileForward').onclick = () => this.seek(this.position + 5);
      $('waveformFitSelection').onclick = () => { if (this.loop) this.setView(this.loop.start, this.loop.end-this.loop.start); };
      $('fileSpeed').onchange = e => { const position=this.position;this.media.playbackRate=Number(e.target.value);if(this.playback.active)void this.restartPlayback(position);else host.discontinuity(position); };
      $('fileVolume').oninput = e => {this.media.volume=Number(e.target.value);this.playback.volume(this.media.volume);};
      $('waveformZoomIn').onclick = () => this.zoom(.5);
      $('waveformZoomOut').onclick = () => this.zoom(2);
      $('waveformShowAll').onclick = () => { if (this.current) { this.setView(0, this.current.duration); } };
      $('fileLoop').onchange = () => {this.draw();void this.restartPlayback();};
      $('clearAudioSelection').onclick = () => { this.loop = null; $('fileLoop').checked = false; this.draw();void this.restartPlayback(); };
      for (const id of ['fileLoopStart', 'fileLoopEnd']) $(id).onchange = () => {
        const start = Number($('fileLoopStart').value), end = Number($('fileLoopEnd').value);
        if (start >= 0 && end > start && end <= this.media.duration) { this.loop = { start, end }; this.draw();void this.restartPlayback(); }
        else { this.message('Choose an end time after the start, within the recording.'); this.draw(); }
      };
      this.media.addEventListener('timeupdate', () => { this.draw(); this.savePosition(); });
      this.media.addEventListener('ended', () => { if(this.playback.active)return;this.wantPlay=false;host.paused(true);this.draw();this.savePosition(true); });
      this.media.addEventListener('pause', () => { if(this.wantPlay)return;host.paused(true); this.draw(); this.savePosition(true); });
      this.media.addEventListener('playing', () => { if (this.playback.active || !this.wantPlay) { this.media.pause(); return; } host.paused(false); this.draw(); });
      this.media.addEventListener('error', () => { if (this.loading || this.playback.active) return; this.message('This recording could not be played. Try another audio format.'); host.paused(true); this.draw(); });
      window.addEventListener('pagehide', () => this.savePosition(true));
      window.addEventListener('resize', () => this.draw());
      this.canvas = $('fileWaveform'); this.canvas.addEventListener('pointerdown', e => this.pointerDown(e)); this.canvas.addEventListener('pointermove', e => this.pointerMove(e)); this.canvas.addEventListener('pointerup', e => this.pointerUp(e)); this.canvas.addEventListener('pointercancel', () => this.cancelGesture()); this.canvas.addEventListener('lostpointercapture', () => this.cancelGesture());
      document.addEventListener('dragover', e => { if (this.desktop.matches && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
      document.addEventListener('drop', e => { if (this.desktop.matches && e.dataTransfer?.files.length) { e.preventDefault(); host.openFiles(); void this.importFiles(e.dataTransfer.files); } });
      this.overview = $('fileOverview'); this.overview.addEventListener('pointerdown', e=>this.overviewDown(e)); this.overview.addEventListener('pointermove', e=>this.overviewMove(e)); this.overview.addEventListener('pointerup', e=>this.overviewUp(e)); this.overview.addEventListener('pointercancel', ()=>this.cancelGesture()); this.overview.addEventListener('lostpointercapture', ()=>this.cancelGesture());
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(this.drag||this.navigation)){e.preventDefault();e.stopImmediatePropagation();this.cancelGesture();}},true);
      window.addEventListener('blur',()=>this.cancelGesture());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelGesture();});
      this.overview.addEventListener('keydown', e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();this.setView(this.viewStart+(e.key==='ArrowLeft'?-1:1)*this.viewSpan*.1,this.viewSpan);}});
      this.desktop.addEventListener('change',()=>{if(!this.desktop.matches){this.pause();this.host.unavailable?.();}else if(this.current){this.lastView='';this.$('fileTransport').hidden=false;this.draw();}});
      setInterval(()=>{if(this.playback.active){this.draw();this.savePosition();}},100);
      this.ready = this.initialize();
    }
    get position(){return this.playback.active?this.playback.position:this.media.currentTime;}
    set position(value){this.media.currentTime=value;}
    get isPaused(){return !this.playback.active&&this.media.paused;}
    message(text) { this.$('audioLibraryStatus').textContent = text; }
    async initialize() {
      try { this.store = await AudioLibraryStore.open();await this.store.pruneStaged(); this.files = (await this.store.list()).sort((a, b) => a.addedAt - b.addedAt); this.bookmarks = (await this.store.bookmarks()).filter(b => this.validBookmark(b)).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)); this.renderList(); const selected = await this.store.preference(); if (this.files.some(f => f.id === selected) && this.desktop.matches && this.host.canRestore()) await this.select(selected); }
      catch { window.SoundglowDiagnostics?.event('files.storage_failed'); this.message('Device storage is unavailable. Audio files could not be saved.'); this.$('importAudio').disabled = true; this.$('openAudio').disabled = true; }
    }
    metadata(blob) {
      return new Promise((resolve, reject) => {
        const probe = document.createElement('audio'), url = URL.createObjectURL(blob); probe.preload = 'metadata';
        const finish = error => { clearTimeout(timer); probe.onloadedmetadata = probe.onerror = null; probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url); error ? reject(error) : resolve(probeDuration); };
        let probeDuration = 0; const timer = setTimeout(() => finish(Error('Could not read this audio file.')), 20000);
        probe.onloadedmetadata = () => { probeDuration = probe.duration; finish(Number.isFinite(probeDuration) && probeDuration > 0 ? null : Error('This file has no readable audio duration.')); };
        probe.onerror = () => finish(Error('This browser cannot read that audio format.')); probe.src = url; probe.load();
      });
    }
    async importFiles(files) {
      await this.ready;
      if (!this.desktop.matches || !this.store || this.importing) return;
      this.importing = true; this.$('importAudio').disabled = true;
      let first = null, saved = 0, failed = 0;
      for (const file of [...files]) {
        try {
          this.message(`Saving ${saved + failed + 1} of ${files.length}…`);
          if (!file.size || !(file.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|opus|flac|webm|aif|aiff)$/i.test(file.name))) throw Error('Choose an audio file.');
          const duration = await this.metadata(file);
          const meta = { id: crypto.randomUUID(), name: file.name, type: file.type, bytes: file.size, duration, position: 0, addedAt: Date.now() };
          await this.store.add(meta, file.slice(0,file.size,file.type)); window.SoundglowDiagnostics?.event('files.saved'); this.files.push(meta); first ||= meta.id; saved++;
        } catch (e) { failed++; this.message(e?.name === 'QuotaExceededError' ? 'Device storage is full. Remove a recording to make room.' : e?.message || 'Could not save this audio file.'); }
      }
      this.importing = false; this.$('importAudio').disabled = false; this.renderList();
      if (saved) { this.message(`${saved} ${saved === 1 ? 'file saved' : 'files saved'} on this device${failed ? ` · ${failed} could not be added` : ''}.`); void navigator.storage?.persist?.().catch(() => {}); if (!this.current) await this.select(first); }
    }
    libraryItem(kind,id) {
      const item = (kind === 'file' ? this.files : this.bookmarks).find(item => item.id === id);
      if (!item) return null;
      const count = this.bookmarks.filter(b => b.fileId === id).length;
      return {...item, maxNameLength: kind === 'file' ? 255 : 80,
        deleteDescription: kind === 'file'
          ? `Delete “${item.name}” from this browser?${count ? ` Its ${count} bookmark${count === 1 ? '' : 's'} will also be deleted.` : ''} The original file on your computer is kept.`
          : `Delete “${item.name}”? Its audio file is kept.`};
    }
    async renameItem(kind,id,name) {
      const item = (kind === 'file' ? this.files : this.bookmarks).find(item => item.id === id);
      if (!item) throw Error('Item no longer exists');
      await this.store.rename(kind,id,name); item.name = name;
      if (this.current?.id === id && kind === 'file') this.$('fileTitle').textContent = name;
      this.renderList();
    }
    renderList() {
      this.actions.closeMenu();
      const list = this.$('audioFileList'); list.replaceChildren();
      for (const file of this.files) {
        const title = `${file.name}\n${formatPreciseTime(file.duration)}${file.bytes ? ` · ${(file.bytes/1048576).toFixed(1)} MB` : ''}`;
        list.append(this.actions.row({kind: 'file', id: file.id, name: file.name, detail: formatTime(file.duration), title, selected: this.current?.id === file.id}));
      }
      this.renderBookmarks();
      this.$('audioEmpty').hidden = !!this.files.length;
    }
    validBookmark(bookmark) {
      const file = this.files.find(f => f.id === bookmark?.fileId), selection = bookmark?.selection;
      return !!(file && typeof bookmark.id === 'string' && typeof bookmark.name === 'string' && bookmark.name.trim()
        && selection && [selection.start, selection.end, bookmark.viewStart, bookmark.viewSpan].every(Number.isFinite)
        && selection.start >= 0 && selection.end > selection.start && selection.end <= file.duration
        && bookmark.viewStart >= 0 && bookmark.viewSpan > 0 && bookmark.viewStart + bookmark.viewSpan <= file.duration + 1e-6);
    }
    renderBookmarks() {
      this.actions.closeMenu();
      const list = this.$('audioBookmarkList'); list.replaceChildren();
      this.$('audioBookmarks').hidden = !this.bookmarks.length;
      for (const bookmark of this.bookmarks) {
        const file = this.files.find(f => f.id === bookmark.fileId); if (!file) continue;
        const range = `${formatPreciseTime(bookmark.selection.start)}–${formatPreciseTime(bookmark.selection.end)}`;
        list.append(this.actions.row({kind: 'bookmark', id: bookmark.id, name: bookmark.name, detail: range, title: `${bookmark.name}\n${file.name}\n${range}`}));
      }
    }
    beginBookmark() {
      if (!this.current || !this.loop || this.loading) return;
      this.$('bookmarkName').value = ''; this.$('bookmarkName').setCustomValidity('');
      this.$('bookmarkForm').hidden = false; this.$('bookmarkSelection').hidden = true; this.$('bookmarkName').focus();
    }
    cancelBookmark() {
      this.$('bookmarkForm').hidden = true; this.$('bookmarkSelection').hidden = !this.loop;
      if (this.loop) this.$('bookmarkSelection').focus();
    }
    async saveBookmark() {
      if (!this.current || !this.loop || this.loading || this.savingBookmark) return;
      const name = this.$('bookmarkName').value.trim();
      if (!name) { this.$('bookmarkName').setCustomValidity('Enter a bookmark name.'); this.$('bookmarkName').reportValidity(); return; }
      const bookmark = { id: crypto.randomUUID(), fileId: this.current.id, name, selection: {...this.loop},
        viewStart: this.viewStart, viewSpan: this.viewSpan, feature: this.$('pitchTab').getAttribute('aria-selected') === 'true' ? 'pitch' : 'spectrogram',
        speed: this.media.playbackRate, addedAt: Date.now() };
      this.savingBookmark = true; this.$('saveBookmark').disabled = true;
      try {
        await this.store.addBookmark(bookmark);
        if (this.files.some(f => f.id === bookmark.fileId)) { this.bookmarks.push(bookmark); this.renderBookmarks(); }
        this.cancelBookmark(); this.message('Bookmark saved.');
      } catch { this.message('Could not save the bookmark. Please retry.'); }
      finally { this.savingBookmark = false; this.$('saveBookmark').disabled = false; }
    }
    async openBookmark(id) {
      const bookmark = this.bookmarks.find(b => b.id === id);
      if (!this.desktop.matches || !this.validBookmark(bookmark)) return;
      await this.select(bookmark.fileId, bookmark);
    }
    async removeBookmark(id) {
      try { await this.store.removeBookmark(id); this.bookmarks = this.bookmarks.filter(b => b.id !== id); this.renderBookmarks(); return true; }
      catch { this.message('Could not remove the bookmark. Please retry.'); return false; }
    }
    async select(id, bookmark = null) {
      if (!this.desktop.matches || !this.store) return;
      const file = this.files.find(f => f.id === id); if (!file) return;
      this.$('bookmarkForm').hidden = true; this.finishedRange = null;
      const epoch = ++this.epoch; this.wantPlay = false; this.loadAbort?.abort(); this.media.pause(); this.savePosition(true); this.host.release();this.playback.clear();this.reader.clear(); this.connected = false; this.loading = true;
      this.media.removeAttribute('src'); this.media.load(); if (this.url) URL.revokeObjectURL(this.url);
      this.current = file; this.host.selected(file); this.loop = null; this.viewStart = 0; this.viewSpan = Math.min(file.duration,10); this.blob = null; this.lastView = ''; this.drag = this.navigation = null; this.peaks = file.peaks || null; this.lastSaved = -1; this.renderList(); this.$('fileTransport').hidden = false; this.$('fileTitle').textContent = file.name; this.$('fileLoop').checked = false; this.$('fileLoopEnd').max = this.$('fileLoopStart').max = file.duration;
      try {
        const blob = await this.store.get(id); if (epoch !== this.epoch) return; if (!blob) throw Error('This saved recording is missing. Please open it again.');
        this.blob = blob; this.url = URL.createObjectURL(blob); this.media.src = this.url;
        await new Promise((resolve, reject) => {
          const controller = new AbortController(); this.loadAbort = controller;
          const finish = error => { clearTimeout(timer); this.media.removeEventListener('loadedmetadata', loaded); this.media.removeEventListener('error', failed); controller.signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
          const loaded = () => finish(), failed = () => finish(Error('This browser cannot play the saved file.')), aborted = () => finish(new DOMException('Selection changed', 'AbortError'));
          const timer = setTimeout(() => finish(Error('The saved audio could not be opened. Please retry.')), 20000);
          this.media.addEventListener('loadedmetadata', loaded); this.media.addEventListener('error', failed); controller.signal.addEventListener('abort', aborted); this.media.load();
        });
        if (epoch !== this.epoch) return;
        await this.store.preference(id); if (epoch !== this.epoch) return;
        this.position = bookmark ? bookmark.selection.start : clamp(file.position || 0, 0, Math.max(0, file.duration - .01));
        this.viewStart = bookmark ? bookmark.viewStart : clamp(this.position-this.viewSpan/2,0,file.duration-this.viewSpan);
        if (bookmark) {
          this.viewSpan = bookmark.viewSpan; this.loop = {...bookmark.selection}; this.$('fileLoop').checked = true;
          const speed = [0.5,0.75,1,1.25,1.5].includes(bookmark.speed) ? bookmark.speed : 1;
          this.media.playbackRate = speed; this.$('fileSpeed').value = String(speed);
          this.$(bookmark.feature === 'pitch' ? 'pitchTab' : 'spectrogramTab').click();
        }
        this.loading = false; this.draw();
        if (!this.peaks || this.peaks.length < this.waveformResolution()) void this.waveform(blob, epoch);
      } catch (e) { if (epoch === this.epoch) { this.loading = false; this.message(e.message || 'Could not open the saved recording.'); } }
    }
    waveformResolution() { return Math.min(120000, Math.max(1200, Math.ceil(this.current.duration * 200))); }
    async waveform(blob, epoch) {
      try {
        const peaks=Array.from({length:this.waveformResolution()},()=>0);
        for await(const {buffer,timestamp} of this.reader.buffers(blob,0,this.current.duration)){
          if(epoch!==this.epoch)return;
          for(let c=0;c<buffer.numberOfChannels;c++){const samples=buffer.getChannelData(c);for(let i=0;i<samples.length;i++){const at=Math.floor((timestamp+i/buffer.sampleRate)/this.current.duration*peaks.length);if(at>=0&&at<peaks.length)peaks[at]=Math.max(peaks[at],Math.abs(samples[i]));}}
        }
        if(epoch!==this.epoch)return;this.peaks=peaks;this.current.peaks=peaks;await this.store.update(this.current);this.draw();
      }catch{ /* The overview is optional; native file playback stays available. */ }
    }
    async play() {
      this.resumeAfterRestart=false;this.wantPlay = true;this.draw();
      if (!this.current || this.loading) return;
      if (this.playTask) { await this.playTask; if (!this.wantPlay || this.epoch === this.playEpoch) return; }
      this.playEpoch = this.epoch;
      this.playTask = this.startPlayback();
      try { await this.playTask; } finally { this.playTask = null; }
    }
    async startPlayback() {
      const epoch=this.epoch,revision=this.revision,current=()=>epoch===this.epoch&&revision===this.revision&&this.wantPlay;
      try {
        if(!this.connected){await this.host.connect(this.media);if(epoch!==this.epoch)return;this.connected=true;if(!current()){this.host.paused(true);return;}this.$('fileTransport').hidden=false;}
        await this.host.resume();if(!current())return;
        const range=this.loop || {start:0,end:this.current.duration};
        // Completion is explicit: media.currentTime can round just below the endpoint.
        const finished = this.finishedRange;
        if ((finished?.fileId === this.current.id && finished.start === range.start && finished.end === range.end)
          || this.position >= range.end || this.position < range.start) this.position = range.start;
        this.finishedRange = null;
        if(this.loop||this.$('fileLoop').checked){
          this.media.pause();await this.playback.play(this.blob,range,this.position,{loop:this.$('fileLoop').checked,rate:this.media.playbackRate,volume:this.media.volume,isCurrent:current});
          if(current())this.host.paused(false);
        }else await this.media.play();
      }catch{if(current()){this.wantPlay=false;this.playback.stop();this.host.paused(true);this.message('This passage could not be decoded. Try a different audio format.');}}
      this.draw();
    }
    toggle(){if(this.wantPlay||this.resumeAfterRestart||!this.isPaused){this.pause();return;}return this.play();}
    pause(preserveIntent=false){this.revision++;if(!preserveIntent)this.resumeAfterRestart=false;this.wantPlay=false;const position=this.position;this.playback.stop();this.media.pause();if(this.current&&!this.loading)this.position=position;this.host.paused(true);this.draw();}
    async restartPlayback(position=this.position){const resume=this.wantPlay||this.resumeAfterRestart;this.pause(true);this.resumeAfterRestart=resume;const revision=this.revision,epoch=this.epoch;this.position=position;this.host.discontinuity(position);this.draw();if(resume){await this.playTask;if(!this.wantPlay&&this.resumeAfterRestart&&revision===this.revision&&epoch===this.epoch)return this.play();}}
    passageChanged(){if(this.wantPlay||this.resumeAfterRestart)void this.restartPlayback();}
    seek(time){if(!this.current||this.loading)return;const position=clamp(time,0,this.current.duration);this.finishedRange=this.loop&&position>=this.loop.end?{fileId:this.current.id,...this.loop}:null;if(this.playback.active||this.playTask){void this.restartPlayback(position);return;}this.position=position;this.host.discontinuity(position);this.draw();this.savePosition(true);}
    savePosition(force = false) {
      if (!this.current || this.loading || !Number.isFinite(this.position)) return;
      const position = this.position; if (!force && Math.abs(position - this.lastSaved) < 2) return;
      this.lastSaved = position; this.current.position = position;
      const snapshot = { ...this.current }; this.pendingSave = this.pendingSave.then(() => this.store.update(snapshot)).catch(() => this.message('Could not save the last playback position.'));
    }
    async remove(id = this.current?.id) {
      if (!this.files.some(f => f.id === id)) return false;
      try { await this.store.remove(id); } catch { this.message('Could not remove the recording. Please retry.'); return false; }
      const active = this.current?.id === id;
      if (active) {
        ++this.epoch; this.wantPlay = false; this.loadAbort?.abort(); this.media.pause(); this.host.release();
        this.playback.clear(); this.reader.clear(); this.connected = false;
        this.media.removeAttribute('src'); this.media.load(); if (this.url) URL.revokeObjectURL(this.url);
        this.url = null; this.current = null; this.$('fileTransport').hidden = true; this.loading = false;
      }
      this.files = this.files.filter(f => f.id !== id); this.bookmarks = this.bookmarks.filter(b => b.fileId !== id); this.renderList();
      if (active) { if (this.files[0]) await this.select(this.files[0].id); else await this.store.preference(''); }
      return true;
    }
    release() { const position=this.position;this.revision++;this.resumeAfterRestart=false;this.wantPlay = false;this.playback.stop();this.media.pause();if(this.current&&!this.loading)this.position=position; this.savePosition(true); this.connected = false; this.$('fileTransport').hidden = true; }
    zoom(factor) {
      if (!this.current || this.drag) return;
      const duration = this.current.duration, oldSpan = this.viewSpan;
      const span = clamp(oldSpan * factor, Math.min(.001, duration), duration);
      const center = this.viewStart + oldSpan / 2;
      const preferred = this.loop ? (this.loop.start + this.loop.end) / 2 : this.position;
      const anchor = preferred >= this.viewStart && preferred <= this.viewStart + oldSpan ? preferred : center;
      const fraction = (anchor - this.viewStart) / oldSpan;
      this.setView(anchor - fraction * span, span);
    }
    setView(start, span) {
      if (!this.current) return;
      this.viewSpan = clamp(span, Math.min(.001, this.current.duration), this.current.duration);
      this.viewStart = clamp(start, 0, this.current.duration-this.viewSpan); this.draw();
    }
    overviewAt(event) { const box=this.overview.getBoundingClientRect();return clamp((event.clientX-box.left)/box.width,0,1)*this.current.duration; }
    overviewGeometry(width) {
      const logicalLeft=this.viewStart/this.current.duration*width,logicalWidth=this.viewSpan/this.current.duration*width;
      const size=Math.min(width,Math.max(36,logicalWidth)),left=clamp(logicalLeft+logicalWidth/2-size/2,0,width-size);
      return {left,right:left+size,logicalLeft,logicalWidth};
    }
    overviewMode(event) {
      const box=this.overview.getBoundingClientRect(),x=event.clientX-box.left,g=this.overviewGeometry(box.width);
      return Math.abs(x-g.left)<=9?'left':Math.abs(x-g.right)<=9?'right':x>g.left&&x<g.right?'move':'new';
    }
    overviewDown(event) {
      if(!this.current||this.loading||event.button!==0||this.drag||this.navigation)return;
      this.navigation={id:event.pointerId,time:this.overviewAt(event),start:this.viewStart,end:this.viewStart+this.viewSpan,mode:this.overviewMode(event)};
      this.overview.setPointerCapture(event.pointerId);
    }
    overviewMove(event) {
      if(!this.current)return;const drag=this.navigation;
      if(!drag){this.overview.style.cursor=({left:'ew-resize',right:'ew-resize',move:'grab',new:'crosshair'})[this.overviewMode(event)];return;}
      if(drag.id!==event.pointerId)return;
      const time=this.overviewAt(event),delta=time-drag.time,min=Math.min(.001,this.current.duration);
      if(drag.mode==='move')this.setView(drag.start+delta,drag.end-drag.start);
      if(drag.mode==='left'){const start=clamp(drag.start+delta,0,drag.end-min);this.setView(start,drag.end-start);}
      if(drag.mode==='right')this.setView(drag.start,clamp(drag.end+delta-drag.start,min,this.current.duration-drag.start));
      if(drag.mode==='new')this.setView(Math.min(time,drag.time),Math.max(min,Math.abs(time-drag.time)));
    }
    overviewUp(event) {
      if(!this.navigation||this.navigation.id!==event.pointerId)return;
      const drag=this.navigation,threshold=this.current.duration/this.overview.getBoundingClientRect().width*6;
      if(drag.mode==='new'&&Math.abs(this.overviewAt(event)-drag.time)<threshold)this.setView(drag.time-(drag.end-drag.start)/2,drag.end-drag.start);
      else this.overviewMove(event);
      this.navigation=null;this.overview.releasePointerCapture?.(event.pointerId);
    }
    cancelGesture() {
      const drag=this.drag,nav=this.navigation;this.drag=this.navigation=null;
      if(nav){this.viewStart=nav.start;this.viewSpan=nav.end-nav.start;}
      if(drag)this.canvas.releasePointerCapture?.(drag.id);if(nav)this.overview.releasePointerCapture?.(nav.id);
      if(drag||nav)this.draw();
    }
    at(event) { const box=this.canvas.getBoundingClientRect();return this.viewStart+clamp((event.clientX-box.left)/Math.max(1,box.width),0,1)*this.viewSpan; }
    edgeAt(time) {
      if(!this.loop)return null;const hit=this.viewSpan/this.canvas.getBoundingClientRect().width*9,a=Math.abs(time-this.loop.start),b=Math.abs(time-this.loop.end);
      return Math.min(a,b)<=hit?(a<=b?'start':'end'):null;
    }
    pointerDown(event) {
      if(!this.current||this.loading||event.button!==0||this.drag||this.navigation)return;
      const time=this.at(event);this.drag={id:event.pointerId,start:time,end:time,x:event.clientX,edge:this.edgeAt(time),original:this.loop?{...this.loop}:null,selection:null};
      this.canvas.setPointerCapture(event.pointerId);
    }
    pointerMove(event) {
      if(!this.current)return;
      if(!this.drag){this.canvas.style.cursor=this.edgeAt(this.at(event))?'ew-resize':'crosshair';return;}
      if(this.drag.id!==event.pointerId)return;
      const drag=this.drag,time=this.at(event),min=1/48000;drag.end=time;
      if(drag.edge){const selection={...drag.original};selection[drag.edge]=drag.edge==='start'?Math.min(time,selection.end-min):Math.max(time,selection.start+min);drag.selection=selection;}
      else if(Math.abs(event.clientX-drag.x)>6)drag.selection={start:Math.min(drag.start,time),end:Math.max(drag.start,time)};
      this.draw();
    }
    pointerUp(event) {
      if(!this.drag||this.drag.id!==event.pointerId)return;
      this.pointerMove(event);const drag=this.drag;this.drag=null;
      if(drag.selection&&drag.selection.end-drag.selection.start>=1/48000){this.loop={start:Math.round(drag.selection.start*48000)/48000,end:Math.round(drag.selection.end*48000)/48000};}
      else if(!drag.edge&&Math.abs(event.clientX-drag.x)<=6)this.seek(this.at(event));
      this.canvas.releasePointerCapture?.(event.pointerId);this.draw();this.passageChanged?.();
    }
    draw() {
      if (!this.current) return;
      const $ = this.$, duration = this.current.duration, time = this.position || 0;
      this.viewSpan = clamp(this.viewSpan || duration, Math.min(.001, duration), duration);
      this.viewStart = clamp(this.viewStart, 0, duration - this.viewSpan);
      const span = this.viewSpan, start = this.viewStart, zoomed = span < duration - .001;
      const precise = value=>formatPreciseTime(value,span<.1?4:span<1?3:2);
      $('waveformZoomOut').disabled = $('waveformShowAll').disabled = !zoomed;
      $('waveformZoomIn').disabled = span <= Math.min(.001, duration) + 1e-9;
      $('waveformFitSelection').disabled = !this.loop;
      const hasSelection = !!this.loop && !this.loading;
      $('fileSelectionControls').classList.toggle('has-selection', hasSelection);
      $('fileSelectionControls').inert = !hasSelection;
      if (!this.loop || this.loading) $('bookmarkForm').hidden = true;
      $('bookmarkSelection').hidden = !this.loop || this.loading || !$('bookmarkForm').hidden;
      const xAt = seconds => (seconds - start) / span * width;
      $('filePlay').textContent = this.wantPlay||this.resumeAfterRestart ? 'Pause' : 'Play'; $('filePlay').setAttribute('aria-label', this.wantPlay||this.resumeAfterRestart ? 'Pause recording' : 'Play recording'); $('filePlay').disabled = this.loading; $('fileTime').textContent = `${formatTime(time)} / ${formatTime(duration)}`;
      $('fileLoopStart').value = (this.loop?.start || 0).toFixed(4); $('fileLoopEnd').value = (this.loop?.end || duration).toFixed(4); $('clearAudioSelection').hidden = !this.loop;
      const canvas = this.canvas, box = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(box.width * ratio)); canvas.height = Math.round(64 * ratio); const g = canvas.getContext('2d'); g.scale(ratio, ratio); const width = box.width;
      g.fillStyle = '#171f2b'; g.fillRect(0, 0, width, 64);
      if (this.peaks) {
        g.strokeStyle = '#a8b8ce'; g.lineWidth = 1; g.beginPath();
        for (let x = 0; x < width; x++) {
          const from = Math.floor((start + x / width * span) / duration * this.peaks.length);
          const to = Math.min(this.peaks.length, Math.max(from + 1, Math.ceil((start + (x + 1) / width * span) / duration * this.peaks.length)));
          let peak = 0; for (let i = from; i < to; i++) peak = Math.max(peak, this.peaks[i] || 0);
          g.moveTo(x, 32 - peak * 28); g.lineTo(x, 32 + peak * 28);
        }
        g.stroke();
      }
      else { g.fillStyle = '#75869b'; g.font = '12px system-ui'; g.fillText('Click to seek · drag to select a passage', 12, 36); }
      const selection = this.drag?.selection || this.loop;
      if (selection) { g.fillStyle = '#f2ac7744'; g.fillRect(xAt(selection.start), 0, (selection.end - selection.start) / span * width, 64); g.fillStyle='#f2ac77'; for(const edge of [selection.start,selection.end])g.fillRect(xAt(edge)-2,0,4,64); }
      if (time >= start && time <= start + span) { g.fillStyle = '#f2ac77'; g.fillRect(clamp(xAt(time), 0, Math.max(0, width - 2)), 0, 2, 64); }
      const ruler=$('waveformRuler');ruler.replaceChildren();for(let i=0;i<=4;i++){const tick=document.createElement('span');tick.textContent=precise(start+span*i/4);ruler.append(tick);}
      const overview=this.overview,ow=overview.getBoundingClientRect().width;overview.width=Math.max(1,Math.round(ow*ratio));overview.height=36*ratio;const og=overview.getContext('2d');og.scale(ratio,ratio);og.fillStyle='#101722';og.fillRect(0,0,ow,36);
      if(this.peaks){og.strokeStyle='#75869b';og.beginPath();for(let x=0;x<ow;x++){let peak=0;for(let i=Math.floor(x/ow*this.peaks.length);i<Math.ceil((x+1)/ow*this.peaks.length);i++)peak=Math.max(peak,this.peaks[i]||0);og.moveTo(x,18-peak*15);og.lineTo(x,18+peak*15);}og.stroke();}
      const nav=this.overviewGeometry(ow);og.fillStyle='#8cdcff22';og.fillRect(nav.logicalLeft,0,nav.logicalWidth,36);og.strokeStyle='#8cdcff';og.strokeRect(nav.left+.5,.5,Math.max(0,nav.right-nav.left-1),35);og.fillStyle='#8cdcff';og.fillRect(nav.left,8,3,20);og.fillRect(nav.right-3,8,3,20);og.fillStyle='#f2ac77';og.fillRect(time/duration*ow,0,1,36);
      const viewKey=[this.current.id,start,span].join(':');if(this.blob && !this.loading && viewKey!==this.lastView){this.lastView=viewKey;this.host.viewChanged?.({start,end:start+span,blob:this.blob});}
      this.host.selectionChanged?.(selection);

    }
  }
  scope.SoundglowAudioLibrary = { AudioLibraryStore, AudioLibrary, formatTime, formatPreciseTime };
})(typeof window === 'object' ? window : globalThis);
