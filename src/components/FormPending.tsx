'use client';
import { useEffect } from 'react';

/** Gives every form instant feedback: the clicked button shows a spinner and cannot be double-clicked while the server works. */
export default function FormPending() {
  useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (e.defaultPrevented || form.dataset.nobusy !== undefined) return;
      const btn = (e.submitter as HTMLButtonElement | null) ?? (form.querySelector('button:not([type=button])') as HTMLButtonElement | null);
      if (!btn) return;
      // Disable after the browser has collected the form data, so the button's own name/value still posts.
      setTimeout(() => { btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true; }, 0);
      setTimeout(() => { btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); btn.disabled = false; }, 20000);
    };
    // On phones, close the slide-out menu after a link is tapped.
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.side a')) { const t = document.getElementById('navtoggle') as HTMLInputElement | null; if (t) t.checked = false; }
    };
    document.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('submit', onSubmit); document.removeEventListener('click', onClick); };
  }, []);
  return null;
}
