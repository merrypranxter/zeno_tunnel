export function setupUI(params) {
  document.getElementById('speed').addEventListener('input', e => {
    params.speed = parseFloat(e.target.value);
    document.getElementById('speed-val').textContent = params.speed.toFixed(1);
  });

  document.querySelectorAll('input[name="ratio"]').forEach(r => {
    r.addEventListener('change', e => {
      params.subdivisionRatio = parseFloat(e.target.value);
    });
  });

  document.getElementById('colorscheme').addEventListener('change', e => {
    params.colorScheme = parseInt(e.target.value);
  });

  document.getElementById('twist').addEventListener('input', e => {
    params.twist = parseFloat(e.target.value);
    document.getElementById('twist-val').textContent = params.twist.toFixed(2);
  });

  document.getElementById('fov').addEventListener('input', e => {
    params.fov = parseFloat(e.target.value);
    document.getElementById('fov-val').textContent = params.fov.toFixed(1);
  });

  document.getElementById('pause').addEventListener('click', () => {
    params.paused = !params.paused;
    document.getElementById('pause').textContent = params.paused ? 'Resume' : 'Pause';
  });

  document.getElementById('settings-toggle').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
}
