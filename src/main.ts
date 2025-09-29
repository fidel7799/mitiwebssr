import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Control manual de restauración de scroll para evitar saltos inesperados tras refresh
if ('scrollRestoration' in history) {
  try { history.scrollRestoration = 'manual'; } catch {}
}

bootstrapApplication(App, appConfig)
  .then(ref => {
    // Forzar scroll top al iniciar (primer frame) para evitar posiciones residuales
    requestAnimationFrame(() => {
      if (window.scrollY !== 0) window.scrollTo({ top: 0 });
      document.documentElement.classList.add('app-hydrated');
      // Segundo refuerzo tras siguiente frame y pequeño delay para evitar saltos por carga diferida
      requestAnimationFrame(() => {
        if (window.scrollY > 24) {
          window.scrollTo({ top: 0 });
        }
        setTimeout(() => {
          if (window.scrollY > 24) window.scrollTo(0, 0);
        }, 120);
      });
      // Diagnóstico: log de scroll inicial
      try {
        console.info('[InitScroll] after hydration scrollY=', window.scrollY);
      } catch {}
    });
    return ref;
  })
  .catch((err) => console.error(err));
