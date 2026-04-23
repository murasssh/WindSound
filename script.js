document.addEventListener('DOMContentLoaded', () => {
    // ── GERAÇÃO DAS LINHAS DE VENTO ──
    const bg = document.getElementById('windBg');
    const lines = [
        { top:'22%', width:'180px', delay:'0s',  dur:'4.5s' },
        { top:'35%', width:'260px', delay:'1.2s', dur:'5.2s' },
        { top:'48%', width:'140px', delay:'0.6s', dur:'3.8s' },
        { top:'55%', width:'320px', delay:'2.1s', dur:'6s'   },
        { top:'62%', width:'200px', delay:'0.3s', dur:'4.2s' },
        { top:'72%', width:'160px', delay:'1.8s', dur:'5s'   },
        { top:'30%', width:'100px', delay:'3s',   dur:'4s'   },
        { top:'78%', width:'240px', delay:'2.5s', dur:'5.5s' },
    ];

    lines.forEach(l => {
        const el = document.createElement('div');
        el.classList.add('wind-line');
        Object.assign(el.style, {
            top: l.top, 
            width: l.width,
            animationDelay: l.delay,
            animationDuration: l.dur,
        });
        bg.appendChild(el);
    });

    // ── ANIMAÇÃO DE REVELAÇÃO NO SCROLL (SCROLL REVEAL) ──
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) { 
                e.target.classList.add('visible'); 
                observer.unobserve(e.target); 
            }
        });
    }, { threshold: 0.12 });

    reveals.forEach(r => observer.observe(r));
});