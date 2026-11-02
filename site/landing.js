// Decides what the confirmation page says, from the address Supabase sent the player to.
//
// Supabase has already checked the email link before it redirects here, and it reports the result
// in the address: a token (or a code) when it worked, an error when it did not. This page only
// reads that result to word its message. It never uses a token, never shows text taken from the
// address, and removes the address details once it has read them.

/**
 * @param {string} hash the part of the address after "#" (`location.hash`)
 * @param {string} search the part of the address after "?" (`location.search`)
 * @returns {'confirmed' | 'problem' | 'nothing'} the id of the section to show
 */
function describeLanding(hash, search) {
  const params = new URLSearchParams(`${hash.replace(/^#/, '')}&${search.replace(/^\?/, '')}`);

  // An error wins over everything else: never say "confirmed" when Supabase reported a problem.
  if (params.has('error') || params.has('error_code') || params.has('error_description')) {
    return 'problem';
  }
  // A password-reset link carries a token too, but it does not confirm an email.
  if (params.get('type') === 'recovery') return 'nothing';
  if (params.has('access_token') || params.has('code')) return 'confirmed';
  return 'nothing';
}

if (typeof document !== 'undefined') {
  document.getElementById(describeLanding(location.hash, location.search)).hidden = false;
  // The tokens are of no use here: keep them out of the address bar and the browser history.
  history.replaceState(null, '', location.pathname);
}

if (typeof module !== 'undefined') module.exports = { describeLanding };
