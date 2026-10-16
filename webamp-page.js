// webamp.html: the whole book as a playlist in Webamp (https://github.com/captbaritone/webamp, vendored as
// webamp.bundle.min.mjs). Webamp cannot open playlist files, so this page hands it the tracks itself.
// The list comes from playlist.json, fetched fresh every time, and each url carries the narration's
// version, so a chapter that was narrated again and pushed plays in its new version on the next load.
// Webamp's LOAD LIST button fetches the list again without reloading the page.
import Webamp from './webamp.bundle.min.mjs';

const status = document.getElementById('webamp-status');

async function loadTracks() {
  const res = await fetch('playlist.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`playlist.json answered ${res.status}`);
  const list = await res.json();
  status.textContent = `${list.tracks.length} chapters, updated ${list.updated}.`;
  return list.tracks.map(t => ({
    url: new URL(`${t.file}?v=${t.version}`, location.href).href,
    duration: t.seconds,
    metaData: { artist: list.author, title: t.title, album: list.title },
  }));
}

async function main() {
  if (!Webamp.browserIsSupported()) {
    status.textContent = 'This browser cannot run Webamp.';
    return;
  }
  // The windows are centred in #webamp-app (sized in style.css): the main window above a playlist tall
  // and wide enough for the chapter titles. The equalizer is left out, so it starts closed.
  const webamp = new Webamp({
    initialTracks: await loadTracks(),
    enableMediaSession: true,
    handleLoadListEvent: loadTracks,
    windowLayout: {
      main: { position: { top: 0, left: 0 } },
      playlist: { position: { top: 116, left: 0 }, size: { extraHeight: 8, extraWidth: 4 } },
    },
  });
  await webamp.renderWhenReady(document.getElementById('webamp-app'));
}

main().catch(err => {
  status.textContent = `Webamp could not start: ${err.message}`;
});
