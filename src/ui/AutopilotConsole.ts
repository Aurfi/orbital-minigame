import type { GameEngine } from '@/core/GameEngine.js';

export function setupAutopilotConsole(engine: GameEngine): void {
  const panel = document.createElement('div');
  panel.id = 'ap-panel';
  panel.style.marginTop = '8px';
  panel.style.padding = '8px 10px';
  panel.style.background = 'rgba(15,15,22,0.9)';
  panel.style.border = '1px solid #445';
  panel.style.borderRadius = '6px';
  panel.style.color = '#ddd';
  panel.style.display = 'none';

  // Header row with title (left) and centered Auto Pilot button
  const header = document.createElement('div');
  header.style.display = 'grid';
  header.style.gridTemplateColumns = '1fr auto 1fr';
  header.style.alignItems = 'center';
  header.style.minHeight = '26px';
  header.style.marginBottom = '6px';

  const title = document.createElement('div');
  title.textContent = 'Command Console - Run your own scripts or try the Auto Pilot!';
  title.style.fontSize = '13px';
  title.style.color = '#9ecbff';
  title.style.justifySelf = 'start';
  header.appendChild(title);

  const apBtn = document.createElement('button');
  apBtn.textContent = 'AUTO PILOT';
  apBtn.style.justifySelf = 'center';
  apBtn.style.marginTop = '3px';
  apBtn.style.background = 'linear-gradient(145deg, #255a8a, #1d3f63)';
  apBtn.style.border = '1px solid #3e77a8';
  apBtn.style.color = '#e3f2fd';
  apBtn.style.fontSize = '12px';
  apBtn.style.padding = '5px 12px';
  apBtn.style.borderRadius = '5px';
  apBtn.style.cursor = 'pointer';
  apBtn.style.opacity = '0.95';
  header.appendChild(apBtn);

  const setApBtnStyle = (enabled: boolean, running: boolean) => {
    if (enabled && !running) {
      apBtn.style.background = 'linear-gradient(145deg, #255a8a, #1d3f63)';
      apBtn.style.border = '1px solid #3e77a8';
      apBtn.style.color = '#e3f2fd';
      apBtn.style.cursor = 'pointer';
      apBtn.style.opacity = '0.95';
    } else {
      apBtn.style.background = '#3a3a3a';
      apBtn.style.border = '1px solid #555';
      apBtn.style.color = '#aaaaaa';
      apBtn.style.cursor = 'not-allowed';
      apBtn.style.opacity = '0.6';
    }
  };

  const updateApBtn = () => {
    try {
      const onGround = engine.isOnGround();
      const running = engine.isAutopilotRunning();
      apBtn.disabled = running || !onGround;
      apBtn.textContent = running ? 'RUNNING' : 'AUTO PILOT';
      apBtn.title = running
        ? 'Autopilot running'
        : onGround
          ? 'Click to auto-run the launch script'
          : 'Available only while on the ground';
      setApBtnStyle(!apBtn.disabled, running);
    } catch {}
  };
  apBtn.addEventListener('click', () => {
    if (apBtn.disabled) return;
    const script = [
      'ignite',
      'hold up',
      'throttle 1',
      'wait until altitude 800',
      'pitch east 5',
      'wait until altitude 6000',
      'pitch east 15',
      'wait until altitude 15000',
      'pitch east 35',
      'wait until altitude 40000',
      'pitch east 55',
      'wait until stage empty',
      'throttle 0',
      'cut',
      'stage',
      'hold prograde',
      'wait until apoapsis',
      'ignite',
      'throttle 1',
      'until periapsis = 110000',
      'cut',
    ].join('\n');
    engine.runAutopilotScript(script);
  });
  // Keep state fresh
  updateApBtn();
  const apInt = window.setInterval(updateApBtn, 400);
  window.addEventListener('beforeunload', () => window.clearInterval(apInt));

  panel.appendChild(header);

  const log = document.createElement('div');
  log.id = 'ap-log';
  log.style.height = '100px';
  log.style.overflowY = 'auto';
  log.style.background = 'rgba(0,0,0,0.35)';
  log.style.border = '1px solid #334';
  log.style.padding = '6px';
  log.style.marginBottom = '6px';
  panel.appendChild(log);

  const addLog = (msg: string) => {
    const line = document.createElement('div');
    line.textContent = msg;
    line.style.whiteSpace = 'pre-wrap';
    if (/^ERR:/i.test(msg)) line.style.color = '#ff6666';
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  };
  engine.setAutopilotLogger(addLog);

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '6px';

  const input = document.createElement('textarea');
  input.id = 'ap-input';
  input.placeholder = [
    'Type commands then Run. Examples:',
    'ignite //// hold prograde',
    'throttle 0.6 //// wait 10',
    'until apoapsis 120000 then throttle 0.3',
    'cut',
  ].join('\n');
  input.style.flex = '1';
  input.style.height = '80px';
  input.style.resize = 'none';
  input.style.fontFamily = 'Courier New, monospace';
  input.style.fontSize = '12px';
  input.style.color = '#eee';
  input.style.background = 'rgba(0,0,0,0.5)';
  input.style.border = '1px solid #334';
  input.style.padding = '6px';
  row.appendChild(input);

  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run';
  runBtn.style.minWidth = '80px';
  runBtn.style.background = '#1b5e20';
  runBtn.style.color = '#e8ffe8';
  runBtn.style.border = '1px solid #2e7d32';
  runBtn.style.borderRadius = '4px';
  runBtn.style.padding = '6px 10px';
  runBtn.onclick = () => {
    const text = input.value;
    if (text.trim()) {
      addLog('> run');
      engine.runAutopilotScript(text);
      input.value = '';
      input.focus();
    }
  };
  row.appendChild(runBtn);

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop';
  stopBtn.style.minWidth = '80px';
  stopBtn.style.background = '#7a1f1f';
  stopBtn.style.color = '#ffeaea';
  stopBtn.style.border = '1px solid #c62828';
  stopBtn.style.borderRadius = '4px';
  stopBtn.style.padding = '6px 10px';
  stopBtn.onclick = () => {
    engine.stopAutopilot();
    engine.cutEngines();
    addLog('> stopped (engines cut)');
  };
  row.appendChild(stopBtn);

  // Remove clear button to keep UI focused on Run/Stop

  panel.appendChild(row);

  document.addEventListener('prefill-autopilot-script', () => {
    const script = [
      'ignite',
      'hold up',
      'throttle 1',
      'wait until altitude 1000',
      'pitch east 5',
      'wait until altitude 6000',
      'pitch east 15',
      'wait until altitude 15000',
      'pitch east 35',
      'wait until altitude 40000',
      'pitch east 55',
      'wait until stage empty',
      'throttle 0',
      'cut',
      'stage',
      'hold prograde',
      'wait until apoapsis',
      'ignite',
      'throttle 1',
      'until periapsis = 110000',
      'cut',
    ].join('\n');
    input.value = script;
    input.focus();
  });

  const ctrlPanel = document.querySelector('.control-panel');
  ctrlPanel?.appendChild(panel);
  panel.style.display = 'block';
}
