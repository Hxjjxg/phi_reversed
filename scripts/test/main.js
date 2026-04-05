function loadScript(path) {
  try {
    const source = File.readAllText(path);
    Script.evaluate(path, source);
    console.log("[+] loaded:", path);
  } catch (e) {
    console.log("[-] failed:", path, e);
  }
}

setImmediate(() => {
  loadScript("/data/local/tmp/BGM_samplerate_hook.js");
  loadScript("/data/local/tmp/Chart_speed_change.js");
});