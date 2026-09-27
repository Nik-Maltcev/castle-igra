'use strict';
/* CrazyGames SDK adapter.
 * On CrazyGames the real SDK is injected by the portal; locally these are
 * safe no-ops so the game runs standalone. See docs.crazygames.com. */
(function () {
  window.CrazyGames = window.CrazyGames || {};
  const sdk = window.CrazyGames.SDK;
  if (!sdk) {
    window.CrazyGames.SDK = {
      game: {
        gameplayStart() { },
        gameplayStop() { },
        happytime() { },
        sdkGameLoadingStart() { },
        sdkGameLoadingStop() { },
      },
      ad: {
        requestAd(type, callbacks) { if (callbacks && callbacks.adFinished) callbacks.adFinished(); },
      },
    };
  }
})();
