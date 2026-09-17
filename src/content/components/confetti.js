export function ensureConfettiCanvas() {
    let canvas = document.getElementById('canvas-tasks-confetti');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'canvas-tasks-confetti';
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    return canvas;
  }

export function launchConfetti(originX, originY) {
    const canvas = ensureConfettiCanvas();
    const ctx = canvas.getContext('2d');
    const colors = ['#0a84ff', '#64d2ff', '#ff375f', '#bf5af2', '#30d158', '#ff9f0a', '#ffd60a'];

    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      activeParticles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
                           vy: Math.sin(angle) * speed - 3.5,
                           size: Math.random() * 6 + 3,
                           color: colors[Math.floor(Math.random() * colors.length)],
                           alpha: 1,
                           decay: Math.random() * 0.022 + 0.014,
                           rotation: Math.random() * 360,
                           rotSpeed: (Math.random() - 0.5) * 12
      });
    }

    if (!isConfettiLoopRunning) {
      isConfettiLoopRunning = true;
      runConfettiLoop(canvas, ctx);
    }
  }

export function runConfettiLoop(canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = activeParticles.length - 1; i >= 0; i--) {
      const p = activeParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.rotation += p.rotSpeed;
      p.alpha -= p.decay;

      if (p.alpha <= 0 || p.y > canvas.height) {
        activeParticles.splice(i, 1);
      } else {
        ctx.save();
        ctx.globalAlpha = Math.max(p.alpha, 0);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
        ctx.restore();
      }
    }

    if (activeParticles.length > 0) {
      requestAnimationFrame(() => runConfettiLoop(canvas, ctx));
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isConfettiLoopRunning = false;
    }
  }
